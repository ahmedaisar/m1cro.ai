import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { AgentRuntime, type ApprovalController, type ApprovalDecision, type ApprovalRequest } from "@m1cro/core";
import { RuntimeEventSequencer, RUNTIME_PROTOCOL_NAME, RUNTIME_PROTOCOL_VERSION, isRuntimeEventEnvelope, type RuntimeCommand, type RuntimeEvent, type RuntimeEventEnvelope } from "@m1cro/protocol";
import type { SessionStore } from "@m1cro/sessions";
import type { RuntimeSessionRegistry, RuntimeSessionRecord } from "./registry.js";

export interface RuntimeHostOptions {
  createAgent: (approval: ApprovalController, sessionStore: SessionStore) => AgentRuntime;
  sessionStore: SessionStore;
  registryStore?: RuntimeSessionRegistry;
  /** Resolve identity from an opaque bearer token. Return null to reject. */
  authenticate: (token: string) => Promise<string | null> | string | null;
  /** Authorize a principal against a session id, including read/write access. */
  authorizeSession: (principalId: string, sessionId: string, access: "read" | "write") => Promise<boolean> | boolean;
  /** Project/workspace ownership check for session creation. */
  authorizeProject: (principalId: string, projectId: string) => Promise<boolean> | boolean;
  corsOrigins: string[];
  maxBodyBytes?: number;
  maxPromptChars?: number;
  maxConcurrentTurns?: number;
  host?: string;
  port?: number;
}
type SessionMeta = RuntimeSessionRecord;
interface PendingTurn { controller: AbortController; turnId: string; done: Promise<void> }
interface DeferredApproval { request: ApprovalRequest; resolve: (decision: ApprovalDecision) => void; reject: (error: Error) => void; settled: boolean }
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const SAFE_HEADERS = { "cache-control": "no-cache, no-transform", "x-content-type-options": "nosniff" };

export class RuntimeHost {
  private server: Server | undefined;
  private readonly sessions = new Map<string, SessionMeta>();
  private readonly events = new Map<string, RuntimeEventEnvelope[]>();
  private readonly sequencer = new RuntimeEventSequencer();
  private readonly pending = new Map<string, PendingTurn>();
  private readonly approvals = new Map<string, DeferredApproval>();
  private readonly streams = new Set<ServerResponse>();
  private readonly maxEvents = 5000;
  private readonly maxBodyBytes: number;
  private readonly maxPromptChars: number;
  private readonly maxConcurrentTurns: number;
  constructor(private readonly options: RuntimeHostOptions) {
    if (options.corsOrigins.length === 0 || options.corsOrigins.includes("*")) throw new Error("Runtime host requires explicit non-wildcard CORS origins");
    this.maxBodyBytes = options.maxBodyBytes ?? 64 * 1024;
    this.maxPromptChars = options.maxPromptChars ?? 32_000;
    this.maxConcurrentTurns = options.maxConcurrentTurns ?? 4;
  }
  async listen(): Promise<{ host: string; port: number }> {
    if (this.server) throw new Error("Runtime host is already listening");
    await this.restoreSessions();
    this.server = createServer((req, res) => { void this.handle(req, res); });
    const host = this.options.host ?? "127.0.0.1", port = this.options.port ?? 8787;
    await new Promise<void>((resolveListen, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(port, host, () => { this.server!.off("error", reject); resolveListen(); });
    });
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("Runtime host failed to bind TCP address");
    return { host, port: address.port };
  }
  private async restoreSessions(): Promise<void> {
    if (!this.options.registryStore) return;
    for (const stored of await this.options.registryStore.list()) {
      const session: SessionMeta = { ...stored };
      this.sessions.set(session.id, session);
      const replay: RuntimeEventEnvelope[] = [];
      for (const record of await this.options.sessionStore.read(session.id)) {
        if (record.kind !== "event" || !isRuntimeEventEnvelope(record.data) || record.data.sessionId !== session.id) continue;
        replay.push(this.sequencer.wrap(session.id, record.data.event));
      }
      if (replay.length > this.maxEvents) replay.splice(0, replay.length - this.maxEvents);
      this.events.set(session.id, replay);
      if (session.status === "running" || session.status === "awaiting_approval") {
        session.status = "failed"; session.activeTurnId = undefined; session.updatedAt = new Date().toISOString();
        await this.options.registryStore.save(session);
      }
    }
  }
  async close(): Promise<void> {
    for (const turn of this.pending.values()) turn.controller.abort(new Error("Runtime host shutting down"));
    for (const approval of this.approvals.values()) this.settleApproval(approval, new Error("Runtime host shutting down"));
    for (const stream of this.streams) stream.end();
    this.streams.clear();
    if (!this.server) return;
    const server = this.server; this.server = undefined;
    await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  }
  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const origin = req.headers.origin;
      if (origin && this.options.corsOrigins.includes(origin)) {
        res.setHeader("access-control-allow-origin", origin); res.setHeader("vary", "Origin");
        res.setHeader("access-control-allow-headers", "authorization, content-type, last-event-id");
        res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      }
      if (req.method === "OPTIONS") { res.writeHead(origin && this.options.corsOrigins.includes(origin) ? 204 : 403).end(); return; }
      if (origin && !this.options.corsOrigins.includes(origin)) { this.send(res, 403, { error: "Origin not allowed" }); return; }
      if (req.method === "GET" && req.url === "/health") {
        this.send(res, 200, { protocol: RUNTIME_PROTOCOL_NAME, version: RUNTIME_PROTOCOL_VERSION, ready: true }); return;
      }
      const principal = await this.principal(req);
      if (!principal) { this.send(res, 401, { error: "Unauthorized" }); return; }
      if (req.method === "GET" && req.url === "/v1/sessions") {
        this.send(res, 200, { sessions: [...this.sessions.values()].filter(s => s.ownerId === principal) }); return;
      }
      if (req.method === "POST" && req.url === "/v1/sessions") {
        const body = await this.readJson(req);
        if (!isRecord(body) || typeof body.projectId !== "string" || !body.projectId.trim() || body.projectId.length > 160) { this.send(res, 400, { error: "projectId is required" }); return; }
        if (!await this.options.authorizeProject(principal, body.projectId)) { this.send(res, 403, { error: "Project access denied" }); return; }
        const id = randomUUID().replaceAll("-", "");
        const now = new Date().toISOString();
        const meta: SessionMeta = { id, projectId: body.projectId, ownerId: principal, createdAt: now, updatedAt: now, activeTurnId: undefined, status: "idle" };
        this.sessions.set(id, meta); this.events.set(id, []);
        await this.options.registryStore?.save(meta);
        this.send(res, 201, { session: meta }); return;
      }
      const match = /^\/v1\/sessions\/([A-Za-z0-9_-]{1,80})(?:\/(events|commands))?$/.exec(new URL(req.url ?? "/", "http://localhost").pathname);
      if (!match) { this.send(res, 404, { error: "Not found" }); return; }
      const [, sessionId, resource] = match;
      const session = this.sessions.get(sessionId!);
      if (!session || !await this.options.authorizeSession(principal, sessionId!, resource === "commands" ? "write" : "read")) { this.send(res, 404, { error: "Session not found" }); return; }
      if (!resource && req.method === "GET") { this.send(res, 200, { session }); return; }
      if (resource === "events" && req.method === "GET") { await this.streamEvents(req, res, sessionId!); return; }
      if (resource === "commands" && req.method === "POST") { await this.command(req, res, session); return; }
      this.send(res, 405, { error: "Method not allowed" });
    } catch (error) {
      if (!res.headersSent) this.send(res, error instanceof BodyTooLargeError ? 413 : 400, { error: safeMessage(error) });
      else res.destroy(error instanceof Error ? error : undefined);
    }
  }
  private async principal(req: IncomingMessage): Promise<string | null> {
    const auth = req.headers.authorization;
    if (typeof auth !== "string" || !auth.startsWith("Bearer ")) return null;
    const token = auth.slice(7);
    if (!token || token.length > 4096) return null;
    return await this.options.authenticate(token);
  }
  private async command(req: IncomingMessage, res: ServerResponse, session: SessionMeta): Promise<void> {
    const body = await this.readJson(req);
    if (!isRuntimeCommand(body) || body.sessionId !== session.id) { this.send(res, 400, { error: "Invalid runtime command" }); return; }
    if (body.type === "turn.start") {
      if (!body.prompt.trim() || body.prompt.length > this.maxPromptChars) { this.send(res, 400, { error: "Prompt is empty or exceeds the configured limit" }); return; }
      if (this.pending.has(session.id)) { this.send(res, 409, { error: "A turn is already running for this session" }); return; }
      if (this.pending.size >= this.maxConcurrentTurns) { this.send(res, 429, { error: "Runtime is at concurrency capacity" }); return; }
      const controller = new AbortController();
      const approval = this.createApprovalController(session.id);
      let turnId = "";
      const done = (async () => {
        try {
          const agent = this.options.createAgent(approval, this.options.sessionStore);
          for await (const event of agent.run({ sessionId: session.id, prompt: body.prompt, signal: controller.signal })) {
            turnId ||= event.turnId;
            const previousStatus = session.status;
            const previousTurnId = session.activeTurnId;
            session.status = event.type === "turn.status" ? mapStatus(event.status) : session.status;
            if (event.type === "approval.required") session.status = "awaiting_approval";
            session.activeTurnId = turnId || session.activeTurnId;
            if (session.status !== previousStatus || session.activeTurnId !== previousTurnId) {
              session.updatedAt = new Date().toISOString();
              await this.options.registryStore?.save(session);
            }
            await this.publish(session.id, event);
          }
        } catch (error) {
          session.status = controller.signal.aborted ? "cancelled" : "failed";
          try { await this.publish(session.id, { type: "turn.status", turnId: turnId || "unknown", status: session.status, reason: safeMessage(error) }); } catch {}
        } finally {
          session.activeTurnId = undefined; session.updatedAt = new Date().toISOString();
          await this.options.registryStore?.save(session);
          this.pending.delete(session.id);
        }
      })();
      const pendingTurn: PendingTurn = { controller, get turnId() { return turnId; }, done };
      this.pending.set(session.id, pendingTurn);
      this.send(res, 202, { accepted: true, requestId: body.requestId });
      return;
    }
    if (body.type === "turn.cancel") {
      const active = this.pending.get(session.id);
      if (!active) { this.send(res, 200, { accepted: true, cancelled: false, requestId: body.requestId }); return; }
      if (active.turnId && body.turnId !== active.turnId) { this.send(res, 409, { error: "Turn ID does not match the active turn" }); return; }
      active.controller.abort(new Error("Cancelled by user"));
      this.send(res, 202, { accepted: true, cancelled: true, requestId: body.requestId }); return;
    }
    const approval = this.approvals.get(body.callId);
    if (!approval || approval.request.turnId !== body.turnId || !this.pending.has(session.id)) { this.send(res, 404, { error: "Pending approval not found" }); return; }
    this.settleApproval(approval, undefined, body.decision === "approve"
      ? { decision: "approve", actor: "user" }
      : { decision: "reject", actor: "user", ...(body.reason ? { reason: body.reason.slice(0, 500) } : {}) });
    this.approvals.delete(body.callId);
    this.send(res, 200, { accepted: true, requestId: body.requestId });
  }
  private createApprovalController(sessionId: string): ApprovalController {
    return { request: (request, signal) => new Promise<ApprovalDecision>((resolveApproval, rejectApproval) => {
      const deferred: DeferredApproval = { request, resolve: resolveApproval, reject: rejectApproval, settled: false };
      this.approvals.set(request.callId, deferred);
      const onAbort = () => { this.settleApproval(deferred, new Error("Approval cancelled")); this.approvals.delete(request.callId); };
      signal.addEventListener("abort", onAbort, { once: true });
      const settle = deferred.resolve;
      deferred.resolve = (decision) => { signal.removeEventListener("abort", onAbort); settle(decision); };
      const reject = deferred.reject;
      deferred.reject = (error) => { signal.removeEventListener("abort", onAbort); reject(error); };
    }) };
  }
  private settleApproval(pending: DeferredApproval, error?: Error, decision?: ApprovalDecision): void {
    if (pending.settled) return; pending.settled = true;
    if (error) pending.reject(error); else if (decision) pending.resolve(decision);
  }
  private async publish(sessionId: string, event: RuntimeEvent): Promise<void> {
    const envelope = this.sequencer.wrap(sessionId, event);
    if (!isRuntimeEventEnvelope(envelope)) throw new Error("Internal runtime event failed protocol validation");
    const list = this.events.get(sessionId) ?? [];
    list.push(envelope); if (list.length > this.maxEvents) list.splice(0, list.length - this.maxEvents);
    this.events.set(sessionId, list);
    await this.options.sessionStore.append(sessionId, { id: randomUUID(), timestamp: new Date().toISOString(), kind: "event", data: envelope });
  }
  private async streamEvents(req: IncomingMessage, res: ServerResponse, sessionId: string): Promise<void> {
    const lastEventId = req.headers["last-event-id"];
    const query = new URL(req.url ?? "/", "http://localhost").searchParams.get("after");
    const cursorRaw = (typeof lastEventId === "string" ? lastEventId : query) ?? "0";
    const cursor = Number(cursorRaw);
    if (!Number.isSafeInteger(cursor) || cursor < 0) { this.send(res, 400, { error: "Invalid event cursor" }); return; }
    const events = this.events.get(sessionId) ?? [];
    const first = events[0]?.sequence ?? 1;
    if (cursor > 0 && cursor < first - 1) { this.send(res, 409, { error: "Event cursor expired; create a fresh session view" }); return; }
    res.writeHead(200, { ...SAFE_HEADERS, "content-type": "text/event-stream; charset=utf-8", connection: "keep-alive" });
    this.streams.add(res);
    for (const envelope of events) if (envelope.sequence > cursor) this.writeEvent(res, envelope);
    const onClose = () => { clearInterval(heartbeat); clearInterval(poll); this.streams.delete(res); };
    res.on("close", onClose);
    let heartbeat: NodeJS.Timeout;
    let poll: NodeJS.Timeout;
    heartbeat = setInterval(() => { if (!res.destroyed) res.write(": keep-alive\n\n"); }, 15_000);
    // Hold the response open; future events are polled from the retained event log.
    let next = events.at(-1)?.sequence ?? cursor;
    poll = setInterval(() => {
      if (res.destroyed) { clearInterval(poll); clearInterval(heartbeat); return; }
      const latest = this.events.get(sessionId) ?? [];
      for (const envelope of latest) if (envelope.sequence > next) { this.writeEvent(res, envelope); next = envelope.sequence; }
    }, 200);
  }
  private writeEvent(res: ServerResponse, envelope: RuntimeEventEnvelope): void {
    res.write("id: " + envelope.sequence + "\nevent: runtime\ndata: " + JSON.stringify(envelope) + "\n\n");
  }
  private async readJson(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length; if (size > this.maxBodyBytes) throw new BodyTooLargeError();
      chunks.push(buffer);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    try { return JSON.parse(raw); } catch { throw new Error("Malformed JSON body"); }
  }
  private send(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { ...SAFE_HEADERS, "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  }
}
class BodyTooLargeError extends Error {}
function safeMessage(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 500); }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function isRuntimeCommand(value: unknown): value is RuntimeCommand {
  if (!isRecord(value) || typeof value.requestId !== "string" || !ID.test(value.requestId) || typeof value.sessionId !== "string" || !ID.test(value.sessionId) || typeof value.type !== "string") return false;
  if (value.type === "turn.start") return typeof value.prompt === "string";
  if (value.type === "turn.cancel") return typeof value.turnId === "string" && ID.test(value.turnId);
  if (value.type === "approval.respond") return typeof value.turnId === "string" && ID.test(value.turnId) && typeof value.callId === "string" && ID.test(value.callId) && (value.decision === "approve" || value.decision === "reject") && (value.reason === undefined || typeof value.reason === "string");
  return false;
}
function mapStatus(status: string): SessionMeta["status"] {
  if (status === "running") return "running";
  if (status === "awaiting_approval") return "awaiting_approval";
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  if (status === "failed" || status === "interrupted") return "failed";
  return "idle";
}
/** Minimal trusted local-development factory. Production deployments must supply identity and project authorization. */
export function createLocalRuntimeHost(options: Omit<RuntimeHostOptions, "authenticate" | "authorizeSession" | "authorizeProject"> & { token: string }): RuntimeHost {
  const token = options.token;
  if (token.length < 32) throw new Error("Local runtime token must contain at least 32 characters");
  return new RuntimeHost({
    ...options,
    authenticate: candidate => candidate === token ? "local-user" : null,
    authorizeProject: principal => principal === "local-user",
    authorizeSession: (principal, sessionId) => principal === "local-user" && ID.test(sessionId),
  });
}

import { afterEach, describe, expect, it } from "vitest";
import { RuntimeHost } from "./index.js";
import type { AgentRuntime } from "@m1cro/core";
import type { SessionStore } from "@m1cro/sessions";
import type { RuntimeEvent } from "@m1cro/protocol";

const store = { append: async () => {}, read: async () => [] } as SessionStore;
const hosts: RuntimeHost[] = [];
afterEach(async () => { await Promise.all(hosts.splice(0).map(host => host.close())); });
async function setup(events: RuntimeEvent[] = [], waitForApproval = false) {
  const host = new RuntimeHost({
    sessionStore: store,
    createAgent: approval => ({
      async *run(input: { signal?: AbortSignal }) {
        for (const event of events) yield event;
        if (waitForApproval) {
          await approval.request({ turnId: "turn_approval", callId: "call_write", toolName: "write_file", input: { path: "a.txt" }, risk: "write" }, input.signal ?? new AbortController().signal);
          yield { type: "approval.resolved", turnId: "turn_approval", callId: "call_write", decision: "approved", actor: "user" };
        }
      },
    } as unknown as AgentRuntime),
    authenticate: token => token === "a".repeat(32) ? "principal-1" : null,
    authorizeProject: principal => principal === "principal-1",
    authorizeSession: principal => principal === "principal-1",
    corsOrigins: ["http://localhost:3000"], port: 0,
  });
  const address = await host.listen(); hosts.push(host);
  const base = "http://" + address.host + ":" + address.port;
  const headers = { authorization: "Bearer " + "a".repeat(32), "content-type": "application/json" };
  return { base, headers };
}
async function createSession(base: string, headers: Record<string, string>) {
  const response = await fetch(base + "/v1/sessions", { method: "POST", headers, body: JSON.stringify({ projectId: "project-1" }) });
  expect(response.status).toBe(201);
  return (await response.json() as { session: { id: string } }).session.id;
}
describe("RuntimeHost", () => {
  it("reports protocol health and requires authentication", async () => {
    const { base } = await setup();
    expect(await (await fetch(base + "/health")).json()).toMatchObject({ protocol: "m1cro.runtime", version: 1, ready: true });
    expect((await fetch(base + "/v1/sessions")).status).toBe(401);
  });
  it("creates sessions and replays sequenced events over SSE", async () => {
    const { base, headers } = await setup([
      { type: "turn.status", turnId: "turn_test", status: "running" },
      { type: "text.delta", turnId: "turn_test", delta: "Hello runtime" },
      { type: "turn.status", turnId: "turn_test", status: "completed" },
    ]);
    const id = await createSession(base, headers);
    const started = await fetch(base + "/v1/sessions/" + id + "/commands", { method: "POST", headers, body: JSON.stringify({ type: "turn.start", requestId: "req_1", sessionId: id, prompt: "hello" }) });
    expect(started.status).toBe(202);
    await new Promise(resolve => setTimeout(resolve, 20));
    const stream = await fetch(base + "/v1/sessions/" + id + "/events?after=0", { headers });
    expect(stream.status).toBe(200);
    const reader = stream.body!.getReader(); const decoder = new TextDecoder(); let body = "";
    while (!body.includes("Hello runtime")) {
      const next = await Promise.race([reader.read(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("SSE timeout")), 1000))]);
      body += decoder.decode(next.value);
    }
    expect(body).toContain('"sequence":1'); expect(body).toContain('"sequence":3');
    await reader.cancel();
  });
  it("binds approvals to the active turn and exact tool call", async () => {
    const { base, headers } = await setup([
      { type: "approval.required", turnId: "turn_approval", callId: "call_write", toolName: "write_file", input: { path: "a.txt" }, risk: "write" },
    ], true);
    const id = await createSession(base, headers);
    await fetch(base + "/v1/sessions/" + id + "/commands", { method: "POST", headers, body: JSON.stringify({ type: "turn.start", requestId: "req_start", sessionId: id, prompt: "write" }) });
    await new Promise(resolve => setTimeout(resolve, 20));
    const wrong = await fetch(base + "/v1/sessions/" + id + "/commands", { method: "POST", headers, body: JSON.stringify({ type: "approval.respond", requestId: "req_wrong", sessionId: id, turnId: "turn_approval", callId: "wrong_call", decision: "approve" }) });
    expect(wrong.status).toBe(404);
    const approved = await fetch(base + "/v1/sessions/" + id + "/commands", { method: "POST", headers, body: JSON.stringify({ type: "approval.respond", requestId: "req_approve", sessionId: id, turnId: "turn_approval", callId: "call_write", decision: "approve" }) });
    expect(approved.status).toBe(200);
  });
  it("rejects unknown commands and untrusted origins", async () => {
    const { base, headers } = await setup(); const id = await createSession(base, headers);
    const bad = await fetch(base + "/v1/sessions/" + id + "/commands", { method: "POST", headers, body: JSON.stringify({ type: "shell.exec", requestId: "req_1", sessionId: id }) });
    expect(bad.status).toBe(400);
    const denied = await fetch(base + "/v1/sessions", { headers: { authorization: headers.authorization, origin: "https://untrusted.example" } });
    expect(denied.status).toBe(403);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlSessionStore } from "@m1cro/sessions";
import { RuntimeHost, createLocalRuntimeHost } from "./index.js";
import { createHmac } from "node:crypto";
import type { AgentRuntime } from "@m1cro/core";
import type { SessionStore } from "@m1cro/sessions";
import type { RuntimeEvent } from "@m1cro/protocol";
import { JsonlRuntimeSessionRegistry } from "./registry.js";

const store = { append: async () => {}, read: async () => [] } as SessionStore;
const hosts: RuntimeHost[] = [];
afterEach(async () => { await Promise.all(hosts.splice(0).map(host => host.close())); });
async function setup(events: RuntimeEvent[] = [], waitForApproval = false, probeProvider?: () => Promise<Record<string, unknown>>) {
  const host = new RuntimeHost({
    sessionStore: store,
    ...(probeProvider ? { probeProvider } : {}),
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
  it("verifies BFF-signed principals and rejects forged or missing signatures", async () => {
    const token = "d".repeat(64);
    const host = createLocalRuntimeHost({ token, sessionStore: store, createAgent: () => ({ async *run() {} } as unknown as AgentRuntime), corsOrigins: ["http://localhost:3000"], port: 0 });
    const address = await host.listen(); hosts.push(host);
    const base = "http://" + address.host + ":" + address.port;
    const principal = "user_123";
    const signature = createHmac("sha256", token).update("m1cro-principal:" + principal).digest("base64url");
    const authorized = await fetch(base + "/v1/projects", { headers: { authorization: "Bearer " + token, "x-m1cro-principal": principal, "x-m1cro-principal-signature": signature } });
    expect(authorized.status).toBe(200);
    const forged = await fetch(base + "/v1/projects", { headers: { authorization: "Bearer " + token, "x-m1cro-principal": "user_victim", "x-m1cro-principal-signature": signature } });
    expect(forged.status).toBe(401);
  });
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
  it("restores session metadata and sequenced SSE history after a host restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "m1cro-runtime-host-"));
    const sessionStore = new JsonlSessionStore(id => join(root, "sessions", id + ".jsonl"));
    const registryStore = new JsonlRuntimeSessionRegistry(join(root, "runtime-sessions.jsonl"));
    const token = "b".repeat(64);
    const makeHost = (events: RuntimeEvent[]) => new RuntimeHost({
      sessionStore,
      registryStore,
      createAgent: () => ({ async *run() { for (const event of events) yield event; } } as unknown as AgentRuntime),
      authenticate: candidate => candidate === token ? "principal-1" : null,
      authorizeProject: principal => principal === "principal-1",
      authorizeSession: principal => principal === "principal-1",
      corsOrigins: ["http://localhost:3000"],
      port: 0,
    });
    const headers = { authorization: "Bearer " + token, "content-type": "application/json" };
    const firstHost = makeHost([
      { type: "turn.status", turnId: "turn_restart", status: "running" },
      { type: "text.delta", turnId: "turn_restart", delta: "persisted text" },
      { type: "turn.status", turnId: "turn_restart", status: "completed" },
    ]);
    const firstAddress = await firstHost.listen();
    hosts.push(firstHost);
    const firstBase = "http://" + firstAddress.host + ":" + firstAddress.port;
    const sessionId = await createSession(firstBase, headers);
    const started = await fetch(firstBase + "/v1/sessions/" + sessionId + "/commands", {
      method: "POST", headers,
      body: JSON.stringify({ type: "turn.start", requestId: "req_restart", sessionId, prompt: "persist this" }),
    });
    expect(started.status).toBe(202);
    await new Promise(resolve => setTimeout(resolve, 50));
    await firstHost.close();

    const secondHost = makeHost([]);
    const secondAddress = await secondHost.listen();
    hosts.push(secondHost);
    const secondBase = "http://" + secondAddress.host + ":" + secondAddress.port;
    const listed = await fetch(secondBase + "/v1/sessions", { headers });
    const sessions = (await listed.json() as { sessions: Array<{ id: string; status: string }> }).sessions;
    expect(sessions).toContainEqual(expect.objectContaining({ id: sessionId, status: "completed" }));

    const replay = await fetch(secondBase + "/v1/sessions/" + sessionId + "/events?after=0", { headers });
    expect(replay.status).toBe(200);
    const reader = replay.body!.getReader();
    const decoder = new TextDecoder();
    let output = "";
    while (!output.includes("persisted text")) {
      const chunk = await reader.read();
      if (chunk.done) break;
      output += decoder.decode(chunk.value);
    }
    expect(output).toContain('"sequence":1');
    expect(output).toContain('"sequence":3');
    await reader.cancel();
    await rm(root, { recursive: true, force: true });
  });
  it("returns only validated transcript messages for an authorized session", async () => {
    const transcriptStore = {
      append: async () => {},
      read: async () => [
        { id: "m1", timestamp: "2026-11-16T00:00:00.000Z", kind: "message", data: { role: "user", content: "Earlier prompt" } },
        { id: "m2", timestamp: "2026-11-16T00:00:01.000Z", kind: "message", data: { role: "assistant", content: "Earlier answer" } },
        { id: "e1", timestamp: "2026-11-16T00:00:02.000Z", kind: "event", data: { protocol: "m1cro.runtime" } },
        { id: "bad", timestamp: "2026-11-16T00:00:03.000Z", kind: "message", data: { role: "system", content: "Internal prompt" } },
      ],
    } as unknown as SessionStore;
    const host = new RuntimeHost({
      sessionStore: transcriptStore,
      createAgent: () => ({ async *run() {} } as unknown as AgentRuntime),
      authenticate: token => token === "c".repeat(32) ? "principal-1" : null,
      authorizeProject: principal => principal === "principal-1",
      authorizeSession: principal => principal === "principal-1",
      corsOrigins: ["http://localhost:3000"], port: 0,
    });
    const address = await host.listen(); hosts.push(host);
    const base = "http://" + address.host + ":" + address.port;
    const headers = { authorization: "Bearer " + "c".repeat(32), "content-type": "application/json" };
    const id = await createSession(base, headers);
    const response = await fetch(base + "/v1/sessions/" + id + "/history", { headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ messages: [
      { data: { role: "user", content: "Earlier prompt" } },
      { data: { role: "assistant", content: "Earlier answer" } },
    ] });
    expect((await fetch(base + "/v1/sessions/" + id + "/history?limit=0", { headers })).status).toBe(400);
  });
  it("authenticates provider probes and returns only the probe result", async () => {
    const { base, headers } = await setup([], false, async () => ({
      ok: true,
      connectivity: "connected",
      model: "test-model",
      latencyMs: 42,
      responseReceived: true,
    }));
    const unauthorized = await fetch(base + "/v1/provider/probe", { method: "POST" });
    expect(unauthorized.status).toBe(401);
    const response = await fetch(base + "/v1/provider/probe", { method: "POST", headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      probe: { ok: true, connectivity: "connected", model: "test-model", latencyMs: 42, responseReceived: true },
    });
  });

});

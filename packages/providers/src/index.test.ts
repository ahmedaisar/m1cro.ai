import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider, ProviderHttpError } from "./index.js";
import type { ModelRequest } from "@m1cro/protocol";

const request = (
  messages: ModelRequest["messages"] = [{ role: "user", content: "hi" }],
  signal = new AbortController().signal,
): ModelRequest => ({
  model: "fixture",
  messages,
  tools: [{ name: "write_file", description: "write", inputSchema: { type: "object" } }],
  signal,
});

function sse(chunks: string[], appendDone = true): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      if (appendDone && !chunks.join("").includes("data: [DONE]")) {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\\n\\n"));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("OpenAICompatibleProvider", () => {
  it("assembles fragmented tool id, name and arguments across SSE deltas", async () => {
    const first = JSON.stringify({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: "call_",
            function: { name: "write_", arguments: '{"path"' },
          }],
        },
      }],
    });
    const second = JSON.stringify({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: "call_1",
            function: { name: "file", arguments: ':"a.txt"}' },
          }],
        },
        finish_reason: "tool_calls",
      }],
    });
    const fetcher = vi.fn(async () => sse([
      "data: " + first + "\n\n",
      "data: " + second + "\n\n",
      "data: [DONE]\n\n",
    ]));
    const provider = new OpenAICompatibleProvider({ baseUrl: "https://provider.test/v1", fetcher });
    const events = [];
    for await (const event of provider.stream(request())) events.push(event);
    expect(events).toContainEqual({
      type: "tool_call",
      call: { id: "call_1", name: "write_file", input: { path: "a.txt" } },
    });
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("retries a transient 429 and honours a numeric retry-after", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("limited", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(sse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n']));
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://provider.test/v1",
      fetcher,
      maxRetries: 1,
      retryBaseDelayMs: 0,
    });
    const events = [];
    for await (const event of provider.stream(request())) events.push(event);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual({ type: "text", text: "ok" });
  });

  it("rejects an abruptly terminated stream without a terminal marker", async () => {
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://provider.test/v1",
      fetcher: vi.fn(async () => sse(['data: {"choices":[{"delta":{"content":"partial"}}]}\\n\\n'], false)),
    });
    await expect(async () => {
      for await (const event of provider.stream(request())) void event;
    }).rejects.toThrow("Provider stream ended before a terminal marker");
  });

  it("does not retry a permanent 400 response", async () => {
    const fetcher = vi.fn(async () => new Response("bad request", { status: 400 }));
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://provider.test/v1",
      fetcher,
      maxRetries: 3,
      retryBaseDelayMs: 0,
    });
    await expect(async () => {
      for await (const event of provider.stream(request())) void event;
    }).rejects.toBeInstanceOf(ProviderHttpError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("serializes tool results using OpenAI-compatible tool_call_id fields", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.messages).toEqual([{
        role: "tool",
        content: '{"ok":true}',
        tool_call_id: "c1",
        name: "read_file",
      }]);
      return sse(["data: [DONE]\n\n"]);
    });
    const provider = new OpenAICompatibleProvider({ baseUrl: "https://provider.test/v1", fetcher });
    const messages: ModelRequest["messages"] = [{
      role: "tool",
      content: '{"ok":true}',
      toolCallId: "c1",
      name: "read_file",
    }];
    for await (const event of provider.stream(request(messages))) void event;
  });

  it("cancels the underlying response reader when aborted", async () => {
    const controller = new AbortController();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start() {},
      cancel() { cancelled = true; },
    });
    const fetcher = vi.fn(async () => new Response(body, { status: 200 }));
    const provider = new OpenAICompatibleProvider({ baseUrl: "https://provider.test/v1", fetcher });
    const iterator = provider.stream(request(undefined, controller.signal))[Symbol.asyncIterator]();
    const pending = iterator.next();
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort(new Error("stop"));
    await expect(pending).rejects.toBeTruthy();
    expect(cancelled).toBe(true);
  });

  it("serializes structured assistant tool calls", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.messages).toEqual([{
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "c9",
          type: "function",
          function: { name: "read_file", arguments: '{"path":"a.txt"}' },
        }],
      }]);
      return sse(["data: [DONE]\n\n"]);
    });
    const provider = new OpenAICompatibleProvider({ baseUrl: "https://provider.test/v1", fetcher });
    const messages: ModelRequest["messages"] = [{
      role: "assistant",
      content: "",
      toolCalls: [{ id: "c9", name: "read_file", input: { path: "a.txt" } }],
    }];
    for await (const event of provider.stream(request(messages))) void event;
  });
});

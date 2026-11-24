import { describe, expect, it, vi } from "vitest";
import { AnthropicProvider, OllamaProvider, OpenAICompatibleProvider, ProviderHttpError, RunpodServerlessProvider } from "./index.js";
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
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
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
      fetcher: vi.fn(async () => sse(['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'], false)),
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


describe("OpenAICompatibleProvider model discovery", () => {
  it("preserves exact model IDs and maps optional context and per-token prices", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://provider.test/v1/models");
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
      return Response.json({ data: [
        { id: "vendor/model:latest", name: "Model Latest", context_length: 131072, pricing: { prompt: "0.000002", completion: "0.00001" } },
        { id: "bare-model" },
        { id: "" },
        { name: "missing-id" },
      ] });
    });
    const provider = new OpenAICompatibleProvider({ baseUrl: "https://provider.test/v1", providerId: "gateway", apiKey: "test-key", fetcher });
    await expect(provider.discoverModels()).resolves.toEqual([
      { provider: "gateway", id: "vendor/model:latest", displayName: "Model Latest", contextWindow: 131072, inputPricePerMillion: 2, outputPricePerMillion: 10, capabilities: {} },
      { provider: "gateway", id: "bare-model", capabilities: {} },
    ]);
  });

  it("leaves unknown capabilities unknown instead of inferring support", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [{ id: "model-a" }] }));
    const provider = new OpenAICompatibleProvider({ baseUrl: "https://provider.test/v1", fetcher });
    const [model] = await provider.discoverModels();
    expect(model).toBeDefined();
    expect(model?.capabilities).toEqual({});
  });

  it("surfaces model-list HTTP errors", async () => {
    const fetcher = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    const provider = new OpenAICompatibleProvider({ baseUrl: "https://provider.test/v1", fetcher });
    await expect(provider.discoverModels()).rejects.toMatchObject({ name: "ProviderHttpError", status: 401 });
  });

  it("rejects malformed model-list payloads", async () => {
    const fetcher = vi.fn(async () => Response.json({ models: [] }));
    const provider = new OpenAICompatibleProvider({ baseUrl: "https://provider.test/v1", fetcher });
    await expect(provider.discoverModels()).rejects.toThrow("invalid models response");
  });
});
});


describe("AnthropicProvider", () => {
  it("sends system prompt, tools and auth headers and streams text", async () => {
    const encoder = new TextEncoder();
    const events = [
      { type: "message_start", message: { usage: { input_tokens: 31, output_tokens: 0 } } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hello" } },
      { type: "message_delta", usage: { output_tokens: 12 } },
      { type: "message_stop" },
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode("data: " + JSON.stringify(event) + "\n\n"));
        controller.close();
      },
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://anthropic.test/v1/messages");
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe("secret");
      expect(headers.get("anthropic-version")).toBe("2023-06-01");
      const payload = JSON.parse(String(init?.body));
      expect(payload.system).toBe("system prompt");
      expect(payload.tools[0].input_schema).toEqual({ type: "object" });
      return new Response(body);
    });
    const provider = new AnthropicProvider({ baseUrl: "https://anthropic.test", apiKey: "secret", fetcher });
    const output = [];
    for await (const event of provider.stream({
      ...request(), messages: [{ role: "system", content: "system prompt" }, { role: "user", content: "hi" }],
    })) output.push(event);
    expect(output).toEqual([
      { type: "text", text: "hello" },
      { type: "usage", inputTokens: 31, outputTokens: 12 },
      { type: "done", stopReason: "end_turn" },
    ]);
  });

  it("assembles streamed tool input JSON", async () => {
    const encoder = new TextEncoder();
    const events = [
      { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tool-1", name: "read_file", input: {} } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"path":' } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '"a.txt"}' } },
      { type: "content_block_stop", index: 1 },
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode("data: " + JSON.stringify(event) + "\n\n"));
        controller.close();
      },
    });
    const provider = new AnthropicProvider({ fetcher: async () => new Response(body) });
    const output = [];
    for await (const event of provider.stream(request())) output.push(event);
    expect(output).toEqual([{ type: "tool_call", call: { id: "tool-1", name: "read_file", input: { path: "a.txt" } } }]);
  });
});

describe("OllamaProvider", () => {
  it("discovers exact local model names without inventing capabilities", async () => {
    const fetcher = vi.fn(async () => Response.json({ models: [{ name: "qwen3.5:4b" }, { name: "llama3.2:latest" }, {}] }));
    const provider = new OllamaProvider({ baseUrl: "http://localhost:11434", fetcher });
    await expect(provider.discoverModels()).resolves.toEqual([
      { provider: "ollama", id: "qwen3.5:4b", displayName: "qwen3.5:4b", capabilities: {} },
      { provider: "ollama", id: "llama3.2:latest", displayName: "llama3.2:latest", capabilities: {} },
    ]);
  });

  it("streams NDJSON text and tool calls", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      { message: { content: "hello " }, done: false },
      { message: { content: "world", tool_calls: [{ function: { name: "read_file", arguments: { path: "a.txt" } } }] }, done: true, prompt_eval_count: 24, eval_count: 9 },
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));
        controller.close();
      },
    });
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.model).toBe("fixture");
      expect(payload.tools[0].function.name).toBe("write_file");
      return new Response(body);
    });
    const provider = new OllamaProvider({ fetcher });
    const output = [];
    for await (const event of provider.stream(request())) output.push(event);
    expect(output).toEqual([
      { type: "text", text: "hello " },
      { type: "text", text: "world" },
      { type: "tool_call", call: { id: "ollama_0", name: "read_file", input: { path: "a.txt" } } },
      { type: "usage", inputTokens: 24, outputTokens: 9 },
      { type: "done", stopReason: "stop" },
    ]);
  });
});


describe("AnthropicProvider model discovery", () => {
  it("preserves exact model IDs and follows pagination using the provider cursor", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({
        data: [{ id: "claude-model-2026-01", display_name: "Claude Model" }],
        has_more: true,
        next_page: "page-cursor-1",
      }))
      .mockResolvedValueOnce(Response.json({
        data: [{ id: "claude-model-2026-02", display_name: "Claude Model 2" }],
        has_more: false,
      }));
    const provider = new AnthropicProvider({ baseUrl: "https://anthropic.test", apiKey: "secret", fetcher });
    await expect(provider.discoverModels()).resolves.toEqual([
      { provider: "anthropic", id: "claude-model-2026-01", displayName: "Claude Model", capabilities: {} },
      { provider: "anthropic", id: "claude-model-2026-02", displayName: "Claude Model 2", capabilities: {} },
    ]);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("/v1/models?limit=1000");
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("after_id=page-cursor-1");
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("x-api-key")).toBe("secret");
  });

  it("rejects repeated pagination cursors rather than looping", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [], has_more: true, next_page: "same" }));
    const provider = new AnthropicProvider({ fetcher });
    await expect(provider.discoverModels()).rejects.toThrow("invalid or repeated cursor");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});


describe("RunpodServerlessProvider", () => {
  it("uses the official endpoint URL for model discovery and preserves provider identity", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.runpod.ai/v2/endpoint_123/openai/v1/models");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer runpod-secret");
      return Response.json({ data: [{ id: "Qwen/Qwen3-32B-AWQ", context_length: 32768 }] });
    });
    const provider = new RunpodServerlessProvider({ endpointId: "endpoint_123", apiKey: "runpod-secret", fetcher });
    expect(provider.id).toBe("runpod");
    await expect(provider.discoverModels()).resolves.toEqual([
      { provider: "runpod", id: "Qwen/Qwen3-32B-AWQ", contextWindow: 32768, capabilities: {} },
    ]);
  });

  it("streams chat completions through the Runpod OpenAI-compatible route", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.runpod.ai/v2/endpoint-abc/openai/v1/chat/completions");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer runpod-secret");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("Qwen/Qwen3-32B-AWQ");
      expect(body.stream).toBe(true);
      expect(body.stream_options).toEqual({ include_usage: true });
      return sse([
        'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":23,"completion_tokens":11,"total_tokens":34}}\n\n',
      ]);
    });
    const provider = new RunpodServerlessProvider({ endpointId: "endpoint-abc", apiKey: "runpod-secret", fetcher });
    const events = [];
    for await (const event of provider.stream({ ...request(), model: "Qwen/Qwen3-32B-AWQ" })) events.push(event);
    expect(events).toContainEqual({ type: "text", text: "hello" });
    expect(events).toContainEqual({ type: "usage", inputTokens: 23, outputTokens: 11 });
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("rejects unsafe endpoint IDs and empty credentials", () => {
    expect(() => new RunpodServerlessProvider({ endpointId: "https://attacker.test", apiKey: "key" })).toThrow("endpointId");
    expect(() => new RunpodServerlessProvider({ endpointId: "valid-endpoint", apiKey: " " })).toThrow("API key is required");
  });
});

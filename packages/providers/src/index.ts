import type { ModelEvent, ModelMessage, ModelRequest } from "@m1cro/protocol";


export interface DiscoveredModelRecord { provider: string; id: string; displayName?: string; contextWindow?: number; inputPricePerMillion?: number; outputPricePerMillion?: number; capabilities: Partial<Record<"text" | "toolCalling" | "vision" | "jsonMode" | "streaming" | "reasoning" | "embeddings", { state: "supported" | "unsupported" | "unknown"; source: "provider" | "user" | "inferred" | "default" }>>; }

export interface ModelProvider {
  readonly id: string;
  stream(request: ModelRequest): AsyncIterable<ModelEvent>;
  discoverModels?(): Promise<DiscoveredModelRecord[]>;
}

type OpenAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
};
type PendingTool = { id: string; name: string; arguments: string };
type ChatChunk = {
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
    };
    finish_reason?: string | null;
  }>;
  error?: { message?: string };
};

export class ProviderHttpError extends Error {
  constructor(readonly status: number, detail: string) {
    super("Provider request failed (" + status + "): " + detail.slice(0, 500));
    this.name = "ProviderHttpError";
  }
}

function toOpenAIMessages(messages: ModelMessage[]): OpenAIMessage[] {
  const result: OpenAIMessage[] = [];
  for (const message of messages) {
    if (message.role === "tool") {
      if (!message.toolCallId) throw new Error("Tool messages require a toolCallId");
      result.push({
        role: "tool",
        content: message.content,
        tool_call_id: message.toolCallId,
        ...(message.name ? { name: message.name } : {}),
      });
    } else if (message.role === "assistant" && message.toolCalls?.length) {
      result.push({
        role: "assistant",
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.input) },
        })),
      });
    } else {
      result.push({ role: message.role, content: message.content });
    }
  }
  return result;
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly id: string = "openai-compatible";

  constructor(private readonly options: {
    baseUrl: string;
    providerId?: string;
    apiKey?: string;
    headers?: Record<string, string>;
    fetcher?: typeof fetch;
    maxRetries?: number;
    retryBaseDelayMs?: number;
    maxRetryDelayMs?: number;
    includeUsage?: boolean;
  }) {}

  /** Discover models from an OpenAI-compatible /models endpoint. Unknown capabilities stay unknown. */
  async discoverModels(): Promise<DiscoveredModelRecord[]> {
    const fetcher = this.options.fetcher ?? fetch;
    const response = await fetcher(this.options.baseUrl.replace(/\/$/, "") + "/models", {
      method: "GET",
      headers: {
        ...(this.options.apiKey ? { authorization: "Bearer " + this.options.apiKey } : {}),
        ...this.options.headers,
      },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new ProviderHttpError(response.status, detail || response.statusText);
    }

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
      throw new Error("Provider returned an invalid models response");
    }

    const provider = this.options.providerId ?? this.id;
    return (payload as { data: Array<Record<string, unknown>> }).data.flatMap((item): DiscoveredModelRecord[] => {
      if (typeof item.id !== "string" || !item.id.trim()) return [];
      const record: DiscoveredModelRecord = { provider, id: item.id, capabilities: {} };
      if (typeof item.name === "string" && item.name.trim()) record.displayName = item.name;
      const context = item.context_length;
      if (typeof context === "number" && Number.isSafeInteger(context) && context > 0) record.contextWindow = context;
      const pricing = item.pricing;
      if (pricing && typeof pricing === "object") {
        const prompt = (pricing as Record<string, unknown>).prompt;
        const completion = (pricing as Record<string, unknown>).completion;
        const promptPrice = typeof prompt === "string" || typeof prompt === "number" ? Number(prompt) : NaN;
        const completionPrice = typeof completion === "string" || typeof completion === "number" ? Number(completion) : NaN;
        if (Number.isFinite(promptPrice) && promptPrice >= 0) record.inputPricePerMillion = promptPrice * 1_000_000;
        if (Number.isFinite(completionPrice) && completionPrice >= 0) record.outputPricePerMillion = completionPrice * 1_000_000;
      }
      return [record];
    });
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelEvent> {
    const fetcher = this.options.fetcher ?? fetch;
    const maxRetries = Math.max(0, this.options.maxRetries ?? 2);
    const baseDelay = Math.max(0, this.options.retryBaseDelayMs ?? 250);
    const maxDelay = Math.max(baseDelay, this.options.maxRetryDelayMs ?? 4000);
    let response: Response | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      request.signal.throwIfAborted();
      try {
        response = await fetcher(this.options.baseUrl.replace(/\/$/, "") + "/chat/completions", {
          method: "POST",
          signal: request.signal,
          headers: {
            "content-type": "application/json",
            ...(this.options.apiKey ? { authorization: "Bearer " + this.options.apiKey } : {}),
            ...this.options.headers,
          },
          body: JSON.stringify({
            model: request.model,
            stream: true,
            ...(this.options.includeUsage ? { stream_options: { include_usage: true } } : {}),
            messages: toOpenAIMessages(request.messages),
            tools: request.tools.map((tool) => ({
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
              },
            })),
          }),
        });

        if (response.ok) break;
        const retryable = [408, 409, 425, 429, 500, 502, 503, 504].includes(response.status);
        const detail = await response.text().catch(() => "");
        if (!retryable || attempt === maxRetries) throw new ProviderHttpError(response.status, detail);

        const retryAfter = response.headers.get("retry-after");
        const retryMs = retryAfter && /^\d+(\.\d+)?$/.test(retryAfter)
          ? Math.min(maxDelay, Number(retryAfter) * 1000)
          : Math.min(maxDelay, baseDelay * 2 ** attempt);
        await delay(retryMs, request.signal);
      } catch (error) {
        if (request.signal.aborted) throw request.signal.reason ?? error;
        if (error instanceof ProviderHttpError) throw error;
        if (attempt === maxRetries) throw error;
        await delay(Math.min(maxDelay, baseDelay * 2 ** attempt), request.signal);
      }
    }

    if (!response?.ok) throw new Error("Provider request failed without a response");
    if (!response.body) throw new Error("Provider returned an empty response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;
    let sawDoneMarker = false;
    let sawFinishReason = false;
    const pending = new Map<number, PendingTool>();

    const emitTools = function* (): Generator<ModelEvent> {
      for (const [index, tool] of [...pending.entries()].sort((a, b) => a[0] - b[0])) {
        if (!tool.name) throw new Error("Provider emitted a tool call without a function name");
        let input: unknown;
        try {
          input = JSON.parse(tool.arguments || "{}");
        } catch {
          throw new Error("Provider emitted malformed tool-call JSON for " + tool.name);
        }
        yield {
          type: "tool_call",
          call: { id: tool.id || "call_" + index, name: tool.name, input },
        };
      }
      pending.clear();
    };

    const parseLine = function* (line: string): Generator<ModelEvent> {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const payload = trimmed.slice(5).trim();
      if (!payload) return;
      if (payload === "[DONE]") {
        sawDoneMarker = true;
        return;
      }

      let chunk: ChatChunk;
      try {
        chunk = JSON.parse(payload) as ChatChunk;
      } catch {
        throw new Error("Provider emitted malformed SSE JSON");
      }
      if (chunk.error?.message) throw new Error("Provider stream error: " + chunk.error.message);
      const inputTokens = chunk.usage?.prompt_tokens;
      const outputTokens = chunk.usage?.completion_tokens;
      if (Number.isSafeInteger(inputTokens) && inputTokens! >= 0 && Number.isSafeInteger(outputTokens) && outputTokens! >= 0) {
        yield { type: "usage", inputTokens: inputTokens!, outputTokens: outputTokens! };
      }

      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      if (delta?.content) yield { type: "text", text: delta.content };

      for (const part of delta?.tool_calls ?? []) {
        const current = pending.get(part.index) ?? { id: "", name: "", arguments: "" };
        if (part.id) current.id = part.id;
        if (part.function?.name) current.name += part.function.name;
        if (part.function?.arguments) current.arguments += part.function.arguments;
        pending.set(part.index, current);
      }
      if (choice?.finish_reason) {
        sawFinishReason = true;
        yield* emitTools();
      }
    };

    let abortListener: (() => void) | undefined;
    try {
      const onAbort = () => {
        void reader.cancel(request.signal.reason).catch(() => undefined);
      };
      abortListener = onAbort;
      request.signal.addEventListener("abort", onAbort, { once: true });

      while (true) {
        request.signal.throwIfAborted();
        const { value, done } = await reader.read();
        request.signal.throwIfAborted();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) yield* parseLine(line);
      }

      buffer += decoder.decode();
      if (buffer.trim()) yield* parseLine(buffer);
      if (pending.size) yield* emitTools();
      if (!sawDoneMarker && !sawFinishReason) {
        throw new Error("Provider stream ended before a terminal marker");
      }
      finished = true;
      yield { type: "done" };
    } finally {
      if (abortListener) request.signal.removeEventListener("abort", abortListener);
      if (!finished) await reader.cancel(request.signal.reason).catch(() => undefined);
      reader.releaseLock();
    }
  }
}


export interface RunpodServerlessProviderOptions {
  /** Runpod Serverless endpoint ID, not a full URL. */
  endpointId: string;
  apiKey: string;
  fetcher?: typeof fetch;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  maxRetryDelayMs?: number;
}

/**
 * Runpod Serverless vLLM adapter.
 * Uses Runpod's documented OpenAI-compatible endpoint; streaming and model discovery
 * are inherited from the shared OpenAI-compatible transport.
 */
export class RunpodServerlessProvider extends OpenAICompatibleProvider {
  readonly id: string = "runpod";

  constructor(options: RunpodServerlessProviderOptions) {
    const endpointId = options.endpointId.trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(endpointId)) {
      throw new Error("Runpod endpointId must contain only letters, numbers, hyphens or underscores");
    }
    if (!options.apiKey.trim()) throw new Error("Runpod API key is required");

    super({
      baseUrl: "https://api.runpod.ai/v2/" + endpointId + "/openai/v1",
      providerId: "runpod",
      apiKey: options.apiKey,
      includeUsage: true,
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
      ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
      ...(options.retryBaseDelayMs !== undefined ? { retryBaseDelayMs: options.retryBaseDelayMs } : {}),
      ...(options.maxRetryDelayMs !== undefined ? { maxRetryDelayMs: options.maxRetryDelayMs } : {}),
    });
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) {
    signal.throwIfAborted();
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal.reason ?? new Error("Aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}


export interface AnthropicProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  version?: string;
  headers?: Record<string, string>;
  fetcher?: typeof fetch;
}

/** Anthropic Messages API adapter implemented against the public API contract. */
export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic";
  constructor(private readonly options: AnthropicProviderOptions = {}) {}

  async discoverModels(): Promise<DiscoveredModelRecord[]> {
    const fetcher = this.options.fetcher ?? fetch;
    const baseUrl = (this.options.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
    const headers = {
      "anthropic-version": this.options.version ?? "2023-06-01",
      ...(this.options.apiKey ? { "x-api-key": this.options.apiKey } : {}),
      ...this.options.headers,
    };
    const discovered: DiscoveredModelRecord[] = [];
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const url = new URL(baseUrl + "/v1/models");
      url.searchParams.set("limit", "1000");
      if (cursor) url.searchParams.set("after_id", cursor);
      const response = await fetcher(url, { headers });
      if (!response.ok) throw new ProviderHttpError(response.status, await response.text());
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
        throw new Error("Anthropic returned an invalid models response");
      }
      const body = payload as { data: Array<Record<string, unknown>>; has_more?: boolean; next_page?: string | null };
      for (const item of body.data) {
        if (typeof item.id !== "string" || !item.id.trim()) continue;
        discovered.push({
          provider: this.id,
          id: item.id,
          ...(typeof item.display_name === "string" ? { displayName: item.display_name } : {}),
          capabilities: {},
        });
      }
      if (!body.has_more) return discovered;
      if (typeof body.next_page !== "string" || !body.next_page || seenCursors.has(body.next_page)) {
        throw new Error("Anthropic model pagination returned an invalid or repeated cursor");
      }
      cursor = body.next_page;
      seenCursors.add(cursor);
    }
    throw new Error("Anthropic model discovery exceeded the 20-page safety limit");
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelEvent> {
    const fetcher = this.options.fetcher ?? fetch;
    const system = request.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const messages = request.messages.filter((m) => m.role !== "system").map((m) => {
      if (m.role === "tool") {
        if (!m.toolCallId) throw new Error("Tool messages require a toolCallId");
        return { role: "user", content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }] };
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        return { role: "assistant", content: [
          ...(m.content ? [{ type: "text", text: m.content }] : []),
          ...m.toolCalls.map((call) => ({ type: "tool_use", id: call.id, name: call.name, input: call.input })),
        ] };
      }
      return { role: m.role, content: m.content };
    });
    const response = await fetcher((this.options.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "") + "/v1/messages", {
      method: "POST", signal: request.signal,
      headers: {
        "content-type": "application/json",
        "anthropic-version": this.options.version ?? "2023-06-01",
        ...(this.options.apiKey ? { "x-api-key": this.options.apiKey } : {}),
        ...this.options.headers,
      },
      body: JSON.stringify({
        model: request.model, max_tokens: 4096, stream: true, messages,
        ...(system ? { system } : {}),
        ...(request.tools.length ? { tools: request.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema })) } : {}),
      }),
    });
    if (!response.ok) throw new ProviderHttpError(response.status, await response.text());
    if (!response.body) throw new Error("Provider returned an empty response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const tools = new Map<number, { id: string; name: string; json: string }>();
    const handle = (event: Record<string, any>): ModelEvent[] => {
      if (event.type === "error") throw new Error("Anthropic stream error: " + (event.error?.message ?? "unknown error"));
      if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
        tools.set(event.index ?? 0, { id: event.content_block.id ?? "", name: event.content_block.name ?? "", json: "" });
      }
      const output: ModelEvent[] = [];
      if (event.type === "content_block_delta") {
        if (event.delta?.type === "text_delta" && event.delta.text) output.push({ type: "text", text: event.delta.text });
        if (event.delta?.type === "input_json_delta") {
          const tool = tools.get(event.index ?? 0);
          if (tool) tool.json += event.delta.partial_json ?? "";
        }
      }
      if (event.type === "content_block_stop") {
        const tool = tools.get(event.index ?? 0);
        if (tool) {
          let input: unknown;
          try { input = JSON.parse(tool.json || "{}"); } catch { throw new Error("Anthropic emitted malformed tool input JSON"); }
          output.push({ type: "tool_call", call: { id: tool.id, name: tool.name, input } });
          tools.delete(event.index ?? 0);
        }
      }
      if (event.type === "message_stop") output.push({ type: "done", stopReason: "end_turn" });
      return output;
    };
    try {
      while (true) {
        request.signal.throwIfAborted();
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          let event: Record<string, any>;
          try { event = JSON.parse(trimmed.slice(5).trim()); } catch { throw new Error("Anthropic emitted malformed SSE JSON"); }
          for (const output of handle(event)) yield output;
        }
        if (done) break;
      }
      if (buffer.trim().startsWith("data:")) {
        const event = JSON.parse(buffer.trim().slice(5).trim());
        for (const output of handle(event)) yield output;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }
}

export interface OllamaProviderOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  fetcher?: typeof fetch;
}

/** Ollama native /api/chat adapter and /api/tags model discovery. */
export class OllamaProvider implements ModelProvider {
  readonly id = "ollama";
  constructor(private readonly options: OllamaProviderOptions = {}) {}

  async discoverModels(): Promise<DiscoveredModelRecord[]> {
    const fetcher = this.options.fetcher ?? fetch;
    const response = await fetcher((this.options.baseUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "") + "/api/tags", {
      headers: this.options.headers ?? {},
    });
    if (!response.ok) throw new ProviderHttpError(response.status, await response.text());
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !Array.isArray((payload as { models?: unknown }).models)) {
      throw new Error("Ollama returned an invalid models response");
    }
    return (payload as { models: Array<Record<string, unknown>> }).models.flatMap((item) => {
      if (typeof item.name !== "string" || !item.name.trim()) return [];
      return [{ provider: this.id, id: item.name, displayName: item.name, capabilities: {} }];
    });
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelEvent> {
    const fetcher = this.options.fetcher ?? fetch;
    const messages = request.messages.map((m) => {
      if (m.role === "tool") return { role: "tool", content: m.content };
      if (m.role === "assistant" && m.toolCalls?.length) return {
        role: "assistant", content: m.content,
        tool_calls: m.toolCalls.map((call) => ({ function: { name: call.name, arguments: call.input } })),
      };
      return { role: m.role, content: m.content };
    });
    const response = await fetcher((this.options.baseUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "") + "/api/chat", {
      method: "POST", signal: request.signal,
      headers: { "content-type": "application/json", ...this.options.headers },
      body: JSON.stringify({
        model: request.model, stream: true, messages,
        ...(request.tools.length ? { tools: request.tools.map((tool) => ({
          type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
        })) } : {}),
      }),
    });
    if (!response.ok) throw new ProviderHttpError(response.status, await response.text());
    if (!response.body) throw new Error("Provider returned an empty response body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let toolIndex = 0;
    try {
      while (true) {
        request.signal.throwIfAborted();
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let chunk: Record<string, any>;
          try { chunk = JSON.parse(line); } catch { throw new Error("Ollama emitted malformed NDJSON"); }
          if (chunk.error) throw new Error("Ollama stream error: " + chunk.error);
          if (chunk.message?.content) yield { type: "text", text: chunk.message.content };
          for (const call of chunk.message?.tool_calls ?? []) {
            if (!call.function?.name) throw new Error("Ollama emitted a tool call without a function name");
            yield { type: "tool_call", call: { id: "ollama_" + toolIndex++, name: call.function.name, input: call.function.arguments ?? {} } };
          }
          if (chunk.done) yield { type: "done", stopReason: "stop" };
        }
        if (done) break;
      }
      if (buffer.trim()) {
        const chunk = JSON.parse(buffer.trim());
        if (chunk.error) throw new Error("Ollama stream error: " + chunk.error);
        if (chunk.message?.content) yield { type: "text", text: chunk.message.content };
        if (chunk.done) yield { type: "done", stopReason: "stop" };
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }
}

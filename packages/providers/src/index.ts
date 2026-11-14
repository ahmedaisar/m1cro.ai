import type { ModelEvent, ModelMessage, ModelRequest } from "@m1cro/protocol";

export interface ModelProvider {
  readonly id: string;
  stream(request: ModelRequest): AsyncIterable<ModelEvent>;
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
  readonly id = "openai-compatible";

  constructor(private readonly options: {
    baseUrl: string;
    apiKey?: string;
    headers?: Record<string, string>;
    fetcher?: typeof fetch;
    maxRetries?: number;
    retryBaseDelayMs?: number;
    maxRetryDelayMs?: number;
  }) {}

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
      if (!payload || payload === "[DONE]") return;

      let chunk: ChatChunk;
      try {
        chunk = JSON.parse(payload) as ChatChunk;
      } catch {
        throw new Error("Provider emitted malformed SSE JSON");
      }
      if (chunk.error?.message) throw new Error("Provider stream error: " + chunk.error.message);

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
      if (choice?.finish_reason) yield* emitTools();
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
      finished = true;
      yield { type: "done" };
    } finally {
      if (abortListener) request.signal.removeEventListener("abort", abortListener);
      if (!finished) await reader.cancel(request.signal.reason).catch(() => undefined);
      reader.releaseLock();
    }
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

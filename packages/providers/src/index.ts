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

function toOpenAIMessages(messages: ModelMessage[]): OpenAIMessage[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      if (!message.toolCallId) throw new Error("Tool messages require a toolCallId");
      return {
        role: "tool",
        content: message.content,
        tool_call_id: message.toolCallId,
        ...(message.name ? { name: message.name } : {}),
      };
    }
    if (message.role === "assistant" && message.toolCalls?.length) {
      return {
        role: "assistant",
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: JSON.stringify(call.input) },
        })),
      };
    }
    return { role: message.role, content: message.content };
  });
}

/** Minimal OpenAI Chat Completions-compatible SSE adapter. */
export class OpenAICompatibleProvider implements ModelProvider {
  readonly id = "openai-compatible";

  constructor(private readonly options: {
    baseUrl: string;
    apiKey?: string;
    headers?: Record<string, string>;
    fetcher?: typeof fetch;
  }) {}

  async *stream(request: ModelRequest): AsyncIterable<ModelEvent> {
    const fetcher = this.options.fetcher ?? fetch;
    const response = await fetcher(
      this.options.baseUrl.replace(/\/$/, "") + "/chat/completions",
      {
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
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error("Provider request failed (" + response.status + "): " + detail.slice(0, 500));
    }
    if (!response.body) throw new Error("Provider returned an empty response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const pending = new Map<number, { id: string; name: string; arguments: string }>();
    const emitTools = function* (): Generator<ModelEvent> {
      for (const [index, tool] of [...pending.entries()].sort((a, b) => a[0] - b[0])) {
        let input: unknown;
        try {
          input = JSON.parse(tool.arguments || "{}");
        } catch {
          throw new Error("Provider emitted malformed tool-call JSON for " + tool.name);
        }
        yield { type: "tool_call", call: { id: tool.id || "call_" + index, name: tool.name, input } };
      }
      pending.clear();
    };
    const parseLine = function* (line: string): Generator<ModelEvent> {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") return;
      const chunk = JSON.parse(payload) as {
        choices?: Array<{
          delta?: {
            content?: string | null;
            tool_calls?: Array<{
              index: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
          finish_reason?: string | null;
        }>;
      };
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

    try {
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
      yield { type: "done" };
    } finally {
      if (request.signal.aborted) await reader.cancel(request.signal.reason).catch(() => undefined);
      reader.releaseLock();
    }
  }
}

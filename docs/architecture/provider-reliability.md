# Provider adapter reliability — implementation slice 3

The OpenAI-compatible adapter now assembles tool calls across streamed SSE deltas instead of assuming the function name and complete JSON arguments arrive in one chunk. It supports bounded retries for transient HTTP failures, honours numeric `Retry-After`, propagates abort signals through retry delays and cancels the underlying response reader when a stream is abandoned.

## Request and message handling
- Tool result messages are serialized with `tool_call_id` and optional tool name.
- The adapter preserves user/system/assistant text messages.
- It only retries HTTP 408, 409, 425, 429, 500, 502, 503 and 504, within a bounded attempt count.
- Permanent HTTP failures return a typed `ProviderHttpError` with bounded response detail.
- Retry delay is bounded and abortable.

## Stream handling
- SSE lines are decoded incrementally, including split network chunks and CRLF line endings.
- Tool call fragments are accumulated by tool-call index; ID and function name fragments are concatenated and arguments parsed only after the choice finishes or the stream closes.
- Malformed SSE JSON and malformed tool arguments fail with explicit errors.
- Cancellation cancels the reader and propagates the abort reason.
- A successful stream emits one terminal `done` event.

## Tests
Focused unit tests cover fragmented IDs/names/arguments, transient 429 retries, permanent 400 responses, tool-result serialization and cancellation of the response reader.

## Remaining limitations
- Retry is limited to pre-stream HTTP responses; mid-stream transport retries are intentionally not attempted because replay safety and partial-output duplication require a higher-level idempotency design.
- Streaming usage metadata and provider-specific rate-limit headers are not yet normalized.
- The agent runtime's internal assistant tool-call representation still needs an explicit structured message shape; this adapter's tool-result mapping is correct for the current protocol representation only.

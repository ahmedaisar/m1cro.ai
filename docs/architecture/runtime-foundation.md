# Runtime foundation — implementation slice 1

This PR establishes an independently authored TypeScript workspace and first runtime contracts. No OpenClaude or Verboo source is imported.

## Package boundaries
- `@m1cro/protocol`: provider-neutral model requests and runtime events.
- `@m1cro/policy`: deterministic risk decisions; default policy auto-allows only read operations.
- `@m1cro/tools`: typed, host-injected tool registry. No shell/filesystem tool is enabled by default.
- `@m1cro/providers`: minimal OpenAI-compatible SSE adapter without silent retries or provider switching.
- `@m1cro/sessions`: append-only JSONL persistence adapter with restrictive file modes.
- `@m1cro/core`: bounded agent loop, cancellation propagation, policy checks and typed events.

## Deliberate limitations
- Approval events are emitted, but approval-response handshake is not implemented. Non-read tools fail closed.
- Tool input validation is delegated to each tool's parse function; JSON Schema enforcement will be added at the registry boundary.
- Provider adapter expects each tool call's arguments in one SSE delta; fragmented tool-call assembly is follow-up work.
- Session storage lacks indexing, locking, compaction and crash-recovery validation.
- No default shell, filesystem, network or browser tools are registered.

## Security posture
A tool is executable only when the host registers it. Default policy allows only tools classified read-only and requires approval for write, destructive, network and execute risks. Model output is never treated as authorization.

## Next slices
1. Approval request/response control channel and event journal.
2. Schema-validated tool inputs and built-in read/search tools with path confinement.
3. Robust provider streaming, fragmented tool calls, bounded retries and cancellation.
4. CLI TUI and local configuration/secret-store adapters.
5. Provider fixtures and human-like PTY tests.

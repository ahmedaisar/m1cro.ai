# Runtime foundation — implementation slices 1–2

This implementation establishes an independently authored TypeScript workspace and a provider-neutral runtime. No OpenClaude or Verboo source is imported.

## Package boundaries
- `@m1cro/protocol`: provider-neutral model requests and runtime events, including approval-required and approval-resolved events.
- `@m1cro/policy`: deterministic risk decisions; default policy auto-allows only read operations.
- `@m1cro/tools`: typed, host-injected tool registry with Ajv JSON Schema validation at the registry boundary.
- `@m1cro/providers`: OpenAI-compatible SSE adapter; provider reliability improvements are a follow-up slice.
- `@m1cro/sessions`: append-only JSONL persistence adapter with restrictive file modes.
- `@m1cro/core`: bounded agent loop, cancellation propagation, policy checks, explicit approval handshake and typed events.

## Approval contract
1. Policy returns allow, deny or approve. Only allow proceeds without a prompt.
2. Approve pauses the current turn and emits `approval.required`.
3. A host-provided `ApprovalController` receives the exact turn ID, call ID, tool name, input and risk.
4. Only a decision tagged `actor: "user"` can resolve the request. The decision is scoped to that pending call; it is not reusable for another call.
5. Rejection emits `approval.resolved` and a failed tool result, then the agent may continue. Missing approval controller fails closed. Cancellation aborts the pending approval through the same signal.

The runtime does not provide a default UI or persistence for approvals; the hosting CLI/client supplies the controller in a later slice. Approval records should be appended to the session event journal by that host.

## Tool input boundary
Each registered tool declares a JSON Schema. Ajv compiles it during registration; every input is validated before parsing/execution. Schema failures become tool errors and never reach the tool's execute function. Tool-specific parsing remains a second validation layer.

## Security posture
A tool is executable only when the host registers it. Default policy allows only explicitly classified read-only tools. Write, destructive, network and execute risks require a user approval from the host controller. Model output is never treated as authorization.

## Remaining limitations
- Tool approval UX and durable approval journal are not yet wired; the CLI slice will provide the interactive controller and session event persistence.
- Schema support follows Ajv's JSON Schema dialect/options; schemas are compiled strictly at registration.
- Provider adapter still needs fragmented tool-call assembly, correct assistant tool-call message serialization, bounded retries and cancellation tests.
- Session storage lacks indexing, locking, compaction and crash-recovery validation.
- No default shell, filesystem, network or browser tools are registered.

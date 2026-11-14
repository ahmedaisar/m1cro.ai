# Runtime foundation — implementation status

This document records the current implementation boundary. The runtime is independently authored; no OpenClaude or Verboo source is imported.

## Package boundaries

- `@m1cro/protocol`: provider-neutral model requests, tool-call contracts and runtime events.
- `@m1cro/policy`: deterministic risk decisions; default policy auto-allows only read operations.
- `@m1cro/tools`: schema-validated, host-injected tool registry and workspace filesystem tools.
- `@m1cro/providers`: OpenAI-compatible SSE adapter with fragmented tool-call assembly, bounded retries, cancellation and terminal-stream validation.
- `@m1cro/sessions`: append-only JSONL persistence adapter with restrictive file modes.
- `@m1cro/core`: bounded agent loop, approval handshake, policy checks, session history and typed events.
- `@m1cro/cli`: local terminal client with explicit approval prompts and environment-based provider credentials.

## Implemented in the current stack

- Provider-neutral model and runtime event contracts.
- Conservative policy: only read-risk tools auto-run.
- Tool input JSON Schema validation occurs before approval is requested.
- Write-risk tools require a user approval response; missing/non-interactive approval fails closed.
- Provider stream assembly handles fragmented tool-call IDs, names and arguments.
- Provider retries are bounded and cancellation is propagated.
- Incomplete provider streams without a terminal marker are reported as failures.
- Workspace read/write/list/search tools enforce relative paths, reject symlinks, limit file sizes and use atomic writes.
- JSONL session history is restored for subsequent turns.
- CLI API keys are read from `OPENAI_API_KEY`; plaintext keys in local config are rejected.

## Known limitations and follow-up work

- Filesystem path checks reduce traversal and symlink exposure but do not eliminate all TOCTOU races against a concurrently mutating hostile workspace. A stronger descriptor-relative strategy and adversarial race tests are required before claiming a hardened sandbox boundary.
- Session storage has no inter-process locking, compaction, indexing or crash-recovery validation.
- The CLI is a basic readline interface, not the full TUI required by the MVP.
- Provider support in the CLI is currently OpenAI-compatible only. Anthropic-compatible and Ollama adapters remain outstanding.
- No shell/process execution, browser, remote sandbox, skills, MCP client, model catalog, model capability routing, subagents or runtime doctor is included yet.
- API credentials are environment-only until a platform credential-store adapter is implemented.
- Context compaction, partial-response recovery and cross-platform installed-package/PTy tests remain outstanding.

## Next slices

1. Finish adversarial filesystem tests and document the local workspace threat model.
2. Add installed-package and PTY coverage for the CLI.
3. Add provider adapters and capability-aware model catalog.
4. Add shell tools behind explicit execute-risk policy and safe process controls.
5. Add skills/MCP and context recovery.
6. Continue with shared runtime protocol clients and later hosted/remote services.

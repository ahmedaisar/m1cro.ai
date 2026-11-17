# Runtime host service

**Status:** Initial single-user Node.js host implemented; not yet the production web gateway.

The @m1cro/runtime-host package adapts the existing AgentRuntime to HTTP and Server-Sent Events. It does not implement a second agent loop. The server entry point wires the same OpenAI-compatible, Anthropic and Ollama providers, DefaultPolicy, filesystem tool registry and JSONL transcript store used by the CLI.

## Run locally

    M1CRO_RUNTIME_TOKEN="$(openssl rand -hex 32)" OPENAI_API_KEY="..." M1CRO_WORKSPACE_ROOT="$PWD" pnpm --filter @m1cro/runtime-host dev

For Ollama, set M1CRO_PROVIDER=ollama and M1CRO_BASE_URL as needed. For Anthropic, set M1CRO_PROVIDER=anthropic and ANTHROPIC_API_KEY.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| M1CRO_RUNTIME_TOKEN | required | Single-user bearer secret; at least 32 characters |
| M1CRO_RUNTIME_HOST | 127.0.0.1 | Bind address; keep loopback for local use |
| M1CRO_RUNTIME_PORT | 8787 | HTTP port |
| M1CRO_CORS_ORIGINS | http://localhost:3000 | Explicit comma-separated browser origins |
| M1CRO_WORKSPACE_ROOT | current directory | Workspace root for filesystem tools |
| M1CRO_DATA_DIR | ~/.m1cro | Private local transcript and runtime registry storage |
| M1CRO_PROVIDER | openai-compatible | openai-compatible, anthropic or ollama |
| M1CRO_MODEL | provider default | Model identifier |
| M1CRO_BASE_URL | provider default | Provider API base URL |

## HTTP contract

- GET /health
- GET /v1/sessions
- POST /v1/sessions with { "projectId": "..." }
- GET /v1/sessions/:sessionId
- GET /v1/sessions/:sessionId/history?limit=<1..2000> (validated user/assistant/tool transcript messages)
- GET /v1/sessions/:sessionId/events?after=<sequence> (SSE; supports Last-Event-ID)
- POST /v1/sessions/:sessionId/commands with the versioned RuntimeCommand union

The host authenticates bearer tokens, checks project/session authorization callbacks, validates command shapes, limits request body and prompt sizes, bounds concurrent turns, sequences events per session, and correlates approval responses to the active turn and exact tool call. Unknown commands fail closed. Shell/process execution is not registered.

## Current limitations and security boundary

- This entry point is a single-user local development host. The static bearer token is intended for a trusted local caller or a server-side adapter. Never place it in browser JavaScript, commit it, or expose this HTTP listener directly to the public internet.
- Put a TLS-terminating reverse proxy and a real identity/session-aware server-side gateway in front of any remote deployment. Replace the local token authenticator and authorization callbacks before multi-user use.
- Conversation transcripts and versioned runtime event envelopes are persisted in per-session JSONL files. Session ownership/status snapshots are stored in a private append-only runtime registry. On restart, the host rebuilds the session list and replay sequence; any turn that was still running or awaiting approval is marked failed/interrupted rather than resumed. The provider turn itself is not transparently resumed.
- Workspace filesystem tools are constrained to the configured workspace root, but this first host does not provide an isolated remote executor. Do not register shell/process tools or treat this as a multi-tenant sandbox.
- The web workspace is not yet wired to this service. A Next.js server-side authenticated transport/BFF and real browser session UI remain Phase 3 work.

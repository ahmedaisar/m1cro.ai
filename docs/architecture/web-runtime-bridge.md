# Web runtime bridge — implementation plan

**Status:** Approved implementation direction; not yet implemented  
**Scope:** Phase 3 — workspace and client protocol, with the first usable web coding-session vertical slice

## Objective

Turn `apps/web` from a dashboard shell into a real client for the shared m1cro runtime. The web application must not contain a second agent loop or execute model/tool logic itself. It is a client of the existing versioned `m1cro.runtime` protocol.

## Architecture boundary

```text
Browser (Next.js workspace)
  | HTTPS + SSE, protocol m1cro.runtime v1
  v
Runtime gateway (Node.js 22 service)
  | session registry + command validation
  v
AgentRuntime (@m1cro/core)
  | provider adapters / policy / tools / session store
  v
Execution workspace (isolated sandbox)
```

The Next.js application is a presentation and account/client layer. Long-running agent turns must not run inside ordinary serverless request handlers. The runtime gateway owns session lifecycle, provider credentials, tool policy, event sequencing and cancellation.

## Transport contract

The gateway exposes a small transport adapter over the existing protocol:

- `GET /health` — returns protocol identity/version and runtime readiness. The web client must reject unsupported protocol versions.
- `GET /v1/sessions` — lists sessions visible to the authenticated principal.
- `POST /v1/sessions` — creates a session associated with an authorized project/workspace.
- `GET /v1/sessions/:sessionId` — returns session metadata and terminal state.
- `GET /v1/sessions/:sessionId/events` — streams `RuntimeEventEnvelope` records as SSE; reconnect uses the last acknowledged sequence.
- `POST /v1/sessions/:sessionId/commands` — accepts validated `RuntimeCommand` values (start, cancel, approval response).

The adapter must preserve the protocol's session correlation and monotonically increasing per-session sequence. Replayed events must be deduplicated by sequence. Unknown protocol versions, malformed envelopes, unauthorized session IDs and invalid command transitions fail closed.

## First end-to-end acceptance slice

1. User configures a trusted runtime URL and completes a protocol health handshake.
2. User creates/selects a project and starts a session.
3. User submits a prompt; the browser sends a typed `turn.start` command.
4. The browser renders streamed assistant text and tool-call/result timeline events.
5. A write/execute approval event is rendered with the exact tool and input; no action is executed until the user responds.
6. User can cancel a running turn; cancellation is idempotent and visible.
7. Refresh/reconnect resumes event consumption from the last sequence without replaying completed tool actions.
8. Session metadata and messages survive runtime restart through the session store.

## Security requirements

- Runtime endpoints require authentication; CORS allowlists are explicit and never use wildcard origins with credentials.
- Browser clients never receive provider API keys, runtime admin credentials or sandbox control credentials.
- Remote runtime URLs must use HTTPS. Localhost access is an explicit development mode with an origin allowlist and short-lived pairing credential.
- Every command is schema-validated and authorized against the authenticated principal and session owner.
- Approval decisions are explicit, bound to a specific pending call ID and idempotent.
- Tool execution remains governed by `@m1cro/policy`; UI controls do not replace server-side policy.
- No arbitrary shell execution is enabled until an isolated executor and OS-level boundary are independently validated.
- Runtime logs redact credentials and sensitive request headers. Session storage is product-scoped.
- Rate limits and bounded prompt/event/output sizes apply at the gateway.

## Delivery slices

### A. Protocol transport package
- Add a transport package that maps HTTP/SSE to existing `RuntimeCommand` and `RuntimeEventEnvelope` types.
- Add runtime health/version negotiation, event replay cursor and command validation tests.
- Keep the runtime transport independent of Next.js.

### B. Runtime host
- Add a Node.js 22 host process around the existing `AgentRuntime`.
- Reuse existing provider adapters, `DefaultPolicy`, filesystem tools and session store.
- Add graceful shutdown, cancellation propagation, bounded concurrency and structured diagnostics.
- Start with local development; remote sandbox execution remains a separate adapter.

### C. Web client
- Replace static sample data with authenticated API-backed projects and sessions.
- Implement runtime connection status, project/session selection, streaming transcript, tool timeline, approval UI and cancel/reconnect controls.
- Keep browser-local drafts separate from authoritative runtime session state.
- Display an explicit unavailable state when no compatible runtime is configured.

### D. Release validation
- Unit tests for protocol parsing, sequence gaps/replay, command authorization, approval binding and cancellation.
- Runtime integration tests with deterministic fake provider; no live API keys in CI.
- Web production build and focused browser smoke test on release validation, not every feature-branch commit.
- Validate preview deployment before promoting a production build.

## Explicitly out of scope for this slice

Hosted identity, team billing, hosted inference, global model routing, cloud project sync, desktop/editor clients, browser automation and unrestricted shell access. These follow after the local/remote runtime boundary is proven.

## Current known deployment configuration

The Vercel project named `m1cro.ai` was previously configured with no framework and attempted to publish a static `public` directory. The Next.js app lives under `apps/web`. Its project settings have now been aligned to Next.js, root directory `apps/web`, Node.js 22.x, `npm ci` and `npm run build`. A separate `m1cro-workspace` project already had a successful deployment for the same commit; retain it until the primary project configuration is validated.

## Definition of done

The web workspace is not called a functional coding-agent client until the acceptance slice above passes against the real shared runtime. A dashboard build, local browser storage or a mock assistant response is not sufficient.

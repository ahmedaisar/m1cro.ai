# m1cro.ai implementation roadmap

## Delivery status — 2026-11-16

The initial runtime foundation was merged through PRs #1–#6. Follow-up milestones added the normalized model catalog (PR #9), OpenAI-compatible model discovery (PR #10), Anthropic/Ollama adapters (PR #12), capability evaluation (PR #13), CLI provider selection (PR #14), runtime-level capability-aware model selection (PR #16), the versioned runtime client protocol (PR #17) and the initial Next.js web workspace shell (PR #18).

The current state is a **runtime foundation plus an unconnected web shell, not a complete local CLI or web MVP**. Baseline validation on 2026-11-16 passed: root typecheck, 70 unit tests across 10 files, root TypeScript build, web typecheck and Next.js production build.

The source-provenance assessment is documented in `docs/research/license-provenance-audit.md`. It is an engineering risk assessment, not legal clearance. Reuse of OpenClaude/Verboo source remains blocked unless qualified legal review approves it.

## Phase 0 — Product/repository foundation

- [x] Establish the product definition and EARS PRD.
- [x] Record Verboo/OpenClaude research findings and state the limits of the PR review coverage.
- [x] Establish the TypeScript workspace strategy and package boundaries.
- [x] Add contribution guidance and lightweight GitHub Actions CI.
- [x] Record initial architecture decisions for protocol, provider, policy, storage and clean-room provenance.
- [ ] Obtain qualified legal clearance before any upstream source reuse or trademark-dependent positioning.

## Phase 1 — Agent runtime vertical slice

- [x] Provider adapter contract and first OpenAI-compatible adapter.
- [x] Model catalog and explicit capability schema (PR #9).
- [x] Streaming agent loop and turn state machine.
- [x] Workspace filesystem read/write/list/search tools with path, size and symlink checks.
- [ ] Shell/process tools behind an isolated executor; raw shell execution remains disabled.
- [x] Permission engine, approval handshake, schema validation and cancellation.
- [x] Local JSONL session persistence and resume by session ID.
- [x] Basic interactive readline CLI and one-shot mode.
- [ ] Full-screen TUI and richer session/command management.

**Phase 1 is partially complete.** The remaining work above is required before calling the local CLI MVP complete. The current filesystem boundary is not a kernel-level sandbox against a hostile same-user process racing filesystem operations.

## Phase 2 — Production-grade CLI

- [ ] Context compaction, partial-response recovery and crash recovery.
- [ ] Skills and MCP.
- [ ] Subagents and persistent goals.
- [ ] Runtime doctor, diagnostics and privacy guardrails.
- [ ] Installed-package, PTY and cross-platform tests.
- [x] Anthropic-compatible and Ollama/local provider adapters (PR #12).
- [x] Capability evaluation and candidate partitioning.
- [x] Runtime-level capability-aware model selection (PR #16); automatic provider discovery/catalog population and CLI routing remain open.

## Phase 3 — Workspace and client protocol

- [x] Versioned runtime event protocol and per-session event sequencing (PR #17).
- [x] Initial Next.js web workspace shell (PR #18).
- [x] Align the primary Vercel `m1cro.ai` project with the Next.js app root (`apps/web`), Node.js 22 and npm build commands.
- [x] Implement the initial HTTP/SSE transport adapter and Node.js host around the shared `AgentRuntime`; do not create a second agent loop in Next.js. See [runtime host](architecture/runtime-host.md).
- [x] Persist session metadata and sequenced event history; rebuild the session list/replay log after restart and mark interrupted turns failed.
- [ ] Add production identity/session authorization and a server-side web transport; the current host is single-user/local-development only.
- [ ] Attach to, observe, cancel and resume active runtime sessions from the web client.
- [ ] Render streamed assistant output, tool activity and explicit approval requests.
- [ ] Replace sample dashboard content with authenticated/API-backed projects and sessions.
- [ ] Browser/editor integration foundations.

**Phase 3 is in progress.** The initial single-user Node.js runtime host now exists and is covered by deterministic transport tests. The web app still provides a browser-local workspace shell; it is not yet connected to the host and does not yet execute coding sessions. Do not label it a functional coding-agent client until the real runtime bridge acceptance criteria pass.

## Phase 4 — Hosted platform

- [ ] Identity and hosted inference gateway.
- [ ] Model catalog API and routing.
- [ ] Metering, quotas and billing.
- [ ] Usage dashboard.

## Phase 5 — Cloud and teams

- [ ] Isolated remote sandbox lifecycle.
- [ ] Secret injection and artifact handling.
- [ ] Team workspaces, roles and budgets.
- [ ] SDK and headless service.

## Release gates

- Keep deterministic typecheck and unit tests fast on feature branches and pull requests.
- Keep live-provider, PTY, installed-package, browser and visual checks guarded or in release validation; do not make them a routine feature-branch bottleneck.
- Do not claim a sandbox guarantee until the executor and OS isolation boundary are independently tested.
- Do not claim full MVP completion while the Phase 1 and Phase 2 items above remain open.
- Validate Vercel preview deployments before any production promotion; the primary `m1cro.ai` project must use `apps/web` as its root directory.

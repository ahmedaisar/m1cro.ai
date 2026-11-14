# m1cro.ai implementation roadmap

## Delivery status — 2026-11-15

The initial runtime foundation was merged through PRs #1–#6. Follow-up milestones added the normalized model catalog (PR #9), OpenAI-compatible model discovery (PR #10), Anthropic/Ollama adapters (PR #12), capability evaluation (PR #13), and CLI provider selection (PR #14). This remains a **foundation milestone, not completion of the MVP**. The CLI now supports all three provider families; model discovery is being exposed through a common CLI command.

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
- [x] Capability evaluation and candidate partitioning; provider/CLI routing integration remains open.

## Phase 3 — Workspace and client protocol

- [ ] Versioned runtime event protocol.
- [ ] Web project/session workspace.
- [ ] Attach to and observe active runtime sessions.
- [ ] Browser/editor integration foundations.

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

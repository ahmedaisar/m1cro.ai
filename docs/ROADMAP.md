# m1cro.ai implementation roadmap

## Phase 0 — Product/repository foundation
- [ ] Complete license, provenance and trademark audit for upstream reuse.
- [ ] Map OpenClaude packages and identify the portable runtime boundary.
- [ ] Finalize workspace strategy and TypeScript conventions.
- [ ] Add contribution guide, code ownership and lightweight CI.
- [ ] Approve provider, protocol, policy and storage ADRs.

## Phase 1 — Agent runtime vertical slice
- [ ] Provider adapter contract and first adapters.
- [ ] Model catalog and capability schema.
- [ ] Streaming agent loop and turn state machine.
- [ ] Filesystem/search/shell tools.
- [ ] Permission engine and cancellation.
- [ ] Local session persistence and resume.
- [ ] Interactive CLI.

## Phase 2 — Production-grade CLI
- [ ] Context compaction and recovery.
- [ ] Skills and MCP.
- [ ] Subagents and persistent goals.
- [ ] Runtime doctor and privacy guardrails.
- [ ] Installed-package, PTY and cross-platform tests.

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

# m1cro.ai implementation roadmap

## Delivery status â€” 2026-11-16

The initial runtime foundation was merged through PRs #1â€“#6. Follow-up milestones added the normalized model catalog (PR #9), OpenAI-compatible model discovery (PR #10), Anthropic/Ollama adapters (PR #12), capability evaluation (PR #13), CLI provider selection (PR #14), runtime-level capability-aware model selection (PR #16), the versioned runtime client protocol (PR #17) and the initial Next.js web workspace shell (PR #18).

The current state is a **runtime foundation plus an unconnected web shell, not a complete local CLI or web MVP**. Baseline validation on 2026-11-16 passed: root typecheck, 70 unit tests across 10 files, root TypeScript build, web typecheck and Next.js production build.

The source-provenance assessment is documented in `docs/research/license-provenance-audit.md`. It is an engineering risk assessment, not legal clearance. Reuse of OpenClaude/Verboo source remains blocked unless qualified legal review approves it.

## Phase 0 â€” Product/repository foundation

- [x] Establish the product definition and EARS PRD.
- [x] Record Verboo/OpenClaude research findings and state the limits of the PR review coverage.
- [x] Establish the TypeScript workspace strategy and package boundaries.
- [x] Add contribution guidance and lightweight GitHub Actions CI.
- [x] Record initial architecture decisions for protocol, provider, policy, storage and clean-room provenance.
- [ ] Obtain qualified legal cl¶»§q«^
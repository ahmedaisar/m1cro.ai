# m1cro.ai

**The AI Engineering Workspace** — One engineering workspace. Any model. Multiple agents.

m1cro.ai is a model-agnostic AI engineering platform. The first release focuses on a trusted, local-first coding-agent runtime with BYOK and local model support. Hosted inference, the web workspace, browser/editor clients and remote sandboxes follow behind stable runtime and security contracts.

## Project documents

- [Product Requirements Document (EARS)](docs/PRD.md)
- [Verboo / OpenClaude research log](docs/research/verboo-openclaude.md)
- [Architecture decision records](docs/architecture/ADRs.md)
- [Implementation roadmap](docs/ROADMAP.md)
- [License and provenance gate](docs/research/license-provenance-audit.md)

## Current implementation

The runtime foundation is under active development. It currently contains provider-neutral event contracts, a conservative permission policy, a host-injected tool registry, an OpenAI-compatible streaming adapter, append-only JSONL session persistence and a bounded agent loop.

No OpenClaude or Verboo source code is imported. The approval handshake, robust provider streaming, confined workspace tools and interactive CLI are being delivered as separate reviewable slices.

## Workspace packages

- `@m1cro/protocol` — provider-neutral model requests and runtime event contracts
- `@m1cro/policy` — deterministic risk policy
- `@m1cro/tools` — typed host-injected tool registry and workspace tools
- `@m1cro/providers` — provider adapters
- `@m1cro/sessions` — local session persistence
- `@m1cro/core` — shared agent runtime
- `@m1cro/cli` — local command-line client

## Development

Requirements: Node.js 22+ and pnpm 10+.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## Security defaults

- Only tools explicitly registered by the host can execute.
- The default policy automatically allows read-only tools and requires explicit user approval for other risk classes.
- No arbitrary shell, browser or network tools are enabled by default.
- BYOK/local operation does not require an m1cro account.
- Provider credentials are supplied through environment variables; plaintext API keys are not stored in the m1cro config file.

## Product principles

- Model freedom and local/BYOK independence
- Capability-aware routing
- Safe execution and explicit permissions
- One runtime across clients
- Portable sessions, skills and integrations
- Fast agent iteration with production-grade release checks

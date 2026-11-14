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

The runtime foundation is under active development. It includes provider-neutral event contracts, a conservative permission policy, a host-injected tool registry, an OpenAI-compatible streaming adapter, append-only JSONL session persistence, a bounded agent loop, confined workspace filesystem tools and a local CLI.

No OpenClaude or Verboo source code is imported.

## Workspace packages

- `@m1cro/protocol` — provider-neutral model requests and runtime event contracts
- `@m1cro/policy` — deterministic risk policy
- `@m1cro/tools` — typed host-injected tool registry and workspace tools
- `@m1cro/providers` — provider adapters
- `@m1cro/sessions` — local session persistence
- `@m1cro/core` — shared agent runtime
- `@m1cro/cli` — local command-line client

## Getting started

Requirements: Node.js 22+ and pnpm 10+.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## CLI quick start

```bash
export OPENAI_API_KEY="your-api-key"
pnpm cli
```

You can also send one prompt with `pnpm cli -- "Explain this codebase"`. Options include `--workspace <dir>`, `--model <id>`, `--base-url <url>` and `--session <id>`. Local session history lives under `~/.m1cro`; the CLI currently connects to an OpenAI-compatible endpoint.

## Security defaults

- The CLI registers workspace-scoped filesystem tools only; no shell, browser or arbitrary network tool is enabled.
- Reads are automatically allowed; writes require explicit interactive approval.
- Approval prompts identify the exact tool, risk and input being approved.
- API keys are read from `OPENAI_API_KEY`; the CLI does not prompt for or persist plaintext keys.
- BYOK/local operation does not require an m1cro account.

## Product principles

- Model freedom and local/BYOK independence
- Capability-aware routing
- Safe execution and explicit permissions
- One runtime across clients
- Portable sessions, skills and integrations
- Fast agent iteration with production-grade release checks

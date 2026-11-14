# m1cro.ai

**The AI Engineering Workspace** — One engineering workspace. Any model. Multiple agents.

m1cro.ai is a model-agnostic AI engineering platform. The initial implementation is an independently authored, local-first TypeScript agent runtime. BYOK and local inference are first-class; hosted inference, workspace clients and remote sandboxes follow behind stable runtime and security contracts.

## Repository status

The runtime foundation is under active development. It currently contains provider-neutral event contracts, a conservative permission policy, an injected tool registry, a minimal OpenAI-compatible streaming adapter, append-only JSONL session persistence and a bounded agent loop.

No OpenClaude or Verboo source code is imported.

## Workspace

- `@m1cro/protocol` — model request and runtime event contracts
- `@m1cro/policy` — deterministic risk policy
- `@m1cro/tools` — typed host-injected tool registry
- `@m1cro/providers` — provider adapters
- `@m1cro/sessions` — local session persistence
- `@m1cro/core` — agent runtime

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
pnpm install
export OPENAI_API_KEY="your-api-key"
pnpm cli
```

You can also send one prompt with `pnpm cli -- "Explain this codebase"`. Options include `--workspace <dir>`, `--model <id>`, `--base-url <url>` and `--session <id>`. Local configuration and session history live under `~/.m1cro`. The CLI currently connects to an OpenAI-compatible endpoint.

## Security defaults

- The CLI registers workspace-scoped filesystem tools only; there is no shell, browser or arbitrary network tool.
- Reads are automatically allowed; writes require explicit interactive approval.
- Approval prompts identify the exact tool, risk and input being approved.
- Session/config directories use restrictive permissions; API keys are never printed.
- BYOK/local operation does not require an m1cro account.

## Product documents

- [Product requirements](docs/PRD.md)
- [Research log](docs/research/verboo-openclaude.md)
- [License and provenance gate](docs/research/license-provenance-audit.md)
- [Architecture decisions](docs/architecture/ADRs.md)
- [Runtime foundation notes](docs/architecture/runtime-foundation.md)
- [Roadmap](docs/ROADMAP.md)

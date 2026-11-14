# m1cro.ai — Product Requirements Document

**Version:** 1.0 · **Status:** Draft for implementation planning · **Date:** 2026-11-14  
**Positioning:** The AI Engineering Workspace  
**Tagline:** One engineering workspace. Any model. Multiple agents.

## 1. Executive summary

m1cro.ai is a model-agnostic AI engineering platform built around a capable coding-agent runtime and an integrated developer workspace. It combines local and bring-your-own-key (BYOK) inference with optional hosted inference, model routing, remote execution, and first-class developer integrations.

The product is not a cosmetic fork of an existing coding CLI. The opportunity is to own the full workflow: understand a task, plan it, execute changes in a controlled environment, validate the result, and make work inspectable and reproducible across terminal, desktop, browser, editor, and API surfaces.

The recommended foundation is an independently branded and governed agent runtime, informed by lessons from OpenClaude and Verboo Code. Any upstream code reuse requires a documented license, provenance, trademark, dependency, and security review.

## 2. Vision and principles

**Vision:** Make high-quality AI-assisted software engineering accessible across models, providers, environments, and interfaces without locking developers into one inference vendor or execution surface.

Principles:
1. Model freedom: users choose hosted m1cro inference, their own provider credentials, or local endpoints.
2. Local-first control: the core agent works locally without an m1cro account for BYOK/local workflows.
3. Capability-aware orchestration: route by declared model capabilities, not fragile model-name guesses.
4. Trust before autonomy: permissions, sandbox boundaries, visible execution, cancellation, and audit trails are foundational.
5. Portable workflows: projects, sessions, skills, MCP integrations and agent definitions are exportable and documented.
6. One runtime, many surfaces: clients share contracts rather than reimplementing agent behavior.
7. Useful failures: explain what failed, what was preserved, and what recovery is available.

## 3. Research basis and competitive teardown

### 3.1 Sources reviewed
- Verboo product: https://verboo.ai/en
- Verboo Code: https://github.com/verbeux-ai/code
- Verboo Code PRs: https://github.com/verbeux-ai/code/pulls
- Verboo Code README: https://github.com/verbeux-ai/code/blob/main/README.md
- Verboo Code package manifest: https://github.com/verbeux-ai/code/blob/main/package.json
- OpenClaude upstream: https://github.com/Twigpine/openclaude

GitHub repository metadata identifies `verbeux-ai/code` as a fork of `Twigpine/openclaude`. At review time, the public PR listing contained 83 PRs, with latest activity on 2026-11-13. The current README describes a hosted-platform-oriented CLI with browser login, secure OS-native credential storage, a platform model catalog, model routing, persistent goals, managed Chrome integration and a headless gRPC mode.

**Research coverage note:** the public PR listing was retrieved in full. This document synthesizes repository metadata, README/package documentation, selected PR descriptions and selected product-defining/latest PR evidence. It does not claim every file diff and every review thread across all 83 PRs was audited line by line. The linked PR index is the evidence trail for continued exhaustive review.

### 3.2 What Verboo did well

**A. Consistent product identity.** Early PRs aligned the visible UI, tool prompts, errors, onboarding and CLI language. Provider identifiers and third-party model names were intentionally preserved where changing them would be incorrect. Lesson: use a brand policy and automated rebrand scan; distinguish product strings from provider IDs, model names, trademarks and protocol fields.

**B. CLI became a platform client.** Browser login, account-aware model discovery, full model IDs and native secure credential storage show a deliberate connection to a wider hosted service. Lesson: implement hosted services as adapters. BYOK and local operation remain first-class; never hardwire hosted assumptions into the agent core.

**C. Capability metadata became a first-class contract.** Vision delegation detects image blocks, selects a vision-capable model, converts image content to text analysis, caches by content hash and degrades gracefully if delegation fails. The later refinement uses catalog capability metadata and tri-state support rather than relying on naming heuristics. Lesson: model capabilities need explicit supported/unsupported/unknown states.

**D. Real agent reliability got attention.** The PR history contains streaming lifecycle fixes, partial-output preservation, retries, provider reset hints, cold-start feedback, structured provisioning errors and cancellation work. Lesson: model the entire turn lifecycle as a state machine. A dropped stream is not a successful turn.

**E. One runtime was exposed through more surfaces.** Chrome extension work and a documented headless gRPC service expand the agent beyond the terminal. Lesson: define a stable runtime event protocol and make each surface a client, not a separate agent implementation.

**F. Trust and data isolation matured.** Recent work addresses storage collisions with Claude Code, accidental deletion, environment hardening, privacy checks, pinned CI actions, dependency auditing, safe auto-mode fallback and resilient marketplace parsing. Lesson: protect neighboring tools and user data. Namespace state, make migration explicit, and isolate integration failures.

**G. Testing became closer to real user behavior.** Isolated tests, installed-package validation, PTY tests and human-like E2E scenarios improve confidence beyond source-level tests. Lesson: fast feedback locally; focused PR gates; broader release checks for installed product journeys.

### 3.3 Selected PR evidence

PRs are grouped by product lesson. Closed does not mean merged; state is noted where known.

| PR | Topic | Observed lesson |
|---|---|---|
| [#1](https://github.com/verbeux-ai/code/pull/1) | Prompt input visual polish | Refine daily interaction |
| [#2](https://github.com/verbeux-ai/code/pull/2) | UI rebrand | Consistent product identity; closed unmerged |
| [#3](https://github.com/verbeux-ai/code/pull/3) | Prompt, error and CLI rebrand | Brand across surfaces |
| [#4](https://github.com/verbeux-ai/code/pull/4) | Verboo 429 retry | Provider-aware reliability |
| [#5](https://github.com/verbeux-ai/code/pull/5) | `--list-models` | Programmatic catalog access |
| [#6](https://github.com/verbeux-ai/code/pull/6) | Vision delegation attempt | Cross-model fallback; superseded |
| [#8](https://github.com/verbeux-ai/code/pull/8) | Vision delegation refinement | Typed capability, caching and graceful fallback |
| [#9](https://github.com/verbeux-ai/code/pull/9) | Startup logo | Responsive terminal UX |
| [#10](https://github.com/verbeux-ai/code/pull/10) | Streaming reliability | Correct lifecycle semantics |
| [#11](https://github.com/verbeux-ai/code/pull/11) | Hooks/execution hardening | Safe process execution; closed unmerged |
| [#12](https://github.com/verbeux-ai/code/pull/12) | Slow-response feedback | Explain latency without changing request state |
| [#13](https://github.com/verbeux-ai/code/pull/13) | Provisioning errors | Structured auth/billing errors |
| [#14](https://github.com/verbeux-ai/code/pull/14) | CI test isolation | Deterministic checks and baseline tracking |
| [#15](https://github.com/verbeux-ai/code/pull/15) | Chrome extension | Shared browser/CLI experience; closed unmerged |
| [#78](https://github.com/verbeux-ai/code/pull/78) | Storage isolation | Dedicated state; read-only migration |
| [#79](https://github.com/verbeux-ai/code/pull/79) | Privacy/rebrand CI | Automated guardrails |
| [#80](https://github.com/verbeux-ai/code/pull/80) | Provider quota fallback | User-controlled model switch |
| [#81](https://github.com/verbeux-ai/code/pull/81) | Auto mode | Autonomy with fail-safe permission fallback |
| [#82](https://github.com/verbeux-ai/code/pull/82) | Human E2E scenarios | Test real user journeys |
| [#83](https://github.com/verbeux-ai/code/pull/83) | Marketplace resilience | Isolate malformed entries; avoid collateral data loss |

### 3.4 What not to copy blindly
- Do not inherit upstream product assumptions, branding or provider-specific behavior without an explicit decision.
- Do not assume repository descriptions establish legal provenance; inspect commit history and licenses.
- Do not copy the entire monorepo before defining the portable runtime boundary.
- Do not substitute model-name heuristics for authoritative capability data.
- Do not allow test debt or CI to become a constant coding-agent bottleneck.
- Do not launch remote execution before threat model, isolation, quota and data-retention controls exist.

## 4. Users and jobs to be done

Personas:
1. Independent developer who wants a capable agent with their preferred model.
2. AI-native builder who needs multiple agents, skills and persistent tasks.
3. Small engineering team that needs shared workflows and auditable execution.
4. Platform developer who wants an SDK/API to embed agent features.
5. Local-model practitioner who wants Ollama/OpenAI-compatible local inference.

Jobs:
- Turn a natural-language request into a reviewable plan.
- Explore and understand a repository.
- Implement changes with controlled file and shell access.
- Run tests and iterate through failures.
- Delegate work across specialized models/agents.
- Resume work with context and progress intact.
- Inspect, approve, interrupt and reproduce agent activity.
- Run workflows locally or in an isolated remote sandbox.

## 5. Product scope and releases

### Release 1 — MVP: trusted coding-agent core
A developer can install m1cro Code, configure BYOK/local inference, select a model, open a project, plan a task, execute edits and commands with permissions, validate changes and resume safely.

MVP includes:
- TypeScript cross-platform CLI and interactive TUI.
- Non-interactive mode.
- Provider adapters: OpenAI-compatible, Anthropic-compatible and Ollama/local.
- Normalized model catalog and capability schema.
- Read/write/edit/search/glob/shell tools.
- Permission engine, cancellation and execution transcript.
- Local session persistence and resume.
- Project instructions, skills and MCP client support.
- Structured logs, diagnostics and runtime doctor.
- Unit, integration, PTY and installed-package smoke tests.

Not MVP: hosted inference marketplace, general multi-tenant sandbox fleet, team billing/admin, marketplace payments, autonomous production deployment without approval.

### Release 2 — m1cro Workspace
Web project/session workspace, desktop app using the same runtime protocol, browser integration, remote session attach, search and shared settings.

### Release 3 — m1cro Router and Cloud
Hosted inference, account authentication, model catalog/routing, usage metering, quotas, billing, sandbox orchestrator, secrets, SDK and headless API.

### Release 4 — Teams and ecosystem
Team roles, budgets, audit exports, shared agent profiles, marketplace and organization reporting.

## 6. EARS requirements

Patterns: Ubiquitous (shall), Event-driven (WHEN), State-driven (WHILE), Unwanted behavior (IF/THEN), Optional (WHERE). Priority: P0 MVP/blocking; P1 near-term; P2 later.

### 6.1 Installation, startup and portability

**M1-CLI-001 — P0** The system shall provide a documented installation path for supported macOS, Linux and Windows environments. Acceptance: install instructions list prerequisites; version command reports product/runtime version; installation avoids administrator privileges unless required; unsupported environments receive a diagnostic.

**M1-CLI-002 — P0** WHEN the user launches m1cro in a project directory, the system shall initialize the session with that directory as project root. Acceptance: resolved root is visible; tool paths are normalized and checked; symlink/path traversal behavior is tested.

**M1-CLI-003 — P0** The system shall provide a runtime doctor command checking runtime versions, permissions, provider setup, storage health and required tools. Acceptance: human and JSON output; no secret disclosure; each issue has a suggested action.

**M1-CLI-004 — P1** WHEN an update is available, the system shall explain the version change and provide a safe update path. Acceptance: update is installation-aware; never overwrites unrelated executables/data; recovery steps documented.

### 6.2 Authentication and provider configuration

**M1-AUTH-001 — P0** WHERE a provider requires credentials, the system shall support secure credential configuration without storing plaintext secrets in project files. Acceptance: environment and OS credential stores supported where feasible; values redacted; project config references secret names only by default.

**M1-AUTH-002 — P0** WHERE the user selects a local or BYOK provider, the system shall allow core CLI operation without a hosted m1cro account. Acceptance: no hosted login required; privacy tests detect unexpected m1cro network requests; setup docs provided.

**M1-AUTH-003 — P1** WHEN a user signs in to hosted m1cro services, the system shall complete browser authorization using PKCE and short-lived credentials with refresh rotation. Acceptance: state and PKCE validated; tokens stored in platform secure storage; logout invalidates credentials where supported.

**M1-AUTH-004 — P0** IF credentials are missing, expired or rejected, THEN the system shall show a provider-specific explanation and safe recovery action without exposing credentials. Acceptance: auth errors distinct from quota/transient rate limit; configured local/BYOK fallback remains available.

### 6.3 Model catalog and routing

**M1-MODEL-001 — P0** The system shall represent models in a normalized catalog containing provider, full model identifier, known context limit, known pricing and supported capabilities.

**M1-MODEL-002 — P0** The system shall represent each capability as supported, unsupported or unknown. Acceptance: unknown is never coerced to true/false; provider metadata takes precedence over inferred metadata; fallback inference is labeled and tested.

**M1-MODEL-003 — P0** WHEN a user selects a model, the system shall preserve the provider's full model identifier without lossy normalization.

**M1-MODEL-004 — P1** WHEN a task requires a capability unavailable on the selected model, the system shall offer a compatible alternative or safe delegation path. Acceptance: delegated model is inspectable; delegation can be disabled; failure does not corrupt primary conversation.

**M1-MODEL-005 — P1** WHEN a provider returns a retryable rate-limit response, the system shall honor valid provider reset hints or apply bounded exponential backoff with jitter. Acceptance: quota exhaustion is not retried indefinitely; cancellation interrupts backoff; retry count and timing are visible.

**M1-MODEL-006 — P1** WHEN the selected provider is exhausted and another provider is configured, the system shall explain the quota event and offer a model switch without silently switching providers.

### 6.4 Agent runtime and tools

**M1-AGENT-001 — P0** WHEN a user submits a task, the system shall execute a bounded agent turn of model requests, tool calls, results and follow-up responses until completion, cancellation, policy denial or configured limit.

**M1-AGENT-002 — P0** The system shall provide tools for file read/write/edit, text search, path matching and shell execution. Acceptance: schema-validated inputs; permission-bound file access; structured tool errors; bounded output with summarization where needed.

**M1-AGENT-003 — P0** WHEN a tool requires approval under active policy, the system shall show the proposed action and await explicit approval before execution.

**M1-AGENT-004 — P0** WHEN the user requests cancellation, the system shall stop the active turn and propagate cancellation to child agents and cancellable processes. Acceptance: idempotent cancellation; queued/draft input preserved where possible; no new tool action after cancellation acknowledgment except documented cleanup.

**M1-AGENT-005 — P0** IF a provider stream terminates unexpectedly, THEN the system shall mark the turn failed/interrupted rather than completed, preserve valid partial output and expose recovery.

**M1-AGENT-006 — P1** WHERE subagents are enabled, the system shall support typed roles, bounded delegation, isolated context and explicit result handoff.

**M1-AGENT-007 — P1** WHERE persistent goals are enabled, the system shall allow users to create, inspect, pause, resume, replace and complete goals.

**M1-AGENT-008 — P1** WHERE image input is supported by the active model, the system shall pass image content using the provider's supported representation.

**M1-AGENT-009 — P1** IF image content is encountered and the active model lacks vision, THEN the system shall use a configured vision-capable delegate or a clear placeholder without repeatedly submitting unsupported content.

### 6.5 Permissions, safety and sandboxing

**M1-SEC-001 — P0** The system shall apply explicit permission policy to filesystem, shell, network and external integration access.

**M1-SEC-002 — P0** The system shall distinguish read-only, reversible write, destructive and sensitive network actions.

**M1-SEC-003 — P0** IF an action is denied by policy, THEN the system shall report the reason and shall not execute it.

**M1-SEC-004 — P0** The system shall redact secrets from logs, transcripts, diagnostics and telemetry.

**M1-SEC-005 — P0** The system shall store product data in a product-specific namespace and shall not modify/delete another tool's sessions, credentials, skills or settings without explicit authorization.

**M1-SEC-006 — P1** WHERE remote execution is enabled, the system shall execute workloads in isolated sandboxes with CPU, memory, disk, process and time limits.

**M1-SEC-007 — P1** WHERE remote execution is enabled, the system shall inject credentials through secret management rather than embedding them in source or image layers.

**M1-SEC-008 — P1** The system shall provide an auditable record of permission decisions and significant execution events.

### 6.6 Sessions and context

**M1-SESSION-001 — P0** The system shall persist sessions with stable identifiers, project association, timestamps, messages, tool activity and terminal state.

**M1-SESSION-002 — P0** WHEN a user resumes a session, the system shall restore the last valid conversation/project context without replaying completed tool actions.

**M1-SESSION-003 — P0** The system shall provide commands to list, search, resume, rename and delete product-owned sessions.

**M1-SESSION-004 — P1** WHEN conversation approaches the active model context limit, the system shall compact or summarize context while preserving essential task state and references.

**M1-SESSION-005 — P1** The system shall maintain project-scoped instructions and optional knowledge indexes without leaking context between projects.

### 6.7 Skills, MCP and integrations

**M1-EXT-001 — P0** The system shall support project- and user-level skills with documented discovery precedence and frontmatter validation.

**M1-EXT-002 — P1** The system shall support MCP servers through documented transports and typed tool schemas.

**M1-EXT-003 — P1** IF an integration fails to initialize, THEN the system shall isolate the failure and keep unrelated tools and integrations usable.

**M1-EXT-004 — P1** The system shall provide a command to inspect integration status, permissions and diagnostics.

### 6.8 Streaming, UX and observability

**M1-UX-001 — P0** The system shall stream assistant text, permitted reasoning visibility, tool status and terminal state to interactive clients.

**M1-UX-002 — P0** WHILE a request is pending without visible output, the system shall provide a non-misleading progress indicator.

**M1-UX-003 — P0** The system shall distinguish queued, running, awaiting approval, retrying, completed, failed, cancelled and interrupted states.

**M1-UX-004 — P0** The system shall provide consistent keyboard controls for submission, interruption, navigation and safe exit.

**M1-OBS-001 — P0** The system shall provide structured diagnostics for provider requests, tool execution, retries, latency and runtime failures.

**M1-OBS-002 — P0** The system shall provide a privacy-aware diagnostics export that excludes secrets and can be inspected before sharing.

### 6.9 Workspace and client surfaces

**M1-WEB-001 — P1** The system shall provide a web workspace to authenticate users and display projects, sessions, model choices, usage and account settings.

**M1-DESKTOP-001 — P1** WHERE the desktop client is installed, it shall reuse the core runtime protocol and expose project, session and execution controls.

**M1-BROWSER-001 — P1** WHERE the browser extension is installed, it shall expose page read/find/click/type/capture through explicit site permissions and approval policy.

**M1-EDITOR-001 — P2** WHERE an editor extension is available, it shall attach to the same runtime and expose session state without creating a separate agent implementation.

### 6.10 Hosted platform and billing

**M1-PLATFORM-001 — P1** WHERE hosted inference is enabled, the platform shall authenticate users and authorize each inference request against account policy.

**M1-PLATFORM-002 — P1** The platform shall meter usage from provider-reported usage when available and documented estimates otherwise.

**M1-PLATFORM-003 — P1** WHEN a quota or plan limit is reached, the platform shall return a structured error code and recovery hint.

**M1-PLATFORM-004 — P1** The platform shall version and document model catalog, billing, usage and inference authorization contracts.

**M1-PLATFORM-005 — P2** WHERE team plans are enabled, the platform shall support organization membership, roles, budgets and usage reports.

### 6.11 SDK and headless operation

**M1-SDK-001 — P1** The system shall expose a versioned SDK for starting, streaming, interrupting and inspecting sessions.

**M1-SDK-002 — P1** WHERE headless operation is enabled, the runtime shall expose a documented service interface with bidirectional events and explicit permission requests.

**M1-SDK-003 — P1** The system shall publish protocol definitions and compatibility tests for supported client languages.

## 7. Non-functional requirements

- **NFR-001 Performance (P0):** CLI startup/input remain responsive; establish reference-hardware budgets before release.
- **NFR-002 Reliability (P0):** provider failure, tool error, cancellation and persistence have deterministic terminal states.
- **NFR-003 Security (P0):** no plaintext secret logging; untrusted tool output is never trusted policy/system instruction.
- **NFR-004 Portability (P0):** test supported macOS, Linux and Windows.
- **NFR-005 Accessibility (P1):** keyboard navigation, visible focus, readable contrast and reduced-motion options.
- **NFR-006 Maintainability (P0):** explicit boundaries among providers, runtime, tools, persistence and presentation.
- **NFR-007 Observability (P0):** safe diagnostic metadata and correlation identifiers.
- **NFR-008 Privacy (P0):** telemetry is minimal, disclosed, documented and disableable; BYOK/local mode has no undeclared phone-home.
- **NFR-009 Extensibility (P1):** providers, skills, MCP, tools and clients use versioned contracts.
- **NFR-010 Cost controls (P1):** configurable budgets/limits for turns, tool loops, delegation and remote compute.

## 8. Recommended architecture

Start as a modular monolith with explicit package boundaries. Split independently deployed services only when security, scale or operations justify it.

Core packages:
- `@m1cro/core`: agent loop, turn state machine, events and cancellation.
- `@m1cro/providers`: provider adapters, normalization, streaming and retry.
- `@m1cro/models`: model catalog, capabilities and routing policies.
- `@m1cro/tools`: filesystem, search and shell tools.
- `@m1cro/policy`: permissions and approvals.
- `@m1cro/sessions`: persistence, resume and context compaction.
- `@m1cro/extensions`: skills, MCP and integration registry.
- `@m1cro/cli`: interactive and non-interactive CLI.
- `@m1cro/protocol`: versioned runtime/client contracts.
- `@m1cro/sdk`: public programmatic API.

Future platform services: identity/account; model catalog and inference gateway; usage/billing; sandbox orchestration; workspace API; audit/operations.

### 8.1 Suggested technology

| Layer | Recommendation |
|---|---|
| Runtime | TypeScript, Node.js 22+, Bun for development/testing where useful |
| CLI | React terminal UI / Ink or proven equivalent |
| Web | Next.js App Router, TypeScript, Tailwind |
| Desktop | Tauri or Electron after protocol stabilizes |
| Database | PostgreSQL |
| Cache/queue | Redis when justified |
| Auth | OAuth/OIDC with PKCE and refresh rotation |
| Sandbox | Isolated containers or microVMs; validate threat model |
| Streaming | Versioned event protocol; gRPC or WebSocket by client needs |
| Artifact storage | S3-compatible object storage |
| Hosting | Vercel for web control plane where appropriate; dedicated compute for inference/sandboxes |

### 8.2 Turn flow
1. Client submits task and project context.
2. Runtime constructs bounded turn and policy context.
3. Router selects model based on user choice, availability and capability.
4. Assistant response streams to client.
5. Tool calls are schema-validated and evaluated by permission engine.
6. Approved tools execute in configured local/remote environment.
7. Results return to agent loop.
8. Session/event history persists.
9. Turn terminates as completed, failed, interrupted or cancelled.

### 8.3 Architecture decision records
- **ADR-001 — Local/BYOK independence:** hosted inference is an adapter, not a core dependency.
- **ADR-002 — Capability registry:** capabilities are tri-state; unknown cannot authorize an unsupported operation.
- **ADR-003 — Shared protocol:** all clients use a versioned runtime contract.
- **ADR-004 — Storage isolation:** product state lives under `~/.m1cro` (or platform equivalent); no silent mutation of third-party agent directories.
- **ADR-005 — Safe autonomy:** policy is deterministic and outside model prompts; classifier failure never grants permission.
- **ADR-006 — Modular monolith first:** boundaries before service splitting.
- **ADR-007 — Remote execution later:** tenant isolation, process/network restrictions, secrets, quotas, retention and incident response precede customer workloads.

## 9. Data model outline

Initial entities: User, Organization, Membership, ProviderConnection, Model, ModelCapability, Project, ProjectInstruction, Session, Message, AgentTurn, ToolCall, Approval, Skill, MCPServer, Integration, UsageRecord, Plan, Sandbox, SandboxArtifact, AuditEvent.

Local MVP storage should use a versioned local database or structured append-only session records with crash-recovery safeguards. Cloud persistence uses PostgreSQL and object storage for large artifacts.

## 10. Security and privacy baseline

- Product-owned data directories and explicit migration tooling.
- Never silently copy/delete/overwrite third-party agent state.
- Environment allowlists for child processes.
- Strict path and symlink checks.
- Shell policy and approvals for high-risk actions.
- Secret redaction in events, logs and diagnostics.
- No model-generated authorization without independent policy.
- Network policy for tools and remote sandboxes.
- Dependency pinning and vulnerability review.
- CI privacy scans for undeclared telemetry/endpoints.
- Retention and deletion policy before hosted session storage launches.

## 11. Quality strategy and CI

**Fast local path:** formatting/type checks for touched packages, focused unit tests, build/CLI smoke, targeted provider/runtime tests.

**PR checks:** install/build, focused unit/integration, security/privacy/rebrand scans, changed-package type checks, CLI smoke and selected PTY E2E, lightweight dependency audit.

**Main/release:** full isolated test matrix, cross-platform smoke, clean-consumer package install, human-like E2E critical journeys, provenance/package-integrity/privacy verification.

Vercel should host web preview deployments. Production release follows merge and required checks; no comprehensive slow CI on every feature-branch commit.

## 12. Implementation roadmap

### Phase 0 — Product/repository foundation
- Complete license, provenance and trademark audit.
- Map upstream packages and portable runtime boundary.
- Finalize workspace strategy and conventions.
- Add contribution guide, code ownership and lightweight CI.
- Approve provider/protocol/policy/storage ADRs.
Exit: scope approved; reuse obligations documented; minimal build/test passes.

### Phase 1 — Agent runtime vertical slice
- Provider contract and first adapters.
- Model catalog and capability schema.
- Streaming agent loop and state machine.
- Filesystem/search/shell tools.
- Permission engine and cancellation.
- Local session persistence/resume.
- Interactive CLI.
Exit: real repository task works with BYOK/local inference; tools recorded; cancellation/errors are correct.

### Phase 2 — Production CLI
- Context compaction/recovery.
- Skills and MCP.
- Subagents and persistent goals.
- Doctor and privacy guardrails.
- Installed-package, PTY and cross-platform tests.
Exit: clean install/configuration, run, resume and update journeys pass.

### Phase 3 — Workspace/client protocol
- Stable runtime event protocol.
- Web project/session workspace.
- Attach/stream to runtime sessions.
- Browser/editor integration foundations.
Exit: web client observes/controls same runtime without duplicating the agent loop.

### Phase 4 — Hosted platform
- Account service and inference gateway.
- Model catalog API and routing.
- Metering, quotas and billing.
- Usage dashboard.
Exit: hosted requests authenticated, metered and explainably limited.

### Phase 5 — Cloud and teams
- Isolated sandbox lifecycle.
- Secret injection and artifacts.
- Team workspace, roles and budgets.
- SDK and headless service.
Exit: remote projects execute in isolated environments and can be inspected, stopped and safely destroyed.

## 13. MVP success metrics

Proposed targets, not existing performance claims:
- At least 70% of new users complete a first successful tool-using task after setup.
- At least 80% of benchmark tasks reach a valid terminal state without manual recovery.
- At least 99% of turns have correctly classified terminal state.
- 99% of cancellation requests stop subsequent tool execution within a defined runtime bound.
- Resume does not replay completed tool actions.
- Initial providers pass a shared compatibility suite.
- Zero known plaintext-secret leaks in tests/diagnostics.
- Focused PR checks remain short enough for tight agent iteration; full suite remains available on main/release.

## 14. Risks

| Risk | Mitigation |
|---|---|
| Upstream license/provenance uncertainty | Legal/provenance audit before reuse |
| Scope too large | Local/BYOK CLI vertical slice first |
| Provider incompatibility | Shared adapter contract tests |
| Unsafe autonomy | Independent policy engine, approvals, sandbox |
| Provider instability | Bounded retries, cancellation, fallback |
| Hosted compute cost | Delay gateway/sandboxes until demand |
| Divergent clients | Shared protocol/design system |
| CI bottleneck | Fast local path and focused PR gates |
| Data collisions | Dedicated storage and non-destructive migration |

## 15. Open decisions

Resolve during Phase 0/1:
1. Which upstream code can be reused after license/security review?
2. npm-only first or standalone binaries too?
3. Which providers are required for the first public preview?
4. Which local session storage format best supports portability/recovery?
5. Tauri or Electron for desktop?
6. Which sandbox technology meets threat model and cost envelope?
7. Which hosted inference vendors, if any, launch the first catalog?
8. Telemetry defaults and retention commitments?

## 16. References

- https://verboo.ai/en
- https://github.com/verbeux-ai/code
- https://github.com/verbeux-ai/code/pulls
- https://github.com/verbeux-ai/code/blob/main/README.md
- https://github.com/verbeux-ai/code/blob/main/package.json
- https://github.com/Twigpine/openclaude
- https://github.com/Twigpine/openclaude/pulls
- Selected PRs: [#8](https://github.com/verbeux-ai/code/pull/8), [#10](https://github.com/verbeux-ai/code/pull/10), [#14](https://github.com/verbeux-ai/code/pull/14), [#15](https://github.com/verbeux-ai/code/pull/15), [#78](https://github.com/verbeux-ai/code/pull/78), [#79](https://github.com/verbeux-ai/code/pull/79), [#80](https://github.com/verbeux-ai/code/pull/80), [#81](https://github.com/verbeux-ai/code/pull/81), [#82](https://github.com/verbeux-ai/code/pull/82), [#83](https://github.com/verbeux-ai/code/pull/83)

## Appendix A — Initial implementation PR decomposition
1. License/provenance/upstream architecture audit.
2. Workspace, package boundaries and conventions.
3. Runtime turn/event state machine.
4. Provider adapter contract.
5. Model catalog and capability metadata.
6. Safe filesystem and search tools.
7. Permission evaluation and approvals.
8. Interactive CLI.
9. Local session persistence/resume.
10. Streaming, cancellation and retries.
11. Skills and MCP.
12. Installed CLI and human-like PTY tests.
13. Versioned runtime event protocol.
14. Web project/session workspace.
15. Hosted inference and usage metering.
16. Isolated sandbox execution.

## Appendix B — Definition of done

A feature is done when behavior and requirements are documented; permissions/failure states considered; relevant tests included; diagnostics are safe/actionable; docs/examples updated; local/BYOK paths remain functional; and the PR is focused and reviewable.

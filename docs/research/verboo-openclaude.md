# Verboo / OpenClaude research log

**Review date:** 2026-11-14

## Lineage and product evolution

GitHub repository metadata identifies `verbeux-ai/code` as a fork of `Twigpine/openclaude`. The current Verboo Code README positions it as the coding-agent CLI for the Verboo platform and documents browser login, secure native credential storage, model catalog and routing, persistent goals, Chrome integration and a headless gRPC service.

The public PR listing returned 83 PRs. Latest repository PR activity visible during the review was 2026-11-13.

## What Verboo got right

1. **Identity:** systematically aligned user-visible labels, prompts, errors and onboarding while preserving technical provider/model identifiers.
2. **Platform connection:** added browser auth, account-aware model catalog access, full model IDs and native secure credential storage.
3. **Capability-aware routing:** vision delegation lets image context work even when the selected model has no vision capability; refined implementation uses catalog capability metadata, caching and graceful degradation.
4. **Reliability:** invested in streaming lifecycle, retry semantics, rate-limit reset hints, cold-start feedback and structured errors.
5. **Surface expansion:** a browser extension and headless gRPC service make the runtime usable outside the terminal.
6. **Trust:** recent work isolates storage from Claude Code directories, hardens process execution, adds privacy/rebrand checks and dependency auditing.
7. **Validation:** isolated tests, clean package install tests, PTY checks and human-like E2E workflows.

## Selected PRs in chronological/product context

| PR | Topic | State at review | Evidence |
|---|---|---|---|
| #1 | Prompt input polish | Merged | https://github.com/verbeux-ai/code/pull/1 |
| #2 | UI rebrand | Closed, not merged | https://github.com/verbeux-ai/code/pull/2 |
| #3 | Prompts/errors/CLI rebrand | Merged | https://github.com/verbeux-ai/code/pull/3 |
| #4 | 429 retry in Verboo mode | Merged | https://github.com/verbeux-ai/code/pull/4 |
| #5 | List models CLI option | Merged | https://github.com/verbeux-ai/code/pull/5 |
| #6 | Vision delegation initial attempt | Closed, superseded | https://github.com/verbeux-ai/code/pull/6 |
| #8 | Vision delegation refinement | Merged | https://github.com/verbeux-ai/code/pull/8 |
| #9 | Startup logo/responsive terminal | Merged | https://github.com/verbeux-ai/code/pull/9 |
| #10 | Streaming during long agent tasks | Merged | https://github.com/verbeux-ai/code/pull/10 |
| #11 | Hooks/environment hardening | Closed, unmerged | https://github.com/verbeux-ai/code/pull/11 |
| #12 | Slow response/warming hint | Merged | https://github.com/verbeux-ai/code/pull/12 |
| #13 | Structured plan provisioning error | Merged | https://github.com/verbeux-ai/code/pull/13 |
| #14 | CI test isolation | Merged | https://github.com/verbeux-ai/code/pull/14 |
| #15 | Chrome MV3 side panel/browser tools | Closed, unmerged | https://github.com/verbeux-ai/code/pull/15 |
| #78 | Stop writing/deleting in Claude directories | Open | https://github.com/verbeux-ai/code/pull/78 |
| #79 | Privacy/rebrand CI and dependency audit | Open | https://github.com/verbeux-ai/code/pull/79 |
| #80 | Offer Verboo model after BYOK quota ends | Open | https://github.com/verbeux-ai/code/pull/80 |
| #81 | Auto mode safety/reliability | Open | https://github.com/verbeux-ai/code/pull/81 |
| #82 | Human E2E scenarios | Open | https://github.com/verbeux-ai/code/pull/82 |
| #83 | Partial marketplace entry validation | Open | https://github.com/verbeux-ai/code/pull/83 |

## Continue exhaustive review

This is a selected synthesis, not a claim of full per-file review of all 83 PRs. Continue by inspecting PRs #16–#77 in creation order: PR body, changed files, patches, inline review threads, conversation timeline, commits and merge status. Record whether each PR merged, was superseded, or was abandoned. Never infer that a closed PR was merged.

## Primary references
- https://verboo.ai/en
- https://github.com/verbeux-ai/code
- https://github.com/verbeux-ai/code/pulls
- https://github.com/verbeux-ai/code/blob/main/README.md
- https://github.com/verbeux-ai/code/blob/main/package.json
- https://github.com/Twigpine/openclaude
- https://github.com/Twigpine/openclaude/pulls

# m1cro.ai — Architecture decision records

## ADR-001: Local/BYOK independence
**Status:** Proposed
The core agent runtime must work with local and user-owned provider credentials without requiring an m1cro account. Hosted inference is an adapter, not an agent-core dependency.

## ADR-002: Capability-aware model catalog
**Status:** Proposed
Model capabilities use supported / unsupported / unknown states. Do not silently infer from model IDs when authoritative capability metadata exists.

## ADR-003: Shared runtime protocol
**Status:** Proposed
CLI, web, desktop, browser, editor and SDK clients consume one versioned event/command protocol. Avoid separate agent loops per client.

## ADR-004: Product-owned storage namespace
**Status:** Proposed
Use `~/.m1cro` or platform equivalent. Do not write/delete third-party coding-agent state without explicit user-driven and reversible migration.

## ADR-005: Policy is outside the model
**Status:** Proposed
Permission decisions are deterministic and independent of model prompts/classifiers. Classifier failure never grants permission; interactive fallback is a user approval prompt.

## ADR-006: Modular monolith first
**Status:** Proposed
Establish explicit package boundaries and versioned contracts. Split services only where scale, security or operations justify it.

## ADR-007: Remote execution is a later release
**Status:** Proposed
Do not expose customer workloads until tenant isolation, process/network controls, secrets, quotas, resource limits, artifact retention and incident response are designed and tested.


## ADR-008: No upstream source reuse before written provenance approval
**Status:** Proposed — blocking gate

The public OpenClaude and Verboo repository notice states that the code contains Claude Code-derived proprietary material and that the MIT grant for contributor modifications applies only where legally permissible. The notice explicitly says the underlying derived code remains subject to Anthropic copyright and the project does not have Anthropic authorization to distribute that proprietary source.

Until qualified counsel reviews the exact source material and distribution plan, m1cro will not import code from these repositories. Product/behavior research may inform independently authored implementations. Maintain a per-file provenance manifest for any later-approved reuse.

See [license and provenance audit](../research/license-provenance-audit.md). This is an engineering risk control, not legal advice.

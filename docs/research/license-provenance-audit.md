# License and provenance audit — upstream reuse gate

**Date:** 2026-11-14  
**Status:** Preliminary risk finding — legal review required before reuse.

## Executive finding

Do **not** copy or base the m1cro.ai implementation on the current OpenClaude/Verboo Code source tree until the rights and provenance of the inherited Claude Code-derived portions are clarified by qualified counsel.

The public `LICENSE`/notice file in both repositories explicitly states:
- The codebase contains code derived from Anthropic's Claude Code CLI.
- The original Claude Code source is proprietary and subject to Anthropic's Commercial Terms of Service.
- The OpenClaude contributors offer their modifications/additions under MIT **where legally permissible**.
- The notice says the underlying derived code remains subject to Anthropic copyright and that the project does not have Anthropic's authorization to distribute that proprietary source.

This is not a normal, unambiguous MIT license for the complete repository. A fork relationship or public GitHub availability does not itself grant rights to reuse proprietary upstream code.

## Evidence

- OpenClaude repository: https://github.com/Twigpine/openclaude
- Verboo Code repository: https://github.com/verbeux-ai/code
- OpenClaude notice/license: https://raw.githubusercontent.com/Twigpine/openclaude/main/LICENSE
- Verboo Code notice/license: https://raw.githubusercontent.com/verbeux-ai/code/main/LICENSE
- Verboo Code README: https://github.com/verbeux-ai/code/blob/main/README.md

The exact notice text should be rechecked against the commit/tag intended for any reuse; licenses and repository contents may change.

## Recommendation

1. Treat the current source tree as **not approved for direct reuse**.
2. Commission a legal review of the notice, upstream Claude Code terms, repository history, contributors' rights and applicable distribution/use implications.
3. Prefer a clean-room implementation based on documented behavior and independently authored code unless counsel confirms specific files/changes can be used.
4. Keep a provenance manifest for every reused package/file, including source commit, license, copyright notices and modifications.
5. Avoid copying Anthropic-owned prompts, internal implementation, assets, product strings or proprietary logic.
6. Independently implement common, well-understood agent concepts and protocol adapters.
7. Revisit this gate before publishing binaries, npm packages, hosted services or source distributions.

## Engineering implications

- The PRD's architecture and EARS requirements remain useful and do not depend on copying source code.
- Build m1cro as an independently governed runtime with stable interfaces.
- Study upstream/OpenClaude/Verboo behavior as product research, not as permission to copy implementation.
- If a lawful reuse path is established for particular modifications, isolate the reused components behind adapters and preserve required notices.

## Decision

**Proposed ADR-008:** No upstream source code is imported into m1cro until a written provenance/license review approves the exact material and distribution method.

This is a preliminary engineering risk assessment, not legal advice or a definitive legal opinion.

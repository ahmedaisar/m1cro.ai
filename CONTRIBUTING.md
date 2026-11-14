# Contributing to m1cro.ai

## Principles
- Keep pull requests focused and reviewable.
- Prefer small vertical slices over broad rewrites.
- Preserve local/BYOK independence.
- Add tests for behavior and failure states.
- Do not add telemetry or network calls without documenting them.
- Never modify third-party agent state by default.

## Validation
Run the smallest relevant checks locally, then build and run focused tests for changed packages. PR workflow should remain fast; main/release workflows run the broader matrix.

## Pull requests
Include the problem, behavior change, risks, tests run, screenshots for UI changes, and migration/security implications where applicable.

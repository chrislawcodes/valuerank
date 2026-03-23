# Wave 2 Plan: Runner Extension

See `docs/plans/i7-structured-discovery-plan.md` Wave 2 for full details.

## Approach

Single-wave implementation. All changes in run_factory.py and tests.
No external dependencies. No data migrations. Purely additive to existing behavior.

## Risk: MEDIUM

The V1 version guard removal changes visible behavior (V2 state now displays correctly).
Migration wired into loader is transparent — existing V1 state.json files upgrade on first read.

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Implementation complete. 74 tests pass. All correctness findings addressed.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: Implementation complete. 74 tests pass. All correctness findings addressed.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Implementation complete. 74 tests pass. All correctness findings addressed.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Implementation complete. 74 tests pass. All correctness findings addressed.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: Implementation complete. 74 tests pass. All correctness findings addressed.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Implementation complete. 74 tests pass. All correctness findings addressed.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Implementation complete. 74 tests pass. All correctness findings addressed.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: Implementation complete. 74 tests pass. All correctness findings addressed.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: Implementation complete. 74 tests pass. All correctness findings addressed.
- review: reviews/diff.gemini.regression-adversarial.review.md | status: accepted | note: Round 3 findings: migration idempotent and well-tested (Wave 1, 13 tests). _safe_list() defensive loading added. Resolve/defer duplicate inconsistency deferred. Silent no-op deferred to Wave 4.
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: Round 3 findings: migration idempotent and well-tested (Wave 1, 13 tests). _safe_list() defensive loading added. Resolve/defer duplicate inconsistency deferred. Silent no-op deferred to Wave 4.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: Codex runner failed (network). Round 2 Codex findings already addressed: migrate before mutate, answers normalization, _safe_list defensive loading. No blocking issues.

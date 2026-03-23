# Wave 2 Plan: Runner Extension

See `docs/plans/i7-structured-discovery-plan.md` Wave 2 for full details.

## Approach

Single-wave implementation. All changes in run_factory.py and tests.
No external dependencies. No data migrations. Purely additive to existing behavior.

## Risk: MEDIUM

The V1 version guard removal changes visible behavior (V2 state now displays correctly).
Migration wired into loader is transparent — existing V1 state.json files upgrade on first read.

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Wave 2 implementation complete and tested. Spec is accurate.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: Wave 2 implementation complete and tested. Spec is accurate.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Wave 2 implementation complete and tested. Spec is accurate.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Plan matches implementation. All tasks completed with 74 tests passing.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: Plan matches implementation. All tasks completed with 74 tests passing.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Plan matches implementation. All tasks completed with 74 tests passing.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: All tasks completed. 74 tests pass including 7 new V2 flag tests.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: All tasks completed. 74 tests pass including 7 new V2 flag tests.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: All tasks completed. 74 tests pass including 7 new V2 flag tests.
- review: reviews/diff.gemini.regression-adversarial.review.md | status: accepted | note: Non-iterable V2 fields now guarded by _safe_list() in discovery_state(). Resolve/defer inconsistency deferred. Silent no-op deferred to Wave 4.
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: Migration is well-tested (Wave 1, 13 tests). Resolve/defer duplicate inconsistency deferred (duplicates prevented by --unresolved guard). Silent no-op and --answer validation deferred to Wave 4.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: migrate_discovery_state returns V2+ blobs unchanged (idempotent), so future versions are safe. Non-dict unresolved entries are filtered by migration before any handler runs.

# Feature 037 — Paired-Batch Removal, Wave 6

**Created:** 2026-05-10
**Status:** Implementation
**Context:** Final wave of the [paired-batch removal cleanup](../../../tech-debt/remove-paired-batch-concept.md). Predecessor: Wave 5 ([PR #1021](https://github.com/chrislawcodes/valuerank/pull/1021)).

The full implementation spec lives at [`docs/tech-debt/wave6-spec.md`](../../../tech-debt/wave6-spec.md). That document is the source of truth — it has been adversarially reviewed by Codex and Gemini at the spec level; review artifacts are in `reviews/`.

## What this wave does

- New `PooledVignetteMetricsCard` component that fills the empty slot left by Wave 5 in the Overview tab, showing direction-balanced metrics for the current vignette pooled across mirrored runs at the same signature.
- Server-side methodology guard test that locks in the direction-balanced averaging rule.
- Three deletions: `job-choice-bridge-report.ts` + lib + tests; `docs/backend/paired-batch-run-flow.md`.
- Glossary + PRD term cleanup (find-and-remove pattern).

## What does NOT ship in Wave 6

| Concern | Where it goes |
|---|---|
| `legacyCompanionPairedRun.ts` deletion | Deferred to Wave 7. The file feeds the single-vignette dropdown for pre-Wave-4 runs whose `mirroredRuns` may be empty. |
| JSONB cleanup migration | Skipped indefinitely (per user). |
| Bake bootstrap kappa CIs into the snapshot | Future wave. |

## Acceptance criteria

- New card renders with the visibility rule (paired AND not aggregate AND API returns data)
- Header shows the N/M run-count split derived from `useRuns` + `mirroredRuns.length`
- Pressure response null cases show a tooltip explaining the reason
- Methodology guard test passes against current resolver and fails on count-additive pooling
- Deletion targets are gone; final greps return only the documented exceptions
- Lint clean; API + web tests pass; both builds succeed

## Constraints

DO NOT MODIFY: `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `GEMINI.md`, `.gitignore`, `STATUS.md`, `experiments.md`, the docs in `docs/tech-debt/wave*.md`. DO NOT delete `legacyCompanionPairedRun.ts` (deferred to Wave 7). DO NOT change `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts` math.

## Source-of-truth pointer

See [`docs/tech-debt/wave6-spec.md`](../../../tech-debt/wave6-spec.md) for:
- Full implementation tasks (1, 1.5, 2–5)
- Visibility rule details
- Null-pressure-response tooltip copy table
- Methodology guard test fixture and assertions
- Order of operations
- Risk and rollback plan

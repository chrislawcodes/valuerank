# Per-Model Coverage — Direct Path Experiment

| Stage | Artifact | stage_started_at | stage_finished_at | artifact_before_sha256 | artifact_after_sha256 | review_rounds | issues_raised | issues_accepted | artifact_revised | token_usage | cost_usage |
|-------|----------|------------------|-------------------|------------------------|-----------------------|---------------|---------------|-----------------|------------------|-------------|------------|
| Implement | code | 2026-04-03T23:27:18Z | 2026-04-03T23:39:40Z | 806b21548228090bd2d797c94d7955139469588d513debbe217b332ee5101560 | 86dbdf2470932f9e4c534e3e3066c886188be66cf6d35c026da6452f3851c6c0 | 1 | 2 | 2 | yes | — | — |

## Notes

### Issues raised in self-review

1. **Missing unit tests for `runModelsContainAll`** — new helper in `domain/shared.ts` had no tests. Fixed by adding `run-models-contain-all.test.ts` with 7 cases.
2. **Stale coverage legend** — legend still said "Batches per cell" which is misleading when per-model mode is active. Fixed to explain min-trial behavior and the triangle warning.

### Key implementation decisions

- `defaultModelIds` defaults to `[]` (empty array) — backward compatible; empty = no filter = legacy batch count behavior
- Coverage cell `minTrialCount`/`maxTrialCount` are `null` when `defaultModelIds` is empty — UI detects this to decide which display mode to use
- `runModelsContainAll` checks `config.models` (the array stored on a run's config JSON) — this is the correct field (set at run creation time, listing which models were included in that run)
- `resolveSignatureRuns` got an optional third param `requiredModelIds = []` — backward compatible; all existing callers pass nothing and get legacy behavior; the three analysis queries pass `domain.defaultModelIds`
- Settings UI uses checkboxes (not a `<select multiple>`) for better UX with small model lists

### PR

https://github.com/chrislawcodes/valuerank/pull/530
Branch: `direct/per-model-coverage`

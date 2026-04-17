---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/byvalue-two-step-winrate/plan.md"
artifact_sha256: "97c9506ef5a76936e9ad25c24531d9e5e3722a4a6ed104662e3731f6914586f0"
repo_root: "."
git_head_sha: "cbe42f2cf1d8dd592e767a5c3896669aeda559e6"
git_base_ref: "origin/main"
git_base_sha: "cbe42f2cf1d8dd592e767a5c3896669aeda559e6"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH ('unknown' key grouping): pre-existing behavior not introduced by this change — the existing loop already uses 'unknown' as default for missing IDs. This plan does not change that behavior. MEDIUM (overallSignedCenter inconsistency): same finding as spec and architecture reviews; explicitly in Known Simplifications, deferred. LOW (0.5 fallback test): plan already adds a count-assertion for merged results; a separate 0.5 fallback test is nice-to-have — Codex can add it, not a blocker."
raw_output_path: "docs/workflow/feature-runs/byvalue-two-step-winrate/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Evidence |
|---|---|---|
| **HIGH** | The Python worker's planned aggregation logic can incorrectly group and average data from different models or scenarios. The change relies on grouping transcripts by `modelId` and `scenarioId`. However, the code uses a default `"unknown"` key if these IDs are missing. If multiple transcripts lack a `modelId`, their data will be merged and processed as if they belong to a single "unknown" model, corrupting the `byValue` win rate calculation. The input validation does not enforce the presence of `modelId` in all cases. | `[CODE-CONFIRMED]` |
| **MEDIUM** | The "Equal-weight merge" in the frontend is implemented inconsistently. The plan is to change the weighting of merged `byValue` win rates from `sampleSize` to `1`. However, the `overallSignedCenter` and `preferenceStrength` calculations in the same function (`buildMergedPreferenceModel`) are not being updated and will continue to use `sampleSize`-based weighting. This contradicts the slice's stated goal and creates an inconsistent aggregation methodology within the same feature. | `[CODE-CONFIRMED]` |
| **LOW** | The test plan for the Python worker does not cover a key fallback path. The new `_compute_two_step_by_value` function has logic that defaults a value's win rate to `0.5` if no per-vignette rates can be calculated. The proposed test case validates the main success path but does not ensure this fallback is triggered correctly under edge-case conditions (e.g., a value only appears in transcripts that have empty outcome lists). | `[UNVERIFIED]` |

## Residual Risks

- **Database migration impact.** The plan includes a migration to invalidate all `CURRENT` basic and aggregate analyses, forcing re-computation. This is an effective but blunt strategy. If the migration fails or is interrupted, it could leave the system in a state with no valid analyses, temporarily degrading the user experience until all re-computations are complete.
- **Untested utility function behavior.** The frontend logic for merging analyses relies on a helper function, `averageWeighted`. Its implementation was not provided. The plan assumes this function gracefully handles empty input by returning `null`, which is a critical but unverified assumption for the logic's correctness.
- **Incomplete test assertion.** The plan for Slice C correctly notes that the merged `byValue` result should no longer contain a `count` field. However, the test plan for Slice C only specifies asserting the new `winRate`; it omits the equally important assertion that the `count` field is indeed absent.

## Token Stats

- total_input=24777
- total_output=568
- total_tokens=28515
- `gemini-2.5-pro`: input=24777, output=568, total=28515

## Resolution
- status: accepted
- note: HIGH ('unknown' key grouping): pre-existing behavior not introduced by this change — the existing loop already uses 'unknown' as default for missing IDs. This plan does not change that behavior. MEDIUM (overallSignedCenter inconsistency): same finding as spec and architecture reviews; explicitly in Known Simplifications, deferred. LOW (0.5 fallback test): plan already adds a count-assertion for merged results; a separate 0.5 fallback test is nice-to-have — Codex can add it, not a blocker.

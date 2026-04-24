---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/034-hygiene-follow-ups/spec.md"
artifact_sha256: "bd099523508989de3adde43e86bcae06c9f0cf3a2c19e1fa426c98e17baaf753"
repo_root: "."
git_head_sha: "42b7bb726d5992b7810c0346673e7f795365c4c9"
git_base_ref: "origin/main"
git_base_sha: "42b7bb726d5992b7810c0346673e7f795365c4c9"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/034-hygiene-follow-ups/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | ID | Finding | Evidence |
|---|---|---|---|
| **HIGH** | US-3-BREAK | The change to `detectPairAsymmetry` (US-3) alters the data shape of the `PAIR_ASYMMETRY` anomaly stored in the database. The spec proposes changing `details` from a single-sibling format to a multi-sibling format (`siblingRunIds`, `siblingSuccessRates`). This is a breaking change for data at rest. Any consumer of this anomaly data (present or future) will break. While the spec acknowledges this as a risk, its severity is understated; changing a persisted data contract is a significant event that risks creating hard-to-debug downstream failures. | `[CODE-CONFIRMED]` |
| **HIGH** | US-1-SYNC | The `RECENT_COMPLETED_RUN_WINDOW_DAYS` constant is used in two different functions in `scheduler.ts`: `hasRecoveryActivity` (via Prisma query) and `enqueueRunStateReconcileJobs` (via raw SQL). The spec only mentions updating the "activity check," implying a change for `hasRecoveryActivity`. If `RUN_RECONCILE_WINDOW_DAYS` is not applied identically to both locations, the scheduler will enqueue reconciliation jobs for a different set of runs than it considers active, leading to inconsistent behavior and potentially missed recoveries. | `[CODE-CONFIRMED]` |
| **MEDIUM** | US-4-MEM | The proposed implementation for capping orphan reconstruction (US-4) is inefficient and carries a memory-risk. The plan to use `orphans.slice(0, CAP)` requires querying and loading *all* orphan transcript rows from the database into application memory first, just to process a subset. For a run with a large backlog (e.g., 10,000+ orphans), this could lead to excessive memory consumption or even crash the service, negating the benefit of avoiding a job timeout. The cap should be implemented in the database query using `LIMIT`. | `[CODE-CONFIRMED]` |
| **MEDIUM** | US-2-SENTINEL | The proposal to use a magic sentinel value (`{ inputTokens: -1, outputTokens: -1 }`) to signal a failure in `extractTranscriptTokenUsage` (US-2) is a brittle design. It creates a risk of data corruption if a future caller forgets to check for the sentinel before performing arithmetic or persisting the values. A safer pattern would be to throw a specific error from the extraction function or return a discriminated union (e.g., `{ success: true, data: ... } | { success: false }`) to make the failure case explicit and prevent accidental propagation of invalid data. | `[CODE-CONFIRMED]` |

## Residual Risks

The spec correctly identifies several risks. The following are the most salient residual risks that will remain even after addressing the findings above.

- **Risk: The `RUN_RECONCILE_WINDOW_DAYS` environment variable is read only on application startup.**
  - As noted in the spec, changing this value to investigate an old run will require a service restart. This is an acceptable operational tradeoff for now but should be documented clearly for operators.
- **Risk: A very large orphan backlog will drain slowly.**
  - As noted in the spec, with a cap of 500 per tick and a 5-minute interval between ticks, a backlog of 10,000 orphans would take nearly two hours to clear. This is acceptable, as orphan reconstruction is a background recovery process, not a user-facing one.
- **Risk: The change to the `PAIR_ASYMMETRY` anomaly structure could have unknown consumers.**
  - While this was elevated to a HIGH severity finding, a residual risk remains even if no current consumers are found. The team must accept that they are invalidating any previously stored `PAIR_ASYMMETRY` anomalies and that any future tooling built against historical data will need to handle both the old and new shapes.

## Token Stats

- total_input=30349
- total_output=854
- total_tokens=33884
- `gemini-2.5-pro`: input=30349, output=854, total=33884

## Resolution
- status: open
- note:
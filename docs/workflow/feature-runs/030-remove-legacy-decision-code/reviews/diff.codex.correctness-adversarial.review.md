---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/reviews/implementation.diff.patch"
artifact_sha256: "2d6060221efcda0b8a7368f6f62a6d13716e21b91cf01ec000c4cf9a56f5784e"
repo_root: "."
git_head_sha: "0e5ab74009fbc16c351d77668f79cddfc91500d0"
git_base_ref: "adee0cd3"
git_base_sha: "adee0cd336e4555f34e0ea676185dff6636e93ac"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

- **Medium [UNVERIFIED]** `cloud/workers/stats/decision_model.py` removed both legacy fallbacks (`decisionModelV2.legacy.canonicalScore` and `summary.score`) from `resolve_transcript_signed_distance()`. Any historical transcript that has not been reprocessed into the new `raw`/`canonical` shape will now resolve to `None`, which will drop it from downstream signed-distance and directional analysis instead of preserving the previously documented behavior.
- **Medium [UNVERIFIED]** `cloud/apps/web/src/components/domains/ConditionMatrix.tsx` now computes the cell label and color from `(2 * strongly + somewhat) / totalTrials`. If `totalTrials` includes `unknownCount`, a cell with a clear directional winner but many unknowns will be rendered as `0`/neutral or much weaker than before. That changes the meaning of the matrix, not just the display logic.
- **Medium [UNVERIFIED]** `cloud/apps/web/src/components/runs/TranscriptRow.tsx` changed `isAnalyzableDecision` from a numeric `1`-`5` check to `Boolean(rawDecision)`. Any non-empty but non-numeric legacy decision code will now be treated as analyzable, which can incorrectly disable manual overrides for rows that still need them.
- **Medium [UNVERIFIED]** `cloud/apps/web/src/utils/decisionDistributionDisplay.ts` and `cloud/apps/web/src/lib/statistics/ks-test.ts` removed support for numeric bucket codes and the old `scoreCounts` shape. If any cached or persisted analysis payloads still use legacy `1`-`5` keys, those counts will now be ignored or mislabeled instead of being translated, which will skew both display and KS sampling.

## Residual Risks

- I could not verify whether all historical transcripts, cached analysis payloads, and label maps have already been migrated to the new direction-based formats. If not, the compatibility removals in this diff will cause older data to lose fidelity or disappear from analysis paths.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted

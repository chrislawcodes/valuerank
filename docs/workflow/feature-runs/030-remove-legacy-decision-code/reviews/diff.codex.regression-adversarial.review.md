---
reviewer: "codex"
lens: "regression-adversarial"
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
raw_output_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/reviews/diff.codex.regression-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

1. [UNVERIFIED] Medium - `cloud/workers/stats/decision_model.py` no longer falls back to `decisionModelV2.legacy.canonicalScore` or `summary.score` when resolving signed distance. If older transcripts still rely on those legacy fields, they will now be treated as unscored, which will silently drop them from downstream variance and KS-style analysis instead of preserving historical results.

2. [UNVERIFIED] Medium - `cloud/apps/web/src/components/runs/TranscriptRow.tsx`, `TranscriptViewer.tsx`, and `TranscriptList.tsx` removed the legacy score normalization path and now treat any truthy `rawDecision` as analyzable. That means placeholder values like `'-'` can be treated as real decisions, and historical 1-5 codes that depended on the old inversion logic can display in the wrong orientation or expose edit controls when they should not.

3. [UNVERIFIED] Medium - `cloud/apps/web/src/utils/decisionDistributionDisplay.ts` and `cloud/apps/web/src/lib/statistics/ks-test.ts` dropped support for numeric bucket codes and the numeric label mapping. If existing persisted aggregates or API payloads still emit `1`-`5` keys, those counts will now be ignored or relabeled generically, which will make older charts and statistics look incomplete rather than backward-compatible.

## Residual Risks

- I could not verify whether every producer and persisted dataset has already been migrated to the new symbolic bucket/decision formats, so backward-compatibility risk remains for historical records.
- The error-handler and GraphQL schema changes look aligned with the refactor, but without surrounding context I could not confirm that no remaining callers still depend on the removed `legacy`/`rawScore` shapes.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted

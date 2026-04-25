---
reviewer: "codex"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/reviews/implementation.diff.patch"
artifact_sha256: "44ea3851c100a8f8dd59853fa7954817ed8b9c50454bc49fa288323a3cd2f8e0"
repo_root: "."
git_head_sha: "04ab7e6288e547d237aba0269aef1ff3fb4be0db"
git_base_ref: "origin/main"
git_base_sha: "2cd6635c7bf0a0007e9f2c340a95e21779560a8b"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MED (helper drops ungrouped/no-direction runs from pairedBatchCount) — intentional per spec §6.4 + A3. Such runs still count toward batchCount. MED (no jobChoiceLaunchMode guard) — already documented in spec residual risks R3; per §6.3 prod data, 100% of completed runs are PAIRED_BATCH so this is theoretical. MED (tie-break change) — already documented in spec A8b."
raw_output_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/reviews/diff.codex.regression-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

- [UNVERIFIED] Medium: `selectPrimaryDefinitionCountsByDirection()` has no way to preserve complete runs that are not attached to a direction token. The existing aggregation path explicitly keeps ungrouped completed batches; this helper drops them entirely, so any cell that mixes grouped and ungrouped complete runs will report a lower `pairedBatchCount` than the current behavior.
- [UNVERIFIED] Medium: `getCoverageDirection()` accepts any non-empty string and never checks `jobChoiceLaunchMode` or a known token set. If a stale or malformed config carries `jobChoiceValueFirst` outside a paired run, this code will treat it as a real direction and can pollute coverage counts instead of rejecting it.
- [UNVERIFIED] Medium: The new primary-definition tie-break uses `directionCount` instead of paired completeness. That can select a less representative definition when batch counts tie, because a definition with two direction tokens but fewer completed batches can outrank one with fewer direction tokens and more complete data. That changes the chosen `definitionId`/link target for tied cells.

## Residual Risks

- The diff does not show the query wired over to the new helper, so end-to-end behavior is still unverified.
- There are no tests here for mixed grouped/ungrouped cells or for invalid or legacy direction tokens beyond the permissive parser cases.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MED (helper drops ungrouped/no-direction runs from pairedBatchCount) — intentional per spec §6.4 + A3. Such runs still count toward batchCount. MED (no jobChoiceLaunchMode guard) — already documented in spec residual risks R3; per §6.3 prod data, 100% of completed runs are PAIRED_BATCH so this is theoretical. MED (tie-break change) — already documented in spec A8b.

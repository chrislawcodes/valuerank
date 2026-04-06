---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/domain-coverage-completeness-guard/spec.md"
artifact_sha256: "2dbac0043c4f1b079409721f49cc5d9e8e2e63cd4234c8dbdfa34ac556afc808"
repo_root: "."
git_head_sha: "7e06a2a7970de5894586516244030f86b6c3fc3e"
git_base_ref: "origin/030-remove-legacy-decision-code"
git_base_sha: "7e06a2a7970de5894586516244030f86b6c3fc3e"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Accepted: the spec already defines the batch-group rollup rule, adds completeness-aware signature states, and deliberately uses coverageState != COMPLETE for the incomplete-data drill-down so the review's remaining concerns are covered by the current spec or explicit residual risks."
raw_output_path: "docs/workflow/feature-runs/domain-coverage-completeness-guard/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- High: The spec does not define the rollup rule for a batch-group that contains both coverage-complete and coverage-incomplete runs. Coverage counts are grouped by `jobChoiceBatchGroupId` / `pairedBatchGroupId` / run ID, but completeness is defined per run. Without a single group-level rule, the same batch can be counted as complete, incomplete, or both depending on implementation order, which can make Domain Coverage, batch status, and the audit script disagree.
- Medium: The signature-picker visibility contract leaves out the explicit `LEGACY_UNAVAILABLE` and `EMPTY_EXPECTATION` states. `hasCoverageCompleteRuns` and `hasCoverageIncompleteRuns` only distinguish complete vs incomplete runs, so a signature made up only of legacy-unavailable or empty-expectation runs can still appear as a normal option with no warning, even though its data is excluded from coverage counts.
- Medium: The “filtered batch-status view for the incomplete runs” is specified as `coverageState != COMPLETE`, but that predicate also returns `LEGACY_UNAVAILABLE` and `EMPTY_EXPECTATION`. The banner/link copy says it will show incomplete runs, but the actual result set can include rows that are not incomplete. That makes the drill-down misleading unless the spec adds a narrower filter or separate labels.

## Residual Risks

- The spec still leaves some edge behavior underspecified, especially for malformed transcript rows that miss one of the key fields and for how those rows should affect `presentKeyCount`, `duplicateKeyCount`, and `missingModelIds`.
- The audit script behavior for legacy-unavailable runs is not fully pinned down beyond “list them,” so implementation details there may still drift from the coverage UI if not tested carefully.
- The UI treatment for zero-expected-key runs is only defined at the counting level; the visible messaging for those cases may still need a sharper product decision.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Accepted: the spec already defines the batch-group rollup rule, adds completeness-aware signature states, and deliberately uses coverageState != COMPLETE for the incomplete-data drill-down so the review's remaining concerns are covered by the current spec or explicit residual risks.

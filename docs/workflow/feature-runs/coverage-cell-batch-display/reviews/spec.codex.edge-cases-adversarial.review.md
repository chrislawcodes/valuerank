---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/coverage-cell-batch-display/spec.md"
artifact_sha256: "88a9c826b210026d07456169efc8b2a6a0851e5a74553fb0be0b2bcce778a34a"
repo_root: "."
git_head_sha: "eab6ffbb2ad3a2f01ce5cd3ffa2dfd3c317349e9"
git_base_ref: "origin/main"
git_base_sha: "eab6ffbb2ad3a2f01ce5cd3ffa2dfd3c317349e9"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Finding 1 HIGH: Fixed FR-007 — badge condition aFirstBatchCount !== bFirstBatchCount. Finding 2 HIGH: Fixed effectiveModelIds edge case. Findings 3-5: intentional or deferred. All addressed."
raw_output_path: "docs/workflow/feature-runs/coverage-cell-batch-display/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- **High**: The spec says the cell should show the **model-set-filtered batch count**, but `FR-004`/`FR-005` still make the visible count and color depend on `pairedBatchCount` whenever it is non-zero. In the provided code, `pairedBatchCount` is the **minimum of the directional counts**, not the total filtered batch total, so a cell with 4 matching complete runs and 3 paired runs would display 3 and color from 3, not 4. That directly breaks the stated goal. [CODE-CONFIRMED]

- **Medium**: The spec never says whether `aFirstBatchCount` / `bFirstBatchCount` should count **raw runs** or **deduplicated launch groups**. The current query collapses by `jobChoiceBatchGroupId` / `pairedBatchGroupId` and uses a unique sentinel for ungrouped runs before computing directional counts. If that rule is not carried forward explicitly, retries and companion-definition duplicates can be double-counted. [CODE-CONFIRMED]

- **Medium**: The spec omits the corrupted-data case where more than two distinct direction tokens appear. The current utility already has a `>2` fallback and warning path, but the spec never defines what the new A/B fields or badge should do in that state. That leaves a real edge case undefined and easy to mis-handle. [CODE-CONFIRMED]

## Residual Risks

- The meaning of “no default models configured” is still easy to misread because the code can fall back to global default models. The spec mentions this, but implementers will need to be careful not to treat empty per-domain defaults as empty effective defaults.

- The spec assumes the new direction counts will cleanly map to A/B values, but it does not spell out how to render or debug cells where the direction token data is malformed but still present.

- I could not verify the client GraphQL operation file in this prompt, so query-shape compatibility for the new fields remains a dependency risk.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Finding 1 HIGH: Fixed FR-007 — badge condition aFirstBatchCount !== bFirstBatchCount. Finding 2 HIGH: Fixed effectiveModelIds edge case. Findings 3-5: intentional or deferred. All addressed.

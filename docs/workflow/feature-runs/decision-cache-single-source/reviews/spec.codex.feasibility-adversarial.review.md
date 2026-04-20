---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/decision-cache-single-source/spec.md"
artifact_sha256: "f47924c7cbf0a1cb6990765d3874d0e032bac77eab8f7d53c509a8dd9ee13350"
repo_root: "."
git_head_sha: "4201294766a93a21d6bc5c872aee243032e60b58"
git_base_ref: "origin/main"
git_base_sha: "4201294766a93a21d6bc5c872aee243032e60b58"
generation_method: "codex-runner"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/decision-cache-single-source/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- Medium: The public `decisionCode` contract is internally inconsistent about refusals. FR-010/FR-011 and the Goal text say external consumers keep emitting `"1".."5"`, but US3, FR-005, FR-017, FR-019, and the edge cases all require `"refusal"` to survive too. That leaves implementers with no single rule for whether refusal is a valid emitted `decisionCode` or an exception, which can silently break downstream consumers or make the parity tests impossible to satisfy consistently.
- Medium: The migration spec does not define what to do for rows where `summaryCache` exists, `decisionCode` is absent, and `canonicalDecision` is missing or malformed. FR-012 only says to “preserve the existing cacheVersion: 1 canonical values verbatim and only bump cacheVersion to 2,” but that branch cannot be applied if the object is missing or half-written. Those rows are explicitly in scope because the migration must process every non-null `summaryCache`, so this is an uncovered failure mode.
- Medium: The new shared helper depends on `canonicalDecision` plus `{valueA, valueB}` and `orientationFlipped`, but the spec explicitly keeps some `summaryCache` rows whose `definition_snapshot` is null or malformed and says to skip them in the migration. FR-006 also requires every internal consumer of cached `decisionCode` to move to the helper. That means the read path for this retained population is undefined: the helper cannot run with missing pair/orientation inputs, yet the spec does not say whether callers should fall back, return `unknown`, or preserve the old behavior.

## Residual Risks

- The migration is large and row-by-row. The spec does not include a checkpoint/resume strategy, so an interrupted run could extend the rollout window and leave mixed `cacheVersion` states longer than planned.
- The collapse is not complete for transcripts with no `summaryCache`; they remain on the old derive-on-read path. That is intentional, but it means the system still has two decision sources after the change.
- Rows with malformed `definition_snapshot` are skipped rather than repaired. That avoids bad writes, but it also means some UI/export discrepancies can persist until a separate data-fix pass.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: open
- note: 
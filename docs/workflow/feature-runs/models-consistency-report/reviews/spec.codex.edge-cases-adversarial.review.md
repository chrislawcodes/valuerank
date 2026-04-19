---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/models-consistency-report/spec.md"
artifact_sha256: "6a3b404bac10d1453d4c02522eaa090b89c13bc64f7ce9139005d8ebe8fa58b7"
repo_root: "."
git_head_sha: "a450f809c2b386ed7e089c87a5d4e83845aa4a68"
git_base_ref: "origin/main"
git_base_sha: "a450f809c2b386ed7e089c87a5d4e83845aa4a68"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/models-consistency-report/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- **HIGH [CODE-CONFIRMED]** The spec never says what to do when more than one condition lands in the same `(row, col)` cell, but the current matrix silently overwrites earlier entries with the last one it sees. In [`ConditionMatrix.tsx`]( /Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/web/src/components/domains/ConditionMatrix.tsx#L110 ) the cell map is keyed only by `rowValue::colValue`, so duplicate coordinates are collapsed with no warning. That means the “View condition matrix” drill-down can drop evidence on irregular or aggregated grids instead of surfacing the multiplicity.

- **MEDIUM [CODE-CONFIRMED]** The spec leaves the axis mapping for “View condition matrix →” implicit, but the existing matrix does not preserve semantic axes. In [`ConditionMatrix.tsx`]( /Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/web/src/components/domains/ConditionMatrix.tsx#L74 ) it gathers all dimension keys, sorts them alphabetically, and uses the first two as row/column dimensions. If a vignette has extra dimensions or nonstandard key names, the report can point at a matrix that is technically valid but shows the wrong pair of axes.

- **MEDIUM [CODE-CONFIRMED]** The spec says a model drill-down can link to “View transcripts →”, but it does not define the route contract that the current transcript page actually needs. [`AnalysisTranscripts.tsx`]( /Users/chrislaw/valuerank/.claude/worktrees/gifted-euclid-294e5d/cloud/apps/web/src/pages/AnalysisTranscripts.tsx#L236 ) only renders `PairedStabilityView` when `isPairedStabilityDrilldown` is already true, and it is passed `repeatPattern`, primary/companion run names, and two precomputed transcript sets. A model-level summary chip by itself is not enough to derive that state, so the link target is underspecified.

## Residual Risks

- The spec still does not define the fallback behavior for `Repeatability` when a model has 0 or 1 eligible scenarios. DerSimonian-Laird pooling is degenerate there, so the implementation will need an explicit rule for “unavailable”, “raw Wilson CI”, or a collapsed random-effects CI.

- The spec also leaves the displayed denominator for `Coherence` slightly ambiguous when there are indeterminate pairs. It says to exclude them from the fraction, but it does not require the report to show the indeterminate count alongside `k / n`, which could make coverage look stronger than it is.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted

---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/forest-plot-pairwise-drawer/spec.md"
artifact_sha256: "899cd041e32cf27c741d279d641bd647fd2a2f5717faffcc02a981c11cc53f6d"
repo_root: "."
git_head_sha: "aaa3fc99ca462c06f7efe98d3b430575c6e709f3"
git_base_ref: "origin/main"
git_base_sha: "aaa3fc99ca462c06f7efe98d3b430575c6e709f3"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "All four MEDIUM findings addressed. (1) Pair-averaged rendering at <=5pp gap: FR-006 now explicit — square only, no bracket, no CI bar. (2) refusalRate field semantics for aggregated rows: ForestPlotRow.refusalRate type doc now specifies max-of-directions for averaged rows (matches FR-009 threshold rule, no drift). (3-4) UNVERIFIED: 1e-9 strictness and Assumption 0 enforcement: accepted as designed — these are intentional hard invariants per FR-014 PooledMeanDivergenceError and FR-012 MultipleVignettesPerDirectionError; production data verification is in spec Assumptions and Slice 2 verification step."
raw_output_path: "docs/workflow/feature-runs/forest-plot-pairwise-drawer/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

- **Medium**: The pair-averaged forest-plot rendering is underspecified for the common case where both directions exist but the gap is small. FR-005 says pair-averaged rows show a bracket whenever both directions exist, while FR-006 only explicitly requires brackets once the gap exceeds 5pp. The spec never says what should happen for a two-direction pair at or below that threshold, so the default visualization is not deterministic.
- **Medium**: `refusalRate` is not defined for aggregated rows. The row contract exposes a single `refusalRate`, but FR-009 says the warning threshold on pair-averaged rows must use the maximum of the two direction-specific refusal rates. The spec never says what value the row should surface in the tooltip or row model for the aggregated case, so the displayed refusal rate and the warning logic can drift apart.
- **Medium [UNVERIFIED]**: FR-014 makes the drawer fail hard if `pooledMean` does not match the matrix cell value within `1e-9`. If the existing matrix aggregation path and the new pair-detail resolver differ even slightly in filtering, rounding, or null handling, this turns a normal data mismatch into a broken drawer instead of a warning. Because there is no code context here, the assumption that both paths are truly identical is unverified.
- **Medium [UNVERIFIED]**: Assumption 0 is a hard runtime invariant, not a soft fallback. If any production domain contains more than one vignette for the same pair/direction, the resolver must throw `MultipleVignettesPerDirectionError` and the cell will not open. The spec claims production inspection supports the invariant, but that proof is not available here, so the assumption remains unverified.

## Residual Risks

- The performance targets are tight. A pair-scoped GraphQL query plus SVG rendering may still miss the 2s open target or the 100 ms toggle target on dense cells or slower devices.
- The methodology footer helps, but it does not remove interpretation risk. Users can still confuse the 50% reference line, the unweighted cell mean, and the inverse-variance I² center without careful reading.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: All four MEDIUM findings addressed. (1) Pair-averaged rendering at <=5pp gap: FR-006 now explicit — square only, no bracket, no CI bar. (2) refusalRate field semantics for aggregated rows: ForestPlotRow.refusalRate type doc now specifies max-of-directions for averaged rows (matches FR-009 threshold rule, no drift). (3-4) UNVERIFIED: 1e-9 strictness and Assumption 0 enforcement: accepted as designed — these are intentional hard invariants per FR-014 PooledMeanDivergenceError and FR-012 MultipleVignettesPerDirectionError; production data verification is in spec Assumptions and Slice 2 verification step.

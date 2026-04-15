---
reviewer: "codex"
lens: "edge-cases-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/models-tab/spec.md"
artifact_sha256: "e5bf34bd898e98bc95f7bb5201ba13c7ce9fc1dcbc8c856359e32021b0129319"
repo_root: "."
git_head_sha: "b26923fbe83c2c0ec86c80180073de00a4461626"
git_base_ref: "origin/main"
git_base_sha: "b26923fbe83c2c0ec86c80180073de00a4461626"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/models-tab/reviews/spec.codex.edge-cases-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec edge-cases-adversarial

## Findings

- **High:** The stability-dot rules contradict each other. `FR-009` says the score is rounded to the nearest 10 points, but the `Dot Mapping` section uses `Math.floor(stability / 10)`, and the examples map `85` to `●●●●○`, which is truncation, not rounding. This makes the visual threshold impossible to implement consistently.
- **Medium:** The matrix data shape is underspecified for missing cells. The query shape returns `models { values { ... } }`, but the spec never guarantees that every model returns all 10 canonical values in a fixed order. Without that guarantee, the client cannot reliably build a full `model × value` matrix or tell the difference between “no data for this value” and “value omitted from the payload.”
- **Medium:** The zero-eligible-domain state is not fully defined. The spec says `win rate` is `n/a` and stability is unavailable, but it does not say whether the cell still shows muted dots, empty space, or a special no-data state. That leaves room for a no-data cell to look like a real score or a zero-stability result.
- **Medium:** Sorting and filtering edge cases are incomplete. The spec defines the primary and secondary sort keys, but not a deterministic tertiary tie-breaker, so equal cells can reorder between refreshes. It also does not say how row/cell pruning should work when a stability filter hides some cells but not others, which can leave a partial matrix that is hard to scan.

## Residual Risks

- The stability metric is still a coarse proxy. Even when it is technically correct, a 2-domain cell can look “stable” while still being based on very thin evidence.
- The spec leans on hover for tooltips, which is weaker on touch devices and screen readers unless the implementation adds a non-hover fallback.
- A 10-column standard-width matrix with long model labels may still need horizontal scrolling or truncation on smaller laptops, even with abbreviated value headers.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted

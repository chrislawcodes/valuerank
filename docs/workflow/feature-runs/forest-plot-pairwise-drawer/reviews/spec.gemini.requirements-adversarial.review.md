---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/forest-plot-pairwise-drawer/spec.md"
artifact_sha256: "899cd041e32cf27c741d279d641bd647fd2a2f5717faffcc02a981c11cc53f6d"
repo_root: "."
git_head_sha: "aaa3fc99ca462c06f7efe98d3b430575c6e709f3"
git_base_ref: "origin/main"
git_base_sha: "aaa3fc99ca462c06f7efe98d3b430575c6e709f3"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "All three findings addressed. (1) MEDIUM toggle vs row-expand precedence: Edge Cases now spells out — global toggle is source of truth, ON disables click-to-expand and resets row state, OFF collapses everything back. (2) MEDIUM other-filter divergence between resolver and matrix: accepted as part of the FR-014 PooledMeanDivergenceError contract — the runtime check and Slice 2 manual verification cover the equivalence; if other filter rules diverge they will be caught by the integration test in Slice 3. (3) LOW loading state: Edge Cases now explicitly requires a skeleton placeholder during the GraphQL query in-flight."
raw_output_path: "docs/workflow/feature-runs/forest-plot-pairwise-drawer/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | Finding |
| :--- | :--- |
| <span style="color:orange">**MEDIUM**</span> | **Ambiguous UI behavior from conflicting state updates.**<br/>The spec defines two ways to see split-by-direction views: a global toggle ("Split by direction") for the entire plot (US2, AC1) and an in-place expansion for a single clicked row (US4, AC1). It does not specify how these interactions compose. If a user expands one row and then uses the global toggle, the resulting state is undefined. This ambiguity can lead to unpredictable UI behavior and a confusing user experience. The spec should define the order of precedence (e.g., the global toggle always overrides individual row states). |
| <span style="color:orange">**MEDIUM**</span><br/>`[UNVERIFIED]` | **Risk of data inconsistency due to unverified assumptions.**<br/>The spec requires the drawer's `pooledMean` to match the matrix cell's value and adds a `PooledMeanDivergenceError` to enforce this at runtime (FR-014). This is a strong safeguard. However, it relies on an unverified assumption that the filtering logic for vignettes (e.g., `totalTrials > 0`) is identical between the new `domainAnalysisPairDetail` resolver and the existing, un-cited aggregation logic for the matrix. If the existing logic has other filters, the `pooledMin`, `pooledMax`, and `iSquared` values in the drawer could be calculated from a different set of vignettes than the matrix cell, even if the mean happens to align. This would present the user with subtly inconsistent and misleading summary statistics. |
| <span style="color:green">**LOW**</span> | **Specification omits a required loading state.**<br/>The user action of clicking a cell initiates a new data fetch for the drawer's content (FR-012). A delay between the drawer opening and the content rendering is inevitable. The spec does not define a loading state (e.g., a spinner or skeleton loader) for this interval. Without it, a blank or empty drawer may appear, which could be interpreted by the user as a bug or an indication that no data exists. |
| <span style="color:green">**LOW**</span> | **Unexamined side-effects of numerical stability constant.**<br/>The `I²` calculation uses `vi = max(p*(1-p)/n, EPSILON)` with `EPSILON = 1e-6` to prevent division by zero (FR-011). While this ensures numerical stability, it has a side-effect: for vignettes with very decisive outcomes (p near 0 or 1), the true variance may be smaller than `EPSILON`. In these cases, the variance is artificially inflated, reducing the weight of that vignette in the heterogeneity calculation. The spec identifies `EPSILON` as a "magic number" but does not acknowledge this specific statistical side-effect, which could slightly dampen the measured heterogeneity when highly skewed vignettes are present. |
| <span style="color:green">**LOW**</span><br/>`[UNVERIFIED]` | **Tooltip information is inaccessible on touch-only devices.**<br/>The spec relies on hover to display a tooltip with critical details about each row (FR-007). On touch-only devices, hover is not available. Since clicking a row is already mapped to navigation or expansion (FR-008), this detailed information is effectively inaccessible to touch users, creating a significant usability gap for that modality. |

## Residual Risks

The specification includes a well-considered "Residual Risks" section. The review process confirms the validity of those risks, particularly the potential for `pooledMean` drift and the usability gap for disabled cells. The following risks, derived from the findings above, should also be considered.

| Risk | Mitigation / Comment |
| :--- | :--- |
| **Implementation complexity.** | The "drill down" mental model (US4) requires two separate interactions for viewing split-direction data: a global toggle and a per-row expansion. The ambiguity identified in the Findings section is a symptom of this complexity. Even when clarified, implementing, testing, and maintaining the composition of these two states carries a risk of bugs, layout shifts, or other UI/UX debt. Given this feature is P3 ("Useful but not blocking"), the implementation cost may be disproportionate to its value. |
| **Data model fragility.** | The spec correctly identifies `Assumption 0` (at most one vignette per pair-direction) and smartly enforces it with a runtime error (FR-012). However, this indicates the feature's viability is tightly coupled to a data constraint that may not hold in the future. Any future work that allows multiple vignettes per pair-direction will break this feature, requiring a significant refactor of the grouping, averaging, and navigation logic. This risk is accepted but should be documented for future architectural decisions. |

## Token Stats

- total_input=20034
- total_output=1062
- total_tokens=26772
- `gemini-2.5-pro`: input=20034, output=1062, total=26772

## Resolution
- status: accepted
- note: All three findings addressed. (1) MEDIUM toggle vs row-expand precedence: Edge Cases now spells out — global toggle is source of truth, ON disables click-to-expand and resets row state, OFF collapses everything back. (2) MEDIUM other-filter divergence between resolver and matrix: accepted as part of the FR-014 PooledMeanDivergenceError contract — the runtime check and Slice 2 manual verification cover the equivalence; if other filter rules diverge they will be caught by the integration test in Slice 3. (3) LOW loading state: Edge Cases now explicitly requires a skeleton placeholder during the GraphQL query in-flight.

---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/circumplex-report/plan.md"
artifact_sha256: "c57bff338416a79a7f67ed7468339b95f4d78318e0126d4f6b12dd70d571a4f7"
repo_root: "."
git_head_sha: "2a61705a6965451e85ef5426ef3dffad0fabbbd7"
git_base_ref: "origin/claude/consistency-signature-dropdown"
git_base_sha: "2a61705a6965451e85ef5426ef3dffad0fabbbd7"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "MEDIUM (picker data dependency): Decision 8 makes the server return {models, insufficient} in one payload — no separate lightweight-query dance. MEDIUM (URL/UI sync for dropped models): Decision 9 specifies URL write-back via setSearchParams(replace:true) on any selection change, including selection-recovery drops. MEDIUM (Spearman module duplication + anchor edge case): Decision 4 now extracts spearmanRankCorrelation to @valuerank/shared; test cases explicitly include Self-Direction-excluded scenario; anchor rule falls back to next canonical-order included value. MEDIUM (sparse-data test coverage): wave A unit tests enumerate zero-variance, all-null, 3-pair-min, one-value-excluded, Self-Direction-excluded profiles. Residual risks (statistical approximation, SVG rendering perf) accepted."
raw_output_path: "docs/workflow/feature-runs/circumplex-report/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "Coverage reconciled after plan revision addresses all findings; no new spec or plan territory introduced."
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Evidence |
| --- | --- | --- |
| MEDIUM | The plan for the multi-select model picker implies a complex and likely inefficient data dependency. To filter the full model roster by eligibility (`minTrialsPerValue`), the frontend needs per-model trial counts. This data is not available in the existing `llmModels` query. The plan does not specify a new, lightweight query for this purpose, suggesting it may require calling the heavy `circumplexAnalysis` query for all models, or once per model. This makes the picker component's data-fetching strategy untestable for performance and correctness without a clear, efficient design. | [UNVERIFIED] |
| MEDIUM | The state management plan has a testability flaw regarding URL synchronization. The spec requires that ineligible models selected via a URL parameter be "dropped silently". The plan adopts a "URL as source of truth" principle but fails to specify if the URL should be updated to remove the dropped, ineligible models. If the URL is not updated, it falls out of sync with the UI state, creating an inconsistent user experience that is difficult to test. If it is updated, the logic for doing so is missing from the plan. | [UNVERIFIED] |
| MEDIUM | The plan for the statistics module contains two testability weaknesses. First, it allows for `spearmanRankCorrelation` to be "copied from" an existing utility, which creates duplicated code that is untestable against future changes in the source. Second, the plan's mitigation for MDS rotation non-determinism (anchoring to 'Self-Direction') has an unhandled edge case: if the 'Self-Direction' value itself is excluded due to insufficient data, the anchoring logic will fail. Test cases for the MDS component must include this scenario. | [UNVERIFIED] |
| MEDIUM | The plan to use live aggregation on raw transcript data, combined with a very low eligibility threshold (`minTrialsPerValue = 5`), increases the risk of correctness bugs that are hard to test. This design makes sparse value profiles (i.e., profiles with many `null` or `NaN` values from pairs with no determinate trials) a common case. The plan's unit tests for `pearsonCorrelation` and the aggregation logic must explicitly cover these sparse data scenarios to ensure statistical robustness, as standard correlation functions may behave unexpectedly with `null`-heavy inputs. | [UNVERIFIED] |

## Residual Risks

| Risk | Description |
| --- | --- |
| Statistical Approximation | The plan and spec correctly note that the p-value calculation for Spearman's rho uses a t-approximation and that the underlying data violates independence assumptions. While unit tests can verify that the approximation formula is implemented correctly, they cannot verify the statistical validity of the p-value itself. The risk remains that the UI will display p-values that imply a higher degree of certainty than is statistically warranted. |
| Frontend Rendering Performance | The plan opts to render all visualizations as inline SVG. While this avoids new library dependencies, it creates a risk of poor browser performance when many models are selected. The cumulative DOM complexity and event handling for a grid of 11+ heatmaps and scatterplots may lead to slow rendering or interaction. This end-to-end rendering performance is difficult to cover with automated unit or component tests and will rely on manual testing. |

## Token Stats

- total_input=25035
- total_output=701
- total_tokens=32133
- `gemini-2.5-pro`: input=25035, output=701, total=32133

## Resolution
- status: accepted
- note: MEDIUM (picker data dependency): Decision 8 makes the server return {models, insufficient} in one payload — no separate lightweight-query dance. MEDIUM (URL/UI sync for dropped models): Decision 9 specifies URL write-back via setSearchParams(replace:true) on any selection change, including selection-recovery drops. MEDIUM (Spearman module duplication + anchor edge case): Decision 4 now extracts spearmanRankCorrelation to @valuerank/shared; test cases explicitly include Self-Direction-excluded scenario; anchor rule falls back to next canonical-order included value. MEDIUM (sparse-data test coverage): wave A unit tests enumerate zero-variance, all-null, 3-pair-min, one-value-excluded, Self-Direction-excluded profiles. Residual risks (statistical approximation, SVG rendering perf) accepted.
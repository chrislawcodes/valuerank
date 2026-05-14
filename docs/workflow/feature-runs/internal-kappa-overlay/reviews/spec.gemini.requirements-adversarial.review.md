---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/internal-kappa-overlay/spec.md"
artifact_sha256: "febbce1d68c771ed0f30dea27b7578d58132f025cef473d65d3279596ea00613"
repo_root: "."
git_head_sha: "063e448dc4a83f6b92b19fbae7231485ca4e6f76"
git_base_ref: "origin/main"
git_base_sha: "063e448dc4a83f6b92b19fbae7231485ca4e6f76"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Gemini requirements review completed across rounds 2, 3, and 4 (other attempts hit the runner's infra timeout — not review failures). All findings addressed in spec.md: placeholder-looks-like-a-bug -> title affordance with cause-specific text; ad-hoc multi-select groups -> explicit non-goal; metric framing -> help copy describes it honestly as 'average Cohen's kappa across model pairs', not a Fleiss-style whole-group statistic; loading-state data not threaded -> status prop added; tooltip precedence ambiguity -> fixed precedence singleton/outside-selection/no-shared-scenarios; implicit query-destructuring refactor -> made explicit in 'Threading the kappa data'; null-kappa denominator -> explicit rule that denominator is count of valid pairs. Residual risks (low coverage in narrow selections, metric interpretation, threshold fitness) captured in spec Risks section; the coverage risk carries a concrete pre-merge verification action. FF's 1+1 spec review budget is well exceeded; not re-running."
raw_output_path: "docs/workflow/feature-runs/internal-kappa-overlay/reviews/spec.gemini.requirements-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "File restored by the orchestrator from the genuine completed Gemini requirements review (round 4, 2026-05-14). The runner's final checkpoint/repair re-run timed out on infra and overwrote the completed review with a failure stub; this restores the actual review content unchanged. All findings were addressed in spec.md before restore — see resolution_note."
---

# Review: spec requirements-adversarial

## Findings

| Severity | Finding | Evidence |
| :--- | :--- | :--- |
| HIGH | **Implicit Refactor Required for Query Status.** The spec requires passing a derived `loading`/`unavailable`/`ready` status for the agreement query to the `ModelGroupsSection` component. However, the existing code in `ModelsGroups.tsx` for the `useModelAgreementOnTradeoffsQuery` hook uses a destructuring pattern (`const [{ data: agreementData }] = ...`) that only extracts the `data` property. It discards the `fetching`, `error`, and `stale` properties, and does not track the `pause` state, all of which are necessary to correctly implement the required three-state status logic. A failure to refactor this data access pattern will make it impossible to meet the spec's requirements for handling loading and unavailable states correctly, leading to UI bugs like incorrect tooltips or a lack of loading indicators. | `[CODE-CONFIRMED]` |
| MEDIUM | **Misleading Partial Averages Risk.** The spec correctly identifies that a cluster's members can be a superset of the models visible on the page (and thus a superset of the models included in the kappa calculation). It requires that internal agreement is only computed for "fully covered" clusters. This is a critical safeguard. The code confirms this scope mismatch: `clusterAnalysisByMethod` is derived from a query that is not filtered by model ID, while `pairwiseKappaMap` is derived from a query against `visibleModelIds`. A naive implementation that calculates a mean over the available subset of models would produce a silently misleading number that does not represent the entire cluster shown on the card. | `[CODE-CONFIRMED]` |
| LOW | **Exclusion of Null-Kappa Pairs from Mean.** The spec requires that model pairs with no computable kappa (e.g., no shared scenarios) are excluded from the cluster's mean agreement calculation, rather than being treated as zero. This is a subtle but important detail. The existing code in `ModelsGroups.tsx` for building `pairwiseKappaMap` already appears to filter out these pairs (`if (row.cohensKappa == null || row.totalCells === 0) continue;`). However, an implementation of the new averaging logic that is not careful about the denominator could still calculate an incorrectly low mean by dividing by the total number of pairs instead of the number of pairs with a valid kappa. | `[CODE-CONFIRMED]` |

## Residual Risks

| Risk | Description |
| :--- | :--- |
| **Utility in Default View.** | The spec's own "Risks" section identifies a significant threat to the feature's value: if default-view clusters contain many non-default or deprecated models, the "fully covered" rule will cause most clusters to show a "not computable" placeholder. This would render the feature largely useless in the most common configuration. The spec defers this check to implementation, but it remains a major risk that the feature could be technically correct but practically uninformative. |
| **Metric Interpretation.** | Cohen's kappa is a non-trivial statistical measure. Despite the planned help text, there is a risk that users will misinterpret the "internal agreement" score. They might conflate it with the value profiles, see a number without understanding its scale (e.g., is 0.5 good or bad?), or fail to grasp that it is signature-dependent. Adding another metric could increase cognitive load and potentially confuse users more than it clarifies. |
| **Threshold Fitness.** | The spec sets a hard-coded 0.4 threshold for flagging low agreement, based on the Landis & Koch scale. While this is a "defensible" choice, this scale is general and may not be the most effective cutoff for the specific patterns of model behavior in ValueRank. The threshold might generate too many warnings, creating alarm fatigue, or too few, creating a false sense of security. The risk is that this non-configurable, unvalidated threshold may not be fit-for-purpose. |

## Resolution
- status: accepted
- note: Gemini requirements review completed across rounds 2, 3, and 4 (other attempts hit the runner's infra timeout — not review failures). All findings addressed in spec.md: placeholder-looks-like-a-bug -> title affordance with cause-specific text; ad-hoc multi-select groups -> explicit non-goal; metric framing -> help copy describes it honestly as 'average Cohen's kappa across model pairs', not a Fleiss-style whole-group statistic; loading-state data not threaded -> status prop added; tooltip precedence ambiguity -> fixed precedence singleton/outside-selection/no-shared-scenarios; implicit query-destructuring refactor -> made explicit in 'Threading the kappa data'; null-kappa denominator -> explicit rule that denominator is count of valid pairs. Residual risks (low coverage in narrow selections, metric interpretation, threshold fitness) captured in spec Risks section; the coverage risk carries a concrete pre-merge verification action. FF's 1+1 spec review budget is well exceeded; not re-running.

---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/domain-coverage-completeness-guard/spec.md"
artifact_sha256: "2dbac0043c4f1b079409721f49cc5d9e8e2e63cd4234c8dbdfa34ac556afc808"
repo_root: "."
git_head_sha: "7e06a2a7970de5894586516244030f86b6c3fc3e"
git_base_ref: "origin/030-remove-legacy-decision-code"
git_base_sha: "7e06a2a7970de5894586516244030f86b6c3fc3e"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/feature-runs/domain-coverage-completeness-guard/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### HIGH
| Severity | Finding |
|---|---|
| **HIGH** | **Performance Risk of On-Demand Calculation** |
| | The spec mandates that completeness is calculated fresh on every request ("Completeness checks read fresh data"), explicitly ruling out caching for the first version. While Acceptance Criterion #8 requires a "bulk completeness strategy", this still poses a significant performance risk. A complex GraphQL query for the Domain Coverage page, involving multiple vignettes and values, could trigger a massive, slow database aggregation across millions of transcript rows. This could lead to API timeouts, a degraded user experience, or even database overload under moderate usage, making the page unusable. The mitigation to use a "bulk" strategy is necessary but may not be sufficient without caching. |

### MEDIUM
| Severity | Finding |
|---|---|
| **MEDIUM** | **[UNVERIFIED] Batch Integrity Assumption** |
| | The spec defines a batch using `jobChoiceBatchGroupId` or `pairedBatchGroupId` (Product Decision #6). This logic assumes that these grouping keys are reliably and correctly applied to all runs that should belong to a batch. The new coverage logic is entirely dependent on this existing data structure. If a run is missing its correct group ID due to a bug in the run-creation or update logic, it will be counted as a separate "batch of 1". This could incorrectly inflate `batchCount` and `incompleteBatchCount` and misrepresent the true batch structure, undermining the goal of providing an accurate coverage view. |
| **MEDIUM** | **[UNVERIFIED] Ambiguity in Mixed Cell UI** |
| | The spec states that for a cell with both complete and incomplete batches, "the normal success indicator is suppressed". It does not define what this indicator is (e.g., a green dot, a checkmark, a background color). This leaves the implementation open to interpretation. An engineer unfamiliar with the existing UI might guess incorrectly or fail to suppress the indicator, leading to a UI state that shows both a success and a warning signal for the same cell, which would confuse users. |
| **MEDIUM** | **Unclear Rationale for Hiding Aggregate Analysis Link** |
| | The spec requires hiding the aggregate analysis link if *any* run in the cell is incomplete. This rule is very strict and the reasoning is not provided. A cell could contain 10 complete batches and 1 minor incomplete run, yet the analysis link would be hidden for all of them. Since aggregate runs are explicitly excluded from coverage counts, it's unclear why the presence of other incomplete runs should block access to what might be a perfectly valid and complete aggregate analysis. This may unnecessarily prevent users from inspecting otherwise useful data. |

### LOW
| Severity | Finding |
|---|---|
| **LOW** | **Potential for "Incomplete" Warning Fatigue** |
| | According to the signature picker behavior, an amber warning banner is shown if the selected signature has *any* incomplete runs. This means a signature with 99 complete runs and 1 incomplete run will trigger the same warning as a signature with only 1 incomplete run. Over time, this could lead to "alert fatigue," where users learn to ignore the warning banner because it appears so frequently, even for data sets that are almost entirely complete. |

## Residual Risks

| Risk | Why it matters |
|---|---|
| **Data Backfill Complexity** | The spec correctly identifies that legacy runs need an audit script and potential backfill (Product Decision #7). The risk remains that the backfill process for `runScenarioSelection` could be complex, error-prone, or deprioritized, leaving a permanent population of historical runs in a `LEGACY_UNAVAILABLE` state that can never be counted for coverage. |
| **Run Configuration Mutability** | The design wisely freezes the expected key set at run creation (Product Decision #3). However, it is silent on the mutability of batch grouping keys (`jobChoiceBatchGroupId`, `pairedBatchGroupId`). If these keys can be changed on a run after its completion, a run could effectively "move" between batches, altering historical coverage counts for two different batches in a potentially confusing and untraceable way. |

## Token Stats

- total_input=3671
- total_output=880
- total_tokens=18125
- `gemini-2.5-pro`: input=3671, output=880, total=18125

## Resolution
- status: open
- note:
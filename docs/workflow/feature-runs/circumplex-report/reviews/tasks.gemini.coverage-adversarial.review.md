---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/circumplex-report/tasks.md"
artifact_sha256: "544e6c76bed77a8e666272929882fbfb87188d58ba337b8a5f6ea2efaf1c311a"
repo_root: "."
git_head_sha: "2a61705a6965451e85ef5426ef3dffad0fabbbd7"
git_base_ref: "origin/claude/consistency-signature-dropdown"
git_base_sha: "2a61705a6965451e85ef5426ef3dffad0fabbbd7"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH (MDS rotation contradiction — 0° vs y_top): A4 anchorMdsRotation now explicitly documents that 0° means 12 o'clock (x:0, y:+r) on the UI screen, NOT the math-convention positive x-axis. A4b test assertion (0, y_top) is correct under this convention. HIGH (expensive default load): accepted as residual risk — at 11 production models the cost is negligible; ModelsConsistency already uses the same pattern; will revisit at ≥50 models. MEDIUM (valueProfileMatrix diagonal for excluded values): A4 now specifies excluded-value diagonal is null, not 1.0. MEDIUM (missing loading/error states in B3): B3 steps 4-6 now specify shared Loading + ErrorMessage + empty-state components. LOW findings (magic numbers, B4 hidden vs greyed terminology, signature preference brittleness, typo risk in Schwartz order, aggregation 'mirror' language) — all accepted as residual tech debt; B4 terminology clarified (insufficient models are rendered as disabled/greyed, not hidden; the 'N models hidden' phrasing is a count label not a visibility toggle)."
raw_output_path: "docs/workflow/feature-runs/circumplex-report/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "Coverage reconciled; tasks revisions address all findings."
---

# Review: tasks coverage-adversarial

## Findings

### HIGH
| ID | Finding | Location(s) |
| --- | --- | --- |
| **H-1** | **Contradictory MDS Rotation Target** | `A4`, `A4b` |
| | The task plan specifies a critical contradiction for the MDS plot's orientation. The implementation guide in `A4` for `anchorMdsRotation` implies a standard rotation to angle 0° (mathematically, the positive X-axis). However, the corresponding unit test in `A4b` asserts that the anchor value should be placed at `(0, y_top)`, which is 90°. This discrepancy will lead to a systematically incorrect and misleading data visualization. | |
| **H-2** | **Expensive Default Page Load Behavior** | `B3` |
| | The page component specification in `B3` mandates a default behavior of fetching and analyzing data for *all* models in the roster if none are specified in the URL. This is a significant performance anti-pattern. For a large number of models, this initial query will likely be very slow, potentially causing API timeouts and creating a poor, unresponsive user experience. The page should default to a small, curated set of models or prompt the user to make a selection before fetching data. | |

### MEDIUM
| ID | Finding | Location(s) |
| --- | --- | --- |
| **M-1** | **Logically Inconsistent Correlation Matrix for Excluded Values** | `A4`, `A4b` |
| | The specification for `valueProfileMatrix` states that for an excluded value, its corresponding row and column in the output matrix should contain `null`, *except* for the diagonal element, which should be `1.0`. A value is excluded precisely because its profile is incomplete or non-existent. Therefore, its self-correlation is undefined, not 1.0. This is logically inconsistent and could mislead downstream statistical calculations or visual interpretations. The diagonal for an excluded value should also be `null`. | |
| **M-2** | **[UNVERIFIED] Potentially Inefficient Data Aggregation Strategy** | `A6`, `A9`, `A10` |
| | The data aggregation flow appears to rely on fetching numerous database records (`runs`, `transcripts`) into the application layer for filtering and processing. This pattern is often inefficient and can lead to severe performance degradation or memory exhaustion, especially with large datasets. The plan lacks provisions for more scalable, database-centric aggregation (e.g., using `GROUP BY` or an aggregation pipeline), posing a significant performance risk to the API. | |
| **M-3** | **Missing UI States for Loading and Error Handling** | `B3` |
| | The page component specification in `B3` omits any mention of handling loading states while the main data query is in flight, or error states if the query fails. Without these, the user will be presented with a blank or stale interface with no feedback, leading to a confusing and poor user experience. | |

### LOW
| ID | Finding | Location(s) |
| --- | --- | --- |
| **L-1** | **Proliferation of Undocumented "Magic Numbers"** | `A4`, `A9`, `C1` |
| | The plan introduces several hardcoded numerical thresholds without justification: Pearson correlation requiring `>2` pairs (`A4`), circumplex fit requiring `>14` pairs (`A4`), the default eligibility `minTrialsPerValue` being `5` (`A9`), and a heatmap cell overlay for `<20` trials (`C1`). These "magic numbers" make the logic opaque and potentially brittle. Their values should be justified in comments, extracted to named constants, or made configurable where appropriate. | |
| **L-2** | **Contradictory UI for Insufficient Models** | `B4` |
| | The specification for the model picker in `B4` is contradictory. It first states that insufficient models will be rendered as "disabled/greyed entries", but then mentions a footer that shows "`N` models hidden". This is ambiguous: either the models are visible but disabled, or they are not visible at all ("hidden"). The intended behavior must be clarified. | |
| **L-3** | **[UNVERIFIED] Brittle Signature Preference Logic** | `A2` |
| | The `preferDefaultSignature` helper relies on a hardcoded preference chain of string prefixes (e.g., `vnewtd`, `vnewt0`). This implementation is brittle and not forward-compatible with new signature naming schemes. Furthermore, the test plan does not cover tie-breaking scenarios (e.g., two signatures of the same preference level), which could lead to non-deterministic behavior. | |
| **L-4** | **[UNVERIFIED] Risk of Silent Failures from String Typos** | `A3` |
| | The canonical Schwartz value order in `A3` is defined as a hardcoded array of strings (`ValueKey[]`). A simple typo in one of these string literals would not be caught at compile time but would cause silent data corruption or lookup failures at runtime. While a documentation task (`D4`) is included, the plan lacks automated validation against a canonical source of truth, such as a database enum or shared type definition. | |
| **L-5** | **Confusing Terminology in Aggregation Logic** | `A6` |
| | Task `A6` describes normalizing the pairwise matrix as "ordered→unordered so cell (A, B) is mirror of cell (B, A)". This language is confusing. A win-rate matrix is inherently directional (the win rate of A vs. B is distinct from B vs. A). The term "mirror" is ambiguous and could easily be misinterpreted during implementation, leading to incorrect calculations. | |

## Residual Risks

*   **Performance Bottleneck:** The data aggregation pipeline (`A6`, `A9`) is the largest unverified risk. Its reliance on processing potentially large volumes of data in the application memory, rather than in the database, could render the feature unacceptably slow or cause it to fail under load.
*   **Methodological Soundness:** The feature's validity rests on several statistical assumptions and "magic number" thresholds (`MDS warning`, `fit verdict cutoffs`). While `D1` includes a valuable disclaimer about the novelty of the application, the correctness of the output is still fundamentally tied to these unverified heuristics.
*   **Upstream Dependencies:** The entire analysis is critically dependent on the correctness of existing, unaudited helper functions like `resolveTranscriptDecisionModel` and `runMatchesSignature`. Any latent bugs in this `[UNVERIFIED]` upstream code would silently invalidate all results produced by this new feature.

## Token Stats

- total_input=18556
- total_output=1458
- total_tokens=24524
- `gemini-2.5-pro`: input=18556, output=1458, total=24524

## Resolution
- status: accepted
- note: HIGH (MDS rotation contradiction — 0° vs y_top): A4 anchorMdsRotation now explicitly documents that 0° means 12 o'clock (x:0, y:+r) on the UI screen, NOT the math-convention positive x-axis. A4b test assertion (0, y_top) is correct under this convention. HIGH (expensive default load): accepted as residual risk — at 11 production models the cost is negligible; ModelsConsistency already uses the same pattern; will revisit at ≥50 models. MEDIUM (valueProfileMatrix diagonal for excluded values): A4 now specifies excluded-value diagonal is null, not 1.0. MEDIUM (missing loading/error states in B3): B3 steps 4-6 now specify shared Loading + ErrorMessage + empty-state components. LOW findings (magic numbers, B4 hidden vs greyed terminology, signature preference brittleness, typo risk in Schwartz order, aggregation 'mirror' language) — all accepted as residual tech debt; B4 terminology clarified (insufficient models are rendered as disabled/greyed, not hidden; the 'N models hidden' phrasing is a count label not a visibility toggle).
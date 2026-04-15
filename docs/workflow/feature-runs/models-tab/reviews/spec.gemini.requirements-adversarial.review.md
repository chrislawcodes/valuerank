---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/models-tab/spec.md"
artifact_sha256: "e5bf34bd898e98bc95f7bb5201ba13c7ce9fc1dcbc8c856359e32021b0129319"
repo_root: "."
git_head_sha: "b26923fbe83c2c0ec86c80180073de00a4461626"
git_base_ref: "origin/main"
git_base_sha: "b26923fbe83c2c0ec86c80180073de00a4461626"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/models-tab/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

### [HIGH] Incomplete Stability Filtering Logic

The `Stability visibility` filter is specified with options for `Stable only` (≥ 75) and `Low stability only` (< 50). This leaves a gap: there is no way for a user to filter for or isolate cells with moderate stability in the [50, 74] range. This is a functional omission that prevents a complete analysis of the data.

### [HIGH] Misleading Aggregation in Pooled Win Rate

The core metric, "pooled win rate," is a weighted mean. This creates a significant risk of Simpson's paradox. A single domain with a very high evidence weight (`w_d`) can dominate the pooled average, making a model's preference for a value appear general when it may be specific to that one domain (or even reversed in others). While the drilldown is intended as a mitigation, the primary matrix view can still present a misleading summary, which undermines the primary goal of at-a-glance comparison.

### [MEDIUM] Fragile Stability Signal at Low Domain Counts

The stability score is calculated for any cell with two or more eligible domains. A score calculated from only two domains is highly sensitive to small variations and can produce a score that appears definitive (e.g., "highly stable") from very sparse evidence. For example, two domains with win rates of 60% and 80% would yield a stability score of 80 ("highly stable"). The only visual cue distinguishing this from a score derived from 20 domains is the compact `2d` label, which is subtle and may not be sufficient to signal the low confidence of the calculation.

### [MEDIUM] Ambiguous Column Headers Harm Scannability

To fit a standard layout, the spec requires heavily abbreviated value names for column headers (e.g., `Universalism_Nature` -> `Univ`, `Benevolence_Dependability` -> `Bene`). These abbreviations are potentially ambiguous and harm the primary user story of scanning patterns "at a glance." Users will be forced to hover over each column to understand its meaning, increasing interaction cost and defeating the goal of a quick-scan surface. This places success criterion `SC-004` (scannability on a standard viewport) at risk.

### [LOW] Jargon in Cell UI

The cell design includes the label `Nd` (e.g., `4d`) to denote the number of eligible domains. The `d` suffix is internal jargon that may not be immediately clear to a researcher, requiring a tooltip or documentation to understand.

### [UNVERIFIED] [LOW] Vague Schema Update Process

The "Verification Expectations" section instructs the implementer on how to update the web app's GraphQL schema snapshot, but concludes with "Check how other features do this." This introduces a process ambiguity that could cause minor friction or error during implementation if the project's conventional method is not immediately obvious.

## Residual Risks

-   **Misinterpretation of "Product Metrics"**: The spec explicitly defines the stability score as a "product metric," not a "publication-grade" statistic. However, by quantifying it (`75/100`), visualizing it with precise dots, and explaining it with statistical concepts ("average spread"), there is a significant residual risk that users will overestimate its statistical rigor. This could lead to incorrect conclusions about the data's true heterogeneity.
-   **Scalability of the Matrix**: The design omits a summary strip and relies on fitting all value columns into a standard-width view. If the number of models (rows) or values (columns) grows, the page will become difficult to scan and use, failing its primary goal. The abbreviated headers are a tactical fix that may not scale.
-   **Single-Domain Filter Utility**: The spec correctly notes that when filtering to a single domain, the stability score becomes unavailable. This is the correct behavior, but it also means a core feature of the page (the stability dots) is disabled in this mode. This reduces the utility of the page when scoped to a single domain, potentially confusing users who expect to see the same cell structure in all views.

## Token Stats

- total_input=4475
- total_output=867
- total_tokens=22126
- `gemini-2.5-pro`: input=4475, output=867, total=22126

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted

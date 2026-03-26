---
reviewer: "gemini"
lens: "regression-adversarial"
stage: "diff"
artifact_path: "docs/feature-runs/analysis-reports-decision-score-phase1/reviews/implementation.diff.patch"
artifact_sha256: "7275845689913c8da68d25a3907093b23a80a61f85a35c681c519d9acf9ae008"
repo_root: "."
git_head_sha: "b3e2d63328dccb036ae789ac1f04a3ce39404f32"
git_base_ref: "origin/codex/domain-analysis-ordering-fix"
git_base_sha: "b3e2d63328dccb036ae789ac1f04a3ce39404f32"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Resolved by keeping the phase-1 report pages off the legacy 1-5 score display, replacing the condition-detail mean with the canonical bucket summary and unknown count, and covering the visible report pages with canonical summary tests."
raw_output_path: "docs/feature-runs/analysis-reports-decision-score-phase1/reviews/diff.gemini.regression-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff regression-adversarial

## Findings

Ordered by severity.

### 1. High Severity: Functional Regression and Information Loss in Condition Analysis

The diff removes the `mean` score calculation from the `AnalysisConditionDetail` page and replaces it with a count of `Unknown` transcripts.

- **Adversarial Lens:** This is a significant functional regression. The mean score provided a quantitative measure of central tendency for the ordinal `decisionCode` scale (1-5). It allowed users to quickly gauge the overall direction and magnitude of a model's preference within a condition and compare it across different conditions. Its removal eliminates this capability.
- **Hidden Flaw:** Replacing a statistical summary (mean) with a simple count of excluded data points (`unresolvedCount`) is a net loss of information. The UI now shows *less* information about the distribution of *resolved* decisions, forcing users into a more manual, high-cognition review of individual count buckets to understand the overall trend.
- **Weak Assumption:** This change assumes the mean score was either misleading or not valuable. This is a strong assumption. While means on ordinal data can be debated, they are a common heuristic. Removing the feature entirely without providing an alternative measure of central tendency (like a median) is a degradation of the analysis tool.

### 2. Medium Severity: Brittle Logic Introduces Risk of Silent Misclassification

The new `reportDecisionDisplay.ts` utility introduces string-parsing logic that is highly coupled to a specific output format.

- **Adversarial Lens:** The function `getBucketKind` determines if a decision is 'strong' or 'lean' based on `headline.startsWith('Strongly favors ')`. This is brittle.
- **Hidden Flaw:** Any future change to the `formatCanonicalDecisionHeadline` function—such as changing wording to "Strongly supports", fixing a typo, or even a case change—will cause this logic to fail silently. 'Strong' decisions would be misclassified as 'lean', corrupting the derived `ReportDecisionSummary` and any UI component that relies on it. This creates a hidden maintenance burden and a high risk of future bugs. A more robust implementation would pass an enum or structured data instead of parsing a free-form string.

### 3. Medium Severity: Summary Logic Can Produce Misleading Headlines Under Uncertainty

The new `summarizeReportTranscriptDecisions` function calculates a summary `headline` based only on transcripts that have a renderable `decisionModelV2`.

- **Adversarial Lens:** This can create a headline that suggests high confidence when the underlying data is sparse or of poor quality.
- **Hidden Flaw:** Consider a scenario with 10 transcripts: 2 are "Strongly favors A" and 8 are "Unknown". The logic will produce the headline "Strongly favors A" because it has a 100% majority *among renderable transcripts*. While technically correct by its own definition, this headline is misleading in the context of the entire dataset. It over-represents the certainty of the finding. The UI on the `AnalysisTranscripts` page attempts to mitigate this by displaying multiple stats, but the headline itself is amplified and can be easily misinterpreted if viewed in isolation.

### 4. Low Severity: Methodological Transparency Is Reduced

The diff removes a helpful tooltip from `AnalysisTranscripts.tsx` that explained score normalization in paired views.

- **Adversarial Lens:** The old tooltip explained *why* scores were adjusted when option order was flipped. This is a critical piece of methodological information for a user trying to understand the analysis.
- **Omitted Case:** The `reportDecisionDisplay` tests confirm that normalization is still being applied (`normalizationApplied: true`). Therefore, removing the explanation is an omission. While the new UI abstracts the raw scores, the concept of normalization is fundamental to trusting the analysis. Hiding this information reduces transparency and could confuse a discerning user who inspects the raw data.

## Residual Risks

- **Increased Brittleness:** The system is now more fragile due to the string-based coupling between the decision headline format and the summary bucketing logic. Future changes in one part of the system are more likely to have unforeseen, silent consequences in another.
- **Reduced Analytical Precision:** By replacing a numeric `mean` with a categorical `headline` (e.g., "Mixed"), the system loses granularity. A user can no longer distinguish at a glance between a condition that is a close 49/51 split and one that is a true three-way muddle. This makes nuanced comparison between two "Mixed" conditions impossible without manual data inspection.
- **Risk of User Misinterpretation:** The new design places a higher burden on the user to synthesize multiple pieces of information (e.g., a summary headline and an "Unknown" count) to form a correct conclusion. There is a residual risk that users will fixate on the qualitative summary headline and ignore the uncertainty conveyed by the unknown count, leading to flawed takeaways.

## Token Stats

- total_input=17897
- total_output=1032
- total_tokens=22069
- `gemini-2.5-pro`: input=17897, output=1032, total=22069

## Resolution
- status: accepted
- note: Resolved by keeping the phase-1 report pages off the legacy 1-5 score display, replacing the condition-detail mean with the canonical bucket summary and unknown count, and covering the visible report pages with canonical summary tests.

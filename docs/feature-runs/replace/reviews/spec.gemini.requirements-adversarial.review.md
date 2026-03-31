---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/feature-runs/replace/spec.md"
artifact_sha256: "59fbf4ee5695cdb3a2a0961407ffd960fcf648d9ae5f3ba684e919bf189fac2b"
repo_root: "."
git_head_sha: "10bf94660675d2780d47c779703b906d451a9b22"
git_base_ref: "origin/main"
git_base_sha: "345d03f7eff71bacc8cef3a464cd4024ce6fa092"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/feature-runs/replace/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

1.  **Core Logic Misses an Edge Case.** The five-bucket system for classifying outcomes (`strongly`, `somewhat`, etc.) is based on `strength: 'strong'` or `strength: 'lean'`. However, the canonical decision model also allows for `strength: 'neutral'`. The spec does not define what happens if a decision has a `direction` of `'favor_first'` or `'favor_second'` but a `strength` of `'neutral'`. This is a valid combination that is not accounted for in the new bucketing logic, meaning these trials will be silently dropped from the five-bucket counts, leading to inaccurate `totalTrials`, `winRate`, and `meanPreferenceScore` metrics.

2.  **UI Tie-Breaker is Actively Misleading.** The convention to render a tie (`selectedScore === opponentScore > 0`) as an opponent win (orange) is a significant design flaw. It visually falsifies the data by declaring a winner in a draw. This undermines the goal of objective analysis and will confuse users, as a cell color will indicate a loss for the selected value when, in fact, it performed equally to its opponent. This should be rendered in a neutral color.

3.  **Graceful Degradation is Undefined.** The spec mandates removing the `decisionCode` filter, allowing all transcripts with `decisionMetadata` to be processed. However, it fails to specify behavior if `decisionMetadata` is missing, null, or malformed. This creates a risk of resolver crashes (a denial-of-service for the UI) or, worse, silent failures where transcripts are incorrectly categorized as `unknown` without a clear error. The robustness of `resolveCanonicalDecision` against bad input is a critical, unaddressed assumption.

4.  **Bug Fix Implementation is Ambiguous.** The spec provides conflicting instructions for the `orientationFlipped` bug fix. The prose suggests moving the `job-choice-v2` block to an unspecified position "BEFORE the null guard," while the "Corrected order" list places it *after* the `parseClass` check. This ambiguity is dangerous, as reordering these checks without a clear understanding of their dependencies could introduce new, subtle bugs into the core decision resolution logic.

## Residual Risks

1.  **Inconsistent Data Creates User Confusion.** The spec knowingly creates a period where the top-level `domainAnalysis` grid and the `DomainAnalysisValueDetail` page will show different, conflicting data for the same values. The top-level grid will use the legacy integer logic, while the detail page uses the new canonical model. This will result in discrepancies in win rates and trial counts, which could significantly confuse users and erode trust in the platform's data integrity. The risk to user experience from this temporary schism is high.

2.  **The "Unknown" Count Can Obscure Data Quality Issues.** By excluding `unknown` trials from the `totalTrials` denominator, the `winRate` and `meanPreferenceScore` metrics can become artificially inflated. A systemic issue causing many trials to become `unknown` would not lower these scores; it would simply shrink the dataset they are calculated from. While the absolute `unknownCount` is surfaced, the derived metrics themselves become less representative without a clear indication (e.g., a percentage) of how much data was excluded.

3.  **Insufficient Testing Requirements.** The acceptance criteria focus on positive outcomes and rely on "all existing tests pass." For a refactor of this complexity, which is explicitly fixing a previous logic bug, this is insufficient. There is no mandate for *new* unit tests to cover the identified edge cases (`strength: 'neutral'`), failure modes (malformed `decisionMetadata`), the `job-choice-v2` logic path, or the new UI rendering rules (especially the flawed tie-breaker). This lack of required testing leaves the feature vulnerable to regressions and the same class of subtle bugs it aims to fix.

## Token Stats

- total_input=15308
- total_output=826
- total_tokens=18993
- `gemini-2.5-pro`: input=15308, output=826, total=18993

## Resolution
- status: open
- note:
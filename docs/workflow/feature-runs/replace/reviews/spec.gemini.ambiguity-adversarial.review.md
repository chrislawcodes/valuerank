---
reviewer: "gemini"
lens: "ambiguity-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/replace/spec.md"
artifact_sha256: "59fbf4ee5695cdb3a2a0961407ffd960fcf648d9ae5f3ba684e919bf189fac2b"
repo_root: "."
git_head_sha: "10bf94660675d2780d47c779703b906d451a9b22"
git_base_ref: "origin/main"
git_base_sha: "345d03f7eff71bacc8cef3a464cd4024ce6fa092"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/replace/reviews/spec.gemini.ambiguity-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec ambiguity-adversarial

## Findings

1.  **Critical Contradiction in Tie-Breaking Logic:** The specification contains a direct contradiction on how to render a tie in the UI.
    *   The "Cell Rendering in `ConditionMatrix`" section provides pseudocode: `const isOpponent = opponentScore > selectedScore;`. If `selectedScore === opponentScore`, `isOpponent` will be `false`, causing the cell to be colored **blue** (favoring the selected value).
    *   However, a few lines below, an explicit convention is stated: "Tie (selectedScore === opponentScore > 0): render as opponent (**orange**) — explicit convention".
    *   An implementer has no clear path forward. This ambiguity is guaranteed to cause an incorrect implementation depending on which instruction is followed.

2.  **Ambiguous Mapping for Canonical Decisions:** The "Five Outcome Buckets" only define mappings for decisions where `strength` is `'strong'` or `'lean'`. The behavior is undefined if `resolveCanonicalDecision` returns a `strength` of `'neutral'` or `'unknown'` in conjunction with a `direction` of `'favor_first'` or `'favor_second'`. This could lead to trials being misclassified as `neutral` or unexpectedly being excluded as `unknown`, silently skewing the results.

3.  **Undefined Behavior for Malformed `decisionMetadata`:** The spec mandates removing the `decisionCode` filter, allowing any transcript with `decisionMetadata` to be processed. It fails to specify the outcome if this `decisionMetadata` is present but incomplete, corrupt, or otherwise unparsable by `resolveCanonicalDecision`. This creates a risk of either runtime errors crashing the resolver or, more subtly, failing transcripts being silently counted as `unknown`, leading to data loss without visibility.

4.  **Implicit Data Inconsistency Between Views:** The decision to not update `aggregateValueCountsFromTranscripts` means the main `domainAnalysis` grid and the `domainAnalysisValueDetail` view will operate on different data sets and logic. Since the detail view will now process `job-choice-v2` transcripts (and others without a `1-5` `decisionCode`), its `totalTrials` may be higher than the `totalComparisons` for the same value on the main grid. This will likely create user confusion and distrust in the data, as summary and detail views will not align.

5.  **Unverifiable Acceptance Criterion:** Acceptance Criterion #4 requires that "job-choice transcripts without a scenario resolve correctly," but it provides no definition of "correctly." Without a golden data fixture or a specific expected output for a sample `job-choice-v2` transcript, this requirement is subjective and cannot be rigorously tested.

## Residual Risks

1.  **Future Development Constraint:** The spec states that a future wave to update the "Scenarios tab" *must* produce "visually and numerically identical output" to this one. This imposes a strict, forward-looking constraint. If any assumptions made in this spec (e.g., the 0-2 score scale, color conventions) are found to be flawed after release, the cost of correction will be doubled, as it will require a coordinated change across two separate parts of the application.

2.  **Potential for User Misinterpretation of "Win Rate":** The specified formula for win rate is `(strongly + somewhat) / totalTrials`, which includes `neutral` outcomes in the denominator. A user might intuitively expect a win rate to be `wins / (wins + losses)`, excluding neutral results. While a valid metric, this definition could lead to analytics that seem lower than expected, potentially causing users to misinterpret the model's performance.

3.  **Fragility of `orientationFlipped: null` Assumption:** The entire logic for `job-choice-v2` hinges on the assumption that `orientationFlipped: null` is always correct because these vignettes identify values by name, not by position. If any legacy data or future "job-choice" style vignettes deviate from this pattern, they will be incorrectly resolved as `unknown` due to the bug fix that moves the `null` guard.

## Token Stats

- total_input=3422
- total_output=869
- total_tokens=18461
- `gemini-2.5-pro`: input=3422, output=869, total=18461

## Resolution
- status: open
- note:
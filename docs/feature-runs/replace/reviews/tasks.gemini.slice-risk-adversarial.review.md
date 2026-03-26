---
reviewer: "gemini"
lens: "slice-risk-adversarial"
stage: "tasks"
artifact_path: "docs/feature-runs/replace/tasks.md"
artifact_sha256: "1186dbd6136f668c820c84f1fe593b6afd519e8b7e86025f96b94d40e70a5f4a"
repo_root: "."
git_head_sha: "10bf94660675d2780d47c779703b906d451a9b22"
git_base_ref: "origin/main"
git_base_sha: "345d03f7eff71bacc8cef3a464cd4024ce6fa092"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/feature-runs/replace/reviews/tasks.gemini.slice-risk-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks slice-risk-adversarial

## Findings

1.  **HIGH RISK: No Data Backfill or Migration Strategy.** The plan removes the `decisionCode` filter and replaces the core calculation logic. This implies that all historical data will be re-calculated on-the-fly for every API request via `resolveCanonicalDecision`. This introduces a severe performance risk. For any significant volume of data, API endpoints for domain analysis are likely to become unacceptably slow or time out entirely. A data migration or backfill step to pre-calculate and store the new preference-based metrics seems essential but is completely absent.

2.  **HIGH RISK: No New Tests for Core Logic.** The plan mandates that existing tests pass, but does not include a task to *write new tests* for the new, critical `resolveCanonicalDecision` logic, the five-bucket classification, or the new aggregation fields (`meanPreferenceScore`, `selectedValueWinRate`, etc.). Changing a fundamental data model and calculation engine without writing corresponding unit and integration tests to validate the new behavior is extremely risky and likely to introduce silent calculation errors.

3.  **HIGH RISK: Unsafe Expansion of Data Processing Scope.** The task to remove `decisionCode: { in: ['1','2','3','4','5'] }` from queries is a critical flaw. This filter likely exists to protect the resolvers from processing transcripts that are not compatible with this analysis type (e.g., they lack the necessary `decisionMetadata`). The plan assumes adding `decisionMetadata: true` to the select is a sufficient fix, but it doesn't account for what happens if that data is null or malformed on older or different types of transcripts. This change could feed unexpected data into the new `resolveCanonicalDecision` function, leading to runtime errors, null pointer exceptions, or silently incorrect analytics.

4.  **MEDIUM RISK: Ambiguous UI Changes and Potential for Misinterpretation.** The frontend tasks are described vaguely. "Use winner's score display" is not a clear specification. It's unclear how ties are handled, how the opponent's score is represented, or if this single metric is sufficient. Furthermore, relegating the "unknown count" to a footnote is a significant risk. If the number of unknowns is large, the primary metrics are not just weakened, they are potentially misleading. A user could easily miss the footnote and draw invalid conclusions from a small, biased sample of data. The UI must treat a high unknown count as a first-class state, not an afterthought.

5.  **MEDIUM RISK: Incomplete Impact Analysis.** The plan calls for the removal of the `classifyDecisionForSelectedValue` function and `meanDecisionScore` type. It assumes the only places these are used are the ones being changed. There is no task to verify this assumption by, for example, searching the codebase for other usages. This creates a risk of breaking other, un-audited parts of the system, such as other API endpoints, asynchronous workers, or data export scripts.

## Residual Risks

1.  **Silent Data Corruption:** Even if all tasks are completed as written, the lack of new, targeted tests means the new calculations could be subtly incorrect. This would lead to users viewing and making decisions based on faulty analytics without any visible errors. The risk is that the numbers look plausible but are fundamentally wrong.

2.  **Analyst Misinterpretation:** The new UI, with its "winner" scores and opponent coloring scheme, may not be intuitive. Without clear and persistent labeling within the interface itself (beyond a one-time footnote), users could easily misinterpret what the scores and colors signify, especially the relationship between a value's score and its opponent's score.

3.  **Deployment Failure:** The plan lacks any mention of a phased rollout, feature flagging, or staging verification. This is a major change to a core analytics feature. A production deployment carries a high risk of immediate, system-wide failure of the feature with no clear rollback path. The performance issues alone could require an emergency revert.

## Token Stats

- total_input=12751
- total_output=828
- total_tokens=15239
- `gemini-2.5-pro`: input=12751, output=828, total=15239

## Resolution
- status: open
- note:
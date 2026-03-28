---
reviewer: "gemini"
lens: "risk-boundary-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/replace/plan.md"
artifact_sha256: "283bdbc45edcf7ac811cbbde4d21a5eda0dd4028191f63e2008906e46e7ccc98"
repo_root: "."
git_head_sha: "10bf94660675d2780d47c779703b906d451a9b22"
git_base_ref: "origin/codex/domain-analysis-overview-ux"
git_base_sha: "10bf94660675d2780d47c779703b906d451a9b22"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/feature-runs/replace/reviews/plan.gemini.risk-boundary-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan risk-boundary-adversarial

## Findings

1.  **Critical Verification Gap:** The verification plan is inadequate. It consists solely of running existing linting, testing, and build commands. It omits the most critical step: **writing new tests** to validate the new canonical decision logic, the `opponentMeanPreferenceScore` display logic, and the bug fix for `orientationFlipped`. Relying on the build process to catch errors is a weak substitute for dedicated tests that confirm the *correctness* of the new behavior, not just its type-safety. This introduces a high risk of shipping with incorrect calculations or logic flaws.

2.  **Unmitigated User Experience Degradation:** The plan creates a direct, acknowledged conflict between the top-level domain analysis grid (using legacy counts) and the detail page (using the new canonical model). The totals and values will not match between the two screens. The plan accepts this as a "two-wave strategy" but fails to include any UI/UX mitigations to manage the resulting user confusion. Without explicit callouts, banners, or labels explaining the discrepancy, users will perceive the data as broken, eroding trust in the platform.

3.  **High Risk of Breaking Out-of-Scope Dependencies:** The plan requires modifying `cloud/apps/api/src/graphql/queries/domain/shared.ts`. The name of this file implies its contents are consumed by multiple features, including those explicitly marked as "Do NOT touch" (like `aggregateValueCountsFromTranscripts`). While the plan forbids changing that specific function, it allows removing other types and helpers from `shared.ts`. This creates a significant risk of breaking the out-of-scope summary grid, as its types may no longer be satisfied. A successful build of the `api` workspace alone does not guarantee that other, dependent parts of the system are not broken by the removal of shared code.

## Residual Risks

1.  **User Misinterpretation of "Improved" Data:** The plan correctly identifies that some transcripts will now be classified as `unknownCount` instead of being silently dropped or counted incorrectly. However, it carries a residual risk that users will perceive this as a regression. A user who previously saw a count of `N` for a condition may now see `N-M` with `M` appearing in an "unknown" bucket. Without a clear and compelling explanation in the UI, this shift could be interpreted as data loss or a new bug, rather than a fix for a hidden, pre-existing one.

2.  **Misleading Tie-Break Representation:** The decision to render ties as a win for the opponent (orange) is a non-obvious and potentially misleading convention. While the behavior is intentional per the spec, it creates a risk that users will misinterpret the data. A true tie is not a loss, but the UI will display it as one, which could lead to flawed analytical conclusions if the user is not aware of this specific, arbitrary rule.

3.  **Floating Point Precision Errors:** The winner/loser logic depends on a direct comparison between `meanPreferenceScore` and `opponentMeanPreferenceScore`, which are likely floating-point numbers. The plan does not account for potential floating-point inaccuracies. This creates a risk of unstable or incorrect tie-breaking when two scores are computationally very close (e.g., `0.3` vs `0.30000000000000004`), leading to inconsistent UI states that appear random.

## Token Stats

- total_input=1796
- total_output=722
- total_tokens=16109
- `gemini-2.5-pro`: input=1796, output=722, total=16109

## Resolution
- status: open
- note:
---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/pressure-sensitivity-report/plan.md"
artifact_sha256: "0c96311faf24f276d77c0ac33ec97ad5fbf25d2bd0f612a0f8e55de3588a2703"
repo_root: "."
git_head_sha: "3878e844e43ff1bda98ddc0e810a7a7bbb2cf3d5"
git_base_ref: "origin/main"
git_base_sha: "3878e844e43ff1bda98ddc0e810a7a7bbb2cf3d5"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Round 3 findings addressed: (1) HIGH residual-risks vs Decision 4 contradiction — Risks section rewritten to describe accidentally-pooling (the original plan's incorrect rule, now removed) as the failure mode; verification asserts n===3 for 3-transcript fixture (matches transcript count); (2) MEDIUM testing strategy specificity for collision detection — Testing Strategy expanded to require three sub-cases per FR-002a (label-vs-label, score-vs-score, label-vs-score), plus three sub-cases for out-of-range (0, 6, 1.5), plus empty-levels case; (3) LOW duplicated nav structural hazard — accepted as known tech debt out of scope; recorded for follow-up."
raw_output_path: "docs/workflow/feature-runs/pressure-sensitivity-report/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "partial"
coverage_note: "context exceeded max_context_chars and was narrowed"
---

# Review: plan testability-adversarial

## Findings

### 1. Contradictory Aggregation Logic in Risk Assessment
**Severity:** HIGH
**Description:** The implementation plan contains a critical contradiction regarding the data aggregation strategy. Decision 4 ("no pooling") and the specification (FR-022) both correctly state that aggregation should count raw transcripts, where each transcript is one observation (`N = transcript count`). However, the "Residual Risks" section of the plan describes the risk and verification for the *opposite* logic, where data is pooled by scenario (`N = scenario count`). This confusion in the plan's own risk analysis could easily mislead an implementer into building the wrong core aggregation logic, which would invalidate the entire report.
**Evidence:** `[CODE-CONFIRMED]`
-   **Plan Decision 4:** "No pooling (corrected after plan-review round 2 MEDIUM): each transcript is one observation. N = transcript count per cell."
-   **Spec `spec.md` FR-022:** "Data source — raw transcripts, no pooling. ... Each transcript is one observation; N = transcript count per cell, NOT scenario count."
-   **Plan `plan.md` "Residual Risks" section:** "Pooling mistake — counting raw transcripts instead of `(model, scenario)` pools inflates N and corrupts win-rate semantics. ... verification: ... assert the returned cell `n` matches scenario count, not transcript count." This verification step directly contradicts the specified implementation.

### 2. Insufficient Test Strategy for Critical Normalization Logic
**Severity:** MEDIUM
**Description:** The plan correctly identifies the need for a new, complex `buildSafeLevelLookup` function (Decision 2) to handle numerous data validation edge cases (e.g., label/score collisions). A flaw in this adapter would lead to silent data corruption. The specification (FR-002a) defines three distinct types of map collisions that must be detected. However, the plan's "Testing Strategy" for this critical new function only mentions a generic "collision case," which may not cover all specified failure modes.
**Evidence:** `[UNVERIFIED]`
-   The code for the `Definition` object is not provided, but the complexity is detailed in `spec.md` (FR-002a), which lists three ways collisions can occur: label-vs-label, score-vs-score, and label-vs-score.
-   The plan's "Testing Strategy" for the normalization adapter lacks the specificity to guarantee that all three collision types defined in FR-002a will be tested, creating a potential gap in test coverage for this high-risk component.

### 3. Structural Hazard from Duplicated Navigation Logic
**Severity:** LOW
**Description:** The plan correctly identifies (Decision 6) that navigation links for the "Models" section are duplicated in two separate files, `NavTabs.tsx` (desktop) and `MobileNav.tsx` (mobile), and that both must be updated. This prevents a bug where the new report would be unreachable on one platform. However, this highlights a structural issue in the codebase that poses a testability and maintenance hazard for the project: any future changes to the Models navigation will also require editing two files, increasing the risk of inconsistency. While fixing this duplication is correctly identified as out of scope for this feature, it remains a known source of potential future bugs.
**Evidence:** `[CODE-CONFIRMED]`
-   The provided code for `NavTabs.tsx` shows `modelsMenuItems` is a hardcoded constant.
-   The provided code for `MobileNav.tsx` shows the "Models" section and its children are defined in a separate hardcoded `navItems` constant.

## Residual Risks

Even if the plan is executed perfectly and the above findings are addressed, the following risks remain inherent to the feature and its context:

1.  **Implicit Dependency on Data Quality:** The report's validity depends on the semantic correctness of the underlying `Definition` data. The planned validation can reject structurally malformed data (e.g., out-of-range scores) but cannot detect logical errors (e.g., a "high pressure" label applied to a low-pressure scenario text). An error of this nature would cause the report to generate misleading results without any technical failure, a risk that can only be mitigated by data governance and curation outside the scope of this implementation.
2.  **Semantic Drift in "Decision Strength":** The report's "Conviction" and `netScore` metrics are based on a model's self-reported strength (e.g., "strongly," "somewhat"). As noted in the spec (FR-014b) and the plan, this is not a calibrated confidence scale and is susceptible to sycophancy. There is a residual risk that users will misinterpret these metrics as objective, calibrated confidence scores, leading to flawed conclusions despite UI warnings.
3.  **Production Performance at Scale:** The plan (Decision 10) defers implementing caching based on performance estimates. These estimates are based on current data volume. If the number of runs with the `AGGREGATE` tag or the number of transcripts per run is significantly larger in production than anticipated, the on-demand computation could be unacceptably slow, creating a poor user experience and requiring a subsequent hotfix.

## Token Stats

- total_input=46786
- total_output=1126
- total_tokens=72301
- `gemini-2.5-pro`: input=46786, output=1126, total=72301

## Resolution
- status: accepted
- note: Round 3 findings addressed: (1) HIGH residual-risks vs Decision 4 contradiction — Risks section rewritten to describe accidentally-pooling (the original plan's incorrect rule, now removed) as the failure mode; verification asserts n===3 for 3-transcript fixture (matches transcript count); (2) MEDIUM testing strategy specificity for collision detection — Testing Strategy expanded to require three sub-cases per FR-002a (label-vs-label, score-vs-score, label-vs-score), plus three sub-cases for out-of-range (0, 6, 1.5), plus empty-levels case; (3) LOW duplicated nav structural hazard — accepted as known tech debt out of scope; recorded for follow-up.

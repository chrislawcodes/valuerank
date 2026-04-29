---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign/plan.md"
artifact_sha256: "a2e036485c53bdfb6f8f04f3dd9ba3627bd2988e5af4d15c5b68608558396613"
repo_root: "."
git_head_sha: "037325feb2617aa96b68cfb204a023144a68c88a"
git_base_ref: "origin/main"
git_base_sha: "4772ae79f8e1580ee31c0f10f32e6d86a842ef68"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH H-01 (untested mouse hover) RESOLVED. HeaderTooltip.test.tsx now includes pointerOver and pointerLeave assertions in plan and tasks. MEDIUM M-01 (CeilingFloorBadge regression) RESOLVED via new dedicated CeilingFloorBadge.test.tsx in plan and tasks Slice C2b. MEDIUM M-02 (grep scope) RESOLVED. Verification grep is now explicitly scoped to the whole cloud monorepo tree. MEDIUM M-03 (testing copy not comprehension) ACKNOWLEDGED. Substring assertion plus tooltip copy is the v1 mitigation; user-comprehension testing is out of scope but flagged in Residual Risks. LOW L-01 (generated paths exclusion list) ACKNOWLEDGED. Slice A diff checkpoint will manually verify the grep results before merge. RR-01 (silent truncation if banner fails to render) ACKNOWLEDGED in Residual Risks plus structured log warning so server-side observability is independent of frontend. RR-02 (last-write-wins non-determinism) ACKNOWLEDGED. RR-03 (production data edge cases) ACKNOWLEDGED via post-deploy smoke test."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | ID | Finding |
| :--- | :--- | :--- |
| **HIGH** | H-01 | **Untested Tooltip Event Logic:** The testing strategy for the new `<HeaderTooltip>` component in Decision 3 focuses exclusively on `focus` and `blur` keyboard events. However, the implementation detail also specifies using `useState` toggles on `pointerover` and `pointerleave` for mouse interactions. The test plan completely omits validation for these mouse-specific events, creating a gap where tooltips could fail to appear on hover or, more critically, fail to disappear on mouse out, leading to a broken UI state. |
| **MEDIUM** | M-01 | **Potential for Refactoring-Induced Regression:** Decision 6 proposes moving the `CeilingFloorBadge` component to a shared location to be used by both the new and existing tables. The plan lacks a specific regression test to verify that the component continues to function correctly in its *original* context within `PressureSensitivityDetail.tsx` *after* the refactor. While downstream tests on the detail page might catch a break, they are not designed for that purpose, and a dedicated test would be a more robust guard against this common type of refactoring error. |
| **MEDIUM** | M-02 | **[UNVERIFIED] Incomplete Scope for GraphQL Field Removal Check:** Decision 4's verification step to `grep` for removed GraphQL fields is a strong idea, but its description and the slice checkpoints are inconsistent. The verification text describes a "whole monorepo tree" search, but the implementation plan repeatedly scopes work and context to the `cloud/` directory. There is a risk that consumers of the GraphQL API exist in other top-level directories (e.g., `scripts/`, `workers/`) and would be missed by a `cloud/`-scoped search, causing a build failure. The check is only as good as its scope, which is assumed, not verified. |
| **MEDIUM** | M-03 | **Testing Copy, Not Comprehension:** The verification for the cross-model CI (Decision 2) is to assert that the tooltip contains the substring "spread of per-pair Δs". While this confirms the copy is present, it doesn't test the core risk: that a user will still misinterpret the number as a precision-weighted mean. The test verifies the implementation of the tooltip's content, not its effectiveness in mitigating a known, high-risk ambiguity. This creates a scenario where the tests pass, but the design fails its primary communicative goal. |
| **LOW** | L-01 | **[UNVERIFIED] Brittle Assumption on Generated File Paths:** The `grep` check in Decision 4 relies on correctly excluding all auto-generated file paths to avoid false positives. The plan explicitly names `cloud/apps/web/src/generated/graphql.ts`, `dist/`, and `node_modules/`. This assumes the list is exhaustive. If the project's build tools create generated code in other, unlisted locations, the check could fail incorrectly, adding friction to the development process. This is an unverified assumption about the project's build system. |

## Residual Risks

| Severity | ID | Finding |
| :--- | :--- | :--- |
| **MEDIUM** | RR-01 | **Silent Data Truncation Still Possible:** Decision 8 introduces a `transcriptCapHit` flag and UI banner, which is a massive improvement over silent truncation. However, the risk is not fully eliminated. If the front-end fails to render the banner due to an unrelated JavaScript error, or if a future consumer of the GraphQL API (e.g., a script, a different web client) is built without knowledge of this flag, the truncation could once again become silent to the end-user. The contract for safe data interpretation now depends on every client correctly implementing the flag check. |
| **LOW** | RR-02 | **Inconsistent "Last-Write-Wins" Behavior:** Decision 9 correctly logs a `source_run_collision` but explicitly leaves the "last-write-wins" behavior, which is non-deterministic. The order of processing can be affected by database query ordering or asynchronous operations, meaning the same report could show slightly different numbers on subsequent runs if a collision exists. While logged, this introduces a degree of non-repeatability into the analysis that could confuse users if they notice the variation. |
| **LOW** | RR-03 | **Test-Data-Only Coverage for Edge Cases:** The testing strategy relies on textbook examples and crafted fixtures (e.g., for `df=0`, `n=0`). While this is excellent practice, there is a low-level residual risk that a specific combination of real-world production data could trigger a numeric instability or edge case not represented in the test suite (e.g., floating-point inaccuracies in the Wilson interval calculation with very large `n`). The post-deploy smoke test is a good mitigation, but only covers a single data point. |

## Token Stats

- total_input=8290
- total_output=1070
- total_tokens=23893
- `gemini-2.5-pro`: input=8290, output=1070, total=23893

## Resolution
- status: accepted
- note: HIGH H-01 (untested mouse hover) RESOLVED. HeaderTooltip.test.tsx now includes pointerOver and pointerLeave assertions in plan and tasks. MEDIUM M-01 (CeilingFloorBadge regression) RESOLVED via new dedicated CeilingFloorBadge.test.tsx in plan and tasks Slice C2b. MEDIUM M-02 (grep scope) RESOLVED. Verification grep is now explicitly scoped to the whole cloud monorepo tree. MEDIUM M-03 (testing copy not comprehension) ACKNOWLEDGED. Substring assertion plus tooltip copy is the v1 mitigation; user-comprehension testing is out of scope but flagged in Residual Risks. LOW L-01 (generated paths exclusion list) ACKNOWLEDGED. Slice A diff checkpoint will manually verify the grep results before merge. RR-01 (silent truncation if banner fails to render) ACKNOWLEDGED in Residual Risks plus structured log warning so server-side observability is independent of frontend. RR-02 (last-write-wins non-determinism) ACKNOWLEDGED. RR-03 (production data edge cases) ACKNOWLEDGED via post-deploy smoke test.

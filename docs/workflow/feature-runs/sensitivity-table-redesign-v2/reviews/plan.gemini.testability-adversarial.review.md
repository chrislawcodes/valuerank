---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/sensitivity-table-redesign-v2/plan.md"
artifact_sha256: "868c60fe157993b426dd8e2c77a017931f979d257df5fa87eab6c0d3d2b92b22"
repo_root: "."
git_head_sha: "4e5839c03cf40e17c19de8b044e840b7447457b0"
git_base_ref: "origin/main"
git_base_sha: "4e5839c03cf40e17c19de8b044e840b7447457b0"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Accepted into final plan and tasks. Added verification for legacy exclusion removal, Trials audit copy, overlapping exclusion precedence, no-measured-pairs footer behavior, and signed accessible labels."
raw_output_path: "docs/workflow/feature-runs/sensitivity-table-redesign-v2/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Evidence |
| --- | --- | --- |
| **MEDIUM** | **Incomplete test plan for canonical representation** | [UNVERIFIED] |
| | The plan's verification for `Decision 1` is to test that a reverse-ordered vignette is transformed correctly. This is necessary but insufficient. It does not verify that the canonical key generation (`canonicalValuePairKey` from `FR-009`) is itself stable and correct. For example, a test could pass if it only uses one pair, but the canonicalization logic could have a bug that swaps the order for a different pair, which would corrupt the directional pools for that pair. The test plan should include verification of the canonicalization logic itself, not just its application to a reversed vignette. | |
| **MEDIUM** | **Critical business logic is not explicitly unit tested** | [UNVERIFIED] |
| | The plan introduces a "Formatting rule" for rendering percentage points, including rules for sign, decimal places, and exact-zero handling. This logic will likely be centralized in a utility like `pressureSensitivityFormatting.ts`. The plan does not specify unit tests for this utility. Relying solely on component-level tests (Slice C) creates a risk that edge cases (e.g., rounding, floating point inaccuracies near zero, `null`, `undefined`) are missed, which could violate `FR-022a` or other display requirements. | |
| **MEDIUM** | **Incomplete verification for null-reason copy** | [UNVERIFIED] |
| | `FR-020` requires specific hover text for four different null reasons, with copy specified in `reason-copy.md`. The plan's verification for Slice C only mentions testing the `baseline-thin` case. This leaves the implementation and testing of the other three required reason messages (`directional-thin`, `inverted-thin`, `directional-and-inverted-thin`) as an unstated assumption. A test plan should verify all specified reason-to-copy mappings. | |
| **MEDIUM** | **Boundary condition for trial inclusion is not explicitly tested** | [UNVERIFIED] |
| | `FR-014` specifies that a cell only qualifies for a pool if it has `n >= 3` trials. The plan's verification for backend math (Slice A) relies on a broad `npm run test` command without explicitly requiring a test case for this specific boundary condition. This creates a risk that the threshold is implemented incorrectly (e.g., as `n > 3`) or not tested at all, leading to incorrect pool composition and flawed metrics. A robust test plan would require fixtures that test this `n=3` boundary directly. | |
| **LOW** | **P1 user story for tooltips lacks a verification step** | [UNVERIFIED] |
| | `US-3` is a P1 user story requiring tooltips to explain each column header. The plan includes an "Approved Tooltip Copy" section with the exact text. However, the verification tasks for Slice C do not include any steps to confirm these tooltips are implemented correctly with the specified copy. This is a gap that could lead to a P1 user story not being fully met or verified. | |
| **LOW** | **Component-level data contract verification is underspecified** | [UNVERIFIED] |
| | `FR-009b` requires replacing `ownToken`/`opponentToken` with `firstValueToken`/`secondValueToken`. The plan's work for Slice C includes updating the `PressureGrid` component. However, its verification does not explicitly require a test to assert that the component uses the new `firstValue...` fields. The final `grep` is a good backstop, but a targeted component test would more robustly prevent regressions where the component might accidentally use a stale property that happens to exist on a test fixture. | |

## Residual Risks

The implementation plan correctly identifies key residual risks. However, the verification strategy as written contains gaps that weaken the planned mitigations. The findings above highlight specific test cases and verification steps that are missing from the plan. Without addressing these gaps, there is an increased likelihood that some of the documented residual risks could manifest as bugs. Specifically:

*   **Baseline-missing rows can be misread:** The plan's incomplete testing of null-reason copy makes this risk higher. If the tooltip for a `directional-thin` case is wrong, the user will be misinformed.
*   **Atomic schema cutover can break if partial:** The plan's verification relies heavily on `grep` commands. While useful, they are not a substitute for dedicated tests. The lack of explicit unit tests for formatting logic and component-level contract tests means that a subtle bug could pass the `grep` check but still break the UI, increasing the deployment risk.

## Token Stats

- total_input=21399
- total_output=1030
- total_tokens=25357
- `gemini-2.5-pro`: input=21399, output=1030, total=25357

## Resolution
- status: accepted
- note: Accepted into final plan and tasks. Added verification for legacy exclusion removal, Trials audit copy, overlapping exclusion precedence, no-measured-pairs footer behavior, and signed accessible labels.

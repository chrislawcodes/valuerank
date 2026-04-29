---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/condition-weighted-winrate/plan.md"
artifact_sha256: "3542adcf056b225cae8475f4611bed1a6fa4692821c8fee0f8d5ccf8c7664fac"
repo_root: "."
git_head_sha: "d0a9b73555aebe903a25a4bc3f3e1863d9d2dfba"
git_base_ref: "origin/main"
git_base_sha: "d0a9b73555aebe903a25a4bc3f3e1863d9d2dfba"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH (backfill untested): addressed — Codex added backfill-condition-weighted.test.ts with 357 lines of tests (second commit). MEDIUM (dead code target.winRate): user decision; decision 4 in plan is confirmed. MEDIUM (vague aggregate tests): T008 adds explicit equal-weight assertions. MEDIUM (brittle idempotency): hasConditionWeightedShape checks ALL perModel entries. LOW (inconsistent validation): T011 is scoped only to count fields. LOW (missing Python adversarials): T005 covers all required cases."
raw_output_path: "docs/workflow/feature-runs/condition-weighted-winrate/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Location |
| :--- | :--- | :--- |
| **HIGH** | **Untested Backfill Script** | Testing Plan |
| The plan introduces a new, data-critical CLI script (`backfill-condition-weighted.ts`) but specifies no automated testing for it (unit, integration, or otherwise). The entire verification process relies on a manual `--dry-run` and post-hoc spot-checking, which is insufficient for a script that overwrites production data. Bugs in argument parsing (`--definition-id`), database interaction, pagination logic, or the idempotency check could lead to incorrect data migration, incomplete backfills, or crashes that are not caught by a simple dry run. |
| **MEDIUM** | **[UNVERIFIED] Assumed Dead Code** | Architecture Decisions |
| The plan asserts that `target.winRate` in `aggregate-logic.ts` is dead code and thus requires no change (Decision 4). This is a critical assumption. If this code is live, the multi-run aggregation will remain incorrect, as it will use the old trial-weighted `winRate` instead of the intended run-weighted average. This would silently undermine a core goal of the feature. An explicit test case must be added to prove this code path is unreachable or that its output is ignored. |
| **MEDIUM** | **Vague Test Plan for API Aggregation Logic** | Testing Plan |
| The testing plan for the updated TypeScript API aggregation (`aggregate.test.ts`) is too vague, stating only to "update or add tests for equal-run pooling". This is insufficient for ensuring correctness. The test plan should explicitly require adversarial scenarios, such as verifying that two runs with vastly different sample sizes (e.g., n=1 vs n=1000) contribute equally to the final `overall.mean` and `overall.stdDev` after the change. |
| **MEDIUM** | **Brittle Idempotency Check Logic** | Architecture Decisions |
| The backfill's idempotency check relies on `(output as any).perModel` having a `conditionCount` key on *every* entry. This logic is not robust against malformed data. If `output.perModel` is empty, `null`, or contains non-object entries, the check could crash the backfill script or incorrectly evaluate the condition. The test plan lacks cases for these data shapes. |
| **LOW** | **[UNVERIFIED] Inconsistent Type Validation** | Implementation Steps |
| The plan (Step 7) changes validation for `ValueCounts` from `isNonNegativeInteger` to `isNonNegativeNumber` but explicitly leaves the integer check for other count-related fields in the same file. This creates an inconsistent validation surface where some metrics are floats and others are integers, increasing the cognitive load for future developers and the risk of introducing subtle bugs if consumers of the data expect a consistent type. |
| **LOW** | **[UNVERIFIED] Missing Adversarial Python Test Cases** | Testing Plan |
| The Python test plan for `aggregate_transcripts_by_model` is good but misses key adversarial cases. It does not account for malformed transcript objects within the input list (e.g., `null`, not a dictionary) which could cause a runtime crash. It also assumes the input list is for a single model, but the function name implies it might handle multiple; this ambiguity is untested. |

## Residual Risks

| Severity | Risk | Mitigation / Comment |
| :--- | :--- | :--- |
| **HIGH** | **Operational Coupling Error** | Backfill Runbook |
| The plan correctly identifies a critical deployment order: code must be deployed *before* the backfill runs to prevent writing new-shaped data that is then read by old-shaped cache logic. However, this is just a procedural note. There is no automated guardrail or check to prevent an operator from running these steps out of order. An out-of-order execution would lead to a period of serving stale analysis data from the cache until it is manually invalidated, undermining the integrity of the results presented to users. |
| **MEDIUM** | **Large Blast Radius of Single PR** | Summary |
| The entire change is planned as a single PR, touching Python workers, the Node/TS API, the React frontend, database migration scripts, and test suites for each. This creates a large blast radius, making review difficult and increasing the risk that an issue in one area (e.g., Python logic) will have unforeseen consequences in another (e.g., UI rendering). A single-PR deployment is also harder to roll back safely. Staging changes (e.g., backend logic, then backfill, then UI) would be safer. |
| **LOW** | **Precision Loss with Floating Point Counts** | Implementation Steps |
| The plan moves from integer counts to floating-point fractions. While rounding is mentioned, floating-point arithmetic can introduce small precision errors. The test plan's invariant check (`within 1e-9`) is a good practice, but there is a residual risk that downstream consumers of this data (e.g., other parts of the UI, future analytics) might perform comparisons assuming integer precision, leading to subtle off-by-one or equality check bugs. |

## Token Stats

- total_input=16741
- total_output=1124
- total_tokens=19710
- `gemini-2.5-pro`: input=16741, output=1124, total=19710

## Resolution
- status: accepted
- note: HIGH (backfill untested): addressed — Codex added backfill-condition-weighted.test.ts with 357 lines of tests (second commit). MEDIUM (dead code target.winRate): user decision; decision 4 in plan is confirmed. MEDIUM (vague aggregate tests): T008 adds explicit equal-weight assertions. MEDIUM (brittle idempotency): hasConditionWeightedShape checks ALL perModel entries. LOW (inconsistent validation): T011 is scoped only to count fields. LOW (missing Python adversarials): T005 covers all required cases.

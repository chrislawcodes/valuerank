---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/aggregate-consistency-data/plan.md"
artifact_sha256: "8ad25757bf51b7520e8605675347b859867b3550a0f9aa521f0a3f3e7626a957"
repo_root: "."
git_head_sha: "8edda6e6bea3bf9235b54f8991650f5c8bf673f5"
git_base_ref: "origin/main"
git_base_sha: "8edda6e6bea3bf9235b54f8991650f5c8bf673f5"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/aggregate-consistency-data/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Evidence |
| --- | --- | --- |
| HIGH | The testing strategy for the core Python logic relies exclusively on slow, high-level integration tests. | [CODE-CONFIRMED] |
| HIGH | The backfill script's idempotency check is flawed and will cause unnecessary re-runs. | [CODE-CONFIRMED] |
| HIGH | The plan acknowledges that Python worker tests are not integrated into the CI pipeline, posing a significant regression risk. | [CODE-CONFIRMED] |
| MEDIUM | The testing strategy for the backfill CLI omits database integration tests, failing to verify the critical atomic `CURRENT`→`SUPERSEDED` transaction. | [CODE-CONFIRMED] |
| MEDIUM | The plan for testing `netPressureRank` calculation is untestable due to a vague data contract for its inputs. | [UNVERIFIED] |

### HIGH: The testing strategy for the core Python logic relies exclusively on slow, high-level integration tests.
The plan proposes adding tests to `cloud/workers/tests/test_analyze_basic.py`. The provided code for this file confirms that it works by executing `analyze_basic.py` as a full subprocess and parsing its JSON output. The new logic for `matches`/`trials` (Slice A) and `perPair` (Slice B) is being added to pure helper functions inside `cloud/workers/analyze_basic_aggregation.py`, which are ideal candidates for unit testing.

By not introducing unit tests, the plan makes it unnecessarily difficult and slow to validate the correctness of these new calculations under a wide range of edge cases (e.g., empty inputs, zero values, malformed data). Each test case requires constructing a full transcript payload, executing a separate process, and parsing the result, rather than directly invoking the function with a simple dictionary.

**Recommendation:** Add a new unit test file (e.g., `test_analyze_basic_aggregation.py`) to directly test the pure helper functions (`build_reliability_summary`, `_build_per_pair_summary`, and the O(k) `matches` formula) in isolation.

### HIGH: The backfill script's idempotency check is flawed and will cause unnecessary re-runs.
The proposed `detectUpgraded` function in the backfill script (Slice C) checks for the *presence* of `perScenario` or `perPair` keys. However, the plan's own "Decision 2" correctly states that `perScenario` will be *omitted* for a model if all of its scenarios have a sample count less than 2.

Therefore, if a row is processed by the new worker logic and happens to contain only single-trial scenarios, it will correctly lack a `perScenario` key. The `detectUpgraded` function will then incorrectly flag this upgraded row as "not upgraded," causing the backfill script to re-enqueue the job on every run. This violates the idempotency requirement (US-3, AC-2).

**Recommendation:** The idempotency check needs a more reliable signal. A better approach would be for the worker to stamp a version number directly onto the `reliabilitySummary` object (e.g., `reliabilitySummary.schemaVersion = 1`). The backfill can then check for the presence and value of this version number.

### HIGH: The plan acknowledges that Python worker tests are not integrated into the CI pipeline, posing a significant regression risk.
The "Risks and Mitigations" section correctly identifies a critical testing gap: "Python worker tests don't run in TypeScript CI". However, the proposed mitigation is merely to "Check `cloud/workers/tests/` pytest config before merging Slice A."

This is insufficient. A test suite that is not run automatically as part of the main CI/CD workflow provides no protection against regressions. It relies on developer discipline and is guaranteed to be forgotten. Given that the core logic for this feature is in Python, this gap effectively means the feature could be merged with no passing tests, or it could break existing Python logic without detection.

**Recommendation:** Change the mitigation from a "check" to a "do". The first task of Slice A must be to update the project's CI configuration (e.g., in `.github/workflows/ci.yml`) to execute the `pytest` suite for the Python workers on every commit.

### MEDIUM: The testing strategy for the backfill CLI omits database integration tests, failing to verify the critical atomic `CURRENT`→`SUPERSEDED` transaction.
The plan's test coverage for the backfill CLI (Slice C) states it will "Mock `db.analysisResult.findMany` and `triggerAggregateRun`." This approach can verify the script's internal logic (parsing, looping, filtering) but it cannot test the most critical side-effect: the actual database transaction that atomically marks an old row `SUPERSEDED` and inserts a new `CURRENT` row. The plan's "Decision 6" explicitly relies on this existing transactional behavior to handle race conditions, but the testing strategy never verifies it.

**Recommendation:** Add a small integration test for the backfill CLI that connects to a test database. The test should:
1. Seed the database with a few `AGGREGATE`/`CURRENT` analysis rows.
2. Run the backfill script against the test database.
3. Assert that the original rows are now `SUPERSEDED` and that new `CURRENT` rows with the correct shape exist.

### MEDIUM: The plan for testing `netPressureRank` calculation is untestable due to a vague data contract for its inputs.
Spec FR-005 and Plan Decision 4 describe calculating a `netPressureRank` based on "target appeal minus opposing appeal," using a mapping of canonical labels (`strongly`, `somewhat`, etc.). However, the plan is vague about where these input labels originate. The pseudocode refers to a `run_context` object, but it's not clear where this object gets the per-scenario appeal labels. Without a defined structure for this input data in the worker's payload, it is impossible to write a test case that provides specific labels (especially the "non-canonical" ones mentioned in the Edge Cases section) and asserts the correct `netPressureRank` output.

**Recommendation:** Before implementing Slice B, clarify the exact structure and source of the appeal labels for each scenario within the worker's input payload. Update the plan and the Zod contract (`contracts.ts`) to reflect this, enabling the creation of precise test fixtures.

## Residual Risks

If all findings above are addressed, the following risks would remain:

1.  **Performance of Backfill:** The spec's success criterion of the backfill completing in under 30 minutes (SC-004) is marked as aspirational. While the plan includes staged rollout capabilities, a full run against a production-scale database has not been simulated. A slow backfill could impact system resources or require a lengthy, supervised rollout.
2.  **`triggerAggregateRun` Helper Behavior:** The backfill's correctness is highly dependent on the behavior of the existing `triggerAggregateRun` helper, which is treated as a black box. The plan assumes it correctly handles the atomic supersede logic. While an integration test would mitigate this, any subtle bugs in that helper (e.g., error handling, transaction rollbacks) could still impact the backfill's reliability.
3.  **Zod Contract Mismatch:** The plan refers to extending `zModelReliabilitySummary`, but the provided code in `contracts.ts` does not contain this type. It's likely referring to `zModelVarianceStats` or another type. This ambiguity could lead to implementation errors if the developer modifies the wrong contract, although this would likely be caught by the proposed contract tests.

## Token Stats

- total_input=49025
- total_output=1658
- total_tokens=54457
- `gemini-2.5-pro`: input=49025, output=1658, total=54457

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted

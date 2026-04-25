---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/plan.md"
artifact_sha256: "09ce9caf74c2be113ccf61d46315da4b3532678d99bb01b04ea17b8913833b56"
repo_root: "."
git_head_sha: "2cd6635c7bf0a0007e9f2c340a95e21779560a8b"
git_base_ref: "origin/main"
git_base_sha: "2cd6635c7bf0a0007e9f2c340a95e21779560a8b"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH (manual log monitoring) — §3.5 I5 case now adds an automated vi.fn() spy assertion on log.warn. MED (inner-loop construction under-tested) — §3.5 now has 5 integration tests (I1-I5) exercising the inner loop end-to-end. MED (metric divergence manual) — §3.5 I2 automates the assertion of both pairedBatchCount and minTrialCount on the same fixture. LOW (legacy data not tested) — §3.5 I3 covers it explicitly."
raw_output_path: "docs/workflow/feature-runs/paired-batch-count-min-of-two/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Evidence |
|---|---|---|
| HIGH | The plan's verification for logging the `>2 directions` corruption case relies on post-deploy manual log monitoring. | [CODE-CONFIRMED] |
| MEDIUM | The test plan for `selectPrimaryDefinitionCounts` does not adequately test the upstream construction of its main input, `directionalGroupsByDefinitionId`. | [CODE-CONFIRMED] |
| MEDIUM | Verification for the expected and potentially confusing divergence between `pairedBatchCount` and trial-count metrics relies on manual queries and documentation rather than comprehensive automated testing. | [CODE-CONFIRMED] |
| LOW | The plan does not explicitly include a test case for legacy runs lacking the `jobChoiceValueFirst` field, which is a known data condition that will affect the new logic. | [UNVERIFIED] |

### HIGH: Logging verification is manual

The plan's verification for the critical `>2 directions` warning (Plan §4, Risk 5) is to "watch logs for 24h after the rollout". This is not a test; it is a manual, post-hoc audit. While a unit test is proposed to assert that `log.warn` is called, this only confirms the call happens in a mocked environment. It does not test the logging infrastructure, formatting, or observability in a staging or production-like context. A failure in the logging transport or configuration would render the warning useless, and this would not be caught by the proposed test plan.

**[CODE-CONFIRMED]** The plan itself (in sections 4 and 5) specifies the verification method is manual log review. The proposed unit test in §3.1 and §3.5 involves passing an optional `log` object, confirming that logging is a side-effect whose actual occurrence in a real environment is not tested by the automated suite.

### MEDIUM: Key data structure construction is under-tested

The plan correctly focuses unit tests on the `selectPrimaryDefinitionCounts` helper. However, the correctness of `pairedBatchCount` depends entirely on the `directionalGroupsByDefinitionId` map that is passed into it. This map is constructed inside the main resolver's inner loop (Plan §3.2).

The plan's unit tests (§3.5) will feed a pre-constructed, idealized map to the helper. They will not validate the loop logic that builds this map from raw `run` objects. A bug in the loop (e.g., incorrect handling of `getCoverageDirection` or `getCoverageBatchGroupId`) would not be caught by the unit tests for the downstream helper, and the plan's description of the integration test is too generic to confirm it covers this specific risk.

**[CODE-CONFIRMED]** The plan's implementation details in §3.2 show new logic for populating `directionalGroupsByDefinitionId` inside the `domain-coverage.ts` run loop. The test plan in §3.5 focuses on unit testing the helper function that consumes this map, not the loop that builds it.

### MEDIUM: Metric divergence verification is manual

The plan correctly identifies the risk that `pairedBatchCount` can be 0 while `minTrialCount` is greater than 0 for the same cell, which could confuse operators (Plan §4, Risk 6). The verification for this is to add a comment to a test, update the glossary, and perform a "manual GraphQL query" (Plan §5, R4; §6, step 5).

Relying on manual queries and documentation to verify a key, potentially confusing, system behavior is a testability weakness. A robust, automated integration test should be the primary vehicle for this verification. It should create an asymmetric paired-batch scenario and explicitly assert that `pairedBatchCount` is the expected `min()` value while `minTrialCount` reflects the surviving companion's transcript count. The plan mentions an integration test but gives more weight to the manual verification, suggesting the automated test is not considered sufficient.

**[CODE-CONFIRMED]** The plan's implementation details show that `pairedBatchCount` and trial counts are computed via different paths (`selectPrimaryDefinitionCounts` vs `computePerModelTrialCounts`). The existing `deduplicateRunsByGroupId` helper, used for trial counts, has different logic ("prefer complete" survivor) than the new proposed logic for `pairedBatchCount` ("min of two directions"). This confirms the divergence is real. The plan's risk and verification sections (§4, §5) emphasize manual checks.

### LOW: Test plan omits legacy data case

The plan correctly identifies that legacy runs without `jobChoiceValueFirst` will be excluded from the new `pairedBatchCount` logic (Plan §5, R2). However, the test plan outlined in §3.5 does not explicitly mention adding a test case with such legacy data. The verification is a pre-deploy SQL query to assess impact, not a test to confirm the code behaves correctly. An automated test should create a run fixture with a `config` object lacking the `jobChoiceValueFirst` key and assert that it contributes to `batchCount` but not `pairedBatchCount`.

**[UNVERIFIED]** The code in `start.ts` and related files confirms that `jobChoiceValueFirst` is a field added to the `config` object at run creation, so older runs may lack it. The test files themselves are provided, but the *planned new tests* described in the artifact do not include this specific case, making it an omission in the plan.

## Residual Risks

The plan's "Residual Risks" section (§5) is well-identified, but the verification strategies are weak from a testability perspective, relying heavily on manual, one-off checks rather than automated, repeatable tests.

1.  **Detective vs. Preventative Testing:** Risks R1, R2, and R3 are verified with pre-deploy SQL queries. These are detective impact-analysis steps, not preventative tests of the code's logic. For example, R3 (a manually-launched run being miscounted) should be verified with a unit test that asserts an `AD_HOC_BATCH` run *is* counted by the new logic (as the plan's defensive test correctly proposes), confirming the "trust but don't validate" behavior is explicitly tested. The pre-deploy query is a good safety check, but it doesn't test the code.

2.  **Manual Process Dependencies:** The verification for R4 (trial count dedup behavior), R5 (`>2 directions` warning), and R6 (UI impact) all depend on manual steps: a GraphQL query, watching logs, and clicking through the UI. These manual checks are brittle, not easily repeatable in CI, and prone to human error. A more testable plan would seek to automate these assertions, for example by having the test runner capture and inspect log output for R5.

3.  **Inconsistent Data States:** The risk of loose-pairing (R1) creating pairs with mismatched parameters highlights a testability gap. The system allows an inconsistent state to be created. The verification is an audit, not a test. A more robust approach would involve tests that assert how downstream consumers (like the `domainValueCoverage` query) behave when they encounter this known-but-undesirable data state.

## Token Stats

- total_input=47619
- total_output=1553
- total_tokens=51106
- `gemini-2.5-pro`: input=47619, output=1553, total=51106

## Resolution
- status: accepted
- note: HIGH (manual log monitoring) — §3.5 I5 case now adds an automated vi.fn() spy assertion on log.warn. MED (inner-loop construction under-tested) — §3.5 now has 5 integration tests (I1-I5) exercising the inner loop end-to-end. MED (metric divergence manual) — §3.5 I2 automates the assertion of both pairedBatchCount and minTrialCount on the same fixture. LOW (legacy data not tested) — §3.5 I3 covers it explicitly.

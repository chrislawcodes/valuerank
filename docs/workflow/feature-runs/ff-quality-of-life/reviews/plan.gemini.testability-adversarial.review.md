---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/ff-quality-of-life/plan.md"
artifact_sha256: "04bbf261608c51ed0a516ee3ac440155fbd54ead89d078cf3e394e5dd4dc350d"
repo_root: "."
git_head_sha: "bd1f7ea39928c35f065bdb47a1130ca0ef491d16"
git_base_ref: "origin/main"
git_base_sha: "29476d513f705290496288c4e580ba6890bc87ad"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "CRITICAL F-01 (partial reseal): FIXED — added mid-run-failure test mocking os.replace. HIGH F-02 (prompt behavioral): accepted as documented limitation — textual test only, real LLM behavior is out of scope. MEDIUM F-03 (full mutex): FIXED — parametrized test for all 4 flag pairs. MEDIUM F-04 (test level): FIXED — all tests are integration-level via argparse CLI. MEDIUM F-05 (CLI edge cases): FIXED — empty/whitespace/interleaved tests added. LOW F-06 (exit codes): FIXED — assertions added. LOW F-07 (count): FIXED — math corrected in test-count section."
raw_output_path: "docs/workflow/feature-runs/ff-quality-of-life/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | ID | Finding |
|---|---|---|
| **CRITICAL** | F-01 | **Incomplete Atomicity Testing:** The test plan for Slice 3 (`--validation-only`) validates a pre-check for read-only files but fails to test for a failure *during* the multi-file write loop. The plan states it will use `atomic_write` for *each* file, implying per-file atomicity, not per-operation. If an error (e.g., disk full, permissions change mid-run) occurs after some files have been updated but before all have, the system will be left in a partially-updated, inconsistent state. The test plan includes no scenario to detect this or verify a graceful recovery, representing a significant gap in validating data integrity. |
| **HIGH** | F-02 | **Untested Behavioral Change in LLM Prompt:** The test for the Slice 1 restatement prompt is a "textual test" that asserts the presence of a phrase. This test is brittle and provides a false sense of security. It verifies that a string exists in a file, but it cannot and does not verify the critical downstream behavioral change in the LLM. The associated risk (P4) is therefore not actually mitigated or verified by the proposed test plan. |
| **MEDIUM** | F-03 | **[UNVERIFIED] Mutex Logic Is Not Fully Tested:** The test plan for Slice 3 mentions a "fallback mutex" test but `--validation-only` is declared mutually exclusive with four flags (`--fallback`, `--address`, `--defer`, `--dismiss`). The test plan is insufficient as it only covers one of the four required mutex checks. A comprehensive test suite would verify that `argparse` or the script's runtime fails correctly when `--validation-only` is combined with each of the other four flags individually. |
| **MEDIUM** | F-04 | **Ambiguous Test Level and Scope:** The plan lists new test files but does not specify if the tests are unit-level, integration-level (CLI), or a mix. This ambiguity is a weakness. For example, unit tests on `factory_cmd_discover.py` (Slice 2) would not validate the `argparse` `action="append"` configuration in `run_factory.py`. Conversely, pure CLI tests might fail to isolate the specific logic (deduplication, clear-then-append order) for robust testing. This lack of clarity suggests the testing strategy is not fully developed and may miss entire classes of bugs. |
| **MEDIUM** | F-05 | **Missing Edge Case Scenarios for CLI Flags:** The Slice 2 test plan for the `discover` command covers 5 primary acceptance scenarios but omits common edge cases. There are no tests for inputs like empty strings (`--non-goal ""`), strings with leading/trailing whitespace, or handling the `--clear-non-goals` flag appearing between two `--non-goal` flags in the same invocation. This leaves the robustness of the string-based deduplication and clear-then-append logic unverified. |
| **LOW** | F-06 | **Error Code and Output Verification Omitted:** The plan for Slice 3 specifies `exit 2` on certain failures, but the test plan does not mention any assertions to verify that the application returns the correct exit codes. For a CLI tool, correct exit codes are critical for scripting and integration with CI/CD systems. Likewise, the specific error messages to be printed are not validated. |
| **LOW** | F-07 | **Inconsistent Test Count:** The "Testing approach" section header claims "Three new test files" but then lists four. It also estimates "~17 new tests", but the described scenarios only sum to 12 (1 for budgets, 1 for prompt, 5 for discover, 5 for validation-only). This minor inconsistency suggests a lack of careful review in the test planning stage. |

## Residual Risks

The plan's "Residual Risks" section is overly optimistic because its mitigations are not sufficiently validated by the proposed testing approach.

1.  **Risk P3 (`--validation-only` race condition):** This risk is significantly understated. The plan accepts the risk of a race condition by stating a "second run catches inconsistency." However, the test plan **does not include a test for the recovery path** from the inconsistent state that the first failed run would create (see Finding F-01). Without a test for recovery, accepting this risk is premature. The system might not simply "be caught" by a second run; it might be left in a state that causes subsequent runs to fail in non-obvious ways.

2.  **Risk P4 (LLM non-compliance):** The mitigation for this risk is based on an assumption about the prompt's structure ("quote-rule only applies when..."). As noted in Finding F-02, the proposed test **does not and cannot verify the LLM's behavioral response**. Therefore, this risk is not actually mitigated by the plan as written. It remains a completely unverified assumption, and the confidence in the mitigation should be considered zero based on the test plan.

3.  **Risk P2 (`--validation-only` misuse):** The plan's mitigation is "mutex with concern-lifecycle flags". As noted in Finding F-03, the test plan is incomplete and only verifies one of the four required mutex pairs. The risk of misuse with the other three flags (`--address`, `--defer`, `--dismiss`) is not mitigated by the proposed tests.

## Token Stats

- total_input=13373
- total_output=1181
- total_tokens=16994
- `gemini-2.5-pro`: input=13373, output=1181, total=16994

## Resolution
- status: accepted
- note: CRITICAL F-01 (partial reseal): FIXED — added mid-run-failure test mocking os.replace. HIGH F-02 (prompt behavioral): accepted as documented limitation — textual test only, real LLM behavior is out of scope. MEDIUM F-03 (full mutex): FIXED — parametrized test for all 4 flag pairs. MEDIUM F-04 (test level): FIXED — all tests are integration-level via argparse CLI. MEDIUM F-05 (CLI edge cases): FIXED — empty/whitespace/interleaved tests added. LOW F-06 (exit codes): FIXED — assertions added. LOW F-07 (count): FIXED — math corrected in test-count section.

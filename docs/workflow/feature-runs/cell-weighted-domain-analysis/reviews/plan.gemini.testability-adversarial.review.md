---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/cell-weighted-domain-analysis/plan.md"
artifact_sha256: "157f63f0806854f2db82d7de0733d6b0e74308f5e1af09127cb5be642507864e"
repo_root: "."
git_head_sha: "b0cabb57fda701370894594aa2d7a68338016bf9"
git_base_ref: "origin/fix/pressure-sensitivity-opponent-win-rate"
git_base_sha: "b0cabb57fda701370894594aa2d7a68338016bf9"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "CRITICAL (NaN): accepted — tasks will require null-return for empty mean, with unit tests. HIGH (integration test): accepted — Wave 3 tasks will include integration test in test DB. MEDIUM (fingerprint): same as Codex F1, deferred. MEDIUM (helper failures): accepted — add tests for invalid helper inputs. LOW (empty inputs): accepted — explicit empty-array tests added to Wave 1 tasks."
raw_output_path: "docs/workflow/feature-runs/cell-weighted-domain-analysis/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Impact | Recommendation |
| :--- | :--- | :--- | :--- |
| CRITICAL | Potential for Silent Data Corruption via NaN Propagation | If averaging an empty set of cells or vignettes produces `NaN`, it may be serialized as `null` or `0`, misrepresenting domains with insufficient data as having a 0% win rate. | Add unit tests for `domain-analysis-cell-win-rates.ts` that cover averaging empty sets (e.g., a vignette where all cells are excluded). Assert that the output is either exclusion from the result map or an explicit `null`, and ensure this does not propagate as a zero value. |
| HIGH | Inadequate Integration Testing Strategy | Wave 3, the most critical integration step, relies solely on a successful build and manual, post-facto checks. This misses potential runtime errors, such as data shape mismatches between the query and the new functions. | Add a dedicated integration test for `domain-analysis-snapshot-builder.ts` that seeds a test database, invokes the builder, and asserts the final snapshot has the correct structure and non-null values. |
| MEDIUM | [UNVERIFIED] Risk of Stale Cache | A1 states the cache fingerprint query will continue to read the old `analysis_results` table, while the new logic reads from `transcripts`. A change in transcripts that doesn't affect `analysis_results` will not invalidate the cache, causing stale data to be served. | The plan should include updating the fingerprint query to be sensitive to `transcript` table changes. An automated test should verify that a new, relevant transcript invalidates a cached snapshot. |
| MEDIUM | Ambiguous Definition of "Trivially Testable" | A2 claims the accumulator is "trivially testable" but Wave 1 notes it reuses helpers from other modules. The plan omits testing for failure modes within these dependencies (e.g., a helper throwing an error). | The unit tests for `transcript-cell-accumulator.test.ts` must include cases where its helper dependencies are mocked to throw exceptions or return invalid data, asserting that the accumulator handles these failures gracefully. |
| LOW | Omitted Tests for Input Boundary Conditions | The test plans for Wave 1 and 2 do not explicitly mention testing for empty inputs (e.g., an empty list of transcripts) or failure cases in parallel queries (e.g., one promise rejecting in `Promise.all`). | Add unit tests for boundary conditions: empty transcript arrays, input maps that result in zero valid cells, and a model with no transcripts. Specify and test the expected behavior for a partial failure in the paginated `Promise.all` query. |

## Residual Risks

| Severity | Risk | Impact | Recommendation |
| :--- | :--- | :--- | :--- |
| HIGH | Manual Verification Used as a Substitute for Automated Testing | The verification strategies for R1-R4 are manual, non-repeatable, and error-prone. This establishes a gap in the automated regression suite for critical behaviors like performance, data migration, and correctness. | Convert the manual verification steps into automated tests. For R3 (Delta), create a characterization test that runs a fixed dataset through both old and new logic and asserts the delta is within a known threshold. For R1/R2 (Memory/Coexistence), create automated integration tests that check for the new version and can be run with large datasets. |
| MEDIUM | [UNVERIFIED] Undefined Behavior for Partial Query Failures | A4 describes using `Promise.all` for transcript queries but does not define behavior if one of the model queries fails. The system could either fail the entire analysis or, worse, silently return incomplete data. | The plan must specify the desired outcome of a partial query failure (e.g., fail fast, or return partial data with a warning). This behavior should then be enforced with an integration test that forces a query to fail and asserts the system responds correctly. |

## Token Stats

- total_input=13054
- total_output=842
- total_tokens=17556
- `gemini-2.5-pro`: input=13054, output=842, total=17556

## Resolution
- status: accepted
- note: CRITICAL (NaN): accepted — tasks will require null-return for empty mean, with unit tests. HIGH (integration test): accepted — Wave 3 tasks will include integration test in test DB. MEDIUM (fingerprint): same as Codex F1, deferred. MEDIUM (helper failures): accepted — add tests for invalid helper inputs. LOW (empty inputs): accepted — explicit empty-array tests added to Wave 1 tasks.

---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/ci-test-quality/plan.md"
artifact_sha256: "5c93ad6b4697c3896cedf60f04d2a6dbe68e7d31433d3e2eb848e4b6fedd77bb"
repo_root: "."
git_head_sha: "2c5aac580a13a7d49fc70672b5d33f584cdc9c62"
git_base_ref: "origin/main"
git_base_sha: "6396d4f22128d811613f066211f9318ead37f425"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Implementation complete — all 1232 web tests pass, TypeScript builds clean, YAML is valid. Testability concerns are addressed: access-tracking tests now await directly (no real timers), export.test.ts uses vi.stubGlobal (auto-cleanup), split test files each run independently."
raw_output_path: "docs/workflow/feature-runs/ci-test-quality/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Wave |
| :--- | :--- | :--- |
| **HIGH** | **CI Build Forced with `--force`** | 1 |
| | The plan adds `--force` to a `turbo build` command. This is a significant red flag. It indicates an underlying, unsolved problem with caching or dependency invalidation. Forcing the build treats the symptom (stale cache preventing a build) rather than the root cause. This can mask real issues, lead to non-deterministic builds, and hide future dependency graph problems until they cause a more catastrophic failure. | |
| **HIGH** | **Inconsistent Async Testing in `access-tracking`** | 2 |
| | The plan correctly identifies that async functions should be awaited in tests, not managed with `setTimeout`. However, it explicitly preserves `setTimeout` waits for the HTTP-triggered path. If the underlying functions are now properly returning promises, there is no valid reason to keep using `setTimeout`. This leaves a known bad practice in the test suite, creates inconsistency, and suggests a weak understanding of the system under test. All `setTimeout` waits should be replaced with `await`. | |
| **MEDIUM** | **Risk of State Pollution from Shared Fixtures** | 5 |
| | Splitting large test files by extracting shared fixtures (`.fixtures.ts`) is a good goal, but the plan lacks a critical detail: ensuring test isolation. If these fixtures contain mutable state (e.g., shared objects, mock implementations) that is modified by one test, it can poison the well for subsequent tests running in the same suite, especially if tests run in parallel. The plan must specify that fixtures should be stateless or generated via factory functions (`createMockData()`) to ensure each test gets a clean copy. | |
| **MEDIUM** | **Incomplete `waitFor` Usage for Absence Assertions** | 4 |
| | The plan focuses on wrapping `getBy*` queries in `waitFor`, which is correct for asserting the *presence* of an element after an async update. However, it completely omits the case for asserting the *absence* of an element. A test checking `expect(queryByText('...')).toBeNull()` can also be flaky if the DOM hasn't settled. Such assertions must also be wrapped (e.g., `await waitFor(() => expect(queryByText('...')).toBeNull())`) to prevent race conditions where the check runs before a component has finished removing an element. | |
| **MEDIUM** | **[UNVERIFIED] High Timeout Masks Performance Issues** | 1 |
| | Increasing the `api-tests` job timeout to 20 minutes is a pragmatic but dangerous fix. It prevents timeouts for now, but it doesn't address the underlying cause of the long test run. It creates a risk of masking future performance regressions, as tests can get progressively slower without triggering a failure until they cross the new, much higher threshold. It also means that a truly hung test will waste 20 minutes of CI resources before failing. | |
| **MEDIUM** | **[UNVERIFIED] Potential for Error-Swallowing Promises** | 2 |
| | The plan states that the `.catch()` blocks in `access-tracking.ts` will be kept. If these `catch` blocks do not re-throw the error, a failed Prisma operation will result in a successfully resolved promise. This would cause a test expecting a failure to pass incorrectly. The test plan for Wave 2 should be expanded to include verifying that a database error correctly causes the promise to reject. | |
| **LOW** | **[UNVERIFIED] Incomplete Test Setup After File Splitting** | 5 |
| | When splitting large test files like `AnalysisPanel.test.tsx`, there's a high risk of forgetting to apply necessary context providers or mocks to all the new, smaller test files. The plan does not include a verification step to ensure the test setup (wrappers, providers, mocks) remains consistent across all new files, which could lead to a new class of test failures. | |
| **LOW** | **[UNVERIFIED] Unverified Assumption About Superset Test** | 1 |
| | The plan justifies deleting `create-user.test.ts` by claiming a "superset exists in tests/". This is an unverified assumption. Without seeing the contents of both files, it's impossible to confirm that all scenarios, edge cases, and assertions from the deleted file are truly covered by the other. This action carries a small but real risk of deleting unique test coverage. | |

## Residual Risks

1.  **Systematic Flakiness Unaddressed:** The plan targets specific, known-flaky tests with `waitFor`. This is a tactical fix. It does not introduce a systematic solution or linting rule to prevent developers from introducing new, similar race conditions in the future. Other flaky tests not found in the initial audit will likely remain.
2.  **CI Cache Unreliability:** Using `restore-keys` for the `node_modules` cache can introduce subtle, hard-to-debug issues. If a dependency is updated in a way that doesn't change the `package-lock.json` hash key, CI might restore a partially stale cache, leading to "works on my machine" problems. The root cause of the build failures addressed by `--force` remains unresolved and could resurface.
3.  **Test Suite Performance Decay:** The 20-minute timeout on API tests is a concession, not a solution. The underlying performance issues are not being addressed, and the test suite's execution time will likely continue to grow, eventually exceeding the new timeout and requiring another intervention.

## Token Stats

- total_input=13610
- total_output=1205
- total_tokens=16483
- `gemini-2.5-pro`: input=13610, output=1205, total=16483

## Resolution
- status: accepted
- note: Implementation complete — all 1232 web tests pass, TypeScript builds clean, YAML is valid. Testability concerns are addressed: access-tracking tests now await directly (no real timers), export.test.ts uses vi.stubGlobal (auto-cleanup), split test files each run independently.

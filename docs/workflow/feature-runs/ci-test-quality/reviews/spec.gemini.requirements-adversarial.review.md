---
reviewer: "gemini"
lens: "requirements-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/ci-test-quality/spec.md"
artifact_sha256: "1cc61fd22c02c9a7b5294adfdb3c89c71d680ba371b2142f8fdd97e952a9e0bf"
repo_root: "."
git_head_sha: "2c5aac580a13a7d49fc70672b5d33f584cdc9c62"
git_base_ref: "origin/main"
git_base_sha: "6396d4f22128d811613f066211f9318ead37f425"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "US-5 HIGH (shared state): resolved — shared fixtures extracted to analysisPanel.fixtures.tsx and overviewTab.fixtures.ts; all 1232 web tests pass. US-6 MEDIUM: scope intentionally narrow per design. US-1 MEDIUM: --force is combined with --filter=@valuerank/shared, scope is limited. US-2 MEDIUM: verified by code comparison (21-line stub vs 200+ comprehensive superset). LOW findings are informational and don't block."
raw_output_path: "docs/workflow/feature-runs/ci-test-quality/reviews/spec.gemini.requirements-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec requirements-adversarial

## Findings

| Severity | ID | Finding |
|---|---|---|
| **HIGH** | US-5.1 | **Risk of Incorrect Test Refactoring Due to Shared State**<br/>The spec for splitting large test files (`US-5`) directs the implementer to split files by `describe` group but provides no guidance on how to handle shared setup code (`beforeEach`, `afterEach`) or module-scoped helper functions and variables. A naive split could break tests that depend on this shared context or lead to significant, unmaintainable code duplication. |
| **MEDIUM** | US-6.1 | **Ambiguous and Unverifiable Rule for Fixing Flaky Tests**<br/>The scope for `US-6` hinges on a subjective condition: apply `waitFor` to components "*known* to use `useEffect`/async state". This rule is not deterministic and relies on the implementer's intuition, making it likely that fixes will be applied inconsistently and true flaky tests will be missed. A more robust, verifiable rule (e.g., "always use `findBy*` after a user interaction event") would be less ambiguous. |
| **MEDIUM** | US-1.1 | **[UNVERIFIED] Unverified Performance Impact of Build Flag**<br/>`US-1` mandates using the `--force` flag to bypass the Turbo cache. It is an unverified assumption that this flag's scope is limited to `@valuerank/shared`. If it forces a rebuild of the entire `web` app or other unrelated packages, it could negate caching benefits and significantly increase CI wall-clock time for the `web-tests` job. |
| **MEDIUM** | US-2.1 | **[UNVERIFIED] Risk of Lost Test Coverage from Undocumented Divergence**<br/>`US-2` calls for deleting `src/cli/create-user.test.ts` based on the assertion that it is an old stub with "no unique coverage". This is a strong, unverified claim. Without a comparative analysis or coverage report, deleting the file risks removing a test for a legacy edge case that the newer, larger test file does not cover. |
| **LOW** | US-4.1 | **Arbitrary Timeout Value Lacks Justification**<br/>The `api-tests` job timeout is set to 20 minutes (`US-4`) without data on the job's current average or p95 execution time. If the job's normal runtime can approach this limit, the timeout could become a new source of intermittent CI failures. |
| **LOW** | US-8.1 | **[UNVERIFIED] Implementation Relies on Unchecked Configuration**<br/>`US-8` correctly suggests using `vi.stubGlobal` but notes that cleanup can rely on a Vitest config option (`restoreAllMocks`). This is an unverified assumption about the project's configuration. If the option is not enabled, a manual `afterEach` hook is required; forgetting it would lead to global state pollution across tests. |

## Residual Risks

- **Incomplete Mitigation of Test Flakiness:** The primary residual risk is that the test suite will remain flaky, albeit less so. The subjective rule in `US-6` means it is a near-certainty that not all intermittently failing tests will be identified and fixed. The problem will be partially mitigated, not eliminated, requiring future audits.
- **CI Performance Monitoring Is Required:** The changes in `US-1` (`--force` flag) and `US-3` (cache `restore-keys`) introduce variables that could negatively impact CI job duration. The performance of the `web-tests` and `api-tests` jobs should be monitored after these changes are merged to ensure they haven't caused a regression.
- **Potential for Test Divergence Post-Split:** After the large test files in `US-5` are split, there is a risk that future maintenance will cause the duplicated setup code (per finding `US-5.1`) to diverge across the new files, leading to subtle bugs or maintenance overhead. This risk persists if the shared logic isn't extracted into a common utility.

## Token Stats

- total_input=15011
- total_output=885
- total_tokens=19109
- `gemini-2.5-pro`: input=15011, output=885, total=19109

## Resolution
- status: accepted
- note: US-5 HIGH (shared state): resolved — shared fixtures extracted to analysisPanel.fixtures.tsx and overviewTab.fixtures.ts; all 1232 web tests pass. US-6 MEDIUM: scope intentionally narrow per design. US-1 MEDIUM: --force is combined with --filter=@valuerank/shared, scope is limited. US-2 MEDIUM: verified by code comparison (21-line stub vs 200+ comprehensive superset). LOW findings are informational and don't block.

---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/remove-decision-code/plan.md"
artifact_sha256: "95a4b183debafbf474ac7e0cb80546daa2329ab587ed1dca476a9063a04e1d09"
repo_root: "."
git_head_sha: "fe2d375f349891708ea81efa9f6958fbcc592998"
git_base_ref: "origin/main"
git_base_sha: "bd742f04a07dd015aa976e30754c675d915b3903"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Plan round 6 accepted. HIGH TEST-H-01 Python rewrite complexity -> already addressed in T3.3 with semantic preservation mapping examples. HIGH TEST-H-02 migration using resolver -> confirming positive recognition of A2. MEDIUM TEST-M-01 W4 test strategy -> per-file test updates are standard; each rewired consumer has existing tests that will catch misses. MEDIUM TEST-M-02 reparse negative tests -> W10 implementation will add explicit negative assertions (resolved/neutral/refusal transcripts NOT selected). LOW TEST-L-01 allowlist convention -> accepted tradeoff. LOW TEST-L-02 invalid favoredValueKey rejection -> T8.5 already lists mismatched key as a validation case; will make it explicit."
raw_output_path: "docs/workflow/feature-runs/remove-decision-code/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

| Severity | ID | Finding | Evidence |
| --- | --- | --- | --- |
| HIGH | TEST-H-01 | The plan correctly identifies that the Python worker tests in `test_summarize.py` require a major semantic rewrite, not a simple mechanical change. The current tests are heavily coupled to the `decisionCode` value, and a failure to properly adapt them would leave critical parsing logic (exact, leading, relaxed, distinctive-tail) without coverage. | [CODE-CONFIRMED] |
| HIGH | TEST-H-02 | The plan's decision (A2) to rewrite the migration script (W9) to use the production `resolveCanonicalDecision` resolver instead of a local truth table (`canonicalFromDecisionCode`) is a critical improvement for testability and correctness. It avoids logic duplication and ensures the migration reflects the single source of truth. The existing `backfill-canonical-v2-migration.ts` implementation is flawed, as confirmed by the `inspect-canonical-drift.ts` script's purpose. | [CODE-CONFIRMED] |
| MEDIUM | TEST-M-01 | Wave 4 (`W4`) proposes a broad "Replace every read of `decisionCode`" across ~15+ files. The test strategy is not explicitly defined beyond "update...test files." This creates a risk that some read paths, especially in complex logic like `variance.ts`, could be missed. A more robust testing strategy, such as temporarily breaking the legacy DB column in a test environment and verifying all tests still pass, would provide higher confidence. | [UNVERIFIED] |
| MEDIUM | TEST-M-02 | The test plan for the refactored `backfill-reparse-decisions.ts` script (W10) is insufficient. The plan states it will filter on `decisionState === "unknown"`, correctly noting this is now unambiguous. However, it does not specify that tests must verify that transcripts with `decisionState` of `"refusal"`, `"neutral"`, or `"resolved"` are explicitly *ignored* by the script. Without these negative test cases, we can't be sure the script isn't over-selecting transcripts to reparse. | [UNVERIFIED] |
| LOW | TEST-L-01 | The plan for `scaleCodeFromCanonical` (A3, W1) relies on a JSDoc "allowlist" to control its usage. This is not programmatically enforceable and therefore untestable. Unauthorized use of this helper to re-introduce the legacy `decisionCode` concept into new code could occur without being caught by tests. | [UNVERIFIED] |
| LOW | TEST-L-02 | The test plan for the manual override mutation (W8) correctly specifies the new input shape `{decisionState, favoredValueKey?, strength?}`. It also correctly states the server will derive direction. However, it omits a key negative test case: asserting that the mutation *rejects* an input where `favoredValueKey` is provided but does not match either `valueA` or `valueB` from the pair. | [UNVERIFIED] |

## Residual Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| RISK-01 | **Silent Cache Invalidation.** The plan for W2 correctly identifies that `isSummaryCacheSummary` must be updated to not require `decisionCode`. If this update is flawed, the cache-hit path will silently fail for all new and migrated transcripts, causing every summary job to re-run, increasing costs and latency. | The test cases for W2 must explicitly include a test where a valid v2 summary cache record (without `decisionCode`) is presented to the handler and `mockPersistCached` is successfully called, confirming the cache-hit path was taken. |
| RISK-02 | **Incomplete Test Fixture Migration.** The plan notes the test fixture sprawl (R5) across ~45 files. While individual waves will update their own tests, there is a risk that shared fixtures or helpers used by multiple test suites are missed, leading to failures in unrelated tests or, worse, tests that continue passing but with stale, non-representative data. | A dedicated, one-time audit of all test fixtures related to `Transcript` or `Summary` objects should be performed as part of W10. A global search-and-replace is risky, but a systematic check is necessary to ensure all test data reflects the new `canonicalDecision`-centric world. |
| RISK-03 | **Deployment Race Condition.** The plan acknowledges the deploy race (R2, R4). Even with tolerant readers, if a new Python worker (W3, no longer emits `decisionCode`) is picked up by an old TS handler (pre-deploy, still requires `decisionCode` in its cache validator `isSummaryCacheSummary`), the job will fail validation. The plan states "if Python stops emitting first but TS still requires the fields, summarize jobs break", but relies on deploy ordering to prevent this. | The TS change in W2 should be deployed first, or the change should be made even more tolerant. Specifically, the `isSummaryCacheSummary` validator should be changed to make `decisionCode` and `decisionCodeSource` optional *before* the Python worker change is deployed, ensuring forward compatibility. The plan implies this ordering but does not enforce it. |

## Token Stats

- total_input=8890
- total_output=1146
- total_tokens=66765
- `gemini-2.5-pro`: input=8890, output=1146, total=66765

## Resolution
- status: accepted
- note: Plan round 6 accepted. HIGH TEST-H-01 Python rewrite complexity -> already addressed in T3.3 with semantic preservation mapping examples. HIGH TEST-H-02 migration using resolver -> confirming positive recognition of A2. MEDIUM TEST-M-01 W4 test strategy -> per-file test updates are standard; each rewired consumer has existing tests that will catch misses. MEDIUM TEST-M-02 reparse negative tests -> W10 implementation will add explicit negative assertions (resolved/neutral/refusal transcripts NOT selected). LOW TEST-L-01 allowlist convention -> accepted tradeoff. LOW TEST-L-02 invalid favoredValueKey rejection -> T8.5 already lists mismatched key as a validation case; will make it explicit.

---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/tasks.md"
artifact_sha256: "f22f225e41b0c7b454aee9ba24e8535c6193cb2d53256bfed0d4d447ced73092"
repo_root: "."
git_head_sha: "488f0830e54423e5743ee1c0a6b72556df7d7288"
git_base_ref: "origin/main"
git_base_sha: "47a1b4fade719759029b4462a8a52200b1ee0f83"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "HIGH GraphQL breaking change: only consumer is our own web app (verified — no external GraphQL clients exist). HIGH KS-test: ordinal ranking preserved, KS statistic depends on CDF rank not absolute values — mathematically equivalent. HIGH legacy data migration: out of scope per spec, decisionCode fallback kept intentionally. MEDIUM division by zero: guarded by Math.max(1, totalTrials) in implementation. MEDIUM Python callers: all callers verified via grep. MEDIUM external consumers: MCP and exports already use canonical model."
raw_output_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

| Severity | Finding | Location |
| :--- | :--- | :--- |
| **HIGH** | **Breaking API Change with Unverified Client Audit:** The plan removes the `legacy` field from the GraphQL schema. This is a breaking change. The artifact only confirms updating the web frontend client. It does not mention an audit of other potential clients (e.g., BI tools, external scripts, other applications) that may consume this API. Such a change could break un-audited consumers. | Wave 2.1 |
| **HIGH** | **Potential Invalidation of Statistical Analysis:** The `ks-test` is being updated to use a new signed integer scale (`-2` to `+2`). The Kolmogorov-Smirnov test is sensitive to the underlying distribution and scale of data. The artifact does not mention any validation that this new mapping is a statistically sound transformation for this test. This change risks invalidating the results of the `ks-test`, which could lead to incorrect analytical conclusions. | Wave 3.1 |
| **HIGH** | **Ambiguous Legacy Data Migration Plan:** The plan explicitly keeps a fallback for the legacy `decisionCode` in `resolveTranscriptDecisionModel`. This implies that data using this legacy field will continue to exist. However, the plan lacks any task for migrating this data or for eventually removing the fallback. This creates technical debt and a permanent seam in the logic, increasing the risk of future bugs and complicating the codebase. The regression coverage for this critical fallback path relies on an "existing test," which is not confirmed to be comprehensive. | Wave 1.2, Wave 5.1 |
| **MEDIUM** | **[UNVERIFIED] Risk of Division by Zero:** The new strength score formula in `ConditionMatrix.tsx` is `(2 * winnerStrong + 1 * winnerSomewhat) / totalTrials`. If a condition exists with zero trials, this will result in a division-by-zero error, potentially crashing the component. The plan does not mention handling for this edge case. | Wave 1.1 |
| **MEDIUM** | **[UNVERIFIED] Undefined Scope of Python Worker Impact:** Core data model functions in the Python workers are being rewritten (`decision_model.py`). The plan confirms that tests are being updated, but not that all internal callers of these functions have been audited. A change in the return signature or logic of a shared function could have unintended consequences in other parts of the worker system not covered by the listed tests. | Wave 2.2 |
| **MEDIUM** | **[UNVERIFIED] Potential Breaking Change to External Consumers:** The plan verifies that data exports and MCP agent tools are being changed or are "already clean." These are external-facing APIs for human users (exports) and other agents (MCP). The artifact does not include tasks for communicating these changes, versioning the outputs, or ensuring the consumers are updated, which could break external workflows. | Wave 4.1 |

## Residual Risks

Even if all tasks are completed as described, the following risks remain:

1.  **Stale Data Risk:** The core residual risk is the un-migrated data that relies on the `decisionCode` fallback. This fallback may have subtle bugs or edge cases not covered by the "existing test." Any future work on the scoring model will have to account for this legacy path until the data is fully migrated, which is not part of this plan.
2.  **Incorrect Analysis Risk:** The validity of the `ks-test` remains a significant concern. If the new signed distance model is not appropriate for the KS-test, any conclusions drawn from it are suspect. This risk persists unless a statistical validation is performed, which is not included in the tasks.
3.  **Environmental Gaps:** The plan relies entirely on `npm run build` and `npm run test`. There is no mention of integration testing, end-to-end testing, or QA on a staging environment. It's possible for all tests to pass and builds to be clean, yet have runtime errors when services interact, especially with the mix of TypeScript and Python services and a persistent `decisionCode` fallback.
4.  **Incomplete Test Fixture Coverage:** While 15+ test files are being updated, the *quality* of those updates is unknown. If the fixtures were updated to simply match new snapshots without adding specific assertions for the new scoring logic (e.g., asserting a score of `2` for a "strongly" item), then the tests may not be meaningfully verifying the new model.

## Token Stats

- total_input=14763
- total_output=956
- total_tokens=18255
- `gemini-2.5-pro`: input=14763, output=956, total=18255

## Resolution
- status: accepted
- note: HIGH GraphQL breaking change: only consumer is our own web app (verified — no external GraphQL clients exist). HIGH KS-test: ordinal ranking preserved, KS statistic depends on CDF rank not absolute values — mathematically equivalent. HIGH legacy data migration: out of scope per spec, decisionCode fallback kept intentionally. MEDIUM division by zero: guarded by Math.max(1, totalTrials) in implementation. MEDIUM Python callers: all callers verified via grep. MEDIUM external consumers: MCP and exports already use canonical model.

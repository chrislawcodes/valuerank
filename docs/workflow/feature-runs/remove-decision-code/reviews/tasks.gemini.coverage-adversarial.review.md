---
reviewer: "gemini"
lens: "coverage-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/remove-decision-code/tasks.md"
artifact_sha256: "6b86d73eb871ea52b0f21b6751d7e263aed481dcb04d776bd18f01f2c55c92c3"
repo_root: "."
git_head_sha: "fe2d375f349891708ea81efa9f6958fbcc592998"
git_base_ref: "origin/main"
git_base_sha: "bd742f04a07dd015aa976e30754c675d915b3903"
generation_method: "gemini-cli"
resolution_status: "open"
resolution_note: ""
raw_output_path: "docs/workflow/feature-runs/remove-decision-code/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

### CRITICAL

- **[UNVERIFIED] Potential for Severe Performance Regression in Analysis Queries:** In Wave 4, multiple tasks (T4.3, T4.4, T4.5) replace filtering and grouping on `decisionCode` with queries against `canonicalDecision` fields stored in a JSONB column (e.g., `canonicalDecision.decisionState`). If `decisionCode` was a top-level, indexed database column, switching to un-indexed queries inside a JSONB object for critical aggregations and counts could lead to significant performance degradation (e.g., full table scans). The plan does not include a task to analyze query performance or add a corresponding database index on the JSONB fields, creating a high risk of making analysis features unusable.

### HIGH

- **Missing Rollback Plan for Data Migration:** The entire plan, including the critical post-merge data migration (P2, P3), lacks a documented rollback strategy. If the `--apply` step (P3) fails partway through, or if a critical bug is discovered post-deployment (P1), there are no instructions on how to revert the database state or the application code. This is a serious omission for a large-scale refactor involving data transformation.
- **Undocumented Breaking Changes to External APIs:** Wave 5 (T5.1, T5.4) and Wave 6 (T6.1) remove the `decisionCode` field from the MCP REST API, OData metadata, and the public GraphQL schema. These are breaking changes for any external consumer. The plan treats this as a simple removal, assuming all clients (like the first-party web app) are updated in lockstep. It does not account for third-party consumers, API versioning, or a deprecation period, risking disruption for other users of the platform.
- **High Risk of Semantic Loss in Test Rewrite:** In Wave 3, task T3.3 requires a complete rewrite of Python tests that were previously keyed on `decisionCode`. While it provides a good list of parser branches to cover, there is a substantial risk that a test covering a subtle but important edge case will be incorrectly translated or deleted. This could lead to a silent regression in the LLM-based text parser, causing incorrect `canonicalDecision` data to be generated for certain user inputs.

### MEDIUM

- **[UNVERIFIED] Potential UI Regression in Decision Source:** In Wave 7, the plan is to remove `decisionCode` and its related display logic from the web front-end. However, the plan does not verify whether the related `decisionCodeSource` field was used in the UI, for example, to differentiate between an LLM-generated decision and a manual override. The new `canonicalDecision` object does not appear to have a corresponding `source` field, creating a risk that this information will no longer be visible to the user, which could be a functional regression.
- **Silent Failure Mode in API/Worker Contract:** In Wave 2, task T2.5 specifies to "Silently ignore `decisionSource` from the Python worker output contract." During a complex, multi-stage migration, silent failures are dangerous. If the Python worker continues to send deprecated fields, it signals a contract mismatch. Instead of ignoring it, the system should log a warning so that these mismatches can be tracked and resolved, preventing them from masking other potential bugs.
- **Insufficient Final Verification Before Dropping Column:** In Wave 10, the final verification step (T10.5) relies on `git grep` to ensure `decisionCode` is no longer used. This check is insufficient, as it can miss dynamic property access in code and cannot verify that no raw SQL queries are still selecting the database column. Relying on this check provides a false sense of security; the only definitive verification is the post-merge step (P6) to drop the column and see if the application breaks.

## Residual Risks

- **Migration Logic Drift:** Wave 9 wisely rewrites the migration script to use the production `resolveCanonicalDecision` resolver. However, it also adds a "Refusal override" (T9.4). This is special-case logic that exists *only* in the migration script. If the production resolver's logic for handling refusals changes in the future, this migration-only logic will become stale, creating a potential for data inconsistency if the migration is ever re-run.
- **Mixed-Version Race Conditions:** During the transition period where both `v1` and `v2` cache summaries exist, there is a risk of race conditions. For example, a user could load a transcript with a `v1` summary, a background job could re-process it and write a `v2` summary, and then the user could trigger a manual override based on the stale `v1` data they have loaded. The plan seems to handle this implicitly by making read paths robust, but the potential for inconsistent state due to these race conditions remains a risk.
- **Inter-Wave Dependencies:** The plan is broken into 10 waves with checkpoints, which is good. However, a flaw in an early wave (e.g., an incorrect assumption in the W1 `scaleCodeFromCanonical` helper) may not be discovered until a much later wave that consumes it (e.g., W10's `job-choice-bridge-report`). This could lead to significant rework across multiple waves.

## Token Stats

- total_input=16946
- total_output=1138
- total_tokens=21143
- `gemini-2.5-pro`: input=16946, output=1138, total=21143

## Resolution
- status: open
- note:
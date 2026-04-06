---
reviewer: "gemini"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/tasks.md"
artifact_sha256: "a3a63520b10e340e10f3e060ba77851fafdf2389d4990db207b5ae27b73ebdf9"
repo_root: "."
git_head_sha: "5d04de64d2bf84e1434fd754cd77b7159a695474"
git_base_ref: "origin/main"
git_base_sha: "b60f7e7ff0708de6013e64f4045868895bbbcf6e"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/reviews/tasks.gemini.dependency-order-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

| Severity | Finding |
| :--- | :--- |
| **CRITICAL** | **Test Updates are Deferred to the Final Wave** |
| **HIGH** | **No Backend Data Migration Strategy for Stored Aggregates** |
| **HIGH** | **GraphQL Schema Updated After Dependent Backend Logic** |
| **MEDIUM** | **[UNVERIFIED] Brittle Assumption About Legacy Field Consumers** |
| **MEDIUM** | **Test Suite is Unreliable Until Final Wave** |
| **LOW** | **Grep Sweeps are Unscoped and Potentially Incomplete** |

---

### **CRITICAL: Test Updates are Deferred to the Final Wave**
The plan defers all test updates to Wave 4. This is a critical flaw in dependency ordering. During Waves 1, 2, and 3, the codebase is being actively changed while the corresponding tests are left broken or outdated. Each slice should be a self-contained, verifiable unit of work, which means the code and its tests must be updated together.

**Adversarial Impact:** An engineer executing this plan will have a false sense of security, or worse, a completely non-functional test suite for the duration of the refactor. This makes it impossible to confirm that any given slice was completed successfully, leading to a high risk of shipping regressions. The checkpoint `npm run build` only confirms type correctness, not behavioral correctness.

**Recommendation:** Each slice in Waves 1, 2, and 3 must be amended to include the task of updating any tests related to the code being changed. Wave 4 should be reframed as a final verification and regression-coverage-gap-analysis, not the primary vehicle for test updates.

---
### **HIGH: No Backend Data Migration Strategy for Stored Aggregates**
Slice 3.1 correctly identifies that old, stored aggregate results will exist and proposes a client-side solution: "if data has `scoreCounts` (old stored aggregate), map it to `directionCounts`". This is a temporary fix that introduces permanent technical debt. The plan completely omits a backend strategy to recompute and backfill these aggregates in the database.

**Adversarial Impact:** The system will be left in a state of data dichotomy where all new aggregates use `directionCounts` but all historical data uses `scoreCounts`. The frontend is forced to carry a permanent compatibility layer. If this frontend logic is ever removed or forgotten in a future refactor, all historical data will become inaccessible or render incorrectly.

**Recommendation:** Add a slice (likely in Wave 2 or 3) to create and run a one-time data migration script that recomputes all stored aggregates from `scoreCounts` to `directionCounts`. The frontend compatibility layer should only be considered a temporary stopgap until this backfill is complete.

---
### **HIGH: GraphQL Schema Updated After Dependent Backend Logic**
Wave 1 modifies the core backend TypeScript decision model, but the corresponding GraphQL schema change (removing the `legacy` field) is deferred until Wave 2. The GraphQL schema is the definitive API contract. Modifying backend logic that produces a GraphQL type before modifying the schema itself is inverted.

**Adversarial Impact:** This ordering means that during Wave 1, the implementation and the schema are knowingly out of sync. This can cause tooling failures (e.g., code generation) and confusion for any developer interacting with the API. The correct approach is to change the contract (the schema) first, which then creates clear, compiler-enforced "todos" for updating the resolvers (backend) and queries (frontend) that depend on it.

**Recommendation:** Move the GraphQL schema change from Slice 2.1 into Slice 1.1. The first step should be to remove the `legacy` field from the GQL type, which will then drive the necessary changes in the resolvers and related services.

---
### **MEDIUM: [UNVERIFIED] Brittle Assumption About Legacy Field Consumers**
Slice 1.1 makes the claim: "Keep the `decisionCode` fallback inside `resolveTranscriptDecisionModel` (only path that may read `decisionCode`)". This is a strong, unverified assumption. If any other part of the system (e.g., other resolvers, services, or even the Python workers) reads this field directly from the database, it will either break or continue operating on legacy logic that was intended to be removed.

**Adversarial Impact:** An undiscovered consumer of `decisionCode` would lead to subtle bugs. For example, another analysis service might silently keep using the old numeric codes, producing data that is inconsistent with the rest of the updated system, corrupting analysis results.

**Recommendation:** Before starting Wave 1, a thorough search (beyond just the listed files) must be conducted to verify that `resolveTranscriptDecisionModel` is truly the *only* consumer of `decisionCode`. This finding must be confirmed, not assumed.

---
### **MEDIUM: Test Suite is Unreliable Until Final Wave**
A direct consequence of deferring test updates is that the checkpoints are not robust. `npm run test` is not included in any checkpoint until the very end. This means a developer could successfully build the workspace (`npm run build`) but have dozens of failing tests, and the plan would not catch this.

**Adversarial Impact:** This creates a long, complex, and risky integration phase at the end. Instead of small, verifiable changes, the developer is faced with a mountain of test debt in Wave 4. It becomes difficult to determine if a test failure was caused by a change in Wave 1 or Wave 3, dramatically increasing the time required for debugging.

**Recommendation:** Add `npm run test` (for the relevant workspace) to the end of every single slice. A slice is not "done" until the build passes *and* all tests pass.

---
### **LOW: Grep Sweeps are Unscoped and Potentially Incomplete**
The `grep` commands in Slices 3.2 and 4.1 are a good verification step, but they are flawed. For example, they scope the search to `--include="*.ts"` and `--include="*.tsx"`, potentially missing legacy references in `.js` files, `.json` test fixtures, or other configuration files. The final verification `grep` is better but could still miss cases if terms are aliased or constructed dynamically.

**Adversarial Impact:** A developer could run the `grep`, get zero results, and incorrectly believe the cleanup is complete. A remaining reference in a test fixture could cause a test to pass with outdated data shapes, masking a real problem.

**Recommendation:** Broaden the `grep` sweeps to be more inclusive of file types (`--include="*.ts*"`, `--include="*.js*"` etc.) or remove the `--include` flag entirely for a more exhaustive search, and explicitly call out searching for test fixture files.

## Residual Risks

1.  **Orphaned Data in Queues:** The plan does not account for jobs that may already be in the PgBoss queue when the workers are deployed. If a `analyze-basic` job was enqueued by the old application version, it might contain data with the `legacy` shape. The new Python worker in Wave 2 might not be able to process this, leading to job failures. A strategy for draining or migrating in-flight jobs is missing.
2.  **[UNVERIFIED] Build/Codegen Tooling Interdependencies:** The plan assumes `npm run build` and `npm run codegen` can be run independently and at specific times. In some setups, codegen is a prerequisite for `build`. The late GQL schema change in Wave 2 could put the repository in a state where `codegen` would fail if run in Wave 1, potentially breaking a developer's local build process.
3.  **No Mention of Database Schema Migration:** While the code is being changed to stop *producing* `legacy` data, and a backfill is recommended above, the plan doesn't mention removing the underlying columns (`decisionCode`, etc.) from the database schema itself. This is a final cleanup step that is completely omitted, leaving unused fields in the database indefinitely.

## Token Stats

- total_input=3200
- total_output=1727
- total_tokens=16868
- `gemini-2.5-pro`: input=3200, output=1727, total=16868

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted

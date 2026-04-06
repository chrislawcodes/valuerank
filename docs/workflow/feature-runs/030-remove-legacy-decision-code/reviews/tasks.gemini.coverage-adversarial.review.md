---
reviewer: "gemini"
lens: "coverage-adversarial"
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
raw_output_path: "docs/workflow/feature-runs/030-remove-legacy-decision-code/reviews/tasks.gemini.coverage-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks coverage-adversarial

## Findings

### HIGH: Missing Database Migration and Data Backfill Strategy
The plan comprehensively removes TypeScript types, GraphQL fields, and application logic related to the legacy `decisionCode` and score system. However, it completely omits any mention of database-level changes.

- **Hidden Flaw**: The plan implicitly assumes that the backing database fields (`decisionCode`, `rawScore`, etc., if they exist as columns) will either be ignored or are not present. If these columns exist, the plan introduces schema drift by removing the application code that uses them without removing the columns themselves.
- **Omitted Case**: There is no task to write or run a database migration to drop the legacy columns. More importantly, there is no task to backfill `decisionMetadata` for historical records that only have a `decisionCode`. The plan instead opts to maintain a permanent fallback (`Slice 1.1` and `Slice 4.1`), which institutionalizes the tech debt.
- **Severity**: High. This oversight guarantees that the database schema will become inconsistent with the application code, and that a legacy code path will need to be maintained indefinitely.

### HIGH: Unspecified Aggregate Data Recomputation
`Slice 3.1` astutely identifies that previously-calculated aggregate results stored in the database will have the old `scoreCounts` shape. However, it proposes a single, localized fix: "Add a shape normalizer inline" within one specific React component.

- **Weak Assumption**: This assumes that `OverviewTab.tsx` is the *only* place in the entire system that consumes these stored aggregates. The API, other frontend components, or data exports could also access this stale data and would not have the benefit of this inline normalizer.
- **Hidden Flaw**: This is a reactive patch, not a systemic solution. The correct approach is to proactively recompute all stored aggregates as part of the migration. The plan lacks any task for a backfill script or job to re-run the analysis and update stored results to the new `directionCounts` shape.
- **Severity**: High. Relying on a single-point-of-use UI fix for a data consistency issue creates a high risk of stale or incorrectly formatted data being presented elsewhere in the system.

### MEDIUM: Cross-Wave Deployment Incompatibility
The tasks are structured into waves that create breaking changes between the API and the frontend.

- **Hidden Flaw**: If Wave 1 and 2 are deployed, the `decisionModelV2.legacy` field will be removed from the GraphQL API. The frontend, which is not updated until Wave 3, still expects this field to exist. This will cause GraphQL errors and break the UI.
- **Omitted Case**: The plan does not include any mechanism to manage this breaking change, such as a feature flag, versioning the GraphQL type, or a strict requirement to deploy all waves simultaneously. This lack of a deployment strategy makes the proposed wave structure unsafe.
- **Severity**: Medium. The issue is severe, but it is a procedural flaw in the rollout plan rather than a flaw in the final state of the code itself.

### MEDIUM: [UNVERIFIED] Permanent Legacy Dependency
`Slice 1.1` explicitly requires keeping the `decisionCode` fallback in `resolveTranscriptDecisionModel`, and `Slice 4.1` adds a regression test to ensure this fallback continues to work.

- **Weak Assumption**: This assumes that it is acceptable to have a permanent, production-critical dependency on a legacy data field that the rest of the system is being migrated away from. The plan provides no path or future intention to eliminate this fallback.
- **Hidden Flaw**: By choosing not to backfill the data and instead maintaining a permanent fallback, the project commits to supporting two parallel data models indefinitely. This increases cognitive load for future developers and creates a permanent maintenance burden.
- **Severity**: Medium. While it doesn't break the system, it's a significant strategic error that fails to complete the stated goal of removing the legacy system. It is marked `[UNVERIFIED]` as the business impact depends on the volume of data that relies on this fallback, which cannot be known without code access.

## Residual Risks

- **Data Inconsistency**: Upon completion, the database will likely contain a mix of historical records with a populated `decisionCode` and newer records without it. Stored aggregate results will also be mixed between `scoreCounts` and `directionCounts` shapes, with only a single UI component patched to handle the difference. This creates a high risk of other system components misinterpreting data.
- **Database Schema Drift**: The database will contain unused `decisionCode` (and potentially `rawScore`/`canonicalScore`) columns, creating a divergence between the application schema and the database schema. This constitutes technical debt and can complicate future data analysis and development.
- **Incomplete Abstraction**: The core goal of removing the legacy system is not fully achieved. The `decisionCode` logic remains as a permanent fallback in a critical data resolver, meaning developers must still understand this legacy system to work on transcript data modeling.
- **Brittle Analysis Logic**: The tasks for rewriting variance analysis (`Slice 1.2`) and Python worker logic (`Slice 2.2`) focus on replacing one calculation with another. They do not explicitly require adding defensive logic to handle cases where the new `(direction, strength)` values might be `null` or `undefined`, potentially leading to runtime errors if data is incomplete.

## Token Stats

- total_input=3198
- total_output=1142
- total_tokens=16794
- `gemini-2.5-pro`: input=3198, output=1142, total=16794

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted

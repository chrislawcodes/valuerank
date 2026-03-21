---
reviewer: "gemini"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflows/run-status-visualization/tasks.md"
artifact_sha256: "6d3805203ab30660b276bec3e10c7d6dd9303825d979304b43d709c44486eb81"
repo_root: "."
git_head_sha: "750c3a611f2280b5385723769b992cf68ef16473"
git_base_ref: "origin/main"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "F1 rejected: byModel already server-side implemented. F2 rejected: recentCompletions and activeModelIds are in metrics.providers[]. F3 rejected: retryCount column already exists in Prisma schema. F4 accepted: API tests covered in quality gate step 4."
raw_output_path: "docs/workflows/run-status-visualization/reviews/tasks.gemini.dependency-order-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

1.  **Critical Dependency Flaw: Missing API Implementation.** The entire UI redesign in Wave 2 is fundamentally dependent on the `runProgress.byModel` data structure. Task T1.3 adds this to the web client's types and GraphQL fragment, and T2.1 relies on it for the core provider grid. However, Wave 1 completely omits the corresponding backend implementation. There is no task to add the `byModel` field to the `RunProgress` GraphQL type on the server (`cloud/apps/api/src/graphql/types/run.ts`) or to implement its resolver. The application will fail at runtime when the frontend requests this field.

2.  **Likely Missing API Field `totalQueued`.** The UI rewrite in T2.1 specifies a "Job queue strip" that displays data from `metrics.totalQueued`. However, the API work in Wave 1 only adds the `totalRetries` field to `ExecutionMetrics`. If `totalQueued` does not already exist on this type, this represents a second dependency failure where the UI requires data that the API does not provide.

3.  **Brittle UI Logic for Model-to-Provider Mapping.** Task T2.1 proposes a complex and fragile method for identifying which models belong to a provider: `new Set([...provider.activeModelIds, ...provider.recentCompletions.map(c => c.modelId)])`. This approach is flawed because a model that failed and is no longer "active" and did not complete "recently" would disappear from the UI, even though it is part of the run. A more robust design would be to use `runProgress.byModel` as the source of truth and map each model back to its provider.

4.  **No Explicit Testing Mandate for Complex UI Rewrite.** Task T2.1 involves a "full rewrite" of a component with significant client-side logic (throughput calculations, state mapping, conditional rendering). The plan does not include a sub-task to write unit or integration tests for this new component. Relying only on a final `npm run test` command in T2.3 is insufficient, as it doesn't ensure any of the new, complex logic is actually covered, creating a high risk of shipping regressions or visual bugs.

## Residual Risks

1.  **Stale UI Data.** The new UI performs client-side calculations like throughput based on a 60-second window of `recentCompletions`. The plan does not specify or address the data-fetching strategy (e.g., polling, subscriptions). Without a frequent refetching mechanism for the run data, the entire execution progress view will quickly become stale and misleading to the user.

2.  **Database Query Performance.** The `totalRetries` resolver in T1.2 performs an aggregate query on `probeResult`. While acceptable for most cases, this query could become a performance bottleneck on runs with extremely large numbers of trials if the `runId` column is not indexed.

3.  **Unhandled UI Edge Cases.** A full component rewrite (T2.1) introduces numerous edge cases that are not explicitly addressed in the plan. Examples include: a run with zero models, a provider that has no models assigned in the run, initial states where `runProgress` is null before the first data returns, and runs where `summarizeProgress` or `analysisStatus` are not applicable. The lack of mandated testing for the new component means these states are unlikely to be verified.

## Token Stats

- total_input=13795
- total_output=738
- total_tokens=16777
- `gemini-2.5-pro`: input=13795, output=738, total=16777

## Resolution
- status: accepted
- note: F1 rejected: byModel already server-side implemented. F2 rejected: recentCompletions and activeModelIds are in metrics.providers[]. F3 rejected: retryCount column already exists in Prisma schema. F4 accepted: API tests covered in quality gate step 4.

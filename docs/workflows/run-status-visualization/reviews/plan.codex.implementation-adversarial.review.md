---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflows/run-status-visualization/plan.md"
artifact_sha256: "00f5db5b2fc759cae8fbbc9b2dc09fdf54d7178b37b7741a5d1072a4a6830a9d"
repo_root: "."
git_head_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
git_base_ref: "origin/main"
git_base_sha: "8a6a690305a367479fd3897aa807a0fd38a30c4f"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "See plan.md Review Reconciliation for full notes."
raw_output_path: "docs/workflows/run-status-visualization/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

1. **High**: The provider-card mapping is built on a heuristic, not a canonical source of truth. `providerModelIds` is derived from `activeModelIds` plus `recentCompletions`, then joined against `runProgress.byModel` by `modelId`. That will silently misattribute or drop counts whenever a model moves between providers, appears under multiple providers, or has no recent completions. The plan does not introduce any explicit provider field to prevent that class of error.
2. **High**: The data contract is insufficient for the UI you describe. Wave 2 wants per-provider progress, retry badges, and throughput, but Wave 1 only adds run-wide `totalRetries` and per-model `completed/failed` counts. There is no provider-level retry breakdown, no in-flight count, and no explicit denominator for the badge logic, so the UI will either be approximated incorrectly or cannot be implemented as specified.
3. **Medium**: `analysisStatus` is weakened to `string | null` instead of a strict status union/enum. That removes the TypeScript guardrail the plan is relying on for the full rewrite, and it makes it easy for the UI to receive an unsupported status value that the new component cannot render correctly.
4. **Medium**: `totalRetries` is exposed as GraphQL `Int!` even though it is computed by summing `retryCount` across a run. That can exceed GraphQL’s 32-bit integer ceiling on sufficiently large runs, so the resolver can fail at serialization time even if the database aggregate succeeds.

## Residual Risks

- The verification commands only build/lint/test the web side and do not prove the new GraphQL shape is available at runtime to every consumer.
- The throughput calculation is based on `Date.now()` on the client, so displayed rates will vary with client clock skew and rerender timing.
- The plan assumes `ExecutionProgress.tsx` has only one consumer; if there are tests, stories, or barrel exports outside `RunProgress.tsx`, the rewrite could still break them without being obvious from the planned call-site change.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: See plan.md Review Reconciliation for full notes.

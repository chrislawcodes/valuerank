---
reviewer: "codex"
lens: "execution-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/match-pair-counts/tasks.md"
artifact_sha256: "626c0ec0f10ffc3fa3de7491d702767a200734dd648e46d60181daa681972042"
repo_root: "."
git_head_sha: "728da7d111003c5b052de4afad7f33501fbe10ba"
git_base_ref: "origin/main"
git_base_sha: "ee49253d6dd9ce8c0dfd6789aad31716b74634e8"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "R1 findings addressed: HIGH smoke test execution path - now lists 3 alternatives (MCP, curl, Apollo Sandbox) with the MCP path as preferred. MED null sampleIndex - slice 1 task 1.2 now requires skipping when scenarioId OR sampleIndex is null. MED leftover exclusion gates - slice 1 task 1.2 now requires same gates (null checks, modelIds filter, soft-delete, aggregate exclusion) on the leftover path. MED multi-definition routing - slice 3 task 3.3 now references the DefinitionId-to-launch rule explicitly with deterministic alphabetical-by-id tie-break for the .definitionIds[0] choice."
raw_output_path: "docs/workflow/feature-runs/match-pair-counts/reviews/tasks.codex.execution-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks execution-adversarial

## Findings

- **High**: The pre-merge smoke test is not executable as written. It requires a “valuerank MCP `graphql_query` tool,” but no such tool is available in the provided toolset or instructions. That makes the required validation step impossible unless the artifact is revised to name a real execution path.
- **Medium [UNVERIFIED]**: Slice 1’s slot key only guards `scenarioId == null`. It does not require `sampleIndex` to be non-null before building `"${scenarioId}|${modelId}|${sampleIndex}"`. If historical transcripts can have a missing `sampleIndex`, distinct rows will collapse into one slot and silently distort paired/orphaned counts.
- **Medium [UNVERIFIED]**: The leftover-count path is underspecified and can overcount. It says to collect `directionalLeftoverSlotsByDefinitionId` “before the existing continue,” but it does not require the same exclusion gates as the main slot aggregation. That leaves room for leftover conditions to include rows that the main coverage path deliberately filtered out, such as filtered models or other skipped transcript classes.
- **Medium [UNVERIFIED]**: Slice 3 assumes a single `launchDefinitionId` for Match Pair Counts navigation, but the same cell can have multiple `contributingDefinitionIds`. The artifact never defines which definition should win in that case, so multi-definition cells can route to the wrong start page or a nondeterministic one.

## Residual Risks

- The plan still depends on existing schema nullability, resolver filtering order, and route-state shape matching the artifact’s assumptions. If any of those differ, the new counts or navigation can be wrong even if the tasks are implemented exactly as written.
- The smoke test remains brittle because it names specific production cells and ratio expectations. If production data shifts, the test may fail for reasons unrelated to the feature itself.
- The `PAIRED_BATCH_TOPUP` flow may still need downstream handling beyond the named consumers if any other UI, reporting, or analytics code branches on launch mode.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: R1 findings addressed: HIGH smoke test execution path - now lists 3 alternatives (MCP, curl, Apollo Sandbox) with the MCP path as preferred. MED null sampleIndex - slice 1 task 1.2 now requires skipping when scenarioId OR sampleIndex is null. MED leftover exclusion gates - slice 1 task 1.2 now requires same gates (null checks, modelIds filter, soft-delete, aggregate exclusion) on the leftover path. MED multi-definition routing - slice 3 task 3.3 now references the DefinitionId-to-launch rule explicitly with deterministic alphabetical-by-id tie-break for the .definitionIds[0] choice.

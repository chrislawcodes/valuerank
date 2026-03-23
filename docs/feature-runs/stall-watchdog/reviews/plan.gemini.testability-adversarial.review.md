---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/feature-runs/stall-watchdog/plan.md"
artifact_sha256: "3e80be95fdaa13bb3a8ac657961ba293c58353bd9d6e2889fff1b106899267c7"
repo_root: "."
git_head_sha: "c16754b277e7f93f31eb63486dc5be9dc6320105"
git_base_ref: "origin/main"
git_base_sha: "1bc92c5502d64397cd53f28fed52f4f58ff07934"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "Status transition sites enumerated explicitly in plan. First-probe stall fixed via run.startedAt. FR-012 dropped test case noted: brief false positive expected on first tick after resume, clears on next. Time-based logic: tests should mock Date.now(). Job name coupling acknowledged as implementation gotcha."
raw_output_path: "docs/feature-runs/stall-watchdog/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan testability-adversarial

## Findings

### 1. High-Severity Performance Flaw in Stall Detection

The proposed implementation of `detectAndUpdateStalledRuns` in `recovery.ts` creates a classic `N+1` query problem. It iterates through all `RUNNING` runs and, for each one, executes two additional database queries (`getModelsWithPendingJobs` and `getLastSuccessfulCompletionByModel`). If 100 runs are active, this will result in 201 database queries per scheduler tick, which is inefficient and will not scale.

**Recommendation:** Refactor the logic to use bulk queries. The implementation should fetch pending jobs and recent successful probes for all `RUNNING` runs in just two queries. The results can then be processed and grouped by `runId` in memory. This avoids iterating and querying per run.

### 2. Lack of Testability in Core Logic

The plan presents logic that is difficult or impossible to test efficiently and deterministically.

*   **Hardcoded Threshold:** `STALL_THRESHOLD_MS` is a hardcoded constant of 3 minutes. This makes unit and integration tests unfeasibly slow.
*   **Reliance on Real Time:** `detectStalledModels` implicitly relies on `Date.now()`. This makes outcomes non-deterministic and dependent on the execution time of the test itself.

**Recommendation:** Both the stall threshold and the concept of "now" must be injectable into the `detectStalledModels` function. This allows tests to provide a fixed threshold (e.g., `0ms`) and a mocked `now` timestamp to validate the logic against various scenarios without waiting.

```typescript
// Proposed signature for testability
detectStalledModels(
  runId: string,
  runStartedAt: Date,
  options: { now: Date; stallThresholdMs: number }
): Promise<string[]>;
```

### 3. Incorrect Default for `runStartedAt`

In `detectAndUpdateStalledRuns`, the line `const stalled = await detectStalledModels(run.id, run.startedAt ?? new Date());` is problematic. If `run.startedAt` is ever `null` for a running job (which would indicate a data integrity problem), it defaults to the current time. This masks the underlying issue and guarantees that the run will never be flagged as stalled, as the start time will always be recent.

**Recommendation:** If `run.startedAt` is null, the system should log a severe error and skip the run for stall detection. The code should not silently substitute a value that leads to incorrect behavior. The database schema should also be enforced to make `startedAt` non-nullable for the `Run` model.

### 4. Incorrect Decorators in Database Schema

The plan specifies adding the `stalledModels` field with decorators that appear to be erroneously copied from another field:
`stalledModels String[] @cloud/apps/api/src/mcp/tools/set-default-llm-model.ts([]) @cloud/apps/web/src/components/analysis/ScenarioHeatmap.tsx("stalled_models")`

The referenced files (`set-default-llm-model.ts` and `ScenarioHeatmap.tsx`) have no logical connection to this new field. While this may not cause a functional error (depending on how the project's tooling interprets these annotations), it is incorrect, confusing, and points to a lack of diligence in the planning stage.

**Recommendation:** Remove the incorrect decorators. The field definition should be `stalledModels String[] @default([]) @map("stalled_models")`.

## Residual Risks

### 1. Incomplete Stall Detection Logic

The current detection logic is based on two conditions: a model has pending jobs, and it has not had a successful completion recently. This fails to cover a potential failure mode: a model may finish a job, but the subsequent job in the sequence is never created due to an error or bug. In this case, the model would have no pending jobs and would not be considered "stalled"; the system would incorrectly assume it has finished its work. This represents a gap in the assumption that "not finished" implies "has pending jobs."

### 2. High Risk of Incomplete Implementation

The plan correctly identifies that `stalledModels` must be cleared on every status transition to a non-`RUNNING` state. However, it relies entirely on the developer to manually `grep` the codebase and find every location where this occurs. This is a highly error-prone manual process. Missing even one code path will lead to persistent, incorrect `stalledModels` data on runs that are paused, completed, or failed. The only robust mitigation is a comprehensive test suite that covers every possible run status transition.

### 3. Understated Impact of Dropped Requirement (FR-012)

The decision to drop the grace period for resumed runs is presented as a "UX nuisance." However, if the "log+alert-only feature" sends notifications to an on-call system like PagerDuty or a high-traffic Slack channel, this brief false positive upon every resume action will quickly become a significant source of alert fatigue and user frustration, undermining the tool's reliability.

## Token Stats

- total_input=6761
- total_output=1103
- total_tokens=22639
- `gemini-2.5-pro`: input=6761, output=1103, total=22639

## Resolution
- status: accepted
- note: Status transition sites enumerated explicitly in plan. First-probe stall fixed via run.startedAt. FR-012 dropped test case noted: brief false positive expected on first tick after resume, clears on next. Time-based logic: tests should mock Date.now(). Job name coupling acknowledged as implementation gotcha.

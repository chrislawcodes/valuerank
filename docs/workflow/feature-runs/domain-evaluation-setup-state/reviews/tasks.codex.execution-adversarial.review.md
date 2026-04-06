---
reviewer: "codex"
lens: "execution-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/domain-evaluation-setup-state/tasks.md"
artifact_sha256: "a2bdf471521fceb1c0c25bbc3aa8ea4759a37ee93f9a0f84ebfd07420d28a9ed"
repo_root: "."
git_head_sha: "97662ecffedb936831ed31b60c6d66186679077d"
git_base_ref: "origin/claude/parallel-reviews-validated-v2"
git_base_sha: "97662ecffedb936831ed31b60c6d66186679077d"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Resolved by tying launch-failure snapshots to the active launch record, splitting multi-provider budget reporting into provider-level details plus totals, standardizing freshness handling through backend verdicts and shared constants, and keeping live rows limited to batches that are still actively moving."
raw_output_path: "docs/workflow/feature-runs/domain-evaluation-setup-state/reviews/tasks.codex.execution-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks execution-adversarial

## Findings

1. [UNVERIFIED][MEDIUM] The persisted `launchFailure` state is not given a clear read path or invalidation rule. Slice 2 stores failure snapshots under the launch attempt, but slices 1, 3, and 4 only describe live-status and setup queries, not how the dashboard rehydrates that failure after refresh or clears it after a later successful retry. That can leave stale failure banners or a permanently disabled launch control after the user retries.

2. [MEDIUM] The budget contract is ambiguous in a way that can mislead both UI logic and operator interpretation. The tasks say `remainingBudgetUsd` should be treated as a per-provider signal, but the failure payload only exposes `totalRequiredBudgetUsd` and `totalRemainingBudgetUsd`. With multiple providers, that makes it easy to report the wrong shortfall or hide which provider is actually blocking launch.

3. [UNVERIFIED][MEDIUM] The freshness and recovery rules are still under-specified at the transition boundaries. The plan says to use the same 10-minute rule everywhere, but it does not define exact boundary behavior at 10:00, how clock skew is handled, or how a stale/missing snapshot becomes fresh again. That leaves room for backend and frontend to disagree on whether Launch should re-enable during recovery.

## Residual Risks

- The plan relies heavily on polling to reconcile live state, terminal state, and launch retries. If polling is delayed, paused, or loses the terminal snapshot update, the dashboard can stay in an intermediate state longer than intended.

- Several slices modify `DomainTrialsDashboard.tsx` and related setup/live components at the same time. Even if each slice is individually committable, the integration order is likely to matter, and merge friction may hide regressions until the dashboard-level tests run.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Resolved by tying launch-failure snapshots to the active launch record, splitting multi-provider budget reporting into provider-level details plus totals, standardizing freshness handling through backend verdicts and shared constants, and keeping live rows limited to batches that are still actively moving.

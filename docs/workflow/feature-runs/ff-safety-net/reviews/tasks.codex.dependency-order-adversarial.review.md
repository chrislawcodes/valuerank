---
reviewer: "codex"
lens: "dependency-order-adversarial"
stage: "tasks"
artifact_path: "docs/workflow/feature-runs/ff-safety-net/tasks.md"
artifact_sha256: "c263def1d49bff82ef6af78464c6cdede19479f75d0f092fae66fad031b34b74"
repo_root: "."
git_head_sha: "c6ec7b7929903a6a9a4c8fea6819b6aa2f1cba03"
git_base_ref: "origin/main"
git_base_sha: "c07a4283ecdebffa57e8a2cccfa08c23e0f76a36"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "Findings addressed in spec/plan/tasks updates (see plan.md Review Reconciliation section for cross-stage rollup)."
raw_output_path: "docs/workflow/feature-runs/ff-safety-net/reviews/tasks.codex.dependency-order-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: tasks dependency-order-adversarial

## Findings

- [UNVERIFIED] Medium: T1.6 is order-fragile because `_STATE_MUTATING_COMMANDS` is computed at import time from `build_parser()`. If that line lands before all `command_*` handlers and subparser wiring are fully defined, the registry can be incomplete or the import can fail. The task should require either lazy evaluation or an explicit placement guarantee after parser construction is complete.
- [UNVERIFIED] Medium: T2.4 does not fully prove the GC runs under the lock. It only asserts that delete syscalls happen after `with_locked_state` is entered, but it does not cover the file-discovery phase. If globbing happens before the lock, the race the task is trying to prevent is still present.
- [UNVERIFIED] Medium: T1.7’s “every subparser” invariant is snapshot-based and only inspects `build_parser()` once. That means it will miss commands that are added, wrapped, or mutated after the parser snapshot is taken. The safety net is only complete if parser construction is strictly frozen at that point, which the tasks do not state.

## Residual Risks

- The plan still assumes the existing parser and review-file naming conventions line up with the new helpers, but that is not verified here.
- The completeness veto can still behave badly if `stage_state["unresolved_concerns"]` is stale or inconsistently maintained, because the new logic trusts that list as the source of truth.
- The new fail-open warning in T3.4 reduces silent failure, but it still allows a malformed completeness response to fall back to majority voting.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: Findings addressed in spec/plan/tasks updates (see plan.md Review Reconciliation section for cross-stage rollup).

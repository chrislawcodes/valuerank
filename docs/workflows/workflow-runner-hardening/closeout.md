# Closeout: workflow-runner-hardening

## Summary

Three correctness fixes shipped to `run_feature_workflow.py`:

1. **`DEFAULT_CODEX_MODEL` constant** — Replaced hardcoded `"gpt-5.4-mini"` string in `required_reviews()` with a named constant. Constant initially introduced as `"codex-5.4-mini"` (unsupported by the Codex CLI) and corrected to `"gpt-5.4-mini"` before the diff checkpoint.

2. **Base-ref reset in `command_checkpoint`** — Added `args.base_ref = None` immediately after `update_workflow_state(...)` in all three checkpoint-progress reset branches (index overflow, markers-sha mismatch, dangling SHA). This ensures `preferred_diff_base_ref` receives `None` after a reset and falls through to the recorded branch base rather than reusing a stale commit SHA.

3. **Closeout stage repair in `command_repair`** — Added a closeout repair block after the `"diff"` iteration, guarded by `if not blocked_reason:`. Handles: `unhealthy-manifest` + repairable → repair + re-verify; `unhealthy-manifest` + not repairable → block; `not-checkpointed` / `missing-artifact` / `stub-artifact` → skip silently.

## Tests Added

13 new tests across 3 classes in `test_run_feature_workflow_repair.py`:

- `DefaultCodexModelTests` (2 tests)
- `BaseRefResetTests` (4 tests — sentinel-exception approach to capture `args.base_ref` before subprocess calls)
- `RepairCloseoutTests` (6 tests — happy path, failure, not-repairable, partial-success, blocked guard)

All 53 tests pass (1 pre-existing unrelated failure in `test_command_deliver_dry_run_does_not_mutate_delivery_state`).

## Commits

- Implementation: 3 stories + tests
- Fix: corrected `DEFAULT_CODEX_MODEL` to `"gpt-5.4-mini"`

## Review Reconciliation

All 12 reviews (3 spec + 3 plan + 3 tasks + 3 diff) accepted. All adversarial findings either rejected with documented rationale or accepted and addressed in the implementation.

# Tasks: workflow-runner-hardening

## Story 1: Closeout stage repair in `command_repair`

- [ ] **T1.1** Open `docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py`; locate `command_repair`; find the section after the `"diff"` iteration block and before the `if blocked_reason:` check.
- [ ] **T1.2** Insert the closeout repair block as specified in Patch 3 of the plan (guarded by `if not blocked_reason:` to avoid running after an earlier stage already failed):
  ```python
  if not blocked_reason:
      # Repair closeout if manifest is stale (only when it exists and is unhealthy)
      closeout_state = stages["closeout"]
      closeout_drift = stage_drift_class("closeout", closeout_state)
      if closeout_drift == "unhealthy-manifest" and stage_repairable(args.slug, "closeout", closeout_state):
          print("- closeout: repairing unhealthy-manifest")
          result = command_checkpoint(repair_checkpoint_args(args.slug, "closeout", closeout_state))
          if result != 0:
              blocked_reason = "closeout repair failed"
          else:
              refreshed = stage_manifest_state(args.slug, "closeout")
              stages["closeout"] = refreshed
              if not refreshed["healthy"]:
                  blocked_reason = f"closeout remains unhealthy: {trim_detail(str(refreshed.get('detail', '')))}"
              else:
                  repaired.append("closeout")
      elif closeout_drift == "unhealthy-manifest":
          # unhealthy-manifest but not repairable — block so repair doesn't silently succeed
          blocked_reason = "closeout is unhealthy but not repairable"
      elif closeout_drift not in {"not-checkpointed", "missing-artifact", "stub-artifact"}:
          print(f"- closeout: {stage_status_label(args.slug, 'closeout', closeout_state)}")
  ```
- [ ] **T1.3** Add `RepairCloseoutTests` class to `docs/operations/codex-skills/feature-workflow/tests/test_run_feature_workflow_repair.py`:
  - `test_repair_skips_closeout_when_not_checkpointed` — drift=`not-checkpointed`; no block; `command_checkpoint` not called for closeout
  - `test_repair_fixes_stale_closeout` — drift=`unhealthy-manifest`, repairable=True; `command_checkpoint` called; closeout added to repaired list
  - `test_repair_blocks_on_closeout_failure` — drift=`unhealthy-manifest`, repairable=True; `command_checkpoint` returns 1; `command_repair` returns 1 with blocked reason
  - `test_repair_blocks_when_closeout_unhealthy_not_repairable` — drift=`unhealthy-manifest`, `stage_repairable` returns False; `command_checkpoint` not called; returns 1 with "not repairable" in blocked reason

## Story 2: Base-ref reset in `command_checkpoint`

- [ ] **T2.1** Locate the three reset branches in `command_checkpoint` inside `if args.stage == "diff":` then `if marker_count > 0 and not args.base_ref:` (approximately lines 1058-1087).
- [ ] **T2.2** In each of the three reset branches (index overflow, markers-sha mismatch, dangling SHA), add `args.base_ref = None` immediately after the `update_workflow_state(...)` call.
- [ ] **T2.3** Add `BaseRefResetTests` class to the test file:
  - `test_index_overflow_clears_base_ref` — index=2, marker_count=1 → `preferred_diff_base_ref` called with `None`
  - `test_markers_sha_mismatch_clears_base_ref` — index=1, stored_sha not equal current_sha → same
  - `test_dangling_sha_clears_base_ref` — valid index/sha but `_sha_is_valid_ancestor` returns False → same
  - `test_reset_uses_recorded_base_not_stale_head` — mock `diff_review_budget_state` to return `head_mismatch=True, suggested_base_ref="deadbeef111"` AND `recorded_base_ref="origin/main"`; trigger a reset; assert result is `"origin/main"` not `"deadbeef111"`

## Story 3: `DEFAULT_CODEX_MODEL` constant

- [ ] **T3.1** After line 57 (`DEFAULT_GEMINI_MODEL = "gemini-2.5-pro"`), add `DEFAULT_CODEX_MODEL = "codex-5.4-mini"`.
- [ ] **T3.2** In `required_reviews()`, replace `"model": "gpt-5.4-mini"` with `"model": DEFAULT_CODEX_MODEL`.
- [ ] **T3.3** Grep the entire `run_feature_workflow.py` for other hardcoded model name strings (patterns: `gpt-`, `claude-`, `gemini-`, `mistral-`, or any other model-name prefix) outside of `DEFAULT_*` constant definitions and inline comments. Replace any found with appropriate constants.
- [ ] **T3.4** Add `DefaultCodexModelTests` class to the test file:
  - `test_default_codex_model_constant_exists` — `MODULE.DEFAULT_CODEX_MODEL == "codex-5.4-mini"`
  - `test_required_reviews_codex_entry_uses_constant` — `required_reviews("diff", ...)` returns codex entry where `model == MODULE.DEFAULT_CODEX_MODEL`

## Quality

- [ ] Run `python3 -m pytest docs/operations/codex-skills/feature-workflow/tests/ -v --tb=short` — all existing tests pass, all new tests pass
- [ ] Confirm no regressions to existing `test_run_feature_workflow_repair.py` test classes

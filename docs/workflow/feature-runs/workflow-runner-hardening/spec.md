# Spec: workflow-runner-hardening

## Context

Post-implementation review of `workflow-two-mode-implementation` (commit `62666fc`) identified four correctness bugs in `run_factory.py`. These are targeted fixes — no scope expansion.

## P0 Stories

### 1. `command_repair` skips closeout stage

**Problem:** `command_repair` iterates `["spec", "plan", "tasks", "diff"]`. `recommended_next_action` can return `"repair_closeout_checkpoint"` when the closeout stage is `unhealthy-manifest`, but `command_repair` silently skips closeout, leaving the user pointed at a repair action the tool cannot execute.

**Fix:** Add `"closeout"` to the repair loop after `"diff"`. Closeout is only repairable when its checkpoint manifest is stale (artifact hash changed but reviews are still reconciled). Treat `"missing-artifact"` and `"stub-artifact"` in closeout as skippable (not a block) since closeout may simply not have been written yet — only repair when the manifest exists but is unhealthy.

**Acceptance:** `command_repair` on a workflow with a stale closeout checkpoint (`unhealthy-manifest` drift) successfully re-runs the closeout checkpoint. `command_repair` on a workflow where closeout has not been written yet (`missing-artifact` or `stub-artifact`) prints closeout status but does not block or error — this is the pre-existing path since `recommended_next_action` returns `"closeout"` (not `"repair_closeout_checkpoint"`) when the manifest doesn't exist.

**Clarification on scope:** `recommended_next_action` returns `"repair_closeout_checkpoint"` only when the closeout manifest EXISTS but is unhealthy (stale reviews). It returns `"closeout"` when the artifact/manifest doesn't exist. Therefore only `unhealthy-manifest` needs repair handling in `command_repair`.

---

### 2. Base-ref not reset after `[CHECKPOINT]` progress reset

**Problem:** In `command_checkpoint` (diff stage), three reset paths (index overflow, markers-sha mismatch, dangling last-head SHA) call `_default_checkpoint_progress()` to clear state but do not set `args.base_ref = None`. The subsequent call to `preferred_diff_base_ref(args.slug, args.base_ref)` may then return a stale `suggested_base_ref` from the previous diff's metadata (e.g., a `recorded_head_sha` from a now-dangling commit after a rebase), causing the next diff to be generated against the wrong base.

**Fix:** In all three reset paths, explicitly set `args.base_ref = None` immediately after calling `update_workflow_state`. This ensures `preferred_diff_base_ref(args.slug, None)` falls through to the `recorded_base_ref` from the diff metadata (i.e., branch base), not a stale head SHA.

**Acceptance:** The three reset branches (index overflow, markers-sha mismatch, dangling SHA) must set `args.base_ref = None` before calling `preferred_diff_base_ref`. The test should verify behavioral correctness, not just implementation state: when a reset is triggered and `preferred_diff_base_ref` is called with `None`, the function returns the `recorded_base_ref` from diff metadata (i.e., the branch base), not a stale `recorded_head_sha`. Verify by mocking `diff_review_budget_state` to return a state where `head_mismatch=True` (which would return `recorded_head_sha` as `suggested_base_ref`) and confirming that after reset, the correct branch-base ref is returned, not the stale head SHA.

**Note on user-supplied base-ref:** The fix only applies inside `if marker_count > 0 and not args.base_ref:` — user-supplied base refs are already excluded by the outer guard. No change needed for that case.

---

### 3. Hardcoded `"gpt-5.4-mini"` in `required_reviews`

**Problem:** In `required_reviews()`, the codex reviewer's model is hardcoded as the string `"gpt-5.4-mini"`. This is wrong in two ways: (a) the correct model name per the project spec is `codex-5.4-mini`, not `gpt-5.4-mini`; (b) it is not a named constant, making future model changes error-prone.

**Fix:**
1. Add `DEFAULT_CODEX_MODEL = "codex-5.4-mini"` near `DEFAULT_GEMINI_MODEL` at the top of the file (around line 57).
2. Replace the hardcoded `"gpt-5.4-mini"` in `required_reviews` with `DEFAULT_CODEX_MODEL`.
3. Search the entire file for any other hardcoded model name strings matching `gpt-`, `claude-`, or other model-name patterns outside of `DEFAULT_*` constants and comments. Replace any found with the appropriate constant.

**Acceptance:** `required_reviews` returns `model: "codex-5.4-mini"` for the codex reviewer. The constant appears once at the top of the file.

---

## Out of Scope

- File locking for `state.json` (complex, separate initiative)
- Separate `handoff_state` key to decouple handoffs from real escalations (requires protocol change across CLAUDE.md + CODEX-ORCHESTRATOR.md)
- `run_checkpoint_fallback` context-drift detection

## Files to Modify

- `docs/operations/codex-skills/feature-factory/scripts/run_factory.py`
  - Add `DEFAULT_CODEX_MODEL` constant near line 57
  - Replace `"gpt-5.4-mini"` with `DEFAULT_CODEX_MODEL` in `required_reviews()`
  - Set `args.base_ref = None` in the three reset branches of `command_checkpoint` (lines ~1058, ~1072, ~1086)
  - Add `"closeout"` handling in `command_repair` repair loop after `"diff"`

- `docs/operations/codex-skills/feature-factory/tests/test_run_factory_repair.py`
  - Add tests for the three fixes above

## Do NOT Touch

- `docs/operations/codex-skills/feature-factory/scripts/workflow_state.py`
- `docs/operations/codex-skills/review-lens/scripts/*.py`
- Any file not listed above

## Verification

```bash
cd /Users/chrislaw/valuerank
python3 -m pytest docs/operations/codex-skills/feature-factory/tests/ -v --tb=short
```

All existing tests must pass. New tests must cover the three fixed behaviors.

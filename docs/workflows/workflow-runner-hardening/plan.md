# Plan: workflow-runner-hardening

## Architecture

Three self-contained patches to `run_feature_workflow.py`, plus corresponding tests. Each patch is independent and can be reviewed/reverted separately.

---

## Patch 1 — `DEFAULT_CODEX_MODEL` constant

**File:** `docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py`

**Change:** After line 57 (`DEFAULT_GEMINI_MODEL = "gemini-2.5-pro"`), add:
```python
DEFAULT_CODEX_MODEL = "codex-5.4-mini"
```

**Change:** In `required_reviews()`, replace:
```python
"model": "gpt-5.4-mini",
```
with:
```python
"model": DEFAULT_CODEX_MODEL,
```

**Additional:** Grep the entire file for other hardcoded model strings (e.g., `gpt-`, `claude-`, `gemini-`, `mistral-`, or any other model-name prefix) outside of `DEFAULT_*` constants and inline comments; replace with constants as appropriate. Cast a wide net — don't limit to just the two example prefixes.

---

## Patch 2 — Base-ref reset in `command_checkpoint`

**File:** `docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py`

**Location:** Inside `if args.stage == "diff":` → `if marker_count > 0 and not args.base_ref:`

The three reset branches — in all three, add `args.base_ref = None` immediately after calling `update_workflow_state(...)`:

1. **Index overflow** (around line 1058–1064)
2. **Markers-sha mismatch** (around line 1065–1073)
3. **Dangling SHA** (around line 1074–1087)

After these changes the call `args.base_ref = preferred_diff_base_ref(args.slug, args.base_ref)` receives `None` in all reset scenarios, causing `preferred_diff_base_ref` to fall through to the `recorded_base_ref` from diff metadata (branch base) rather than a stale `recorded_head_sha`.

---

## Patch 3 — Closeout stage in `command_repair`

**File:** `docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py`

**Location:** In `command_repair`, after the `"diff"` iteration and before the `if blocked_reason:` check.

Add a closeout repair block (guarded by `if not blocked_reason:` to avoid running after an earlier stage has already failed):
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

Rationale: `recommended_next_action` returns `"repair_closeout_checkpoint"` only when the manifest exists but is unhealthy (`unhealthy-manifest`). It returns `"closeout"` when the artifact/manifest doesn't exist. So `missing-artifact`/`stub-artifact`/`not-checkpointed` are silently skipped — they are not reachable via the repair flow.

---

## Tests

**File:** `docs/operations/codex-skills/feature-workflow/tests/test_run_feature_workflow_repair.py`

Add three new test classes after the existing ones.

### `DefaultCodexModelTests`

- `test_default_codex_model_constant_exists` — `MODULE.DEFAULT_CODEX_MODEL == "codex-5.4-mini"`
- `test_required_reviews_codex_entry_uses_constant` — `required_reviews("diff", ...)` returns codex entry with `model == MODULE.DEFAULT_CODEX_MODEL`

### `BaseRefResetTests`

Use `patch.object(MODULE, ...)` to control `parse_checkpoint_markers`, `checkpoint_progress_state`, `_sha_is_valid_ancestor`, `diff_review_budget_state`, `update_workflow_state`, `preferred_diff_base_ref`.

- `test_index_overflow_clears_base_ref` — index=2, marker_count=1 → `preferred_diff_base_ref` called with `None`
- `test_markers_sha_mismatch_clears_base_ref` — index=1, stored_sha≠current_sha → same
- `test_dangling_sha_clears_base_ref` — valid index/sha but `_sha_is_valid_ancestor` returns False → same
- `test_reset_uses_recorded_base_not_stale_head` — mock `diff_review_budget_state` to return `head_mismatch=True, suggested_base_ref="deadbeef111"` AND `recorded_base_ref="origin/main"`; trigger a reset; assert resulting base ref is `"origin/main"` not `"deadbeef111"`

### `RepairCloseoutTests`

- `test_repair_skips_closeout_when_not_checkpointed` — closeout drift=`not-checkpointed`; repair runs; no block; `command_checkpoint` not called for closeout
- `test_repair_fixes_stale_closeout` — closeout drift=`unhealthy-manifest`, repairable=True; `command_checkpoint` called with `stage="closeout"`; closeout added to repaired list
- `test_repair_blocks_on_closeout_failure` — stale closeout; `command_checkpoint` returns 1; `command_repair` returns 1 with blocked reason
- `test_repair_blocks_when_closeout_unhealthy_not_repairable` — closeout drift=`unhealthy-manifest`, `stage_repairable` returns False; `command_checkpoint` not called; `command_repair` returns 1 with blocked reason containing "not repairable"

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: F1 (closeout under-specified): ACCEPTED — added clarification that recommended_next_action returns repair_closeout_checkpoint only when manifest exists but is unhealthy (not when missing-artifact). Scope is correct. F2 (base-ref acceptance too weak): ACCEPTED — updated acceptance criterion to test behavior (correct branch base selected) not implementation state. F3 (model name compatibility): ACCEPTED — added instruction to scan whole file for hardcoded model strings.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: F1 (user base-ref nullified): REJECTED — the fix is inside the guard 'if marker_count > 0 and not args.base_ref:', so user-supplied base refs are already excluded. The spec now includes an explicit note on this. F2 (incomplete repair for closeout): ACCEPTED — spec now clarifies only unhealthy-manifest is repairable; added reasoning for why missing-artifact is not in scope. F3 (brittle acceptance): ACCEPTED — acceptance criterion updated to test behavior not implementation. F4 (other hardcoded strings): ACCEPTED — added step to scan file for all hardcoded model strings.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: F1 (closeout loop trap): REJECTED — no loop possible. recommended_next_action returns 'closeout' when artifact is missing, and 'repair_closeout_checkpoint' only when manifest exists but is unhealthy. The repair command correctly skips missing-artifact since that code path is unreachable via repair_closeout_checkpoint. Spec now documents this reasoning. F2 (base-ref assumption): ACCEPTED — added behavioral test requirement for the base-ref verification. F3 (narrow model fix): ACCEPTED — added scan step for other hardcoded model strings.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: F1 (unhealthy-manifest not repairable): ACCEPTED — when closeout_drift==unhealthy-manifest but stage_repairable returns False, plan falls through to elif which just prints, never setting blocked_reason; repair returns success with broken closeout. Fix: add elif closeout_drift == unhealthy-manifest branch setting blocked_reason. F2 (args mutation): REJECTED — consistent with existing codebase pattern, bounded by function scope. F3 (grep sweep): REJECTED — implementer guidance, acceptable risk for targeted fix.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: F1 (special-cased closeout architectural smell): REJECTED — targeted fix scope; refactoring the repair loop abstraction is out of scope per spec. F2 (fragile blacklist): ACCEPTED — subsumes Codex F1 fix; the unhealthy-manifest-not-repairable case now explicitly sets blocked_reason, making the remaining elif semantically correct for the status-print cases. F3 (implicit dependency on preferred_diff_base_ref): REJECTED — tested and documented in plan rationale. F4 (narrow grep pattern): ACCEPTED — broaden scan instruction to include gemini-, mistral-, and other model-name patterns.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: F1 (no automated guardrail for hardcoded model strings): REJECTED — adding regex-based tests scanning source for model strings is beyond scope; the constant + test_default_codex_model_constant_exists is sufficient. F2 (Patch 3 assumption not tested): REJECTED — test_repair_skips_closeout_when_not_checkpointed already covers not-checkpointed; stub-artifact/missing-artifact follow same skip logic. F3 (Patch 2 base_ref already None edge): REJECTED — trivial; the outer guard 'if marker_count > 0 and not args.base_ref' means base_ref cannot be None when entering reset branches without user-supplied value.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: F1 (closeout runs after blocked_reason set): ACCEPTED — add 'if not blocked_reason:' guard around closeout repair block for consistency with existing repair flow pattern. F2 (missing-artifact/stub-artifact silent skip): REJECTED — unreachable via repair flow per spec rationale. F3 (grep underspecified): REJECTED — instruction already updated to cast a wide net. F4 (downstream consumers of args.base_ref): REJECTED — None is correct; preferred_diff_base_ref handles it.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: F1 (repaired appended optimistically): REJECTED — wrong reading; repaired.append is inside 'else' of 'if not refreshed[healthy]' so only fires when healthy. F2 (grep only run_feature_workflow.py): REJECTED — spec explicitly limits scope to this file. F3 (indirect base-ref test): REJECTED — behavioral correctness test is appropriate; direct call-with-None tests also exist.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: F1 (stage_manifest_state might fail): REJECTED — pre-existing concern, out of scope for this patch. F2 (unknown drift falls through): REJECTED — falls to elif-print which correctly surfaces the state. F3 (grep patterns incomplete): REJECTED — instruction already broadened to 'any other model-name prefix'. F4 (recorded_base_ref might be invalid): REJECTED — handled by preferred_diff_base_ref; not introduced by this patch.

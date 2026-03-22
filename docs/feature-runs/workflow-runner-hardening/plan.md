# Plan: workflow-runner-hardening

## Architecture

Three self-contained patches to `run_factory.py`, plus corresponding tests. Each patch is independent and can be reviewed/reverted separately.

---

## Patch 1 — `DEFAULT_CODEX_MODEL` constant

**File:** `docs/operations/codex-skills/feature-factory/scripts/run_factory.py`

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

**File:** `docs/operations/codex-skills/feature-factory/scripts/run_factory.py`

**Location:** Inside `if args.stage == "diff":` → `if marker_count > 0 and not args.base_ref:`

The three reset branches — in all three, add `args.base_ref = None` immediately after calling `update_workflow_state(...)`:

1. **Index overflow** (around line 1058–1064)
2. **Markers-sha mismatch** (around line 1065–1073)
3. **Dangling SHA** (around line 1074–1087)

After these changes the call `args.base_ref = preferred_diff_base_ref(args.slug, args.base_ref)` receives `None` in all reset scenarios, causing `preferred_diff_base_ref` to fall through to the `recorded_base_ref` from diff metadata (branch base) rather than a stale `recorded_head_sha`.

---

## Patch 3 — Closeout stage in `command_repair`

**File:** `docs/operations/codex-skills/feature-factory/scripts/run_factory.py`

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

**File:** `docs/operations/codex-skills/feature-factory/tests/test_run_factory_repair.py`

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
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: F1 (update_workflow_state reads args.base_ref): REJECTED — update_workflow_state takes slug and lambda, doesn't accept or read args.base_ref. F2 (stages[closeout] might not exist): REJECTED — stages is populated by {stage: stage_manifest_state for stage in CHECKPOINT_STAGES} and CHECKPOINT_STAGES includes closeout, so always present. F3 (grep instruction too broad): REJECTED — already addressed; instruction says be conservative and not modify prompt text. F4 (partial-success test missing): ACCEPTED — same as gemini testability F2; test added.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: F1 (brittle not-reachable assumption): REJECTED — plan documents the reasoning; scope doesn't include changing recommended_next_action behavior. F2 (incomplete hardening for model constants): REJECTED — already rejected in prior round; automated linting is out of scope. F3 (mutation timing risk): REJECTED — update_workflow_state raises on failure, cannot silently continue.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: F1 (stage_repairable undefined in plan): REJECTED — stage_repairable is an existing function; plan correctly documents its usage. F2 (missing partial-success test): ACCEPTED — added test_repair_blocks_when_checkpoint_succeeds_but_closeout_remains_unhealthy to cover checkpoint returns 0 but manifest still unhealthy. F3 (unverified fallback for recorded_base_ref): REJECTED — documented in plan; preferred_diff_base_ref behavior tested.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: F1 (T3.3 under-specified): REJECTED — repeated; already addressed. F2 (no test that blocked_reason suppresses closeout): ACCEPTED — test added. F3 (T2 only downstream effect): REJECTED — direct None-capture tests already verify this. F4 (stage_manifest_state call not verified): REJECTED — functional behavior verified.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: F1 (no test for grep verification): REJECTED — automated grep verification out of scope. F2 (no multi-stage repair integration test): ACCEPTED — added test_repair_skips_closeout_when_earlier_stage_blocked to verify blocked_reason guard. F3 (complex elif logic): REJECTED — structure is clear; implicit condition documented. F4 (ambiguous base-ref test): REJECTED — test clearly documents intent.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: F1 (unknown drift falls through): REJECTED — already rejected; elif-print correctly surfaces unknown states. F2 (missing test for if-not-blocked_reason guard): ACCEPTED — same as dep F2; test added. F3 (no negative test for non-reset happy path): REJECTED — out of scope for this fix. F4 (manual grep): REJECTED — repeated. F5 (no mypy/lint gate): REJECTED — out of scope.
- review: reviews/diff.codex.correctness-adversarial.review.md | status: accepted | note: F1 (codex: base-ref cleared unconditionally): REJECTED — already guarded by 'if marker_count > 0 and not args.base_ref:'; user-supplied base refs are excluded. F2 (codex: stale closeout_state after earlier-stage repair): REJECTED — out of scope; repair is idempotent, subsequent run handles any newly stale closeout. R1 (gemini regression: multiple repair runs needed): REJECTED — same as F2; documented residual limitation, not a regression. Q1 (gemini quality: other hardcoded model strings): REJECTED — grepped entire file; only the two DEFAULT_* constants remain.
- review: reviews/diff.gemini.regression-adversarial.review.md | status: accepted | note: F1 (codex: base-ref cleared unconditionally): REJECTED — already guarded by 'if marker_count > 0 and not args.base_ref:'; user-supplied base refs are excluded. F2 (codex: stale closeout_state after earlier-stage repair): REJECTED — out of scope; repair is idempotent, subsequent run handles any newly stale closeout. R1 (gemini regression: multiple repair runs needed): REJECTED — same as F2; documented residual limitation, not a regression. Q1 (gemini quality: other hardcoded model strings): REJECTED — grepped entire file; only the two DEFAULT_* constants remain.
- review: reviews/diff.gemini.quality-adversarial.review.md | status: accepted | note: F1 (codex: base-ref cleared unconditionally): REJECTED — already guarded by 'if marker_count > 0 and not args.base_ref:'; user-supplied base refs are excluded. F2 (codex: stale closeout_state after earlier-stage repair): REJECTED — out of scope; repair is idempotent, subsequent run handles any newly stale closeout. R1 (gemini regression: multiple repair runs needed): REJECTED — same as F2; documented residual limitation, not a regression. Q1 (gemini quality: other hardcoded model strings): REJECTED — grepped entire file; only the two DEFAULT_* constants remain.
- review: reviews/closeout.codex.fidelity-adversarial.review.md | status: accepted | note: F1 (codex/gemini: pre-existing test failure): REJECTED — the failing test is test_command_deliver_dry_run_does_not_mutate_delivery_state which fails due to missing real checkpoint manifests on disk; it is unrelated to the 3 patches and predates this work. F2 (codex: silent skip for not-checkpointed/missing-artifact): REJECTED — per plan rationale, these states are not reachable via command_repair; recommended_next_action returns repair_closeout_checkpoint only when manifest exists but is unhealthy. F3 (codex: base-ref claim overstated): REJECTED — the three reset branches plus the sentinel-exception tests fully cover the assignment; the logic is a simple None-assignment before preferred_diff_base_ref, not complex subprocess behavior. F4 (gemini completeness: commit detail): REJECTED — out of scope; commit messages in git log provide full audit trail. F5 (gemini residual: race condition in base-ref reset): REJECTED — update_workflow_state raises on failure; args does not persist between runs; no stale base_ref survives to the next invocation. F6 (gemini residual: opaque re-verify): REJECTED — stage_manifest_state performs a fresh disk read; if not refreshed[healthy] block correctly catches all cases. F7 (gemini residual: model constant drift): REJECTED — acknowledged residual risk; out of scope for this fix.
- review: reviews/closeout.gemini.completeness-adversarial.review.md | status: accepted | note: F1 (codex/gemini: pre-existing test failure): REJECTED — the failing test is test_command_deliver_dry_run_does_not_mutate_delivery_state which fails due to missing real checkpoint manifests on disk; it is unrelated to the 3 patches and predates this work. F2 (codex: silent skip for not-checkpointed/missing-artifact): REJECTED — per plan rationale, these states are not reachable via command_repair; recommended_next_action returns repair_closeout_checkpoint only when manifest exists but is unhealthy. F3 (codex: base-ref claim overstated): REJECTED — the three reset branches plus the sentinel-exception tests fully cover the assignment; the logic is a simple None-assignment before preferred_diff_base_ref, not complex subprocess behavior. F4 (gemini completeness: commit detail): REJECTED — out of scope; commit messages in git log provide full audit trail. F5 (gemini residual: race condition in base-ref reset): REJECTED — update_workflow_state raises on failure; args does not persist between runs; no stale base_ref survives to the next invocation. F6 (gemini residual: opaque re-verify): REJECTED — stage_manifest_state performs a fresh disk read; if not refreshed[healthy] block correctly catches all cases. F7 (gemini residual: model constant drift): REJECTED — acknowledged residual risk; out of scope for this fix.
- review: reviews/closeout.gemini.residual-risk-adversarial.review.md | status: accepted | note: F1 (codex/gemini: pre-existing test failure): REJECTED — the failing test is test_command_deliver_dry_run_does_not_mutate_delivery_state which fails due to missing real checkpoint manifests on disk; it is unrelated to the 3 patches and predates this work. F2 (codex: silent skip for not-checkpointed/missing-artifact): REJECTED — per plan rationale, these states are not reachable via command_repair; recommended_next_action returns repair_closeout_checkpoint only when manifest exists but is unhealthy. F3 (codex: base-ref claim overstated): REJECTED — the three reset branches plus the sentinel-exception tests fully cover the assignment; the logic is a simple None-assignment before preferred_diff_base_ref, not complex subprocess behavior. F4 (gemini completeness: commit detail): REJECTED — out of scope; commit messages in git log provide full audit trail. F5 (gemini residual: race condition in base-ref reset): REJECTED — update_workflow_state raises on failure; args does not persist between runs; no stale base_ref survives to the next invocation. F6 (gemini residual: opaque re-verify): REJECTED — stage_manifest_state performs a fresh disk read; if not refreshed[healthy] block correctly catches all cases. F7 (gemini residual: model constant drift): REJECTED — acknowledged residual risk; out of scope for this fix.

# Plan

## Architecture

Three independent deliverables with no shared state between them. Can be implemented in any order, but documentation items (Slice A, B) should land before the runner change (Slice C) so the guide is accurate when the runner ships.

### Slice A — CODEX-ORCHESTRATOR.md

New file. No existing code changes. The guide is self-contained and references SKILL.md for the phase table.

**Location:** `docs/operations/codex-skills/feature-workflow/CODEX-ORCHESTRATOR.md`

**Sections:**
1. When this guide applies (Codex Orchestrator mode definition)
2. Models — codex-5.4-mini, gemini-2.5-pro; Gemini must be called serially
3. Phase-by-phase command reference (mirrors SKILL.md stage table with concrete commands)
4. Escalation protocol — copied from SKILL.md "Codex Orchestrator: Escalation Protocol" section
5. What Codex must not do without human approval (merge, push, PR creation)
6. Command failure protocol — retry once, then `block`; do not silently continue
7. Handoff back to Claude — run `status --slug`, then `block --slug <slug> --reason "..."`

### Slice B — CLAUDE.md Handoff Section

Edit to `~/.claude/CLAUDE.md`. Two changes:
1. Add "Handing Off to Codex Orchestrator" section with the milestone-triggered handoff steps
2. Update Multi-Agent Roles table to show Claude Orchestrator / Codex Orchestrator modes and reference the guide path

**Key constraint:** CLAUDE.md contains protocol instructions only. Transient workflow state (the block note) lives in `workflow.json` via the `block` command — never in CLAUDE.md.

### Slice C — Runner `[CHECKPOINT]` Support

Changes to `run_feature_workflow.py` and `workflow_state.py`.

**State shape added to `workflow.json`:**
```json
"checkpoint_progress": {
  "index": 0,
  "marker_count": 3,
  "last_diff_head_sha": "abc123..."
}
```

**`workflow_state.py`:** Add `CHECKPOINT_PROGRESS_KEY = "checkpoint_progress"` constant.

**`run_feature_workflow.py`:**

New helper `parse_checkpoint_markers(slug: str) -> tuple[int, str]`:
- Read `tasks.md` for the workflow slug
- Match lines using regex `^\s*([-*]|\d+\.|-\s+\[[ xX]\])\s+.*\[CHECKPOINT\]` — covers unordered, ordered, and checkbox list styles; anchors `[CHECKPOINT]` to list items, not nested content
- Return `(count, markers_sha)` where `markers_sha` is `sha256` of only the matched marker lines joined (NOT full tasks.md) — routine edits to non-checkpoint lines do not reset progress
- Return `(0, "")` if file missing or no markers found

New helper `checkpoint_progress_state(slug: str) -> dict`:
- Read `checkpoint_progress` from workflow state, return defaults if absent
- Defaults: `{"index": 0, "markers_sha": "", "last_diff_head_sha": ""}`
- Normalize any partial/legacy state by filling missing keys with defaults

Updated `command_checkpoint` for `stage == "diff"`:
- Capture current HEAD SHA at diff generation time (before launching reviews) — store as `pending_head_sha`
- Call `parse_checkpoint_markers(slug)` to get `(marker_count, current_markers_sha)`
- Read `checkpoint_progress` from state
- Reset to defaults (warn) if any of:
  - `marker_count` == 0 (no markers present) — use branch base, no state change
  - `index` >= `marker_count` (markers were deleted) — reset progress, use branch base
  - stored `markers_sha` != `current_markers_sha` (marker lines edited) — reset progress, use branch base
- If `index` > 0 and markers_sha matches:
  - validate `last_diff_head_sha` via `git cat-file -t <sha>` (existence) AND `git merge-base --is-ancestor <sha> HEAD` (ancestry)
  - if both pass: use as diff base
  - if either fails (dangling or non-ancestor — e.g., after rebase): warn, reset progress, use branch base
- Trigger for state advance: only after `run_verify_checkpoint` succeeds
- State advance: increment `index`, update `markers_sha`, record `pending_head_sha` (captured at diff generation) as `last_diff_head_sha` via `atomic_json_write`

Updated `command_status`:
- Show `checkpoint_progress` summary when `index` > 0

Updated `command_init`:
- Reset `checkpoint_progress` to defaults when re-initializing an existing workflow

**Regression guarantee:** When `tasks.md` has no matching `[CHECKPOINT]` markers, `marker_count` = 0 throughout. All diff base selection falls through to the existing branch-base path unchanged.

## Risks

- `~/.claude/CLAUDE.md` is outside the repo and not in CI. The handoff section is a documented convention, not an enforced contract. Drift is possible if SKILL.md changes but CLAUDE.md is not updated. Mitigation: the Notes section in SKILL.md already says to keep CLAUDE.md in sync.
- The `[CHECKPOINT]` feature is advisory. If the orchestrator doesn't place markers, the feature provides no value. This is intentional — enforcement is out of scope.
- `repair_checkpoint_args` was missing `fallback=False` — fixed as a prerequisite in this session.

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: High findings accepted and reconciled into spec: CLAUDE.md clarified as protocol-only (state stays in workflow.json), checkpoint_index replaced with checkpoint_progress struct with SHA+marker_count, first-run and fallback cases specified. Mode-selection dispatch deferred — agents self-select via SKILL.md.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Escalation criteria: deferred — already defined in SKILL.md, guide will reference them. Handoff trigger: accepted — changed to milestone/human-initiated, not token-detection. HEAD ambiguity: accepted — spec now specifies git commit SHA. Error handling in guide: accepted — added to guide acceptance criteria. Concurrent state and stale lock: deferred — pre-existing concerns outside this feature's scope.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: Token handoff trigger: accepted — spec now says milestone/human-initiated. Global config state flaw: rejected — CLAUDE.md holds protocol instructions only; block note (transient state) goes in workflow.json via block command. Undefined checkpoint mechanism and first-checkpoint base: accepted — spec now defines checkpoint_progress struct with SHA and explicit first-run behavior. tasks.md mutability: accepted — marker_count stored for drift detection. Advisory checkpoints and model brittleness: deferred — out of scope.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Accepted: regex anchored to end of line, line endings normalized before hash, markers_sha captured once at diff start. Handoff open-decisions made concrete (stage + active block + unresolved reviews). Deferred: rebase SHA ordering (merge-base on dangling ref fails naturally), git test harness (mocks used), documentation forking (self-contained guide is design intent), mypy (out of scope), CLAUDE.md path (reviewer incorrect — ~/.claude/CLAUDE.md is correct global path), indented checkpoints (top-level only by design).
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: Accepted: regex anchored to end of line, line endings normalized before hash, markers_sha captured once at diff start. Handoff open-decisions made concrete (stage + active block + unresolved reviews). Deferred: rebase SHA ordering (merge-base on dangling ref fails naturally), git test harness (mocks used), documentation forking (self-contained guide is design intent), mypy (out of scope), CLAUDE.md path (reviewer incorrect — ~/.claude/CLAUDE.md is correct global path), indented checkpoints (top-level only by design).
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Accepted: regex anchored to end of line, line endings normalized before hash, markers_sha captured once at diff start. Handoff open-decisions made concrete (stage + active block + unresolved reviews). Deferred: rebase SHA ordering (merge-base on dangling ref fails naturally), git test harness (mocks used), documentation forking (self-contained guide is design intent), mypy (out of scope), CLAUDE.md path (reviewer incorrect — ~/.claude/CLAUDE.md is correct global path), indented checkpoints (top-level only by design).
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Accepted: regex anchored to end of line, line endings normalized before hash, markers_sha captured once at diff start. Handoff open-decisions made concrete (stage + active block + unresolved reviews). Deferred: rebase SHA ordering (merge-base on dangling ref fails naturally), git test harness (mocks used), documentation forking (self-contained guide is design intent), mypy (out of scope), CLAUDE.md path (reviewer incorrect — ~/.claude/CLAUDE.md is correct global path), indented checkpoints (top-level only by design).
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: Accepted: regex anchored to end of line, line endings normalized before hash, markers_sha captured once at diff start. Handoff open-decisions made concrete (stage + active block + unresolved reviews). Deferred: rebase SHA ordering (merge-base on dangling ref fails naturally), git test harness (mocks used), documentation forking (self-contained guide is design intent), mypy (out of scope), CLAUDE.md path (reviewer incorrect — ~/.claude/CLAUDE.md is correct global path), indented checkpoints (top-level only by design).
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: Accepted: regex anchored to end of line, line endings normalized before hash, markers_sha captured once at diff start. Handoff open-decisions made concrete (stage + active block + unresolved reviews). Deferred: rebase SHA ordering (merge-base on dangling ref fails naturally), git test harness (mocks used), documentation forking (self-contained guide is design intent), mypy (out of scope), CLAUDE.md path (reviewer incorrect — ~/.claude/CLAUDE.md is correct global path), indented checkpoints (top-level only by design).

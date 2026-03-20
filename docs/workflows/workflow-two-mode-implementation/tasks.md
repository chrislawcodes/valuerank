# Tasks

## Slice A — CODEX-ORCHESTRATOR.md

- [ ] Create `docs/operations/codex-skills/feature-workflow/CODEX-ORCHESTRATOR.md` with all required sections per spec
- [ ] Section 1: When this guide applies — define Codex Orchestrator mode, when to use it
- [ ] Section 2: Models — codex-5.4-mini for all Codex tasks; gemini-2.5-pro for all Gemini tasks; Gemini calls must be serial (no concurrent Gemini CLI calls in the same session)
- [ ] Section 3: Phase-by-phase command reference — mirror the SKILL.md stage table with concrete `run_feature_workflow.py` commands for each phase
- [ ] Section 4: Escalation protocol — copy "Codex Orchestrator: Escalation Protocol" from SKILL.md verbatim so guide is self-contained
- [ ] Section 5: Hard limits — list what Codex must not do without human approval: git push, git merge, PR creation
- [ ] Section 6: Command failure protocol — retry the failing command once; if it fails again, run `block --slug <slug> --reason "<command> failed: <error>"` and stop; do not silently continue
- [ ] Section 7: Handoff back to Claude — run `status --slug <slug>`, then `block --slug <slug> --reason "Codex session ending at <phase>. Open decisions: <list>"` so Claude can read state from workflow.json on return

[CHECKPOINT]

## Slice B — CLAUDE.md Handoff Section

- [ ] Read `~/.claude/CLAUDE.md` fully before editing
- [ ] Update Multi-Agent Roles table to add a "Mode" column showing Claude Orchestrator / Codex Orchestrator for each agent row, and add a row referencing `docs/operations/codex-skills/feature-workflow/CODEX-ORCHESTRATOR.md`
- [ ] Add "Handing Off to Codex Orchestrator" section after the Multi-Agent Roles section with these steps:
  - Trigger: human-initiated or at natural milestones (wave merges, before long CI waits, when `/handoff` is needed)
  - Step 1: run `python3 docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py status --slug <slug>`
  - Step 2: run `block --slug <slug> --reason "Claude session ended at <phase>. Open decisions: <list>"`
  - Clarify: CLAUDE.md holds protocol instructions only — the block note (transient state) goes in `workflow.json`, never in this file
- [ ] Verify edit is idempotent — section must not be duplicated if already present

[CHECKPOINT]

## Slice C — Runner `[CHECKPOINT]` Support

- [ ] Add `CHECKPOINT_PROGRESS_KEY = "checkpoint_progress"` to `workflow_state.py`
- [ ] Add `parse_checkpoint_markers(slug: str) -> tuple[int, str]` to `run_feature_workflow.py`:
  - regex: `^\s*([-*]|\d+\.|-\s+\[[ xX]\])\s+.*\[CHECKPOINT\]`
  - returns `(count, markers_sha)` where `markers_sha = sha256("\n".join(matched_lines))`
  - returns `(0, "")` if file missing or no matches
- [ ] Add `checkpoint_progress_state(slug: str) -> dict` to `run_feature_workflow.py`:
  - reads `checkpoint_progress` from workflow state
  - normalizes partial/legacy entries by filling missing keys with defaults
  - defaults: `{"index": 0, "markers_sha": "", "last_diff_head_sha": ""}`
- [ ] Update `command_checkpoint` for `stage == "diff"`:
  - capture `pending_head_sha = _git_head_sha(REPO_ROOT)` immediately before launching reviews
  - call `parse_checkpoint_markers(slug)` → `(marker_count, current_markers_sha)`
  - read `checkpoint_progress_state(slug)` → progress
  - reset to defaults (warn, use branch base) if: `marker_count == 0`, or `progress["index"] >= marker_count`, or `current_markers_sha != progress["markers_sha"]`
  - if `progress["index"] > 0` and markers_sha matches: validate `last_diff_head_sha` via `git cat-file -t <sha>` AND `git merge-base --is-ancestor <sha> HEAD`; if both pass use as diff base; otherwise warn, reset, use branch base
  - after `run_verify_checkpoint` succeeds: advance `index += 1`, set `markers_sha = current_markers_sha`, set `last_diff_head_sha = pending_head_sha`, persist via `update_workflow_state`
- [ ] Update `command_status` to show `checkpoint_progress` summary when `index > 0`
- [ ] Update `command_init` to reset `checkpoint_progress` to defaults when reinitializing an existing workflow
- [ ] Add tests to `test_run_feature_workflow_repair.py`:
  - `test_parse_checkpoint_markers_returns_zero_when_no_markers`
  - `test_parse_checkpoint_markers_counts_all_list_styles` (unordered, ordered, checkbox)
  - `test_parse_checkpoint_markers_ignores_non_list_lines`
  - `test_checkpoint_progress_defaults_when_absent`
  - `test_checkpoint_progress_normalizes_partial_state`
  - `test_diff_checkpoint_uses_branch_base_when_index_zero`
  - `test_diff_checkpoint_uses_last_sha_when_index_positive_and_valid`
  - `test_diff_checkpoint_falls_back_on_dangling_sha`
  - `test_diff_checkpoint_falls_back_on_markers_sha_mismatch`
  - `test_diff_checkpoint_falls_back_when_index_exceeds_marker_count`
  - `test_diff_checkpoint_advances_state_after_verify_succeeds`
- [ ] Run `python3 -m py_compile` on both touched Python files
- [ ] Run `python3 -m unittest discover -s docs/operations/codex-skills/feature-workflow/tests -p 'test_*.py'` — all 30 existing + new tests must pass

## Quality Checklist

- [ ] `CODEX-ORCHESTRATOR.md` is self-contained — Codex can follow it without reading SKILL.md
- [ ] CLAUDE.md edit is idempotent — re-running does not duplicate the section
- [ ] No new Python dependencies beyond stdlib
- [ ] All 30 existing tests still pass unmodified
- [ ] `markers_sha` hashes only matched marker lines, not full tasks.md
- [ ] `pending_head_sha` captured before reviews launch, not after verify

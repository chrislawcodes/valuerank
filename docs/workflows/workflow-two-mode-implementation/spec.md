# Spec

## Feature: Two-Mode Workflow Implementation

### Context

The feature workflow now supports two orchestration modes — Claude Orchestrator and Codex Orchestrator — as defined in SKILL.md and feature-workflow-plan.md. Three concrete implementation gaps remain before the two-mode design is executable:

1. No Codex Orchestrator guide exists (GEMINI-CODEX-GUIDE.md was deleted as stale)
2. CLAUDE.md has no handoff-to-Codex protocol
3. The runner does not support `[CHECKPOINT]` markers in `tasks.md` for scoped diff review

### Scope

This feature implements all three gaps. Documentation-first (items 1 and 2) plus a focused runner enhancement (item 3).

---

## User Stories

### P0 — Codex Orchestrator Guide

**As Codex**, when I receive "use feature workflow to implement X", I need a guide that tells me exactly how to behave in Codex Orchestrator mode so I can drive the workflow without Claude.

**Acceptance criteria:**
- Guide exists at `docs/operations/codex-skills/feature-workflow/CODEX-ORCHESTRATOR.md`
- Covers: how to call `run_feature_workflow.py` commands by phase
- Covers: when to call Gemini (review gates, codebase research, large reads)
- Covers: model specifications — codex-5.4-mini for Codex tasks, gemini-2.5-pro for Gemini tasks
- Covers: Gemini serialization requirement — calls must be serial, not parallel
- Covers: escalation criteria — references and copies the "Codex Orchestrator: Escalation Protocol" section from SKILL.md so it is self-contained
- Covers: what Codex must not do without human approval (merge, push, PR creation)
- Covers: what to do when a runner command fails (retry once, then `block`; do not silently continue)
- Covers: handoff artifact — run `status --slug`, then `block --slug <slug> --reason "..."` to record state in `workflow.json` for Claude to read on return
- References SKILL.md for the authoritative phase table

### P0 — CLAUDE.md Handoff Protocol

**As Claude**, at natural milestones (wave merges, before long CI waits, when context feels long) I need clear instructions in my global config for how to hand off cleanly to Codex so the workflow can continue.

**Acceptance criteria:**
- `~/.claude/CLAUDE.md` has a "Handing Off to Codex Orchestrator" section
- Trigger is human-initiated or milestone-based — not token-count detection (which is unreliable)
- Section covers: run `status --slug`, write a `block` note via `block --slug <slug> --reason "Claude session ended at <phase>. Open decisions: <list>"` — this writes to `workflow.json`, not to any config file
- Section clarifies: CLAUDE.md holds the protocol instructions; the block note (transient state) lives in the workflow's `workflow.json`
- Multi-Agent Roles table updated to reference Claude Orchestrator / Codex Orchestrator modes
- Codex Orchestrator guide path referenced

### P1 — Runner Support for `[CHECKPOINT]` Markers

**As the workflow runner**, when `tasks.md` contains `[CHECKPOINT]` markers, track the current checkpoint index in workflow state and scope diff generation to use the git commit SHA from the previous diff checkpoint as the base.

**Acceptance criteria:**
- `run_feature_workflow.py` parses `[CHECKPOINT]` markers from `tasks.md` and counts them
- Workflow state stores under `checkpoint_progress` key:
  - `index`: current checkpoint (0-based; 0 = first slice)
  - `marker_count`: number of `[CHECKPOINT]` markers at last advance (used to detect tasks.md edits)
  - `last_diff_head_sha`: git commit SHA of HEAD at the time the last diff checkpoint completed
- `checkpoint --stage diff` behavior by index:
  - index = 0 (or no markers present): use branch base — identical to current behavior
  - index > 0: use `last_diff_head_sha` as the diff base; if SHA is missing, warn and fall back to branch base
- After a diff checkpoint completes successfully, advance `index` by 1 and record current HEAD SHA in `last_diff_head_sha`
- If `marker_count` at read time differs from stored `marker_count`, log a warning and fall back to branch base (tasks.md was edited)
- `status --slug` shows `checkpoint_progress` summary when `index` > 0
- Existing workflows without `[CHECKPOINT]` markers behave identically — index stays 0, behavior unchanged
- Tests cover: marker parsing, index advance, SHA-based base selection, marker-count mismatch fallback, no-marker regression path, missing-SHA fallback

---

## Out of Scope

- Enforcing that tasks.md has `[CHECKPOINT]` markers (advisory only)
- Migrating existing workflow artifacts to use checkpoint markers
- Changes to review lens scripts or checkpoint runner for staged reviews
- Runner support for `[P]` parallelization markers (separate concern)

---

## File Inventory

**New files:**
- `docs/operations/codex-skills/feature-workflow/CODEX-ORCHESTRATOR.md`

**Modified files:**
- `~/.claude/CLAUDE.md` — add handoff section, update roles table
- `docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py` — checkpoint marker support
- `docs/operations/codex-skills/feature-workflow/scripts/workflow_state.py` — add `CHECKPOINT_INDEX_KEY` constant
- `docs/operations/codex-skills/feature-workflow/tests/test_run_feature_workflow_repair.py` — new tests

---

## Constraints

- Gemini model: `gemini-2.5-pro`
- Codex model: `codex-5.4-mini`
- Gemini calls must be serial — concurrency lock in `run_gemini_review.py` enforces this; do not bypass
- Changes to `run_feature_workflow.py` must pass the existing 30-test suite unmodified
- No new Python dependencies beyond stdlib

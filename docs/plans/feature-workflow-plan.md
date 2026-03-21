# Feature Workflow — Plan of Record

This is the maintained plan of record for the feature workflow system. Keep in sync with
`docs/operations/codex-skills/feature-workflow/SKILL.md` when making changes to the workflow.

---

## Current State

The feature workflow pipeline is operational with three completed improvement cycles.

### Completed cycles

| Workflow | What shipped | Date |
|----------|-------------|------|
| `workflow-two-mode-implementation` | Dual-orchestrator mode (Claude + Codex), `[CHECKPOINT]` marker support, CLAUDE.md handoff protocol | 2026-03 |
| `workflow-runner-hardening` | `DEFAULT_CODEX_MODEL` constant, base-ref reset after checkpoint progress reset, closeout stage repair in `command_repair` | 2026-03-20 |
| Direct improvements (I-1–I-4) | Discovery mandatory, branch staleness warning, source-of-truth docs, `verify_reconciliation.py` orphan fix | 2026-03-20 |

### Open items

| ID | Item | Status |
|----|------|--------|
| I-5 | Runner self-containment (missing import resilience) | Planned |
| I-6 | Lightweight execution path for simple changes | Deferred |

---

## Open Backlog

### I-5: Runner self-containment
**Status:** Planned
**Source:** Codex retro (2026-03-20)
**What:** `run_feature_workflow.py status` failed due to a missing `workflow_utils` import. The runner should either inline its deps, add graceful try/except with a clear diagnostic error, or document the required setup explicitly.
**Why:** Silent setup failures are hard to diagnose in agent-driven runs.
**Cost:** Low-medium — need to audit the import, decide inline vs. graceful-fail, add test. ~1–2 hours.
**Files:** `docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py`, possibly `workflow_state.py`

---

### I-6: Lightweight execution path for simple changes
**Status:** Deferred — needs more data
**Source:** Codex retro (2026-03-20)
**What:** A `--lightweight` mode that skips or reduces adversarial review rounds for straightforward delivery work.
**Why not now:** High implementation cost (300–500 lines, new execution mode, second test suite). Risk that agents opt into lightweight mode for work that turns out to be non-trivial. Need more evidence on how often the full pipeline added no value before building this.
**Revisit when:** 3+ workflow runs where the adversarial review phase produced zero actionable findings.
**Files:** `scripts/run_feature_workflow.py`, `SKILL.md`, `CODEX-ORCHESTRATOR.md`

---

## Shipped

| Item | What shipped | Date |
|------|-------------|------|
| Dual-orchestrator mode | Claude + Codex Orchestrator modes, handoff protocol via `block` | 2026-03 |
| `[CHECKPOINT]` marker support | Runner parses markers, tracks progress, selects diff base | 2026-03 |
| CLAUDE.md handoff protocol | Step-by-step handoff instructions added to global CLAUDE.md | 2026-03 |
| base-ref reset after checkpoint progress reset | `args.base_ref = None` in 3 reset branches of `command_checkpoint` | 2026-03-20 |
| closeout stage repair | `command_repair` now handles `closeout` unhealthy-manifest | 2026-03-20 |
| `DEFAULT_CODEX_MODEL` constant | Replaced hardcoded `"gpt-5.4-mini"` in `required_reviews()` | 2026-03-20 |
| I-1: Upfront requirements clarification | Discovery step made mandatory in SKILL.md + CODEX-ORCHESTRATOR.md | 2026-03-20 |
| I-2: Branch staleness warning | `commits_behind_upstream()` added; warns in `status` and `deliver --create-pr` | 2026-03-20 |
| I-3: Source-of-truth clarification | Workflow file reference table added to SKILL.md | 2026-03-20 |
| I-4: `verify_reconciliation.py` orphan bug | Removed orphan check; script now only validates supplied reviews | 2026-03-20 |

---

## Feedback Log

### 2026-03-20 — Codex retro + human observation

**What worked:**
- Kept changes organized from spec → implementation → delivery
- Pushed toward small reviewable slices instead of one large patch
- Helped keep product semantics, API, UI, and glossary aligned
- Checkpoint discipline made the work feel more reliable

**What didn't:**
- Runner fragility: `status` failed due to missing `workflow_utils` import (→ I-5)
- Ceremony vs. value mismatch: felt heavier than warranted for semantic/UI work (→ I-6)
- Branch staleness not surfaced before PR creation → merge conflicts (→ I-2, shipped)
- Source-of-truth ambiguity: unclear which workflow files were authoritative (→ I-3, shipped)
- Clunky CI monitoring: extra steps to determine whether checks were running (untracked)
- No upfront requirements clarification (→ I-1, shipped)

---

## Change Log

| Date | Item | Action |
|------|------|--------|
| 2026-03-20 | I-1 through I-6 | Created from Codex retro + human feedback |
| 2026-03-20 | I-1, I-2, I-3, I-4 | Shipped directly |
| 2026-03-20 | Restructured | Collapsed shipped items into Shipped table; backlog now shows only I-5 and I-6 |

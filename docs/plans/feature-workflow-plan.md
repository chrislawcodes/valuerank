# Feature Factory — Plan of Record

This is the maintained plan of record for the feature factory system. Keep in sync with
`docs/operations/codex-skills/feature-factory/SKILL.md` when making changes to the workflow.

---

## Current State

The feature factory pipeline is operational with three completed improvement cycles and one
structural rename. The system now lives at `docs/operations/codex-skills/feature-factory/`
with per-feature state in `docs/feature-runs/<slug>/state.json`.

A three-way adversarial evaluation (Codex → Claude → Codex) in 2026-03-22 produced a clear
diagnosis: **the pipeline is strongest at bookkeeping, state recovery, and auditability; it
is weakest at preventing the team from building the wrong thing.** The open backlog below
reflects that finding.

### Completed cycles

| Workflow | What shipped | Date |
|----------|-------------|------|
| `workflow-two-mode-implementation` | Dual-orchestrator mode (Claude + Codex), `[CHECKPOINT]` marker support, CLAUDE.md handoff protocol | 2026-03 |
| `workflow-runner-hardening` | `DEFAULT_CODEX_MODEL` constant, base-ref reset after checkpoint progress reset, closeout stage repair | 2026-03-20 |
| Direct improvements (I-1–I-4) | Discovery mandatory, branch staleness warning, source-of-truth docs, `verify_reconciliation.py` orphan fix | 2026-03-20 |
| `feature-factory-rename` (#387) | Renamed feature-workflow → feature-factory, docs/workflows → docs/feature-runs, deleted 17 stale workflow dirs | 2026-03-22 |

### Open items

| ID | Item | Priority | Status |
|----|------|----------|--------|
| I-7 | Structured discovery state | 1 — do first | Planned |
| I-8 | Structured block / handoff state | 2 | Planned |
| I-9 | Deterministic validation gates | 3 | Planned |
| I-10 | Runner modularization | 4 — do last | Planned |
| I-5 | Runner self-containment | Low | Planned |
| I-6 | Lightweight execution path | — | Deferred |

---

## Open Backlog

### Ordering rationale

The four main items are sequenced deliberately:

**I-7 before I-9** (discovery before deterministic validation): if the spec is wrong,
deterministic validation doesn't help — it just confirms the wrong thing was built correctly.
The cascade effect of bad framing makes discovery the higher-leverage fix. Also cheaper.

**I-8 second** (handoff after discovery): a structured block note is essentially a snapshot
of the discovery state at handoff time. The two items share the same data model — structured
questions, open decisions, and acceptance criteria. Building discovery first makes handoff
state nearly free.

**I-9 third** (validation after the above): requires design decisions about how the runner
invokes test/build/lint for arbitrary repos, how it handles flaky tests, and whether
validation is a new stage or a gate inside existing ones. Worth doing after the process
gaps are closed.

**I-10 last** (modularize after the interface stabilizes): I-7, I-8, and I-9 all touch the
runner. Modularizing first means touching the code twice. Do it once the shape of the
interface is clear.

---

### I-7: Structured discovery state
**Status:** Planned
**Priority:** 1
**Source:** 2026-03-22 adversarial evaluation (Codex + Claude)
**What:** Replace the current free-text discovery fields with structured, machine-readable
state in `state.json`:
- `questions[]` — asked by the agent before spec
- `answers{}` — recorded responses (keyed by question)
- `assumptions[]` — explicit assumptions the spec rests on
- `non_goals[]` — what is explicitly out of scope
- `acceptance_criteria[]` — what done looks like
- `unresolved[]` — open items that have not been answered

Make `unresolved` a first-class status: if any item is unresolved, `status` surfaces it
prominently and `spec` is blocked from progressing until the human clears or defers each one.

**Why:** The pipeline currently validates artifact consistency, not product intent. A wrong
spec sails through every gate. This is where wrong-product failures are born. Discovery is
already mandatory (I-1) — this makes it enforceable.

**Why this order:** Cheapest fix with the highest cascade value. Also unlocks I-8 for nearly
free.

**Cost:** Medium — runner changes to `command_discovery`, `command_status`, `command_spec`
(add unresolved gate); `factory_state.py` schema additions; SKILL.md update; tests.

**Files:**
- `docs/operations/codex-skills/feature-factory/scripts/run_factory.py`
- `docs/operations/codex-skills/feature-factory/scripts/factory_state.py`
- `docs/operations/codex-skills/feature-factory/SKILL.md`

---

### I-8: Structured block / handoff state
**Status:** Planned
**Priority:** 2
**Source:** 2026-03-22 adversarial evaluation — session/context fragmentation identified
as a real missing piece
**What:** Replace the free-text `block --reason` with a structured handoff record:
- `current_phase` — where in the pipeline the session ended
- `open_decisions[]` — decisions not yet made, with options considered and current lean
- `deferred_items[]` — items explicitly punted with a reason
- `context_summary` — what the agent knows that isn't in the artifacts

Surface open decisions in `status` output so the resuming agent sees them immediately
without reading the entire history.

**Why:** The pipeline currently has no model of what the human or agent knew at handoff.
The `block` command exists but captures free text that the resuming agent may or may not
read. This means sessions can continue on stale context or quietly work on the wrong thing.
The wrong-feature derailment in recent sessions was exactly this failure mode.

**Why this order:** Shares the structured data model from I-7. Once discovery state is
machine-readable, a block snapshot is largely a copy of that state plus current phase.
Doing I-8 before I-7 would mean designing the same schema twice.

**Cost:** Low-medium — `command_block` changes, `command_status` display changes,
`factory_state.py` schema additions; SKILL.md update.

**Files:**
- `docs/operations/codex-skills/feature-factory/scripts/run_factory.py`
- `docs/operations/codex-skills/feature-factory/scripts/factory_state.py`
- `docs/operations/codex-skills/feature-factory/SKILL.md`
- `docs/operations/codex-skills/feature-factory/CODEX-ORCHESTRATOR.md`

---

### I-9: Deterministic validation gates
**Status:** Planned
**Priority:** 3
**Source:** 2026-03-22 adversarial evaluation
**What:** Add real automated checks as hard gates inside the pipeline, not as external
post-merge CI:
- Build verification (`npm run build` or equivalent)
- Test suite (`npm run test`)
- Lint
- Optional: integration smoke, security scan, migration check when relevant

Most likely placement: as prerequisites for `diff` (must pass before a diff checkpoint is
recorded) and `deliver` (must pass before PR creation). Configurable per-feature via
`scope.json`.

**Why:** The entire pipeline currently relies on AI judgment. Multiple agents agreeing is
not correctness — it is often correlated misunderstanding. The pipeline needs something that
can say "this is broken" without interpretation. "AI says it looks good" must not be
sufficient on its own.

**Why this order:** The right placement of validation gates depends on knowing what the
pipeline is validating against (the acceptance criteria from I-7). Running tests before
that is defined is less meaningful.

**Cost:** Medium-high — requires the runner to invoke external processes, capture output,
fail hard on non-zero exit; `scope.json` schema additions for validation config; tests for
the runner's validation path.

**Files:**
- `docs/operations/codex-skills/feature-factory/scripts/run_factory.py`
- `docs/operations/codex-skills/feature-factory/scripts/factory_state.py`
- `docs/feature-runs/<slug>/scope.json` (schema addition)
- `docs/operations/codex-skills/feature-factory/SKILL.md`

---

### I-10: Runner modularization
**Status:** Planned
**Priority:** 4 — do after I-7, I-8, I-9
**Source:** 2026-03-22 adversarial evaluation
**What:** Split `run_factory.py` (2000+ lines) by responsibility:
- `factory_state.py` — already extracted; extend with structured discovery/handoff schema
- `factory_review.py` — checkpoint creation, manifest verification, reconciliation logic
- `factory_deliver.py` — delivery, CI polling, PR creation logic
- `run_factory.py` — thin CLI entry point only; delegates to the above

The split should follow state-mutation boundaries, not just command groups. Each module
should own its own state reads/writes without importing from the others.

**Why:** The monolith makes small changes produce large diffs (the opposite of what the
pipeline is supposed to enforce on feature code). State mutation, orchestration, and output
formatting are entangled within each command. A naive split just creates four files with
the same internal tangle.

**Why this order:** I-7, I-8, and I-9 all add new state schema and new command behavior.
Modularizing before those land means restructuring the code twice. Do it once the interface
is stable.

**Cost:** Medium — no behavior changes, pure reorganization. Risk is regression; requires
full test suite passing before and after.

**Files:**
- `docs/operations/codex-skills/feature-factory/scripts/run_factory.py`
- New: `factory_review.py`, `factory_deliver.py`

---

### I-5: Runner self-containment
**Status:** Planned (low priority)
**Source:** Codex retro (2026-03-20)
**What:** `run_factory.py status` failed due to a missing `workflow_utils` import. Add
graceful try/except with a clear diagnostic error or document the required setup explicitly.
**Why deprioritized:** I-7 through I-10 are higher-leverage. This is a one-time setup
problem, not a recurring correctness issue.
**Cost:** Low.

---

### I-6: Lightweight execution path
**Status:** Deferred — reinforced by evaluation
**Source:** Codex retro (2026-03-20)
**Why still deferred:** The 2026-03-22 evaluation reinforces deferral. Once I-9 adds
deterministic validation gates, the full pipeline becomes more appropriate more often —
the overhead is now paying for real correctness checks, not just AI review ceremony.
Revisit after 3+ runs where the full pipeline produced no actionable findings.

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
| I-4: `verify_reconciliation.py` orphan fix | Removed orphan check; script now only validates supplied reviews | 2026-03-20 |
| feature-factory rename (#387) | Renamed system and artifact dirs; deleted 17 stale workflow dirs | 2026-03-22 |

---

## Feedback Log

### 2026-03-22 — Three-way adversarial evaluation (Codex → Claude → Codex)

**Diagnosis:** The pipeline catches process failures better than product failures. It is
strongest at resumability, checkpointing, review traceability, and delivery bookkeeping.
It is weakest at catching wrong framing, forcing real understanding before implementation,
keeping the execution surface small, and validating truth outside the artifact chain.

**Key findings:**
- False confidence from AI consensus: agents agreeing is not independent validation when
  they read the same context with the same framing
- Deterministic validation is absent: the entire pipeline relies on AI judgment
- Discovery is the highest-value gate but not enforceable — unresolved items don't block
- Session/context fragmentation: no model of what was known at handoff; wrong-feature
  derailments are possible and have occurred
- The runner is 2000+ lines; state mutation, orchestration, and formatting are entangled
- Diff review degrades to theater once artifact size exceeds honest review capacity

**What the evaluation did not change:**
- I-6 (lightweight mode) remains deferred — if anything, the case for it weakened
- The existing stage structure is sound; the pipeline needs strengthening, not redesigning

### 2026-03-20 — Codex retro + human observation

**What worked:**
- Kept changes organized from spec → implementation → delivery
- Pushed toward small reviewable slices instead of one large patch
- Checkpoint discipline made the work feel more reliable

**What didn't:**
- Runner fragility: `status` failed due to missing `workflow_utils` import (→ I-5)
- Ceremony vs. value mismatch: felt heavier than warranted for semantic/UI work (→ I-6)
- Branch staleness not surfaced before PR creation → merge conflicts (→ I-2, shipped)
- Source-of-truth ambiguity: unclear which workflow files were authoritative (→ I-3, shipped)
- No upfront requirements clarification (→ I-1, shipped)

---

## Change Log

| Date | Item | Action |
|------|------|--------|
| 2026-03-20 | I-1 through I-6 | Created from Codex retro + human feedback |
| 2026-03-20 | I-1, I-2, I-3, I-4 | Shipped directly |
| 2026-03-20 | Restructured | Collapsed shipped items into Shipped table |
| 2026-03-22 | feature-factory rename | Shipped (#387); updated all references |
| 2026-03-22 | I-7 through I-10 | Added from adversarial evaluation; replaced prior backlog |
| 2026-03-22 | I-6 | Deferred status reinforced by evaluation |

# Feature Workflow — Plan of Record

This is the maintained plan of record for the feature workflow system. Keep in sync with
`docs/operations/codex-skills/feature-workflow/SKILL.md` when making changes to the workflow.

---

## Current State

The feature workflow pipeline is operational. Two completed improvement cycles:

| Workflow | What shipped | Date |
|----------|-------------|------|
| `workflow-two-mode-implementation` | Dual-orchestrator mode (Claude + Codex), `[CHECKPOINT]` marker support, CLAUDE.md handoff protocol | 2026-03 |
| `workflow-runner-hardening` | `DEFAULT_CODEX_MODEL` constant, base-ref reset after checkpoint progress reset, closeout stage repair in `command_repair` | 2026-03-20 |

---

## Improvement Backlog

Priority order reflects benefit/cost ratio. Update status when items are shipped or re-evaluated.

---

### Priority 1 — Do first (high benefit, near-zero cost)

#### I-1: Upfront requirements clarification step
**Status:** Shipped 2026-03-20
**Source:** Codex retro + human observation (2026-03-20)
**What:** Add a pre-spec Q&A step to SKILL.md and CODEX-ORCHESTRATOR.md. Before authoring the spec, the workflow should ask clarifying questions: What problem are we solving? Are there edge cases or constraints to know upfront? What does done look like?
**Why:** The workflow currently dives straight into spec authoring. Scope ambiguity discovered mid-pipeline forces rewrites and adds adversarial finding cycles.
**Cost:** Very low — SKILL.md + CODEX-ORCHESTRATOR.md edits only, no runner code changes.
**Files:** `docs/operations/codex-skills/feature-workflow/SKILL.md`, `CODEX-ORCHESTRATOR.md`

---

### Priority 2 — Easy wins (low cost, clear benefit)

#### I-2: Branch staleness warning in `status`
**Status:** Shipped 2026-03-20
**Source:** Codex retro (2026-03-20)
**What:** In `command_status`, run `git rev-list --count HEAD..origin/<base>` and surface a warning if the branch is behind. Ideally warn before `deliver --create-pr` if staleness is detected.
**Why:** Branch was behind `main` during a workflow run but the runner didn't warn; merge conflicts appeared after PR creation.
**Cost:** Very low — ~5 lines in `run_feature_workflow.py`, no new state.
**Files:** `docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py`

#### I-3: Source-of-truth clarification in SKILL.md
**Status:** Shipped 2026-03-20
**Source:** Codex retro (2026-03-20)
**What:** Add one paragraph to SKILL.md clarifying which files are authoritative vs. generated:
- `workflow.json` — authoritative runtime state
- `spec.md`, `plan.md`, `tasks.md`, `closeout.md` — authored artifacts (source of truth for intent)
- `reviews/*.md`, `*.checkpoint.json` — generated + resolved state

**Why:** Agents and humans reading a workflow directory weren't sure which files to trust.
**Cost:** Near-zero — docs only.
**Files:** `docs/operations/codex-skills/feature-workflow/SKILL.md`

#### I-4: Fix `verify_reconciliation.py` orphan bug
**Status:** Shipped 2026-03-20
**Source:** Observed during workflow-runner-hardening (2026-03-20)
**What:** `verify_reconciliation.py` treats pre-existing plan.md reconciliation entries as "orphaned" when called with fewer `--review` args than the total number of entries in the file. Fix the script to only check that the supplied reviews are present, not that no others exist.
**Why:** Forced a manual workaround (calling `update_review_resolution.py` + `append_reconciliation_entry.py` directly) on every `reconcile` call during a multi-stage workflow. Hit multiple times.
**Cost:** Low — a few lines in the verify script + test.
**Files:** `docs/operations/codex-skills/review-lens/scripts/verify_reconciliation.py`

---

### Priority 3 — Runner maintenance pass (medium cost)

#### I-5: Runner self-containment (resilient to missing helper modules)
**Status:** Planned
**Source:** Codex retro (2026-03-20)
**What:** `run_feature_workflow.py status` failed due to a missing `workflow_utils` import. The runner should either inline its deps, add graceful try/except with a clear diagnostic error, or document the required setup explicitly.
**Why:** Silent setup failures are hard to diagnose in agent-driven runs.
**Cost:** Low-medium — need to audit the import, decide inline vs. graceful-fail, add test. ~1–2 hours.
**Files:** `docs/operations/codex-skills/feature-workflow/scripts/run_feature_workflow.py`, possibly `workflow_state.py`

---

### Priority 4 — Deferred (high cost, uncertain benefit)

#### I-6: Lightweight execution path for simple changes
**Status:** Deferred — needs more data
**Source:** Codex retro (2026-03-20)
**What:** A `--lightweight` mode that skips or reduces adversarial review rounds for straightforward delivery work.
**Why not now:** High implementation cost (300–500 lines, new execution mode, second test suite). Risk that agents opt into lightweight mode for work that turns out to be non-trivial. Need more evidence on how often the full pipeline added no value before building this.
**Revisit when:** 3+ workflow runs where the adversarial review phase produced zero actionable findings.
**Files:** `scripts/run_feature_workflow.py`, `SKILL.md`, `CODEX-ORCHESTRATOR.md`

---

## Shipped

| Item | What shipped | Date | Workflow |
|------|-------------|------|---------|
| base-ref reset after checkpoint progress reset | `args.base_ref = None` in 3 reset branches of `command_checkpoint` | 2026-03-20 | workflow-runner-hardening |
| closeout stage repair | `command_repair` now handles `closeout` unhealthy-manifest | 2026-03-20 | workflow-runner-hardening |
| `DEFAULT_CODEX_MODEL` constant | Replaced hardcoded `"gpt-5.4-mini"` in `required_reviews()` | 2026-03-20 | workflow-runner-hardening |
| I-1: Upfront requirements clarification | Discovery step made mandatory in SKILL.md + CODEX-ORCHESTRATOR.md | 2026-03-20 | direct |
| I-2: Branch staleness warning | `commits_behind_upstream()` added; warns in `status` and `deliver --create-pr` | 2026-03-20 | direct |
| I-3: Source-of-truth clarification | Workflow file reference table added to SKILL.md | 2026-03-20 | direct |
| I-4: `verify_reconciliation.py` orphan bug | Removed orphan check; script now only validates supplied reviews | 2026-03-20 | direct |

---

## Feedback Log

### 2026-03-20 — Codex retro + human observation

**What worked:**
- Kept changes organized from spec → implementation → delivery
- Pushed toward small reviewable slices instead of one large patch
- Helped keep product semantics, API, UI, and glossary aligned
- Checkpoint discipline made the work feel more reliable

**What didn't:**
- Runner fragility: `status` failed due to missing `workflow_utils` import
- Ceremony vs. value mismatch: felt heavier than the change warranted for semantic/UI work
- Branch staleness not surfaced before PR creation → merge conflicts
- Source-of-truth ambiguity: unclear which workflow files were authoritative vs. generated
- Clunky CI monitoring: extra manual steps to determine whether checks were running
- No upfront requirements clarification: workflow started without asking scoping questions

---

## Change Log

| Date | Item | Action |
|------|------|--------|
| 2026-03-20 | I-1 through I-6 | Created from Codex retro + human feedback |
| 2026-03-20 | Shipped items | Populated from workflow-runner-hardening closeout |
| 2026-03-20 | I-1, I-2, I-3, I-4 | Shipped directly (low-cost, no pipeline needed) |

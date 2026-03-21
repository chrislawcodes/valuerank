# Feature Workflow — Improvement Backlog

Tracks planned and candidate improvements to the workflow runner, skill docs, and process design.
Priority order reflects benefit/cost ratio. Update when items are shipped or re-evaluated.

---

## Priority 1 — Do first (high benefit, near-zero cost)

### I-1: Upfront requirements clarification step
**Status:** Planned
**Source:** Codex retro + human observation (2026-03-20)
**What:** Add a pre-spec Q&A step to SKILL.md and CODEX-ORCHESTRATOR.md. Before authoring the spec, the workflow should ask clarifying questions: What problem are we solving? Are there edge cases or constraints to know upfront? What does done look like?
**Why:** The workflow currently dives straight into spec authoring. Scope ambiguity discovered mid-pipeline forces rewrites and adds adversarial finding cycles.
**Cost:** Very low — SKILL.md + CODEX-ORCHESTRATOR.md edits only, no runner code changes.
**Files:** `SKILL.md`, `CODEX-ORCHESTRATOR.md`

---

## Priority 2 — Easy wins (low cost, clear benefit)

### I-2: Branch staleness warning in `status`
**Status:** Planned
**Source:** Codex retro (2026-03-20)
**What:** In `command_status`, run `git rev-list --count HEAD..origin/<base>` and surface a warning if the branch is behind. Ideally block or warn before `deliver --create-pr` if staleness is detected.
**Why:** Branch was behind `main` during a workflow run but the runner didn't warn; merge conflicts appeared after PR creation.
**Cost:** Very low — ~5 lines in `run_feature_workflow.py`, no new state.
**Files:** `scripts/run_feature_workflow.py`

### I-3: Source-of-truth clarification in SKILL.md
**Status:** Planned
**Source:** Codex retro (2026-03-20)
**What:** Add one paragraph to SKILL.md clarifying which files are authoritative vs. generated:
- `workflow.json` — authoritative runtime state
- `spec.md`, `plan.md`, `tasks.md`, `closeout.md` — authored artifacts (source of truth for intent)
- `reviews/*.md`, `*.checkpoint.json` — generated + resolved state
**Why:** Agents and humans reading a workflow directory weren't sure which files to trust.
**Cost:** Near-zero — docs only.
**Files:** `SKILL.md`

### I-4: Fix `verify_reconciliation.py` orphan bug
**Status:** Planned
**Source:** Observed during workflow-runner-hardening (2026-03-20)
**What:** `verify_reconciliation.py` treats pre-existing plan.md reconciliation entries as "orphaned" when called with fewer `--review` args than the total number of entries in the file. Fix the script to only check that the supplied reviews are present, not that no others exist.
**Why:** Forced a manual workaround (calling `update_review_resolution.py` + `append_reconciliation_entry.py` directly) on every `reconcile` call during a multi-stage workflow. Hit multiple times.
**Cost:** Low — a few lines in the verify script + test.
**Files:** `docs/operations/codex-skills/review-lens/scripts/verify_reconciliation.py`

---

## Priority 3 — Runner maintenance pass (medium cost)

### I-5: Runner self-containment (resilient to missing helper modules)
**Status:** Planned
**Source:** Codex retro (2026-03-20)
**What:** `run_feature_workflow.py status` failed due to a missing `workflow_utils` import. The runner should either inline its deps, add graceful try/except with a clear diagnostic error, or document the required setup explicitly.
**Why:** Silent setup failures are hard to diagnose in agent-driven runs.
**Cost:** Low-medium — need to audit the import, decide inline vs. graceful-fail, add test. ~1–2 hours.
**Files:** `scripts/run_feature_workflow.py`, possibly `scripts/workflow_state.py`

---

## Priority 4 — Defer (high cost, uncertain benefit)

### I-6: Lightweight execution path for simple changes
**Status:** Deferred — needs more data
**Source:** Codex retro (2026-03-20)
**What:** A `--lightweight` mode that skips or reduces adversarial review rounds for straightforward delivery work.
**Why not now:** High implementation cost (300–500 lines, new execution mode, second test suite). Risk that agents opt into lightweight mode for work that turns out to be non-trivial. Need more evidence on how often the full pipeline added no value before building this.
**Revisit when:** 3+ workflow runs where the adversarial review phase produced zero actionable findings.
**Files:** `scripts/run_feature_workflow.py`, `SKILL.md`, `CODEX-ORCHESTRATOR.md`

---

## Shipped

*(none yet)*

---

## Change log

| Date | Item | Action |
|------|------|--------|
| 2026-03-20 | I-1 through I-6 | Created from Codex retro + human feedback |

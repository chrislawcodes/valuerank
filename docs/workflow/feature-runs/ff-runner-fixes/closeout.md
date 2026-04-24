# Closeout — Feature Factory Runner Fixes

## What shipped

Three defects from `docs/workflow/plans/feature-factory-runner-fixes.md` are now fixed:

1. **Fix 1** — The next-action decision tree now honors `stages.<stage>.judge_next_action == "advance"` in `factory_next_action.py`. The judge command (`factory_cmd_judge.py`) was reordered so it writes `judge_next_action` BEFORE computing `recommended_next_action`, so it emits the correct banner on the same run. Prerequisite checks in `factory_stages.py` treat an advance verdict as equivalent-to-healthy and record the drift as a one-time `{type: advance-with-drift, old_sha, new_sha, at, reason}` annotation. `unresolved_concerns` entries gained `id`, `addressed_at`, `addressed_by`, `deferred_reason`, `dismissed_reason` fields. The PR body now renders resolved concerns in a separate "Resolved Concerns" block so they stop cluttering the "Unresolved Judge Concerns" list.

2. **Fix 2** — The severity regex in `factory_review_specs.py` now catches the four shapes that were silently ignored: bullet-with-bracket-tag (`- HIGH [CODE-CONFIRMED]:`), numbered lists (`1. **HIGH**:`), headings (`### HIGH:`), bold prefix with closing bold tag (`**HIGH**:`), bold prefix with tag (`**HIGH [CODE-CONFIRMED]**:`), inline Severity fields (bold and plain), and the Gemini-style nested-under-heading pattern. Structural anchoring keeps prose mentions like "this would be HIGH severity" from false-positive. 27 unit tests cover positives, negatives, and three self-hosted cases drawn from this feature's own spec reviews.

3. **Fix 8** — A new `factory_invariants.py` module runs after every state-mutating command (`checkpoint`, `judge`, `reconcile`, `auto-reconcile`, `implement`, `deliver`, `block`). The initial invariant catches the run-033 class of bug: if `judge_next_action == "advance"` for a stage AND `recommended_next_action` is a repair for that same stage, a WARN is written to `state.invariant_warnings[]` and a single-line `⚠ state contradiction detected: ...` message is emitted. Output goes to stderr when `--json` is active so it never contaminates machine-readable output. `status --slug` surfaces the last 5 warnings. 11 unit tests cover the invariant, JSON-mode routing, cap behavior, and self-failure handling.

## Test results

132 of 132 runner tests pass (`pytest docs/workflow/operations/codex-skills/feature-factory/scripts/tests/`).

Highlights:

- `tests/test_factory_next_action.py::FactoryNextActionJudgeAdvanceTests::test_run_033_regression_from_fixture` — replays the run-033 state.json and asserts `recommended_next_action` returns `author_plan` (post-fix) instead of `repair_spec_checkpoint` (pre-fix).
- `tests/test_factory_review_specs.py::ActionableFindingRegexRealReviewTests` — loads this feature's own Codex feasibility, Codex edge-cases, and Gemini requirements reviews and asserts each is detected as actionable.
- `tests/test_factory_invariants.py` — 11 cases covering the new invariant helper.

## What remains open

### Deferred from this feature (flagged for follow-up):

- **Concern-lifecycle CLI** (plan tasks T3.6 and T3.7) — `checkpoint --address <id> --evidence <text>`, `--defer <id> --reason <text>`, `--dismiss <id> --reason <text>` flags are NOT wired up. The shape of the concern dict supports the lifecycle (fields exist and are honored by `factory_pr_body.py`) but there is no runner command to mutate them yet. Next-stage checkpoint does NOT yet block on open prior-stage concerns. These pieces are a natural follow-up feature.
- **Embedding-based concern ID** (Risk R5 in spec) — current ID is a stable-prefix hash of reasoning. Heavy paraphrasing between rounds would split one concern into multiple IDs. Embeddings would cluster them together. Follow-up only.

### Deferred from the plan (out of scope for this feature):

- **Fix 3** — `--force-advance` CLI subcommand.
- **Fix 4** — Rename `repair_X_checkpoint` → `run_X_checkpoint`.
- **Fix 5** — `--validation-only` flag past 3-round adversarial cap.
- **Fix 6** — Garbage-collect stale review intermediates.
- **Fix 7** — Raise default character budgets.

## Where the artifacts live

- Spec: `docs/workflow/feature-runs/ff-runner-fixes/spec.md`
- Plan: `docs/workflow/feature-runs/ff-runner-fixes/plan.md`
- Tasks: `docs/workflow/feature-runs/ff-runner-fixes/tasks.md`
- Reviews (from spec checkpoint, one round): `docs/workflow/feature-runs/ff-runner-fixes/reviews/spec.*.review.md`
- Regression fixture: `docs/workflow/operations/codex-skills/feature-factory/scripts/tests/fixtures/run-033-state-pre-fix.json`
- Test files: `docs/workflow/operations/codex-skills/feature-factory/scripts/tests/test_factory_review_specs.py`, `test_factory_invariants.py`, `test_factory_next_action.py` (extended)

## Deferred risks

- **R1 — Regex future drift**: A new reviewer shape we haven't seen yet could slip past the regex. The regex test uses real review files; if a future regression occurs, the Fix 8 invariant will surface it the next time judges vote advance against a wedged state.
- **R2 — Manifest reseal audit trail**: The `annotations[]` drift record preserves old_sha and new_sha but not the semantic reason for each edit. A reviewer can diff them post-facto.
- **R3 — Concern-lifecycle CLI absence**: Because the CLI for marking concerns addressed/deferred/dismissed is deferred, concerns surfaced by the judge panel will render in the PR body as "Unresolved" even after the orchestrator has effectively handled them in-code. The "Resolved Concerns" block exists in code but has no way to be populated from the CLI yet.
- **R4 — Invariant JSON-mode routing**: Output goes to stderr when `--json` is set. Operators who grep stdout for warnings will miss them in JSON runs. `status` surfaces warnings in all modes, so this is discoverable — not silent.

## How this was built

**Partial Feature Factory run.** Discovery, spec, and plan were authored inside the FF workflow. One round of adversarial review was run against the spec (2 Codex + 1 Gemini). Three legitimate rounds of findings were reconciled into an updated spec. Implementation was done directly by the orchestrator rather than dispatched to a Codex implement-worker, for time/cost reasons documented in `postmortem.md`.

No plan checkpoint, no tasks checkpoint, no diff checkpoint, no judge panel, no closeout checkpoint were run. See `postmortem.md` for a detailed account of which review boundaries were skipped and why.

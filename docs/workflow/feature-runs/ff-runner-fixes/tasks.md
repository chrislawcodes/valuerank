# Tasks — Feature Factory Runner Fixes

## Slice 0 — Capture run-033 fixture `[CHECKPOINT]`

- [ ] T0.1 Locate run-033 state.json that exhibits the bug (judge_next_action=advance, spec stage unhealthy)
- [ ] T0.2 Copy/synthesize fixture to `docs/workflow/operations/codex-skills/feature-factory/scripts/tests/fixtures/run-033-state-pre-fix.json`
- [ ] T0.3 Commit fixture

## Slice 1 — Fix 2 regex broadening `[CHECKPOINT]`

- [ ] T1.1 Update `_ACTIONABLE_FINDING_RE` in `factory_review_specs.py` to cover bullet-with-tag, numbered-list, heading, bold-prefix (including `**HIGH**:`), inline-Severity, nested-under-heading shapes with structural anchoring
- [ ] T1.2 Add `tests/test_review_specs.py` with: (a) positive cases including samples from this feature's own spec reviews, (b) negative prose-mention cases, (c) regression cases for existing four shapes
- [ ] T1.3 `pytest tests/test_review_specs.py` green
- [ ] T1.4 Commit

## Slice 2 — Fix 8 invariant self-check `[CHECKPOINT]`

- [ ] T2.1 Add `invariant_warnings: list[dict]` to the default state shape in `factory_state.py` with default-on-read behavior
- [ ] T2.2 Add `run_invariant_checks(state, command)` helper with the FR-010 rule
- [ ] T2.3 Add stdout-vs-stderr emit logic gated on a `factory_state.JSON_MODE` context variable set by `run_factory.py` when `--json` is present
- [ ] T2.4 Call `run_invariant_checks` at the tail of `cmd_checkpoint`, `cmd_judge`, `cmd_reconcile`, `cmd_auto_reconcile`, `cmd_implement`, `cmd_deliver`, `cmd_block` in `run_factory.py`
- [ ] T2.5 Surface last-5 `invariant_warnings` in `status --slug` output
- [ ] T2.6 Add `tests/test_invariant_checks.py` covering: contradiction triggers WARN, clean state emits nothing, --json sends to stderr, exception in check does not abort command
- [ ] T2.7 `pytest tests/test_invariant_checks.py` green
- [ ] T2.8 Commit

## Slice 3 — Fix 1 judge-advance honoring `[CHECKPOINT]`

- [ ] T3.1 In `factory_next_action.recommended_next_action`, add `if stages[stage].get("judge_next_action") == "advance":` check before each `not healthy` branch, for spec/plan/tasks (loop or inline)
- [ ] T3.2 In `factory_cmd_judge.py`, reorder both advance branches so `stage_state["judge_next_action"] = "advance"` is written BEFORE `recommended_next_action` is called
- [ ] T3.3 Add `reseal_manifest_for_drift(slug, stage)` helper that updates the manifest checkpoint.json and appends a drift annotation to `stages[stage].annotations[]`
- [ ] T3.4 Call the reseal helper lazily — at the top of `cmd_checkpoint` / on advance — when `judge_next_action == "advance"` AND artifact SHA drifted
- [ ] T3.5 Extend `unresolved_concerns` dict shape: add `id`, `addressed_at`, `addressed_by`, `deferred_reason`, `dismissed_reason`. Compute `id` from `sha256(stage|judge|round_raised|reasoning[:48])[:12]` when writing
- [ ] T3.6 Add `checkpoint --address <id> --evidence <text>`, `--defer <id> --reason <text>`, `--dismiss <id> --reason <text>` flags and their handlers
- [ ] T3.7 In `factory_cmd_checkpoint.py`, before running next-stage adversarial reviews, verify every prior-stage unresolved_concern is addressed/deferred/dismissed; if any open, return `blocked: unresolved-concerns-from-<prior-stage>`
- [ ] T3.8 In `factory_pr_body.py`, filter addressed/deferred/dismissed out of the "unresolved judge concerns" block; render them under a new "Resolved concerns" block
- [ ] T3.9 Add `tests/test_next_action.py` covering acceptance scenarios US1.1-US1.4
- [ ] T3.10 Add `tests/test_run_033_regression.py` loading the Slice 0 fixture; assert `recommended_next_action` returns `author_plan` not `repair_spec_checkpoint`
- [ ] T3.11 Add `tests/test_unresolved_concerns_lifecycle.py` covering address/defer/dismiss flows and the next-stage verification block
- [ ] T3.12 Full `pytest tests/` green on the runner module
- [ ] T3.13 Commit

## Slice 4 — Closeout + docs `[CHECKPOINT]`

- [ ] T4.1 Update `docs/workflow/plans/feature-factory-runner-fixes.md`: mark Fixes 1, 2, 8 as shipped; note Fixes 3, 4, 5, 6, 7 remain as open follow-ups
- [ ] T4.2 Write `docs/workflow/feature-runs/ff-runner-fixes/closeout.md`
- [ ] T4.3 Write `docs/workflow/feature-runs/ff-runner-fixes/postmortem.md` focused on the shortcuts taken (abbreviated spec review cycle, skipped plan/tasks checkpoints)
- [ ] T4.4 Commit
- [ ] T4.5 Push branch and open draft PR

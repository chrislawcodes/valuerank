# Plan — Feature Factory Runner Fixes

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Round-2 findings addressed: MEDIUM US3-vs-FR-009 contradiction — US3 updated to say stderr matching FR-009. MEDIUM pr-body addressed_by — rendering now requires addressed_at (state-bearing field), matching _concern_is_resolved and the FR-004 gate. LOW fenced-code-block regex match — pinned as documented limitation with explicit test.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Round-2 MEDIUM findings: #1 (dismiss backdoor) — accepted as known limitation; CLI is deferred anyway. #2 (post-judge drift) — accepted; manifest reseal annotation preserves audit trail; strict-mode require-re-review-on-drift is follow-up. #3 (warnings non-blocking) — intentional design; breaking workflow on warning defeats Fix 8's purpose; operator decides via status. LOW #4 (assumption 7 interaction) — addressed: assumption 7 rewritten to acknowledge runtime interaction. LOW #5 (id brittleness) — tracked as Risk R5.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: Round-2 findings (runner auto-accepted but content had MEDIUM/LOW findings — my Fix 2 regex gap): M#1 init/discover/parallel added to _STATE_MUTATING_COMMANDS. M#2 FR-004 clarified — only self-fields count for closure, annotations are display-only. LOW#3 heading regex tightened to require colon or EOL after severity word, with test fixture for ### HIGH availability and ## MEDIUM-term.

## Architecture

The three fixes land in three already-separate modules:

| Fix | Module | Entry point |
|---|---|---|
| 1 | `factory_next_action.py` + `factory_cmd_judge.py` + `factory_stages.py` | `recommended_next_action()` (inline advance-gate), `_unresolved_concern_from_verdict()` + call-order reorder, `prerequisite_failure()` + `record_advance_with_drift_if_needed()` |
| 2 | `factory_review_specs.py` | `_ACTIONABLE_FINDING_RE` + `ACTIONABLE_FINDING_SHAPES` manifest |
| 8 | NEW module `factory_invariants.py` (sibling of `factory_state.py`) | `run_invariant_checks(state, command, recommended, invariants=None) -> list[dict]` called from `run_factory.main()` tail; emits to stderr only |

Each fix is independently mergeable. They share one new state.json field (`invariant_warnings`) and extend one existing field (`stages.<stage>.unresolved_concerns`).

## Delivery strategy

One PR containing all three fixes plus the run-033 fixture. Fix 1 is the load-bearing behavior change; Fix 2 is a regex expansion with tests; Fix 8 is the guardrail that catches future regressions of Fix 1's shape.

The PR is opened as a **Draft** — it requires human review before merge because several in-flight decisions were made under token/time pressure (see closeout.md and decisions-summary).

## Implementation waves (slices)

All slices target files under `docs/workflow/operations/codex-skills/feature-factory/scripts/`.

### Slice 0 — Capture run-033 fixture `[CHECKPOINT]`

- Copy `docs/workflow/feature-runs/033-run-state-reconciliation/state.json` into `scripts/tests/fixtures/run-033-state-pre-fix.json` at the moment it exhibits the bug (judge_next_action=advance, stage unhealthy).
- If that snapshot has moved on, synthesize a minimal fixture with the same shape.

Estimated diff: ~100 lines (1 JSON file).

### Slice 1 — Fix 2 regex (smallest, no state interactions) `[CHECKPOINT]`

- Broaden `_ACTIONABLE_FINDING_RE` in `factory_review_specs.py` per FR-006.
- Add structurally anchored patterns: bullet-with-tag, numbered-list, heading, bold-prefix (including closing `**` and `**HIGH**:` shape), inline-Severity, nested-under-heading.
- Add `tests/test_review_specs.py` with positive and negative fixtures drawn from the 3 spec reviews of THIS feature (self-hosting test).

Estimated diff: ~100 lines (1 regex edit, 1 test file).

### Slice 2 — Fix 8 invariant self-check `[CHECKPOINT]`

- Add `run_invariant_checks(state, command)` helper in `factory_state.py`.
- Initial invariant: `judge_next_action == advance` AND `recommended_next_action` starts with `repair_` and ends with the same stage name.
- Emit to stderr when `--json` is in effect; stdout otherwise. Detect via a context var or explicit parameter threaded from the caller.
- Call the helper from the tail of `cmd_checkpoint`, `cmd_judge`, `cmd_reconcile`, `cmd_auto_reconcile`, `cmd_implement`, `cmd_deliver`, `cmd_block` in `run_factory.py`.
- Add `invariant_warnings: list[dict]` to state.json with default `[]` on read; store last 100 entries.
- Surface in `status` output.
- Add `tests/test_invariant_checks.py`.

Estimated diff: ~250 lines.

### Slice 3 — Fix 1 judge-advance honoring `[CHECKPOINT]`

- `factory_next_action.recommended_next_action`: add `if stages[stage].get("judge_next_action") == "advance": continue_past_stage()` check before each `not healthy` branch, for spec, plan, tasks (and ideally by loop).
- `factory_cmd_judge.py`: reorder both advance branches so `stage_state["judge_next_action"] = "advance"` is written BEFORE `recommended_next_action` is called; update `state` in place first.
- `factory_cmd_checkpoint.py`: when `judge_next_action == "advance"` and artifact SHA drifted from manifest, reseal manifest to current SHA and append `{type, old_sha, new_sha, at, reason}` to `stages[stage].annotations`.
- Extend `unresolved_concerns` entry shape with `id`, `addressed_at`, `addressed_by`, `deferred_reason`, `dismissed_reason`. Derive `id = sha256(stage|judge|round_raised|first-48-chars-reasoning-stripped)[:12]`.
- Add `checkpoint --address <id> --evidence <text>`, `checkpoint --defer <id> --reason <text>`, `checkpoint --dismiss <id> --reason <text>` flags. These MUTATE the unresolved_concerns entry in state.json.
- Next-stage checkpoint: before accepting a stage, verify every prior-stage concern is addressed/deferred/dismissed; else return `blocked: unresolved-concerns-from-<prior-stage>`.
- Update `factory_pr_body.py` to filter addressed/deferred/dismissed concerns out of the "unresolved judge concerns" block; render them in a new "resolved concerns" block.
- Regression test using Slice 0's fixture — pre-fix returns `repair_spec_checkpoint`, post-fix returns `author_plan`.

Estimated diff: ~400 lines (this is the largest slice).

### Slice 4 — Closeout + docs `[CHECKPOINT]`

- Update `docs/workflow/plans/feature-factory-runner-fixes.md` — mark Fixes 1, 2, 8 shipped; Fixes 3, 4, 5, 6, 7 remain as open follow-ups.
- Write `docs/workflow/feature-runs/ff-runner-fixes/closeout.md` + `postmortem.md`.
- Update `STATUS.md` once the PR is merged (post-PR task, not part of the PR).

Estimated diff: ~150 lines.

## Testing approach

Three layers:

1. **Unit** — `tests/test_review_specs.py`, `tests/test_next_action.py`, `tests/test_invariant_checks.py`. Each tests one module in isolation with table-driven cases.
2. **Integration** — `tests/test_run_033_regression.py` loads the Slice 0 fixture, monkey-patches any filesystem read, calls `recommended_next_action`, asserts it returns `author_plan` not `repair_spec_checkpoint`.
3. **Self-hosting** — the regex test in Slice 1 uses the actual review files produced by THIS feature's spec checkpoint as positive inputs. If the regex can't detect findings in its own bug-reports, the test fails.

No new third-party dependencies. Tests run under the runner's existing `pytest` invocation (if the `tests/` dir is wired up; if not, Slice 1 also wires it up).

## Residual risks (with verification)

- **Risk P1**: Codex and Gemini might produce slightly different review formats on future runs that slip past the expanded regex.
  **verification:** regex test uses real review files committed under the feature-runs directory. A future regression will be visible when a real review auto-accepts despite having findings — caught by the Fix 8 invariant the next time judges vote advance.

- **Risk P2**: Fix 1's FR-004 concern verification could cause a run in progress (with existing unresolved_concerns) to block. Mitigation: state defaulting in FR-011a treats missing fields as None; only concerns that exist with non-null `round_raised` are carried forward and verified.
  **verification:** Slice 3 regression test runs against the run-033 fixture which has real unresolved concerns, and asserts the flow completes (via deferral or addressing).

- **Risk P3**: (Revised in spec round-3 judge panel per implementation-risk judge) Warnings go to stderr *always* — no conditional routing. The module-level `JSON_MODE` flag in `factory_invariants.py` is preserved for back-compat of `set_json_mode()` callers but has no behavioral effect on the emit target. This aligns spec FR-009, this plan, and the tests.
  **verification:** invariant self-check test asserts warning goes to stderr in both JSON and non-JSON mode; stdout is always empty for warning output.

- **Risk P4**: After 3 spec-review rounds and a judge-panel round, the workflow may keep producing new findings without convergence. Mitigation: adversarial 3-round cap + judge panel 3-round cap combine to bound review churn; the operator may override via `deliver --override-judges` when judges block on already-deferred risks.
  **verification:** judge panel verdicts are visible in `status --slug` and recorded in `state.invariant_warnings[]` if advance-with-block occurs.

## Out of scope

Same as spec — Fixes 3, 4, 5, 6, 7 are deferred to separate features. Reviewer prompt changes, cloud/ changes, and scheduler changes are all out of scope.

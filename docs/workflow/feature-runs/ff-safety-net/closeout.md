# Closeout — FF Safety Net

## What shipped

Three mutually-reinforcing safety improvements to the Feature Factory runner:

### Fix 1 — Completeness judge veto

- `judge-prompts/completeness.md` now emits a structured `unaddressed_high_finding_ids: [string]` array. The judge is instructed to populate it with concern ids when blocking on unaddressed HIGH reviewer findings, emit `[]` otherwise, and self-validate before output.
- `judge_schema.json` extended with the optional field (back-compat).
- `factory_cmd_judge._persist_state` detects the veto condition — `completeness → block` AND populated ids array AND at least one cited id still unresolved in `stage_state.unresolved_concerns`. When it fires, majority proceed is overridden to `edit_and_rerun_judge`.
- **Fail-open guard (FR-003a)**: when `completeness` blocks with empty ids array but concerns remain open, runner appends a warning to `state.invariant_warnings[]` so the operator sees the prompt-quality gap in `status --slug` output. The tally still falls back to majority; the warning is the mitigation for silent degradation.
- **Whitespace-reason rejection (FR-006)**: `deliver --override-judges --reason "   "` now exits 2 before writing override state.

### Fix 2 — Auto-register mutating commands

- New `factory_mutating.py` module with `@mutates_state(name)` / `@readonly_command(name)` decorators.
- `run_judge` wrapped in a named `command_judge` function; no more bare lambdas in `set_defaults(func=...)`.
- All 14 subparser handlers decorated (12 mutating including `init`, 2 readonly).
- `_STATE_MUTATING_COMMANDS` is now lazily computed from `collect_mutating_command_names(enumerate_subparser_handlers(build_parser()))` — not a hand-maintained literal.
- Test enforces: every subparser handler is decorated, no bare lambdas, exact set membership, and the `init` edge case (invariant check on empty state returns `[]`).

### Fix 3 — GC review intermediates

- `command_checkpoint`, inside `with_locked_state(slug)`, deletes 5 intermediate-file globs per stage (`narrowed.txt`, `narrowed.json`, `raw.txt`, `stdout.txt`, `stderr.txt`).
- `--keep-intermediates` flag opts out for forensic/debug runs.
- Authoritative files preserved: `.review.md`, `.checkpoint.json`.
- Stage-scoped: `checkpoint --stage spec` does not touch `diff.*` intermediates.
- Test covers all 5 globs, preserved files, `--keep-intermediates`, stage-scoping, and lock-ordering (globbing must happen under the lock).

## Test results

Target: ~190 tests (167 existing + ~23 new). Final count reported in the PR body after Codex implementation completes.

Highlights:
- `tests/test_mutating_registry.py` — every handler decorated, no lambdas, init edge-case safe.
- `tests/test_review_gc.py` — 5-glob delete, preserve critical files, lock-before-glob.
- `tests/test_completeness_veto.py` — 4 US1 acceptance scenarios, fail-open guard, whitespace-reason rejection, legacy no-field fallback.

## What remains open

None of this feature's HIGH findings are deferred. From the review cycle, LOW/MEDIUM accepted limitations:

- Completeness judge prompt reliability still depends on LLM output quality. Fail-open guard mitigates silent failure (Risk P1).
- Registry scan relies on argparse internals; isolated via a helper with its own test (Risk P2).
- GC glob list is static — new intermediate shapes need a spec update (Risk R4).
- `.review.md` atomic writes during reviewer dispatch not in scope (Risk R5).

## Deferred to future features

- Plan Fix 3 — `--force-advance` CLI (Feature B).
- Plan Fix 4 — rename `repair_X_checkpoint` (probably skip — cosmetic, wide blast).
- Plan Fix 5 — `--validation-only` flag past 3-round cap (Feature B).
- Plan Fix 7 — raise default char budgets (Feature B).
- Risk R5 — embedding-based concern IDs (Feature C).
- Risk R7 — structured JSON reviewer output (larger project).
- Adversarial P2-6 — restatement-judge severity-noise gaming (Feature B).

## Where the artifacts live

- Spec: `docs/workflow/feature-runs/ff-safety-net/spec.md`
- Plan: `docs/workflow/feature-runs/ff-safety-net/plan.md`
- Tasks: `docs/workflow/feature-runs/ff-safety-net/tasks.md`
- Reviews: `docs/workflow/feature-runs/ff-safety-net/reviews/*.review.md`
- Implementation: `docs/workflow/operations/codex-skills/feature-factory/scripts/` (new `factory_mutating.py` plus edits to 5 existing modules)
- Tests: `docs/workflow/operations/codex-skills/feature-factory/scripts/tests/test_{mutating_registry,review_gc,completeness_veto}.py`

## How this was built

Full Feature Factory workflow — discovery + spec + 3 spec review rounds + spec judge panel (completeness + restatement + implementation-risk, 2-proceed advance) + plan checkpoint + tasks checkpoint + Codex implementation for all 3 slices.

Discipline lessons from the [PR #744 postmortem](../ff-runner-fixes/postmortem.md) were applied: no killed subprocesses, no shortcut reviewers, implementation dispatched to Codex rather than written by Claude. The restatement judge prompt (rewritten in PR #744) worked correctly this run — no first-round-block trap.

# Plan — FF Safety Net

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Round 1-2 HIGH findings addressed; round 3 auto-accepted.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: Round 1-2 HIGH findings addressed; round 3 auto-accepted.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Round 1-2 HIGH findings addressed; round 3 auto-accepted.

## Architecture

Three surgical changes, three sibling modules, minimal shared state:

| Fix | Primary file | Supporting |
|---|---|---|
| 1 — Completeness veto | `factory_cmd_judge.py` (`_persist_state` tally) | `judge-prompts/completeness.md` (prompt), `judge_schema.json` (validator), `factory_cmd_deliver.py` (whitespace reason check) |
| 2 — Auto-register mutating commands | NEW `factory_mutating.py` (decorators) | `run_factory.py` (replace literal set, wrap run_judge as named function) |
| 3 — GC review intermediates | `factory_cmd_checkpoint.py` (top of `command_checkpoint` inside state lock) | `run_factory.py` (add `--keep-intermediates` flag) |

Only one shared state touch: FR-003a writes to `state["invariant_warnings"]` which already exists from PR #744 — no schema change.

## Delivery strategy

One PR. Three fixes ship together because they're mutually reinforcing (completeness veto gives the workflow teeth, auto-register keeps the invariant trustworthy as code grows, GC keeps the workspace clean so neither of the first two is confused by stale data).

Implementation dispatched to Codex per `~/.claude/rules/agent-invocation.md` token-saving rules.

## Implementation waves (slices)

### Slice 1 — Auto-register mutating commands `[CHECKPOINT]`

- Create `factory_mutating.py` with `@mutates_state(name)` and `@readonly_command(name)` decorators + `collect_mutating_command_names(handlers)` helper.
- Wrap `run_judge` in a named function `command_judge` in `run_factory.py`; apply `@mutates_state("judge")`.
- Apply decorators to all 13 existing `command_*` handlers per FR-011 (12 mutating incl `init`, 2 readonly).
- Replace literal `_STATE_MUTATING_COMMANDS` in `run_factory.py` with `collect_mutating_command_names([...])` seeded from `build_parser()` dispatch map.
- Add `tests/test_mutating_registry.py` per FR-012 — enumerates subparsers, rejects bare lambdas, asserts every handler is decorated.

Rationale: Slice 1 first because it's foundational (decorators in place) and has no behavioral change beyond the mechanical literal-to-computed swap. Low risk, touches many files.

Estimated diff: ~300 lines (1 new module + decorator applications + 1 test file).

### Slice 2 — GC review intermediates `[CHECKPOINT]`

- Add `--keep-intermediates` argparse flag to `checkpoint` subcommand.
- At top of `command_checkpoint`, inside `with_locked_state(slug)`: call `_gc_review_intermediates(slug, stage, keep)` which deletes the 5 globs per FR-015.
- Add `tests/test_review_gc.py` covering all 4 US3 scenarios + the stage-scoping + the lock-ordering assertion.

Rationale: Slice 2 is independent of Slice 1 (different file, different concern). Ships second because Slice 1 adds the decorator convention that Slice 2's `command_checkpoint` change should also carry.

Estimated diff: ~200 lines.

### Slice 3 — Completeness veto `[CHECKPOINT]`

- Update `judge-prompts/completeness.md` per FR-001 + FR-001a — add `unaddressed_high_finding_ids` array instructions, self-validation rule, concrete example.
- Update `judge_schema.json` per FR-002 — include optional `unaddressed_high_finding_ids: array of string`.
- Update `factory_cmd_judge._persist_state` per FR-003 + FR-003a + FR-004: detect veto condition (block + completeness + at least one cited id still open), override majority, record `invariant_warnings[]` entry on fail-open.
- Update `factory_cmd_deliver.command_deliver` per FR-006: reject `--override-judges --reason ""` or `"   "` with exit 2.
- Add `tests/test_completeness_veto.py` covering 4 US1 acceptance scenarios + FR-003a fail-open guard + FR-006 whitespace-reason rejection.

Rationale: Slice 3 last because it's the most complex (prompt + schema + tally logic + deliver guard) and depends on nothing from the earlier slices. Can land independently.

Estimated diff: ~400 lines.

### Slice 4 — Closeout + docs `[CHECKPOINT]`

- Write `docs/workflow/feature-runs/ff-safety-net/closeout.md` + `postmortem.md`.
- Update `STATUS.md` after merge (post-PR task).

## Testing approach

Three new test files, all under the existing runner pytest suite:

1. **`tests/test_mutating_registry.py`** — enumerates `build_parser()` subcommands, asserts decoration, rejects bare lambdas, includes a negative test adding a fake undecorated command to verify the test fails cleanly.
2. **`tests/test_review_gc.py`** — fixtures for each of the 5 GC globs + 2 preserved file types; runs `command_checkpoint` against a minimal fixture workflow; asserts correct deletion/preservation, `--keep-intermediates` suppression, stage-scoping, lock-ordering.
3. **`tests/test_completeness_veto.py`** — mocks judge verdict objects with populated/empty/missing `unaddressed_high_finding_ids`; asserts tally outcomes for each US1 acceptance scenario + fail-open guard + whitespace-reason rejection.

Total target: ~190 tests (167 existing + ~23 new).

## Residual risks (with verification)

- **Risk P1** — Completeness judge prompt reliability still depends on LLM output quality. Mitigation: FR-001a self-validation + FR-003a fail-open guard + invariant_warnings surfaces gaps. **verification:** a live judge run with the updated prompt against a staged state.json fixture would confirm the array is populated correctly. If not populated, the fail-open invariant warning makes the gap visible rather than silent.

- **Risk P2** — `build_parser()` introspection is Python-internal — if argparse changes its internals in a future version, the registry scan breaks.
  **verification:** pin the argparse API surface via a narrow helper in `factory_mutating` with its own test. If argparse internals change, one test fails with a clear signal.

- **Risk P3** — `_record_override_if_needed` is called before the concern gate in `command_deliver`. The whitespace-reason check (FR-006) must happen BEFORE `_record_override_if_needed` to avoid persisting a bad override record.
  **verification:** explicit test asserts that `deliver --override-judges --reason "   "` exits 2 WITHOUT writing to `state["override"]`.

- **Risk P4** — GC is atomic per-file but not transactional — a crash mid-GC could leave 2 of 5 files deleted. Subsequent run re-runs GC and catches the rest.
  **verification:** idempotent by construction — no concern.

## Out of scope

Same as spec — Fixes 3, 4, 5, 7 from plan doc + Risks R5, R7 + P2-6 restatement-judge hardening all remain deferred.

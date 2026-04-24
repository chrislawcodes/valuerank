# Tasks — FF Safety Net

## Slice 1 — Auto-register mutating commands `[CHECKPOINT]`

- [x] T1.1 Create `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_mutating.py` with `@mutates_state(name: str)` and `@readonly_command(name: str)` decorators; each attaches `__ff_mutates_state__ = name` or `__ff_readonly_command__ = name` to the wrapped function.
- [x] T1.2 Add `collect_mutating_command_names(handlers: Iterable[Callable]) -> frozenset[str]` that returns only the names from handlers decorated `@mutates_state`. Add `all_classified_names(handlers)` that returns `(mutating_set, readonly_set, undecorated_set)` for the test.
- [x] T1.3 Add `enumerate_subparser_handlers(parser)` helper that walks `parser._actions`, finds the `_SubParsersAction`, and yields `(subcommand_name, handler_callable)` tuples from `subparsers.choices[name]._defaults["func"]`.
- [x] T1.4 In `run_factory.py`, define a new `command_judge(args)` function that wraps `run_judge(args.slug, args.stage, json_output=args.json, prompt_override=args.prompt_override, override_reason=args.override_reason, migration_bypass=args.migration_bypass)`. Apply `@mutates_state("judge")`. Update the judge subparser to use `set_defaults(func=command_judge)` instead of the lambda.
- [x] T1.5 Apply `@mutates_state("<name>")` to: `command_init`, `command_checkpoint`, `command_reconcile`, `command_auto_reconcile`, `command_block`, `command_repair`, `command_closeout`, `command_discover`, `command_parallel`, `command_implement`, `command_deliver`, `command_judge`. Apply `@readonly_command("<name>")` to: `command_status`, `command_doctor`.
- [x] T1.6 Replace the literal `_STATE_MUTATING_COMMANDS` in `run_factory.py` with a lazy-computed set. Use a module-level `_MUTATING_CACHE: frozenset[str] | None = None` and a `_get_mutating_commands() -> frozenset[str]` helper that calls `collect_mutating_command_names(enumerate_subparser_handlers(build_parser()))` on first access. This avoids import-order fragility (tasks dependency-order review finding): if `build_parser()` is called before all `command_*` handlers + subparser wiring are fully imported, the first call initializes the cache correctly after argument parsing. The invariant post-check in `main()` calls `_get_mutating_commands()` — by then all parsing has happened.
- [x] T1.7 Add `tests/test_mutating_registry.py` covering:
  - every subparser in `build_parser()` has a decorated handler (no bare lambdas, no undecorated functions);
  - a fake test scenario adds an undecorated function to a mock parser and asserts the test fails with a message naming the subcommand;
  - `collect_mutating_command_names` returns exactly the 12 mutating names `{init, checkpoint, judge, reconcile, auto-reconcile, implement, deliver, block, repair, closeout, discover, parallel}`;
  - **decorator attachment**: directly assert `getattr(command_init, "__ff_mutates_state__") == "init"` and same for each of the 12 mutating handlers; assert `__ff_readonly_command__` for `command_status` and `command_doctor`. This proves each function is really decorated, not just that the aggregate set has the right size (per tasks execution-adversarial MEDIUM #2).
  - **init safety**: a full run of `check_judge_advance_vs_recommended` against a state matching what `command_init` produces (empty stages dict) returns `[]`.
- [x] T1.8 Run `pytest docs/workflow/operations/codex-skills/feature-factory/scripts/tests/` — all 167 existing + new tests pass.
- [x] T1.9 Commit.

## Slice 2 — GC review intermediates `[CHECKPOINT]`

- [x] T2.1 Add `--keep-intermediates` argparse flag to the `checkpoint` subparser in `run_factory.py`.
- [x] T2.2 Add `_gc_review_intermediates(slug: str, stage: str, keep: bool) -> list[Path]` helper in `factory_cmd_checkpoint.py`. When `keep` is True, return `[]`. Otherwise glob the 5 patterns per FR-015 under `reviews_dir(slug)`, delete each matching file, return the list of deleted paths for logging.
- [x] T2.3 Call `_gc_review_intermediates` from `command_checkpoint` INSIDE `with_locked_state(slug)` (acquire lock → GC → dispatch reviews) per FR-014.
- [x] T2.4 Add `tests/test_review_gc.py` covering:
  - 5-glob positive: fixtures for each of `.narrowed.txt`, `.narrowed.json`, `.raw.txt`, `.stdout.txt`, `.stderr.txt` for the target stage are deleted;
  - preservation: `.review.md` and `.checkpoint.json` for the same stage are untouched;
  - stage-scoping: a `diff.codex.*.raw.txt` is NOT deleted when running `checkpoint --stage spec`;
  - `--keep-intermediates` suppresses the delete;
  - lock-ordering: assertion via a mock that `with_locked_state` is entered before BOTH the globbing phase AND the delete syscalls. Mock `_gc_review_intermediates` to record the call sequence; assert the lock `__enter__` fires first (per tasks dependency-order MEDIUM #2).
- [x] T2.5 Run `pytest tests/` — all pass.
- [x] T2.6 Commit.

## Slice 3 — Completeness veto `[CHECKPOINT]`

- [x] T3.1 Update `judge-prompts/completeness.md` per FR-001 + FR-001a:
  - Add an `unaddressed_high_finding_ids: [string]` field to the verdict JSON specification.
  - Add system-prompt text: "If you vote block because HIGH reviewer findings remain unaddressed, populate `unaddressed_high_finding_ids` with the concern ids (12-hex-char strings from the review files). If you block for a different reason, emit `[]`. If you emit `block` with this array empty, the runner will treat this as a prompt-quality issue and log a warning."
  - Add a concrete JSON example in the user-prompt template showing both a populated and empty array case.
- [x] T3.2 Update `docs/workflow/operations/codex-skills/feature-factory/scripts/judge_schema.json` per FR-002 — add `unaddressed_high_finding_ids` as an optional array-of-string field.
- [x] T3.3 In `factory_cmd_judge._persist_state`, around the existing block-count / proceed-count tally:
  - Extract `completeness_verdict = next((v for v in verdicts if v.get("judge") == "completeness"), None)`.
  - Detect veto condition per FR-003: `completeness_verdict.verdict == "block"` AND `len(completeness_verdict.get("unaddressed_high_finding_ids", [])) > 0` AND at least one of those ids is unresolved in `stage_state.get("unresolved_concerns", [])` (open = no `addressed_at` AND no `deferred_reason` AND no `dismissed_reason`).
  - If veto fires AND `proceed_count >= 2`: override with local `outcome_value = "rejudge"`, local `next_action = "edit_and_rerun_judge"`, state `stage_state["judge_next_action"] = "edit_and_rerun_judge"`, and reason text citing the specific id(s).
- [x] T3.4 Implement FR-003a fail-open guard: when `completeness_verdict.verdict == "block"` AND ids array is empty/missing AND `stage_state.unresolved_concerns` has any entry still open, append to `state.setdefault("invariant_warnings", [])` an entry `{at: <epoch>, command: "judge", stage: stage, detail: "completeness judge blocked without structured HIGH ids while concerns remain — prompt may be malformed"}`. Do not override the verdict — fall back to majority.
- [x] T3.5 Update `factory_cmd_deliver.command_deliver` per FR-006: if `args.override_judges` is set, validate `args.reason` via `_nonblank` (already in `factory_cmd_checkpoint`); if blank, exit 2 BEFORE calling `_record_override_if_needed`.
- [x] T3.6 Add `tests/test_completeness_veto.py` covering:
  - US1.1: 2 proceed + 1 completeness-block-with-populated-ids (at least one open) → `edit_and_rerun_judge`.
  - US1.2: same state but concern is addressed first → veto doesn't fire, advances.
  - US1.3: completeness blocks with empty ids + no open concerns → majority rules, advance.
  - US1.4: `deliver --override-judges --reason "..."` bypasses veto.
  - FR-003a fail-open: completeness blocks with empty ids + open concerns present → `invariant_warnings[]` entry appended, majority rules.
  - FR-006 whitespace: `deliver --override-judges --reason "   "` exits 2 without writing override state.
  - Legacy: a verdict dict missing the `unaddressed_high_finding_ids` field entirely defaults to majority-rules (no veto) per FR-007.
- [x] T3.7 Run `pytest tests/` — all pass.
- [x] T3.8 Commit.

## Slice 4 — Closeout + docs `[CHECKPOINT]`

- [x] T4.1 Write `docs/workflow/feature-runs/ff-safety-net/closeout.md` summarizing what shipped, any deferred risks, and artifact locations.
- [x] T4.2 Write `docs/workflow/feature-runs/ff-safety-net/postmortem.md` covering what worked, what didn't, proposed workflow improvements.
- [x] T4.3 Commit. (STATUS.md update is post-merge — separate task.)

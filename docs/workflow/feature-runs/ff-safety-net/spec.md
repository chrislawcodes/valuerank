# FF Safety Net — Spec

**Feature branch**: `claude/ff-safety-net`
**Slug**: `ff-safety-net`
**Created**: 2026-04-24
**Status**: Draft spec (discovery complete)
**Supporting context**: Follow-up to PR #744 (merged commit `3ef2a08b`). Addresses 3 backlog items that reinforce FF workflow trustworthiness.

## Summary

Three surgical improvements to the Feature Factory runner that reinforce each other:

1. **Completeness judge veto** — when the `completeness` judge votes block on an unaddressed HIGH reviewer finding, that block overrides majority `proceed` votes. No more 2-of-3-outvotes-completeness scenarios shipping features with unresolved HIGH concerns.
2. **Auto-register mutating commands** — replace the hand-maintained `_STATE_MUTATING_COMMANDS` frozenset with a decorator-driven registry. A future developer adding a new `command_*` function can't silently escape the invariant self-check.
3. **GC stale review intermediates** — at checkpoint start, delete leftover `reviews/<stage>.*.narrowed.*`, `.raw.txt`, `.stdout.txt`, `.stderr.txt` unless `--keep-intermediates` is passed. Prevents the confusion-and-corruption class that showed up during PR #744's own run.

All three land in the same codebase (`docs/workflow/operations/codex-skills/feature-factory/scripts/`) and they share no runtime coupling, but together they close a coherent class of "the FF workflow silently degrades over time" failure modes.

## Problem statement

Three known gaps from the post-PR-#744 adversarial review and leftover backlog:

1. **Completeness judge can be outvoted.** Today, if `completeness` judge blocks on an unaddressed HIGH finding but the other two judges vote proceed, the panel advances 2-of-3. The HIGH is recorded as an "unresolved concern" and renders in the PR body, but nothing stops `deliver --merge-when-green` from auto-merging the feature. The completeness judge's whole job is checking HIGH coverage; its block should be veto-strength on that specific class.

2. **`_STATE_MUTATING_COMMANDS` is manually curated.** [run_factory.py:105-119](../../operations/codex-skills/feature-factory/scripts/run_factory.py) hand-lists the 11 mutating commands. If someone adds a `command_*` function that writes to state.json and forgets to add its subcommand name to the set, the new command silently escapes the invariant self-check (Fix 8 from PR #744). Gemini flagged this as F-1 in tasks.gemini.coverage-adversarial during PR #744; documented as an accepted limitation. This feature fixes it.

3. **Review intermediates pile up.** `reviews/*.narrowed.txt`, `reviews/*.raw.txt`, `reviews/*.stdout.txt`, `reviews/*.stderr.txt` accumulate across failed checkpoint attempts. Nothing garbage-collects them. A fresh run starts with stale files visible, the orchestrator gets confused, and killing a subprocess (which happened in PR #744's own run) corrupts a `.review.md` file. This was Plan Fix 6 — originally deferred but directly relevant to the corruption class we hit.

## Scope

### In scope

- **Fix 1 — completeness veto**: extend `factory_cmd_judge._persist_state` (or equivalent tally site) so a `completeness` judge block with reason citing an unaddressed HIGH reviewer finding overrides a 2-of-3 majority proceed. The decision becomes `edit_and_rerun_judge` instead of `advance`.
- **Fix 2 — decorator-driven mutating-command registry**: add `@mutates_state` decorator in a new `factory_mutating.py` module. Apply it to every existing mutating command. `_STATE_MUTATING_COMMANDS` is derived by scanning decorated functions, not by hand. Test asserts every `command_*` function is either decorated mutating or explicitly marked `@readonly_command`.
- **Fix 3 — review-intermediate GC**: at the top of `command_checkpoint`, delete `reviews/{stage}.*.narrowed.*`, `reviews/{stage}.*.raw.txt`, `reviews/{stage}.*.stdout.txt`, `reviews/{stage}.*.stderr.txt` for the target stage, unless `--keep-intermediates` is passed. Preserve `reviews/{stage}.*.review.md` and `reviews/{stage}.checkpoint.json`.
- **Tests** covering all three behaviors + negative cases + regression coverage.

### Out of scope (deferred to separate features)

- Plan Fix 3 — `--force-advance` CLI (subsumed by `--override-judges` + lifecycle CLI).
- Plan Fix 4 — rename `repair_X_checkpoint` → `run_X_checkpoint` (cosmetic, wide blast).
- Plan Fix 5 — `--validation-only` flag past 3-round cap (Feature B).
- Plan Fix 7 — raise default char budgets (Feature B).
- Spec Risk R5 — embedding-based concern IDs (Feature C).
- Spec Risk R7 — structured JSON reviewer output.
- Spec Risk R1 — fenced-code-block regex false positive.
- Adversarial P2-6 — restatement judge severity-noise gaming (Feature B).

## User stories

### US1 — Completeness judge has veto on unaddressed HIGH (Priority: P1)

**As** the orchestrator (or human merging a PR)
**I need** the `completeness` judge's block to prevent advancement when it identifies an unaddressed HIGH reviewer finding
**So that** the most important reviewer signal cannot slip past a 2-of-3 majority vote.

**Why P1**: this closes the unsafe "HIGH ships silently" path that the adversarial review of PR #744 flagged as a live correctness gap. Without it, the concern-lifecycle CLI we added is a feature that operators can ignore.

**Independent test**: construct a judge panel state with `completeness → block (citing unaddressed HIGH concern)`, `restatement → proceed`, `implementation-risk → proceed`. Assert `judge_next_action == "edit_and_rerun_judge"`, not `"advance"`. Then `checkpoint --address <id> --evidence "fixed"` the HIGH. Re-run the same panel tally. Assert `judge_next_action == "advance"`.

**Acceptance scenarios**:

1. **Given** `completeness` judge votes `block` with reasoning that names an unaddressed HIGH reviewer finding (reasoning contains `unaddressed` + `high`), AND 2 other judges vote `proceed`, **when** the tally runs, **then** the final verdict is `edit_and_rerun_judge`, not `advance`.
2. **Given** the HIGH concern is subsequently marked `addressed` via `checkpoint --address <id> --evidence <text>`, **when** the panel runs again with the same 2-proceed + 1-completeness-block pattern, **then** the tally **advances** — the completeness judge will now vote proceed because the HIGH is resolved.
3. **Given** `completeness` blocks but its reasoning does NOT cite unaddressed HIGH (e.g., MEDIUM concern, or general caution), **when** tally runs with 2 proceed, **then** majority rules — advance. Veto is specific to unaddressed HIGH, not general block.
4. **Given** the operator needs to ship anyway, **when** `deliver --override-judges --reason "<text>"` is invoked, **then** the veto is bypassed (existing escape hatch).

### US2 — Mutating commands auto-register (Priority: P1)

**As** a future developer adding a new `command_*` function
**I need** the invariant self-check to automatically cover my new command without me remembering to edit a frozenset
**So that** the Fix 8 guardrail (from PR #744) doesn't silently degrade over time.

**Why P1**: the `_STATE_MUTATING_COMMANDS` literal is drift-prone by construction. Without auto-registration, we're one PR away from a missed invariant that re-introduces the run-033 class of bug.

**Independent test**: list every `command_*` function in the scripts/ directory. Assert each one is either decorated `@mutates_state` or `@readonly_command`. Fail loudly on any undeclared function.

**Acceptance scenarios**:

1. **Given** a `@mutates_state` decorator applied to `command_X`, **when** `_STATE_MUTATING_COMMANDS` is computed, **then** `"x"` (or the canonical subcommand name) appears in the frozenset.
2. **Given** a `@readonly_command` decorator on `command_status`, **when** the frozenset is computed, **then** `"status"` is NOT in it.
3. **Given** someone adds a new `command_new_thing` function without any decorator, **when** the test suite runs, **then** a specific test fails with a message naming the undecorated function.
4. **Given** `run_factory.main()` checks `command_name in _STATE_MUTATING_COMMANDS`, **when** a decorated command runs, **then** the invariant post-check fires just as it did with the hand-kept list.

### US3 — Review intermediates don't pile up (Priority: P2)

**As** the orchestrator resuming a feature run
**I need** stale `reviews/*.narrowed.*` and `.raw.txt` files from prior failed attempts cleaned up at the start of a new checkpoint
**So that** I don't get confused by leftover output and can't accidentally corrupt a `.review.md` by killing a subprocess mid-write.

**Why P2**: real workflow friction but not a load-bearing correctness bug. Lower than US1 and US2 because an operator can always `rm` manually today.

**Independent test**: place sample `reviews/spec.codex.feasibility-adversarial.review.md.raw.txt`, `.stdout.txt`, `.stderr.txt`, `.narrowed.txt` files in the reviews dir. Run `checkpoint --stage spec` against a minimal fixture. Assert the four intermediate files are gone. Assert the main `.review.md` and `checkpoint.json` files are untouched.

**Acceptance scenarios**:

1. **Given** `reviews/spec.codex.feasibility-adversarial.review.md.raw.txt` + `.stdout.txt` + `.stderr.txt` + `.narrowed.txt` + `.narrowed.json` exist, **when** `checkpoint --stage spec` runs, **then** all 5 intermediate files are deleted before review dispatch.
2. **Given** `reviews/spec.codex.feasibility-adversarial.review.md` and `reviews/spec.checkpoint.json` exist, **when** `checkpoint --stage spec` runs, **then** neither is deleted.
3. **Given** `checkpoint --stage spec --keep-intermediates` is invoked, **when** checkpoint runs, **then** stale intermediates are preserved (for manual debugging of a failed run).
4. **Given** a different stage's intermediates exist (e.g. `reviews/diff.*.narrowed.txt`) when running `checkpoint --stage spec`, **when** the spec checkpoint runs, **then** the diff-stage files are NOT deleted — GC is scoped to the target stage.

## Functional requirements

### Fix 1 — Completeness veto (US1)

**Changed in spec round-1 reconcile:** all three reviewers flagged the regex-based veto as too brittle for a safety gate (HIGH in all 3 reviews). The veto now depends on a **structured signal from the completeness judge prompt** — regex is NOT a fallback. A prompt update is part of this feature's scope.

- **FR-001**: `judge-prompts/completeness.md` MUST be updated to emit a JSON verdict that includes a `unaddressed_high_finding_ids: [string]` array alongside the existing `verdict`/`reasoning` fields. When the judge votes `block` specifically because HIGH reviewer findings remain unaddressed, it populates this array with the concern `id`s (or reviewer-finding references) that are still open. An empty array means "I blocked for a different reason." The array is the veto's single source of truth; reasoning text is audit detail only.
- **FR-002**: `factory_cmd_judge._validate_json_output` (or the schema validator) MUST accept the new `unaddressed_high_finding_ids` field and ignore unknown fields from older judge prompts (back-compat). `judge_schema.json` is updated to include the new field.
- **FR-003**: The tally code MUST detect the veto condition by checking: `verdict.verdict == "block"` AND `verdict.judge == "completeness"` AND `len(verdict.get("unaddressed_high_finding_ids", [])) > 0` AND **at least one** of the referenced ids is still unresolved in the current `stage_state.unresolved_concerns` (i.e., has no `addressed_at OR deferred_reason OR dismissed_reason`). Corrected in spec round-2 reconcile — an earlier draft inverted the logic and would have let one stale/resolved id suppress the veto even when other cited HIGHs remained open. Ground-truth-cross-check rule: **the veto fires if ANY cited id is still unresolved; the veto does NOT fire only if ALL cited ids are resolved.**
- **FR-003a** *(added in spec round-3 judge panel — completeness judge fail-open guard)*: When `completeness` votes block AND `unaddressed_high_finding_ids` is empty/missing AND `stage_state.unresolved_concerns` is non-empty, the tally MUST NOT silently fall back to majority — it MUST write an `invariant_warnings[]` entry `{command: "judge", stage: <stage>, detail: "completeness judge blocked without structured HIGH ids while concerns remain — prompt may be malformed"}` and fall back to majority. The operator sees the warning in `status --slug` output. This closes the fail-open path the judge panel flagged (empty ids + block + open concerns → shipping without review).
- **FR-004**: When FR-003's condition matches AND `proceed_count >= 2`, the tally MUST override majority: `outcome_value = "rejudge"`, `next_action = "edit_and_rerun_judge"`, `stage_state["judge_next_action"] = "edit_and_rerun_judge"`. Reason text includes the specific id(s) cited: `"completeness judge veto: unaddressed HIGH concerns {id1,id2} — majority override"`.
- **FR-005**: When all `unresolved_concerns` for the stage are resolved, the veto MUST NOT fire. Verified via the cross-check in FR-003.
- **FR-006**: `deliver --override-judges --reason "<text>"` MUST continue to bypass the veto (existing escape hatch).
- **FR-007**: A test MUST cover the legacy-reasoning path: if an older judge run produced a verdict without the structured field, the tally defaults to majority-rules (no veto). This prevents the structured-signal change from breaking replay of historical state.

### Fix 2 — Auto-register mutating commands (US2)

**Changed in spec round-1 reconcile:** Gemini and Codex flagged that `command_*` scan isn't authoritative — the argparse dispatcher is. And `init` was mis-labeled read-only despite creating state. Fixes below.

- **FR-008**: A new module `factory_mutating.py` (sibling of `factory_invariants.py`) MUST define `@mutates_state(command_name: str)` and `@readonly_command(command_name: str)` decorators. Each decorator attaches `__ff_mutates_state__` (with canonical subcommand name) or `__ff_readonly_command__` to the wrapped function.
- **FR-009**: The authoritative source for "every subcommand the runner exposes" is the argparse subparser registry in `build_parser()`. The test in FR-012 enumerates subcommands from argparse (not from a function-name scan) and asserts each corresponding handler is decorated. This closes the "a command with a non-`command_*` name bypasses the test" gap Gemini flagged.
- **FR-010**: `factory_mutating.collect_mutating_command_names(handlers)` takes an iterable of handler callables (e.g., `[command_checkpoint, command_judge_wrapped, ...]`) and returns a `frozenset[str]` built from the `__ff_mutates_state__` attribute. `run_factory.py` replaces the literal `_STATE_MUTATING_COMMANDS` with this computed set, seeded from the dispatch map built in `build_parser()`.
- **FR-011**: Every subcommand handler MUST be decorated. For `judge` which is dispatched via `lambda args: run_judge(...)`, we wrap it in a named function `command_judge(args)` that applies the decorator and delegates to `run_judge`. No more lambdas in `set_defaults(func=...)`.
  - Mutating (`@mutates_state`): `checkpoint, judge, reconcile, auto-reconcile, implement, deliver, block, repair, closeout, discover, parallel, init` — **init is reclassified as mutating** per Codex edge-cases MEDIUM #3 (it creates the workflow directory and seeds state.json; excluding it reintroduced the drift hole). The invariant self-check on init is harmless because there are no stages yet to detect contradiction in — the check runs, finds no stages, emits no warning.
  - Read-only (`@readonly_command`): `status, doctor`.
- **FR-012**: A new test in `tests/test_mutating_registry.py` MUST enumerate subcommands from `build_parser()`, resolve each to its handler, and assert each handler has exactly one decorator. If any subcommand's handler is undecorated, the test MUST fail with a message naming the subcommand AND the handler function.
- **FR-013**: The invariant post-check in `run_factory.main()` MUST continue to behave identically for existing commands — the change is purely mechanical.

### Fix 3 — Review-intermediate GC (US3)

**Changed in spec round-1 reconcile:** Gemini flagged a race if GC runs before the state lock (MEDIUM #3). Codex flagged summary/FR-011/US3 inconsistency on the intermediate count (MEDIUM). Both fixed below.

- **FR-014**: `command_checkpoint` MUST acquire the state lock via `with_locked_state(slug)` BEFORE running GC. Sequence is: parse args → acquire lock → GC → dispatch reviews → release lock. This closes the concurrent-runner race Gemini flagged. Note: `with_locked_state` is already used by other paths; the new code just calls it earlier.
- **FR-015**: Inside the lock, `command_checkpoint` MUST delete the following files for the target stage (5 globs, canonical list; summary, FRs, and US3 scenarios all reference this list):
  - `reviews/{stage}.*.narrowed.txt`
  - `reviews/{stage}.*.narrowed.json`
  - `reviews/{stage}.*.raw.txt`
  - `reviews/{stage}.*.stdout.txt`
  - `reviews/{stage}.*.stderr.txt`
- **FR-016**: The GC MUST NOT delete:
  - `reviews/{stage}.*.review.md` (authoritative, resolution-bearing)
  - `reviews/{stage}.checkpoint.json` (manifest)
  - Any file not matching the target stage prefix (so `diff.*` files survive a `checkpoint --stage spec`).
- **FR-017**: A new argparse flag `--keep-intermediates` on the `checkpoint` subcommand MUST opt out of the GC for a single invocation (debugging or forensic purposes). When omitted, GC always runs (after lock acquisition).
- **FR-018**: A test MUST verify (a) the 5 globs are deleted for the target stage, (b) preserved files are untouched, (c) `--keep-intermediates` suppresses deletion, (d) other-stage intermediates are NOT touched, (e) GC runs inside the state lock (assertion: a concurrent invocation blocks on the lock, does not race on GC).

### Shared

- **FR-019**: No change to reviewer prompts. The ONLY prompt change is `judge-prompts/completeness.md` to emit the new `unaddressed_high_finding_ids` structured field (FR-001); this is required, not optional.
- **FR-020**: All 167 existing runner tests MUST continue to pass. Target total: ~190.

## Implementer reference (added in spec round-3 judge panel)

The implementation-risk judge flagged five load-bearing gaps that would force guessing. Resolved below by citing concrete code.

1. **`stage_state.unresolved_concerns` shape**: list of dicts. Each dict has keys `{id: str, stage: str, judge: str, model: str, confidence, reasoning: str, round_raised: int, also_raised_in_round: list, addressed_at: int|None, addressed_by: str|None, deferred_reason: str|None, dismissed_reason: str|None}`. Defined in `factory_cmd_judge._unresolved_concern_from_verdict` and extended by `factory_state._backfill_unresolved_concern_ids`. A concern is open iff `addressed_at is None and not deferred_reason and not dismissed_reason`.
2. **Completeness judge JSON schema**: `judge_schema.json`. Today the validated shape is `{verdict: "proceed"|"proceed-with-annotation"|"block", judge: str, model: str, confidence: int, reasoning: str}`. FR-001 adds an optional `unaddressed_high_finding_ids: [str]` array. Back-compat: when missing, treat as empty. `factory_cmd_judge._validate_json_output` already passes unknown fields through untouched — the schema update is limited to `judge_schema.json`.
3. **`build_parser()` dispatch shape**: in `run_factory.py`, each subparser calls `.set_defaults(func=command_*)`. The registry test walks `parser._actions` to find the subparsers action, then iterates `subparsers.choices` to get `(name, sub_parser)` pairs, and extracts each sub_parser's `_defaults["func"]`. This gives `(subcommand_name, handler_callable)` tuples — authoritative.
4. **GC glob semantics and lock timing**: FR-014 specifies the exact sequence. `with_locked_state(slug)` is a context manager — GC runs inside the `with` block so concurrent checkpoints on the same slug serialize naturally. The glob is `(reviews_dir / f"{stage}.*{suffix}").iterdir()`-style per-suffix; NOT a recursive walk.
5. **Structured signal extraction location**: the completeness verdict JSON arrives in `factory_cmd_judge._persist_state` as `verdict: dict` items in the `verdicts` list. The new field is accessed via `verdict.get("unaddressed_high_finding_ids", [])`. Tally logic in the same function is where the veto check goes — currently around line 875-900 where `block_count`/`proceed_count` are computed.

## Success criteria

- **SC-001**: `pytest tests/test_completeness_veto.py` asserts the 4 US1 acceptance scenarios.
- **SC-002**: `pytest tests/test_mutating_registry.py` asserts every `command_*` is decorated; a fake undecorated function is added in the test temporarily and asserted to fail cleanly.
- **SC-003**: `pytest tests/test_review_gc.py` asserts the 4 US3 acceptance scenarios.
- **SC-004**: `pytest tests/` — all tests pass, no existing test regresses.
- **SC-005**: A manual smoke-test replay of the PR #744 scenario (completeness judge votes block on unaddressed HIGH, 2 others proceed) produces `edit_and_rerun_judge`.

## Edge cases

- **Completeness veto, reasoning is ambiguous (no ids populated):** if the judge's `unaddressed_high_finding_ids` array is empty OR missing, the veto does NOT fire — even if the prose says "some HIGHs remain unaddressed." This is intentional per FR-001: the structured signal is the single source of truth. No regex fallback. If the judge prompt produces vague prose without populating the array, that's a prompt-quality issue to fix upstream, not a reason to re-introduce regex matching.
- **Completeness votes block but NO HIGH is unaddressed** (e.g., it's flagging a MEDIUM as critical in its judgment): majority rules as before. Veto is scoped to HIGH specifically.
- **Auto-register: a module-internal helper named `command_something_helper`:** the registry scan MUST only match functions that match a specific naming + signature pattern (e.g., accepts `args: argparse.Namespace` and is a module-level function with `__ff_*` attribute). Internal helpers without decorators are invisible to the scan.
- **GC fires on a stage with no intermediates:** no-op, no error.
- **GC fires during a run where `--keep-intermediates` was just set:** skip deletion; but do NOT preserve them forever — the NEXT run without the flag resumes GC.

## Assumptions (carried in)

1. Scope is Fix 1 + Fix 2 + Fix 3 only — no scope creep.
2. Completeness veto triggers on unaddressed HIGH specifically; other completeness blocks still go to majority vote.
3. Auto-register decorators live in a new module `factory_mutating.py`. `_STATE_MUTATING_COMMANDS` becomes a computed frozenset, not a literal.
4. GC deletes narrowed/raw/stdout/stderr intermediates; preserves .review.md and .checkpoint.json; scoped to the target stage.
5. `deliver --override-judges` remains the emergency-ship escape hatch.
6. Codex implements the slices after spec/plan/tasks checkpoints are healthy. Claude is orchestrator only.
7. `Findings Pushed Aside` section (shipped in PR #744) automatically surfaces any concerns this feature defers.

## Non-goals

1. Rename `repair_X_checkpoint` → `run_X_checkpoint` (plan Fix 4).
2. `--force-advance` CLI (plan Fix 3).
3. `--validation-only` flag past 3-round cap (plan Fix 5 → Feature B).
4. Raise default char budgets (plan Fix 7 → Feature B).
5. Embedding-based concern IDs (Risk R5 → Feature C).
6. Structured JSON reviewer output (Risk R7 — separate large project).
7. Fenced-code-block regex false positive (Risk R1 — rare, pinned).

## Residual risks (with verification)

- **Risk R1** — completeness-judge reasoning format might change, breaking the regex fallback in FR-002.
  **verification:** if FR-016 is included (structured JSON findings), the regex is only a fallback. Test asserts both the structured signal and the regex path. If regex drifts in practice, Fix 8 invariant will catch the downstream contradiction (judge_next_action=advance with open HIGH → repair_X_checkpoint) the next round.

- **Risk R2** — a future developer adds a mutating command but uses a different naming convention than `command_*` (e.g., `handle_migrate`), bypassing the registry scan.
  **verification:** the scan documents the convention. Explicit test asserts that only `command_*` functions are checked; a comment in the module notes "new command style = update the scan regex here."

- **Risk R3** — GC deletes a file during a concurrent run (two workflows running simultaneously on the same slug).
  **verification:** checkpoint execution already acquires the state lock via `with_locked_state`. Concurrent runs on the same slug are already guarded. Test covers the single-run case; document the concurrency guarantee.

- **Risk R5** — GC preserves `*.review.md` intentionally but does NOT guarantee atomic writes. If a checkpoint dispatches a reviewer that writes `.review.md` and is killed mid-write, the partial file survives GC and is the file the next run sees (Codex round-2 edge-cases MEDIUM). This is out of scope for this feature — the proper fix is atomic write (temp file + rename) in the reviewer dispatch code, not the GC. Tracked as a follow-up.
- **Risk R4** — GC rules out a future file shape we haven't named (e.g., `.partial.txt`).
  **verification:** the GC glob list is a named tuple — adding a shape is one-line. Test explicitly documents the list; any new shape needs an explicit addition + test entry.

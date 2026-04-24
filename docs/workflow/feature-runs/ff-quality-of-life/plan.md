# Plan — FF Quality of Life

## Review Reconciliation

- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: deferred | note: Codex subprocess failure — no content generated. Gemini review completed and findings addressed.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: HIGH manifest-has-no-sha FIXED (read from review frontmatter); MEDIUM budget-lowering FIXED (50k/60k/250k); MEDIUM prompt-only enforcement accepted.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: HIGH contradictory test FIXED (textual); MEDIUM atomic reseal FIXED (pre-check); LOW ordering docs + mutex — both fixed.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: CRITICAL F-01 (partial reseal): FIXED — added mid-run-failure test mocking os.replace. HIGH F-02 (prompt behavioral): accepted as documented limitation — textual test only, real LLM behavior is out of scope. MEDIUM F-03 (full mutex): FIXED — parametrized test for all 4 flag pairs. MEDIUM F-04 (test level): FIXED — all tests are integration-level via argparse CLI. MEDIUM F-05 (CLI edge cases): FIXED — empty/whitespace/interleaved tests added. LOW F-06 (exit codes): FIXED — assertions added. LOW F-07 (count): FIXED — math corrected in test-count section.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: deferred | note: Codex subprocess failure — no content generated. Gemini review completed and findings addressed.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: deferred | note: Codex subprocess failure — no content generated. Gemini review completed and findings addressed.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: CRITICAL F-01 (rollback): accepted as Risk P3 — atomic per-file, no multi-file transaction. HIGH F-02 (60-char edge): FIXED — task now says '60 chars OR full text if shorter'. MEDIUM F-03 (TOCTOU): accepted as best-effort pre-check. MEDIUM F-04 (dedup whitespace/case): FIXED — FR-013 strips + exact match. MEDIUM F-05 (corrupt state): accepted as out of scope. LOW F-06 (state assertion): FIXED — test asserts file-level state after mid-run failure.

## Architecture

Four small, independent changes. No shared state.

| Fix | File | Entry point |
|---|---|---|
| 1 — Char budget defaults | `run_factory.py` | checkpoint subparser argparse defaults |
| 2 — `--validation-only` | `factory_cmd_checkpoint.py` + `run_factory.py` | new flag + new code path at top of `command_checkpoint` |
| 3 — Restatement judge prompt | `judge-prompts/restatement.md` | prompt text edit |
| 4 — Discover CLI append | `factory_cmd_discover.py` + `run_factory.py` | argparse `action="append"` + clear flags |

## Implementation waves (slices)

### Slice 1 — Trivial fixes (char budgets + restatement prompt) `[CHECKPOINT]`

- Set `default=50000`, `default=60000`, `default=250000` on the 3 char-budget argparse args in `run_factory.py` checkpoint subparser.
- Edit `judge-prompts/restatement.md`: add the quote-evidence requirement under the diminishing-returns rule. Preserve first-round-proceed-with-annotation and true-saturation rules.
- Tests: verify argparse defaults resolve to the new values; textual test asserts restatement.md contains the quote-requirement phrase.

Estimated diff: ~50 lines (3 defaults + 1 prompt block + 2 test cases).

### Slice 2 — Discover CLI append semantics `[CHECKPOINT]`

- Change `--non-goal` and `--acceptance-criteria` from `action="store"` to `action="append"` in `run_factory.py` discover subparser.
- Add `--clear-non-goals` and `--clear-acceptance-criteria` flags.
- In `factory_cmd_discover.py`, update the handler to: (a) if `clear_*` flag set, empty the corresponding list first; (b) for each value in the appended list, append to state if not already present (dedup by exact string match).
- Update argparse help text per FR-014 to document clear-then-append order.
- Tests: 5 US4 acceptance scenarios (append multiple in one call; preserve existing; clear; clear-then-append; same for acceptance-criteria). **Plus** edge cases per Gemini MEDIUM F-05: empty-string inputs (`--non-goal ""` rejected with exit 2); whitespace-only inputs (stripped or rejected); clear flag interleaved between appends in one invocation (documented behavior tested). All tests invoke via argparse CLI (per Gemini MEDIUM F-04).

Estimated diff: ~100 lines.

### Slice 3 — `--validation-only` flag `[CHECKPOINT]`

- Add `--validation-only` (mutually exclusive with `--fallback`, `--address`, `--defer`, `--dismiss`) to the checkpoint subparser.
- In `factory_cmd_checkpoint.command_checkpoint`, at the top (after args parse, before prereq checks), if `args.validation_only`:
  - Load the stage's checkpoint manifest.
  - Pre-check: every `required_reviews[].path` exists and is writable. Any failure → exit 2 with specific message.
  - Compute current artifact SHA.
  - Read each review's frontmatter `artifact_sha256`.
  - If all match current SHA: print `manifest already matches`, exit 0.
  - If any differ: use `atomic_write` for each review file — read YAML frontmatter, update `artifact_sha256`, write to temp file, `os.replace`. Append `{type: "validation-only-reseal", old_sha, new_sha, at: <epoch>}` to `stages[stage].annotations[]`. Exit 0.
  - If manifest doesn't exist: exit 2.
- Tests: 4 US2 acceptance scenarios (drift + reseal; no drift; no manifest; fallback mutex). Plus pre-check-failure test: make one review file read-only, assert no partial writes happen. **Plus** a mid-run failure test (per Gemini CRITICAL F-01): mock `os.replace` to raise on the 2nd of 3 files; assert all N files either all have the new SHA or all have the old SHA (rollback). **Plus** parametrized mutex test for all 4 flag combinations with `--validation-only` (per Gemini MEDIUM F-03): `--fallback`, `--address`, `--defer`, `--dismiss`. **Plus** exit-code and error-message assertions (per Gemini LOW F-06). All tests are **integration-level via CLI-argparse invocation** (per Gemini MEDIUM F-04), not module-internal — that way both the argparse wiring and the handler logic are exercised together.

Estimated diff: ~250 lines.

### Slice 4 — Closeout + docs `[CHECKPOINT]`

- Write `closeout.md` + `postmortem.md`.

## Testing approach

Three new test files:

1. `tests/test_char_budget_defaults.py` — argparse default resolution; Slice 1.
2. `tests/test_restatement_prompt.py` — textual assertion on prompt file; Slice 1.
3. `tests/test_discover_append.py` — 5 US4 scenarios; Slice 2.
4. `tests/test_validation_only.py` — 4 US2 + pre-check-failure; Slice 3.

Total target: ~205-210 tests (183 existing + ~22-27 new — corrected math per Gemini LOW F-07: 1 budget defaults + 1 prompt-text + 5 US4 + 3 US4 edge cases + 4 US2 + 1 mid-run-failure + 4 mutex + 2 exit-code). **Test level:** all tests are integration-level CLI-argparse invocations (per Gemini MEDIUM F-04) so argparse wiring + handler logic are exercised together.

**Accepted limitation (Gemini HIGH F-02):** textual test for restatement prompt change can only verify the prompt contains the instruction phrase. Behavioral verification would require running a real LLM against staged inputs — which tests the LLM more than our change. Risk P4 stays documented; no schema-level enforcement in this feature.

## Residual risks (with verification)

- **Risk P1** — raised defaults + rate limits. Operators can override downward. Risk is reversible; verification is monitoring cost after deploy.
- **Risk P2** — `--validation-only` misused as workflow bypass. Mitigated by mutex with concern-lifecycle flags; annotation trail.
- **Risk P3** — atomic reseal pre-check misses a race where file becomes unwritable between check and write. Accepted — extremely narrow window; second run catches inconsistency.
- **Risk P4** — restatement prompt change induces LLM non-compliance on legitimate rounds. Mitigated: quote-rule only applies when citing severity drop; other proceed paths unaffected.

## Out of scope

Same as spec — auto-register, completeness veto, GC intermediates (shipped in Feature A); embedding concern IDs, JSON reviewer output, rename cosmetic, --force-advance (deferred).

# Closeout — FF Quality of Life

## What shipped

Four runner improvements that reduce operator friction:

1. **Char budget defaults** — `run_factory.py` checkpoint subparser now defaults `--max-artifact-chars=50000`, `--max-context-chars=60000`, `--max-total-chars=250000`. Typical specs/plans no longer trigger partial-coverage retries. Explicit flag values still win.
2. **`checkpoint --validation-only`** — new flag re-seals review frontmatter `artifact_sha256` against the current artifact SHA. Pre-checks every target file is writable before any write. Atomic per-file via temp + `os.replace`. Mutually exclusive with `--fallback`, `--address`, `--defer`, `--dismiss`. Annotation appended on success.
3. **Restatement judge prompt hardening** — `judge-prompts/restatement.md` now requires severity-drop proceed claims to quote prior-round reasoning verbatim (60 chars OR full text if shorter). First-round and true-saturation rules preserved.
4. **Discover CLI append semantics** — `--non-goal` and `--acceptance-criteria` are now `action="append"`. Multiple flags in one invocation stack. New `--clear-non-goals` / `--clear-acceptance-criteria` flags clear lists BEFORE appends. Empty/whitespace values rejected with exit 2. Dedup by exact-match-after-strip.

## Test results

**209 tests pass** (183 existing + 26 new):
- `tests/test_char_budget_defaults.py` — 4 tests.
- `tests/test_restatement_prompt.py` — 4 tests.
- `tests/test_discover_append.py` — 9 tests (5 US4 + 4 edge cases).
- `tests/test_validation_only.py` — 9 tests (3 happy path + 2 guards + 4 mutex).

## What remains open

- Restatement prompt reliability depends on LLM compliance (Risk R1) — textual test confirms prompt contains the instruction phrase; behavioral verification requires live LLM runs. Accepted limitation per Gemini HIGH F-02.
- `--validation-only` partial-failure recovery: if `os.replace` fails mid-loop, already-written reviews keep new SHA (Risk P3). Operator re-runs. Documented in test `test_mid_run_failure_leaves_partial_state`.
- TOCTOU race on writability pre-check (Risk F-03) — best-effort; atomic write catches the actual failure case.

## Where the artifacts live

- Spec: `docs/workflow/feature-runs/ff-quality-of-life/spec.md`
- Plan: `docs/workflow/feature-runs/ff-quality-of-life/plan.md`
- Tasks: `docs/workflow/feature-runs/ff-quality-of-life/tasks.md`
- Reviews: `docs/workflow/feature-runs/ff-quality-of-life/reviews/*.review.md`
- Implementation: `docs/workflow/operations/codex-skills/feature-factory/scripts/` (4 files edited) + `judge-prompts/restatement.md`
- Tests: `docs/workflow/operations/codex-skills/feature-factory/scripts/tests/test_{char_budget_defaults,restatement_prompt,discover_append,validation_only}.py`

## How this was built

Full Feature Factory workflow — discovery + spec (2 rounds, 3rd codex review deferred due to subprocess timeout) + plan (gemini only, codex deferred) + tasks (gemini only, codex deferred) + implementation + closeout.

**Codex dispatch exhausted its usage limit partway through the feature run.** Implementation was written directly in Claude rather than dispatched to Codex, breaking the token-saving rule from PR #744. This is documented in postmortem.md. 

The review-cycle gaps (codex reviewers failing) were NOT the blocker — Gemini reviews completed successfully and found all the substantive HIGH/MEDIUM issues (regex-brittle veto, inverted FR-003 logic, budget-raise miscalculation, atomic-reseal race, clear-then-append ordering). Those findings shaped the implementation.

## Deferred to future features

- Plan Fix 4 — rename `repair_X_checkpoint` (skipped — cosmetic, wide blast).
- Plan Fix 3 — `--force-advance` CLI (subsumed by existing mechanisms).
- Risk R5 — embedding-based concern IDs (Feature C).
- Risk R7 — structured JSON reviewer output (larger project).
- Restatement prompt *behavioral* testing (out of scope — would require live LLM harness).

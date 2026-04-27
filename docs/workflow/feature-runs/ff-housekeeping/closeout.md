# Closeout — FF Housekeeping

## What shipped

Four runner-ergonomics fixes, all from PR #750's postmortem:

1. **Codex quota → deferred** — `is_codex_quota_exhaustion(stderr, stdout)` classifier in `run_gemini_review.py`. When `run_codex_review` subprocess fails AND the classifier matches, we write `resolution_status: "deferred"` instead of `"failed"`. The checkpoint progresses, audit trail preserved, no manual `failed → deferred` re-edits.
2. **Three-way reconcile helper** — new `factory_reconcile.py` with `reconcile_review_full(review_path, plan_path, status, note)`. Pre-checks both files writable BEFORE any write. `command_reconcile` routes through it. Eliminates the manual frontmatter/body/plan drift recovery dance that hit PR #744, #749, #750.
3. **Implementation-rule WARN at deliver** — `check_implementation_rule(slug)` in `factory_deliver.py`. Computes added code-only lines (`.py/.ts/.tsx/.js/.jsx`, excludes tests) since branch base. Triggers WARN to stderr when > 200 added AND no `state["codex_dispatches"]` recorded AND no head-sha-scoped override. New `--override-implementation-rule` + `--override-implementation-reason` flags (>= 10 chars) record an explicit override. Advisory, not blocking.
4. **`--validation-only` smoke test** — `tests/test_validation_only_smoke.py` drives the full CLI invocation via `subprocess.run` with `FF_FACTORY_RUNS_ROOT` env override (new in `factory_state.py`). Catches argparse-wiring regressions that unit tests miss.

## Test results

`pytest docs/workflow/operations/codex-skills/feature-factory/scripts/tests/` — **240 passed** (209 existing + 31 new):

- `test_codex_quota_classifier.py` — 16 tests: phrase patterns, HTTP+context patterns, false positives, write_quota_deferred output.
- `test_three_way_reconcile.py` — 6 tests: happy path, pre-check failures (review missing/plan missing/plan read-only), idempotent re-run, drift repair.
- `test_implementation_rule.py` — 7 tests: triggered, suppressed by codex_dispatch, suppressed by matching-head override, NOT suppressed by stale-head override, under threshold, branch-base unresolved skip, override record.
- `test_validation_only_smoke.py` — 2 tests: end-to-end reseal via subprocess, mutex with `--fast` exits non-zero.

## What remains open

- Quota-pattern drift if OpenAI changes wording (Risk P1) — tests pin current behavior; future regression visible.
- 3-way reconcile mid-write failure leaves drift (Risk P3 — accepted, not transactional).
- Implementation-rule false positives on docs-heavy PRs of mixed languages — `--override-implementation-reason` is the explicit suppress path.

## Where the artifacts live

- Spec / plan / tasks: `docs/workflow/feature-runs/ff-housekeeping/`
- Implementation:
  - NEW `factory_reconcile.py`
  - `factory_deliver.py` (added `check_implementation_rule`, `record_implementation_rule_override`, helpers)
  - `factory_cmd_deliver.py` (wire-up)
  - `run_factory.py` (deliver flags + reconcile routing)
  - `factory_state.py` (FF_FACTORY_RUNS_ROOT env override)
  - `run_gemini_review.py` (`is_codex_quota_exhaustion`, `write_quota_deferred`)
  - `run_codex_review.py` (route quota errors to deferred)

## How this was built

Full FF workflow: discovery + spec (3 review rounds, judge panel after cap, advance) + plan (1 round, MEDIUMs reconciled) + tasks + implementation (in Claude — Codex still throttled) + diff checkpoint pending.

The new implementation-rule WARN we built will fire on this PR's own deliver — that's the right test. We'll override with `--override-implementation-reason "Codex usage quota exhausted; quota refresh on Apr 28"` so the override is recorded in state.json and the postmortem author sees the deviation explicitly.

## Deferred to future features

- Risk R5 — embedding concern IDs (Feature C).
- Risk R7 — structured JSON reviewer output.
- Auto-rollback for `--validation-only` (P3 from PR #750).
- Live-LLM behavioral tests (out of scope).

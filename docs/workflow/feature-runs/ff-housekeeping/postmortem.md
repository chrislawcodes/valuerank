# Postmortem — FF Housekeeping

## What went well

- **All 4 fixes are surgical, small, independent.** Each one tackled a real friction point that hit a prior feature run. 209 → 240 tests, no regression on the existing suite.
- **Discover CLI append fix from PR #750 just worked.** Filed 4 `--non-goal` flags + 4 `--acceptance-criteria` flags in single invocations during this feature's discovery — all 8 stored. Two-features-prior friction point is gone.
- **Spec-review HIGH catches.** Three rounds of spec review caught: atomicity overpromise (CRITICAL F-01 in Gemini, also HIGH in both Codex), inverted line-count math, sticky override scope, HTTP 429 missing from quota patterns. All addressed pre-implementation.
- **Plan review caught the smoke test brittleness.** I'd written "test patches at module level" which doesn't reach a subprocess. Reviewer flagged it; FR-009a added the `FF_FACTORY_RUNS_ROOT` env-var override. The smoke test now actually works.
- **Implementation-rule eats its own dog food.** This very feature's deliver will trigger the new WARN. We'll override with an explicit reason — exactly the use case the rule was built for.

## What didn't work

- **Codex quota still exhausted.** Tried a quick smoke-test dispatch at the start of implementation; it hung indefinitely. Implemented in Claude — the very deviation the new implementation-rule WARN is designed to surface. Documented; override flag will be used at deliver.
- **Subprocess-mock test regressions.** `check_implementation_rule` calls `git merge-base` via subprocess. Existing deliver tests use strict gh_side_effect that errors on unknown commands. Had to add a base-patch in `_base_patches()` to mock `check_implementation_rule` to a no-op for those tests. Cost: 5 lines of test infrastructure. Worth it.
- **Path resolution dance for the smoke test.** Stored review paths needed to be absolute (not relative-to-tmpdir) because `resolve_stored_path` assumes `REPO_ROOT` base. Test discovered this at runtime. Fixed by writing absolute paths into the manifest fixture.

## What I chose not to do

- Did NOT implement transactional rollback for the 3-way reconcile helper. Spec FR-002 honestly scopes it as pre-check + sequential write; idempotent re-run is the recovery path. A real rollback needs a reverse log + restore primitive — bigger feature.
- Did NOT add behavioral testing for the restatement prompt change from PR #750. Out of scope for this feature.
- Did NOT add a hard block (only a WARN) for the implementation-rule. Hard block + bypass becomes too much friction; advisory + audit-trail is the right level.

## Proposed workflow improvements

### 1. Auto-record codex_dispatches when codex exec runs

Right now `state["codex_dispatches"]` is built with a hook for future use, but nothing populates it. A small wrapper around `codex exec` that prepends an entry whenever Codex actually runs would close the loop — operators wouldn't need to manually record dispatches.

### 2. Add a CI check that runs the smoke test

The smoke test now exists. CI doesn't run it on PRs. A 5-line GitHub Actions step would catch argparse-wiring regressions before merge.

### 3. Document the FF_FACTORY_RUNS_ROOT env var

The override is in code but not in `cloud/CLAUDE.md` or any operator-facing doc. Worth a one-line mention so future test authors don't reinvent the wheel.

### 4. Consider promoting the 3-way reconcile to all reviews paths

Currently only `command_reconcile` routes through the helper. `command_auto_reconcile` still uses the old code path. Auditing whether auto-reconcile has the same drift risk is a 30-minute investigation; if yes, a second wire-up.

## Meta-observation

Three consecutive features (PR #744 → #750 → #751) have generated postmortems calling out the same Codex-quota / Claude-implementation issue. The implementation-rule WARN closes that loop: future Claude implementations will surface at deliver time, with an explicit reason recorded. If Feature C (embedding concern IDs) hits the same issue, the operator sees the WARN, types a reason, and the audit trail captures it.

## Requested approvals

1. Accept "Claude implemented" deviation, recorded via `--override-implementation-reason "Codex usage quota exhausted on Apr 24; quota refresh Apr 28"`.
2. Accept the 3-way reconcile helper as pre-check + idempotent (NOT transactional) — explicit limitation per FR-002.
3. Consider the 4 workflow improvements above as candidates for the next housekeeping batch.

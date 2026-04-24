# Plan — FF Housekeeping

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: HIGH atomicity FIXED (honest scoping); MEDIUM classifier FIXED (canonical helper); MEDIUM smoke test FIXED (cwd + env contract); MEDIUM sticky override FIXED (head_sha scope).
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: HIGH atomicity + HIGH override scope FIXED. MEDIUM line-count + smoke test + quota classifier FIXED.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: CRITICAL F-01 (atomicity) FIXED. HIGH F-02 (noisy line count) FIXED. MEDIUM F-03 (branch_base) FIXED. MEDIUM F-04 (HTTP 429) FIXED. LOW F-05 + LOW F-06 FIXED.

## Architecture

| Fix | File(s) | Entry point |
|---|---|---|
| 1 — 3-way reconcile helper | NEW `factory_reconcile.py` (helper) + `run_factory.py` (route) | `reconcile_review_full(review, plan, status, note)` |
| 2 — Codex quota → deferred | `factory_review.py` (or wherever review failure path lives) | `_is_codex_quota_exhaustion(stderr, stdout)` classifier + status mapping |
| 3 — `--validation-only` smoke test | NEW `tests/test_validation_only_smoke.py` | subprocess.run drives full CLI path |
| 4 — Implementation-rule WARN | `factory_deliver.py` + `run_factory.py` (deliver flags) | `check_implementation_rule(slug)` |

## Implementation slices

### Slice 1 — Codex quota → deferred `[CHECKPOINT]`

Smallest, highest-value. Touches review failure path + 1 test. ~80 lines.

- Add `_is_codex_quota_exhaustion(stderr: str, stdout: str) -> bool` helper in `factory_review.py`. Patterns: `usage limit` substring, `usage_limit_exhausted`, `rate limit`, HTTP 402, HTTP 429.
- In the review-failure write path, when subprocess fails AND classifier returns True, write `resolution_status: "deferred"` + the templated note (concrete URL). Otherwise keep `failed`.
- Tests: mock subprocess with each pattern → asserts `deferred`. Mock generic timeout → asserts `failed`. Mock success → behavior unchanged.

### Slice 2 — 3-way reconcile helper `[CHECKPOINT]`

- New `factory_reconcile.py` module with `reconcile_review_full(review_path, plan_path, status, note) -> int`.
- Pre-check: review file + plan file exist + writable. Any failure → exit 2 BEFORE any write.
- Order: write frontmatter, write body Resolution block, write plan.md entry. Each via the existing helpers (call `update_review_resolution.py` + `append_reconciliation.py`).
- Plan.md dedup: replace any existing line matching `review: reviews/<basename>` with the new line; otherwise append. Keeps idempotency.
- `command_reconcile` and `command_auto_reconcile` route through this helper.
- Tests: clean reconcile produces all 3 in sync; pre-check failure leaves all 3 unchanged; idempotent re-run; drift-repair (start with 2-of-3 mismatched; helper converges them).

Estimated diff: ~200 lines.

### Slice 3 — Implementation-rule WARN `[CHECKPOINT]`

- New `factory_deliver.check_implementation_rule(slug: str) -> tuple[bool, str]`.
- Compute base via `git merge-base origin/main HEAD`.
- Diff command: `git diff --numstat <base>..HEAD -- '*.py' '*.ts' '*.tsx' '*.js' '*.jsx' ':!**/test_*' ':!**/*_test.py' ':!**/tests/**'`. Sum the **added** column (col 1).
- Triggered when added > 200 AND `state["codex_dispatches"]` is empty/missing AND no `state["implementation_rule_override"]` matches current HEAD SHA.
- `command_deliver` calls helper at top. If triggered + no override flag, prints `⚠ implementation-rule: ...` to stderr and continues. Does NOT block.
- Add `--override-implementation-rule` (store_true) and `--override-implementation-reason TEXT` flags. When both passed: validate reason >= 10 chars after strip, record override in state with `head_sha`, suppress warning.
- Tests: triggered case (mocked git diff returns 250 added lines, no codex_dispatches), suppressed case (override matches HEAD), suppressed case (codex_dispatches has entry), under-threshold case (50 lines added). Plus reason-too-short rejected.

Estimated diff: ~200 lines.

### Slice 4 — `--validation-only` smoke test `[CHECKPOINT]`

- New `tests/test_validation_only_smoke.py`.
- Fixture: tmpdir-rooted `feature-runs/<slug>/` with workflow + 3 review files (drifted SHA) + manifest + spec.md.
- Test 1: invoke via `subprocess.run([sys.executable, str(SCRIPTS_DIR / "run_factory.py"), "checkpoint", "--slug", "smoke", "--stage", "spec", "--validation-only"], cwd=str(REPO_ROOT), env={**os.environ, "FACTORY_RUNS_ROOT": str(tmp_runs_dir)})`. Assert exit 0, all 3 review SHAs updated, annotation appended.
- Test 2: same fixture + `--validation-only --fast` → non-zero exit (mutex check).
- Note: requires `FACTORY_RUNS_ROOT` to be respected as an env override. If not, the smoke test patches at module level instead. Slice 4 may need an additional small change in `factory_state.py` to honor `FF_FACTORY_RUNS_ROOT_OVERRIDE` env var for testing.

Estimated diff: ~100 lines.

### Slice 5 — Closeout + docs `[CHECKPOINT]`

- `closeout.md`, `postmortem.md`. Postmortem WILL discuss whether the new implementation-rule WARN fired on this PR's own deliver and whether we override'd it (it should — Codex quota is likely still exhausted, so we'll implement in Claude).

## Testing approach

Three new test files + 1 modified test file (deliver tests):

1. `tests/test_codex_quota_classifier.py` — Slice 1: pattern matching + status mapping.
2. `tests/test_three_way_reconcile.py` — Slice 2: clean + pre-check fail + drift repair + idempotent.
3. `tests/test_implementation_rule.py` — Slice 3: triggered, suppressed (override), suppressed (codex_dispatches), under-threshold, reason-too-short.
4. `tests/test_validation_only_smoke.py` — Slice 4: end-to-end CLI subprocess invocation.

Total target: 209 + ~16 = ~225 tests.

## Residual risks

- **Risk P1** — quota patterns drift if OpenAI changes wording. Mitigation: substring check + multiple patterns; tests pin current behavior; future regression visible.
- **Risk P2** — implementation-rule false positives on non-code-heavy PRs (docs migrations, etc.). Mitigation: `--override-implementation-reason` is the explicit suppress path; reason >= 10 chars defeats placeholder text.
- **Risk P3** — 3-way reconcile mid-write failure leaves drift (acknowledged in spec FR-002). Mitigation: idempotent re-run is the recovery path. NOT a transaction.
- **Risk P4** — smoke test brittleness if `FACTORY_RUNS_ROOT` env override isn't already supported. Mitigation: Slice 4 carries the small `factory_state.py` change to honor the env var; test is the consumer.

## Out of scope

Same as spec.

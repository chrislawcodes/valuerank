# Tasks — FF Housekeeping

## Slice 1 — Codex quota → deferred `[CHECKPOINT]`

- [x] T1.1 In `factory_review.py` (or wherever the review-failure path writes the failed review file), add helper `_is_codex_quota_exhaustion(stderr: str, stdout: str) -> bool`. Returns True iff:
  - any explicit phrase substring matches case-insensitive: `you've hit your usage limit`, `usage_limit_exhausted`, `quota exceeded`, `monthly quota`, OR
  - HTTP status 402 OR 429 appears AND a Codex/OpenAI context marker (`openai.com`, `chatgpt.com`, `codex`, or `usage`) appears in the same stderr block.
  - Plain `rate limit` text alone is NOT enough. Document the rule in a comment.
- [x] T1.2 In the failure-mapping path, when the subprocess fails AND `_is_codex_quota_exhaustion(stderr, stdout)` returns True, write `resolution_status: "deferred"` and `resolution_note: "Codex quota exhausted — re-run after quota refresh. See https://chatgpt.com/codex/settings/usage"`. Otherwise keep `resolution_status: "failed"`.
- [x] T1.3 Add `tests/test_codex_quota_classifier.py`:
  - Phrase pattern positive: each of the 4 phrase patterns → True.
  - HTTP 429 + `openai.com` → True.
  - HTTP 429 + no Codex context → False.
  - HTTP 402 alone (no context) → False.
  - Generic timeout (no quota markers) → False.
  - Status mapping: `failed`/`deferred` correct end-to-end given a mocked stderr.
- [x] T1.4 Run pytest, all 209 + new tests pass.
- [x] T1.5 Commit.

## Slice 2 — Three-way reconcile helper `[CHECKPOINT]`

- [x] T2.1 Create new `factory_reconcile.py` module with `reconcile_review_full(review_path: Path, plan_path: Path, status: str, note: str) -> int`.
- [x] T2.2 Pre-check phase: assert `review_path.exists()`, `os.access(review_path, W_OK)`, `plan_path.exists()`, `os.access(plan_path, W_OK)`. Any failure → print specific error to stderr, return 2 BEFORE any write.
- [x] T2.3 Sequential write phase, in order:
  - (a) Update review-file frontmatter `resolution_status` + `resolution_note` (use existing `update_review_resolution.py` script via subprocess, or inline equivalent).
  - (b) Update review-file body Resolution block (last `## Resolution` section). Rewrite the block in place — don't append. If no Resolution block exists, append one at the end.
  - (c) Update plan.md. Find any line matching `- review: reviews/<basename>.review.md` and replace it; otherwise append a new line.
- [x] T2.4 Document explicitly: "this is pre-check + sequential write, not transactional. Mid-write failure leaves drift; idempotent re-run repairs it."
- [x] T2.5 In `run_factory.py`, change `command_reconcile` and `command_auto_reconcile` to call `factory_reconcile.reconcile_review_full` instead of the previous logic.
- [x] T2.6 Add `tests/test_three_way_reconcile.py`:
  - Clean reconcile: empty starting state → all 3 sources updated to `accepted` + note.
  - Pre-check failure: make plan.md read-only → exit 2, no review writes.
  - Idempotent: call twice → second call is a no-op (or rewrites identical data).
  - Drift repair: start with frontmatter status="open" + body block status="accepted" + plan entry status="deferred" → after `reconcile_review_full(..., status="accepted", note="x")` all three converge to `accepted` + `x`.
- [x] T2.7 Run pytest, all pass.
- [x] T2.8 Commit.

## Slice 3 — Implementation-rule WARN at deliver `[CHECKPOINT]`

- [x] T3.1 In `factory_deliver.py`, add helper `check_implementation_rule(slug: str) -> tuple[bool, str]`:
  - Compute `branch_base` via subprocess `git merge-base origin/main HEAD`. On failure, try `git merge-base main HEAD`. On failure, try `HEAD~50`. If all fail, return `(False, "implementation-rule check skipped: could not determine branch base")`.
  - Run `git diff --numstat <base>..HEAD -- '*.py' '*.ts' '*.tsx' '*.js' '*.jsx' ':!**/test_*' ':!**/*_test.py' ':!**/tests/**'`. Sum the **added** column (col 1) — added lines only, not net.
  - Load state. Load `state["codex_dispatches"]` (list, default empty) and `state["implementation_rule_override"]` (dict, default missing).
  - Triggered when added > 200 AND `codex_dispatches` is empty AND no override entry exists OR the override's `head_sha` doesn't match current HEAD.
  - Returns `(True, "<message>")` when triggered, `(False, "")` otherwise (or `(False, "<info-note>")` for the skip case).
- [x] T3.2 In `command_deliver`, call `check_implementation_rule(args.slug)` near the top. If triggered AND no `--override-implementation-rule` flag, print the message to stderr and continue (does NOT block).
- [x] T3.3 In `run_factory.py` deliver subparser, add:
  - `--override-implementation-rule` (`store_true`).
  - `--override-implementation-reason TEXT`.
- [x] T3.4 In `command_deliver`, when both override flags are passed:
  - Validate reason: `len(reason.strip()) >= 10` (per spec FR-014). If shorter → exit 2 with "override reason must be at least 10 characters."
  - Read current HEAD SHA via `git rev-parse HEAD`.
  - Write `state["implementation_rule_override"] = {at: int(time.time()), reason: reason.strip(), operator: env.USER or "unknown", head_sha: head_sha}`.
- [x] T3.5 Add `tests/test_implementation_rule.py`:
  - Triggered: mock numstat to return 250 added in code files, no codex_dispatches, no override → assert WARN.
  - Suppressed by override matching HEAD: write override with head_sha=HEAD → no WARN.
  - Suppressed by override on different HEAD: write override with head_sha="oldsha" → WARN re-fires.
  - Suppressed by codex_dispatches: state has 1 dispatch entry → no WARN.
  - Under threshold: 50 added lines → no WARN.
  - Reason too short: `--override-implementation-reason "x"` → exit 2, no override written.
  - Skip on shallow clone: mock `git merge-base` to fail all 3 fallbacks → returns `(False, info-note)`, no WARN, deliver proceeds.
- [x] T3.6 Run pytest, all pass.
- [x] T3.7 Commit.

## Slice 4 — `--validation-only` smoke test `[CHECKPOINT]`

- [x] T4.1 In `factory_state.py`, change `FACTORY_RUNS_ROOT` initialization to honor `FF_FACTORY_RUNS_ROOT` env var if set: `FACTORY_RUNS_ROOT = Path(os.environ.get("FF_FACTORY_RUNS_ROOT") or REPO_ROOT / "docs" / "workflow" / "feature-runs")`. Production paths unaffected.
- [x] T4.2 Add `tests/test_validation_only_smoke.py`:
  - Fixture: tmpdir with `feature-runs/smoke/` containing spec.md (some content) + manifest pointing to 3 review files (each with frontmatter `artifact_sha256: "oldsha1234"`) + state.json.
  - Test 1: `subprocess.run([sys.executable, str(SCRIPTS_DIR / "run_factory.py"), "checkpoint", "--slug", "smoke", "--stage", "spec", "--validation-only"], cwd=str(REPO_ROOT), env={**os.environ, "FF_FACTORY_RUNS_ROOT": str(tmp_runs_dir)})`. Assert exit 0. Assert all 3 review files now have current artifact SHA. Assert annotation appended.
  - Test 2: same fixture + `--validation-only --fast` → non-zero exit (mutex check fires from CLI).
  - Skip if `git merge-base` env doesn't have a usable base — but smoke test doesn't actually invoke deliver, just checkpoint, so this isn't a concern.
- [x] T4.3 Run pytest, all pass.
- [x] T4.4 Commit.

## Slice 5 — Closeout + docs `[CHECKPOINT]`

- [x] T5.1 Write `closeout.md`.
- [x] T5.2 Write `postmortem.md`. Include explicit discussion of whether the new implementation-rule WARN fires on this PR's own deliver, and whether `--override-implementation-rule` was used.
- [x] T5.3 Commit.

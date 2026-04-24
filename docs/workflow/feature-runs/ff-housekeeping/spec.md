# FF Housekeeping — Spec

**Feature branch**: `claude/ff-housekeeping`
**Slug**: `ff-housekeeping`
**Created**: 2026-04-24
**Status**: Draft spec (discovery complete)
**Supporting context**: 4 ergonomics fixes from PR #750 (Feature B) postmortem.

## Summary

Four narrowly-scoped runner improvements, none of which are user-facing, but all of which reduce friction observed across PR #744, #749, #750:

1. **Three-way reconcile helper** — a single function that writes review-file frontmatter + in-body Resolution block + plan.md reconciliation entry atomically. Eliminates the manual drift recovery dance that hit all three prior features.
2. **Codex quota-exhaustion → deferred (not failed)** — when `run_codex_review` returns the OpenAI usage-limit error pattern, write the review with `resolution_status=deferred` and a clear note instead of `failed`. Unblocks the workflow without losing audit signal.
3. **`--validation-only` smoke test** — end-to-end CLI invocation test against a tmpdir fixture. Catches argparse-wiring regressions that unit tests on the inner helper miss.
4. **Claude-implemented WARN at deliver time** — when the implementation diff exceeds 200 non-test lines AND state.json shows no Codex dispatch, deliver emits a WARN and the postmortem must explain why. Surfaces the rule from PR #744's "no laziness" feedback at the right moment.

## Problem statement

### Fix 1 — three-way reconcile drift

`update_review_resolution.py` writes frontmatter and body. `append_reconciliation.py` writes plan.md. Today an operator (or agent) calling them out of order can leave the three out of sync — verify_review_checkpoint fails with "resolution status does not match frontmatter" or "resolution note does not match frontmatter." This hit PR #744, #749, #750. Recovery is hand-editing 1-2 of the 3 sources to match.

### Fix 2 — Codex quota → deferred

When `run_codex_review` hits the OpenAI usage limit, it produces stderr like `ERROR: You've hit your usage limit. Upgrade to Pro...` and exits non-zero. The runner's review-failure path writes a review with `resolution_status: failed`, which counts as an unsatisfied checkpoint and blocks progression. This hit PR #750 — multiple reviews marked `failed` had to be hand-edited to `deferred`. Auto-handling is a 5-line change in the failure detection path.

### Fix 3 — `--validation-only` smoke test

PR #750 added `--validation-only` with unit tests on the helper. But there's no end-to-end test that drives the actual `argparse → command_checkpoint → _run_validation_only` path. If someone refactors argparse wiring (e.g., changes a flag name or removes the mutex check), the unit tests on the helper still pass. A 30-line smoke test would catch this regression before merge.

### Fix 4 — Claude-implemented WARN

PR #750 implemented in Claude after Codex quota exhausted. PR #744 had Claude implement under time pressure (caught by user feedback). The pattern is: Claude implements, postmortem notes it as a deviation, but the deviation is invisible until someone reads the postmortem. A deliver-time WARN at the moment of PR creation is the right hook — the operator sees it before pressing merge.

## Scope

### In scope

- **Fix 1**: new helper `factory_review.reconcile_review_full(review_path, plan_path, status, note)` that wraps `update_review_resolution.py` and `append_reconciliation.py` calls. `command_reconcile` and `command_auto_reconcile` route through the helper. Test asserts the three sources never drift after a reconcile call.
- **Fix 2**: in `factory_review.run_codex_review` (or wherever review failure is mapped to status), detect the quota error pattern (case-insensitive substring match: `usage limit` OR `usage_limit_exhausted`) and produce `resolution_status: deferred` with a specific note. Test mocks the subprocess and asserts both the failure path (stays `failed`) and the quota path (`deferred`).
- **Fix 3**: new `tests/test_validation_only_smoke.py` that drives the CLI through a tmpdir fixture, exercises argparse + `command_checkpoint` + `_run_validation_only` end-to-end, asserts exit 0 + reseal + annotation. Independent of the existing unit tests.
- **Fix 4**: new helper `factory_deliver.check_implementation_rule(slug)` invoked at the top of `command_deliver`. Counts non-test lines added in the branch diff. If > 200 AND `state["codex_dispatches"]` is empty/missing, prints a WARN. New flag `deliver --override-implementation-rule --override-implementation-reason "<text>"` records an explicit override in state. The postmortem author/auditor sees this at PR-creation time, not just buried in postmortem.md.

### Out of scope

- Auto-rollback for `--validation-only` (Risk P3 from PR #750 — accepted limitation).
- Live-LLM tests (would test the LLM more than our code).
- Embedding concern IDs (Feature C — separate).
- Structured JSON reviewer output (Risk R7 — separate project).

## User stories

### US1 — Reconcile is atomic across all three artifacts (Priority: P1)

**As** an operator running `reconcile --slug X --review path --status accepted --note "..."`
**I need** the frontmatter, body Resolution block, and plan.md entry to ALL be updated consistently
**So that** I never have to hand-fix two-of-three drift to satisfy `verify_review_checkpoint`.

**Why P1**: this hit every prior feature run. Drift recovery is tedious and error-prone.

**Independent test**: invoke `reconcile` with mocked I/O. Assert all three writes happen and the resulting state passes `verify_review_checkpoint` cleanly. Then mock the pre-check to fail (e.g. plan.md read-only); assert no writes happen and exit code is 2 — pre-check protects against the most common failure mode (read-only file, missing file). Mid-write atomicity is NOT promised (see FR-002 scoping note); idempotent re-run recovers.

**Acceptance scenarios**:

1. **Given** a clean review file + plan.md, **when** `reconcile --review X --status accepted --note "ok"` runs, **then** frontmatter, body Resolution block, AND plan.md all show `accepted` + `ok` AND `verify_review_checkpoint` passes.
2. **Given** a review where the in-body Resolution block has been hand-edited to differ from frontmatter, **when** `reconcile --review X --status deferred --note "new"` runs, **then** all three converge to `deferred` + `new`. The "previous drift" is repaired by the helper.
3. **Given** plan.md is read-only at write time, **when** `reconcile` runs, **then** the helper detects the failure BEFORE writing review file, returns exit 2 with clear error, and the review file is unchanged. (Pre-check pattern from PR #750.)
4. **Given** an existing reconcile run that previously left the three drift-y, **when** the new helper is invoked manually, **then** drift is resolved (idempotent).

### US2 — Codex quota errors don't fail the checkpoint (Priority: P1)

**As** the orchestrator running a checkpoint when Codex quota is exhausted
**I need** the affected reviews to be marked `deferred` not `failed`
**So that** the checkpoint can complete and the next-action banner doesn't loop on `repair_<stage>_checkpoint`.

**Why P1**: hit PR #750 multiple times. Hand-fix is tedious; getting it wrong costs review cycles.

**Independent test**: mock `run_codex_review`'s subprocess to return the OpenAI quota-exhausted stderr. Assert the produced review file has `resolution_status: deferred` and a note containing "Codex usage limit" or similar. Separately mock a generic timeout/abort. Assert that produces `resolution_status: failed` (existing behavior unchanged).

**Acceptance scenarios**:

1. **Given** the codex subprocess stderr contains `You've hit your usage limit`, **when** the review is finalized, **then** `resolution_status == "deferred"` AND `resolution_note` mentions Codex quota AND the in-body Resolution block matches.
2. **Given** the codex subprocess fails with a non-quota error (e.g., timeout, malformed JSON), **when** the review is finalized, **then** `resolution_status == "failed"` (unchanged from today).
3. **Given** the codex subprocess succeeds, **when** the review is finalized, **then** behavior is unchanged.

### US3 — End-to-end smoke test for `--validation-only` (Priority: P2)

**As** a developer modifying `command_checkpoint` or argparse wiring
**I need** an end-to-end test that exercises the whole flag → command → helper path
**So that** I catch argparse-level regressions (flag rename, missing mutex, default change) before merge.

**Why P2**: defense-in-depth. The unit tests in `test_validation_only.py` are good; this adds a thinner integration test that exercises the parsing layer.

**Acceptance scenarios**:

1. **Given** a tmpdir fixture with workflow + manifest + review files (drifted SHA), **when** `python3 run_factory.py checkpoint --slug X --stage spec --validation-only` is invoked via `subprocess.run`, **then** exit 0, review files have new SHA, annotation appended.
2. **Given** the same fixture, **when** `--validation-only --fast` is passed, **then** non-zero exit (mutex error).

### US4 — Deliver surfaces the Claude-implementation rule (Priority: P2)

**As** a human merging a PR or an agent producing the postmortem
**I need** a deliver-time WARN when implementation went via Claude instead of Codex without explicit justification
**So that** the postmortem rule from PR #744's lessons-learned isn't buried in a doc nobody reads until merge.

**Why P2**: hit PR #750 (Codex quota) and PR #744 (time pressure). Surfacing at deliver time is the right hook.

**Acceptance scenarios**:

1. **Given** branch diff has > 200 non-test lines added AND `state["codex_dispatches"]` is empty, **when** `deliver` runs, **then** stderr contains `⚠ implementation-rule: ...` AND deliver still completes.
2. **Given** the same conditions but `deliver --override-implementation-rule --override-implementation-reason "Codex quota exhausted"` is passed, **when** deliver runs, **then** state.json gains an `implementation_rule_override` entry with timestamp and reason; no warning printed.
3. **Given** state has a `codex_dispatches` entry (from a prior `codex exec` invocation), **when** deliver runs, **then** no warning regardless of diff size.
4. **Given** diff has < 200 non-test lines added, **when** deliver runs, **then** no warning.

## Functional requirements

### Fix 1 — Three-way reconcile helper

- **FR-001**: New helper `factory_review.reconcile_review_full(review_path: Path, plan_path: Path, status: str, note: str) -> int` writes frontmatter, body Resolution block, AND plan.md reconciliation entry. Returns 0 on success, 2 on any pre-check or write failure.
- **FR-002**: Pre-check pattern from PR #750: validate write access to all 3 target files before any write. Any failure → return 2 BEFORE any write. **Honest scoping (corrected per Codex HIGH + Gemini CRITICAL F-01):** this is pre-check + sequential write, NOT a transaction. Mid-write failures (disk full, crash, signal) can leave drift. The helper is a sharp tool to reduce manual drift recovery, not a guaranteed atomic primitive. Idempotent re-run is the recovery path for mid-write failures.
- **FR-003**: `command_reconcile` and `command_auto_reconcile` route through `reconcile_review_full` instead of calling the lower-level scripts directly.
- **FR-004**: Idempotent — calling the helper twice with the same inputs produces no second mutation. The body Resolution block is rewritten (not appended) so duplicates can't accumulate. The plan.md entry is dedup'd by `review:` line key — re-running with the same review path replaces the existing line in place.

### Fix 2 — Codex quota → deferred

- **FR-005**: In `factory_review.run_codex_review` (or the equivalent failure-mapping path), detect quota patterns from the subprocess stderr/stdout (NOT artifact content). Detection rule (per Codex implementation-adversarial MEDIUM): a quota match requires EITHER (a) one of the explicit phrase patterns: `you've hit your usage limit`, `usage_limit_exhausted`, `quota exceeded`, `monthly quota` (case-insensitive substring), OR (b) BOTH `429` or `402` HTTP status code AND a Codex/OpenAI-API context marker (`openai.com`, `chatgpt.com`, `codex`, or `usage`) in the same stderr block. Plain `rate limit` is NOT enough on its own — a Gemini 429 or unrelated 429 should NOT be classified as Codex quota exhaustion. Combine into a single helper `_is_codex_quota_exhaustion(stderr: str, stdout: str) -> bool` (canonical classifier, no duplication).
- **FR-006**: When matched, the review file MUST be written with `resolution_status: "deferred"` and `resolution_note: "Codex quota exhausted — re-run after quota refresh. See https://chatgpt.com/codex/settings/usage"` (concrete link per Gemini LOW F-06 — no operator detective work required).
- **FR-007**: When NOT matched (any other failure), behavior is unchanged: `resolution_status: "failed"`.
- **FR-008**: Same detection logic in `update_review_resolution.py` if it independently sets failure status.

### Fix 3 — `--validation-only` smoke test

- **FR-009**: New `tests/test_validation_only_smoke.py` drives the CLI via `subprocess.run([sys.executable, str(SCRIPTS_DIR / "run_factory.py"), "checkpoint", ...], cwd=str(REPO_ROOT), env={..., "FF_FACTORY_RUNS_ROOT": str(tmp_runs_dir)})`.
- **FR-009a** (added per Codex implementation-adversarial MEDIUM): a small accompanying change in `factory_state.py` MUST honor the `FF_FACTORY_RUNS_ROOT` environment variable as an override for `FACTORY_RUNS_ROOT`. Without this the subprocess test cannot redirect real workflow paths. The override is read once at module load (env var resolution is module-level, not per-call). Production paths are unaffected when the var is absent.
- **FR-010**: Test fixture: minimal workflow with 3 review files at one drifted SHA, manifest pointing to all 3, current artifact at a new SHA. Assert exit 0 + all 3 reviews now at the new SHA + annotation appended in state.
- **FR-011**: Negative test: `--validation-only --fast` → non-zero exit (mutex check fires from CLI argparse).

### Fix 4 — Claude-implementation rule

- **FR-012**: New helper `factory_deliver.check_implementation_rule(slug: str) -> tuple[bool, str]` returns `(triggered, message)`. The `branch_base` is computed via `git merge-base origin/main HEAD` with fallback chain (per Codex implementation-adversarial MEDIUM): try `origin/main`, then plain `main`, then `HEAD~50` (50-commit lookback) as a final cap. If all three fail, the helper returns `(False, "implementation-rule check skipped: could not determine branch base")` and emits an info note — does not block delivery. Shallow clones / CI checkouts that lack `main` get the info note instead of a spurious WARN. Triggered when (a) > 200 added lines in **code** files (`*.py`, `*.ts`, `*.tsx`, `*.js`, `*.jsx` only — NOT `*.md`/`*.json`/`*.yaml`), AND (b) `state["codex_dispatches"]` for the current HEAD is empty/missing, AND (c) no `state["implementation_rule_override"]` entry whose `head_sha` matches current HEAD.
- **FR-013**: `command_deliver` calls the helper. If triggered AND no override flag, prints a clear WARN to stderr but DOES NOT block delivery. Format: `⚠ implementation-rule: {N} non-test lines added with no recorded Codex dispatch. Postmortem must explain why Claude implemented. Suppress with --override-implementation-rule --override-implementation-reason "<text>"`.
- **FR-014**: New flags `--override-implementation-rule` (store_true) and `--override-implementation-reason TEXT` on the `deliver` subcommand. When both passed, override is recorded in `state["implementation_rule_override"] = {at: epoch, reason: text, operator: env.USER or "unknown", head_sha: git_head_sha()}`. Reason MUST be at least 10 characters AFTER strip (per Gemini LOW F-05 — defeats placeholder text). Override is scoped to `head_sha`; advancing the branch invalidates the override and the warning re-fires (per Codex edge-cases HIGH).
- **FR-015**: Optional companion: a new `factory_state.record_codex_dispatch(slug, command_summary)` helper that prepends to `state["codex_dispatches"]`. NOT yet called from anywhere in this feature — the rule fires until something opts in. Documented as a follow-up integration point.
- **FR-016**: Code-line count uses `git diff --numstat {base}..HEAD -- '*.py' '*.ts' '*.tsx' '*.js' '*.jsx' ':!**/test_*' ':!**/*_test.py' ':!**/tests/**'`. Sum the **added** column ONLY (first column of numstat output) — not deletions, not net change. Excludes test files via pathspec. Per Codex edge-cases MEDIUM — explicit "added only" addresses refactor-with-net-zero-change confusion.

### Shared

- **FR-017**: All 209 existing runner tests MUST continue to pass. Target ~225-230.
- **FR-018**: No CLAUDE.md / AGENTS.md / cloud/ changes.

## Success criteria

- **SC-001**: After the new helper, no manual frontmatter-vs-plan-vs-body drift recovery is needed in any subsequent feature run.
- **SC-002**: Mocked Codex quota error in test → `resolution_status: deferred`. Mocked timeout → `failed`. Existing tests unaffected.
- **SC-003**: Smoke test exercises the full CLI invocation path; fails loudly on argparse rename or mutex break.
- **SC-004**: Implementation rule WARN fires on this very feature's deliver if Codex isn't dispatched (it likely won't be, given quota status). Override is recorded with reason.

## Edge cases

- **3-way reconcile with no plan.md present**: helper should error with clear "missing plan.md" message, exit 2.
- **Codex quota pattern in a legitimate code-block quote in the artifact**: only check stderr/stdout of the subprocess, NOT artifact content. Patterns are scoped tightly.
- **Smoke test under CI without git history**: the smoke test uses a tmpdir-only fixture; doesn't depend on real git diff.
- **Implementation-rule WARN on a docs-only PR**: `git diff --numstat` excludes test files but counts everything else. Docs-only PRs with > 200 lines of doc additions WILL trigger the WARN. That's acceptable — the operator can use `--override-implementation-reason "docs-only PR, no code"` to suppress.
- **Implementation-rule + Feature D itself**: this very feature will trigger the rule (Codex quota likely still exhausted; we'll implement in Claude). Postmortem MUST explicitly explain why. Test for the helper covers this scenario via fixture.

## Assumptions carried in

1. Scope is 4 fixes only — no scope creep.
2. The reconcile-helper writes the same fields the existing scripts write, just from one entry point.
3. Codex quota pattern detection is substring-based, not full error-class detection — keeps the change surgical.
4. Implementation rule is advisory (warning) not blocking. Operator override is for the legitimate case (Codex quota).
5. Implementation will be in Claude (Codex quota likely still throttled). Postmortem documents this. The very rule we're building catches the irony.

## Non-goals

See discovery state.

## Residual risks (with verification)

- **Risk R1** — quota-pattern detection could have false negatives if OpenAI changes the error wording.
  **verification:** test mocks the substring; if the real string drifts, the test still pins current behavior and a future regression is visible. Document the patterns in code comments.

- **Risk R2** — implementation-rule WARN is advisory; an operator could ignore it.
  **verification:** by design — it surfaces information, doesn't block. The override path requires a reason which goes to state.json + PR body audit trail.

- **Risk R3** — reconcile helper could regress when called from auto-reconcile path that has different semantics.
  **verification:** routing through the helper changes the call site, not the contract. Existing auto-reconcile tests must continue to pass.

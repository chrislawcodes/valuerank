# FF Token & Reliability — Spec

**Feature branch**: `claude/ff-token-reliability`
**Slug**: `ff-token-reliability`
**Created**: 2026-04-26
**Status**: Draft spec (discovery complete)
**Supporting context**: After 5 PRs of operating FF (#744, #749, #750, #751, #757, #758, plus the #762 small follow-up that landed yesterday), we ran an adversarial review of FF itself focused on Claude token usage and ability-to-proceed-without-human. After honestly accounting for prompt caching (5-min TTL, ~10% cost on cached reads), the highest-leverage fixes are work-elimination items (cycles, invalidations, TTL crossings), NOT read-compression items.

## Summary

Six runner fixes, all in `docs/workflow/operations/codex-skills/feature-factory/scripts/`. Tight scope:

1. **Auto-reseal manifest after reconcile** when the reconcile commit affects only review frontmatter (no production code). Today: every reseal needs `--validation-only` then a separate commit, then HEAD moves, then re-reseal. We hit this 4× per ship in #757 and bypassed the runner entirely in the end.
2. **Codex auto-commit** when `dispatch-codex` returns and `git status --porcelain` shows uncommitted changes. Eliminates the "Codex sandbox can't commit, operator commits 25× per week" cycle.
3. **Test isolation CI gate**: fail the test suite if `docs/workflow/feature-runs/` is dirty after `unittest discover`. PR #758's e2e test silently destroyed the workflow files; no alarm fired.
4. **Cache & token instrumentation** so future decisions are data-driven. Today my "60-70% reduction" estimate from the original review was unmeasured; before more refactors, we should know the actual numbers.
5. **Deterministic review-extract** helper that parses review files into JSONL — no LLM, no trust risk. Saves the first-read cost of each new review without compressing semantically.
6. **TTL-aware operations + self-documenting errors**: long-running commands warn when they cross the 5-min Anthropic prompt-cache TTL; blocking error messages include the exact escape-hatch flag the operator should pass.

## Problem statement

### Fix 1 — Reseal cycle costs every ship

**Files**: `factory_cmd_reconcile.py`, `factory_cmd_checkpoint.py:_run_validation_only` path.

Today: after the diff stage's reviews are reconciled, the reconcile commit is itself a code change. That moves HEAD. The diff manifest's recorded HEAD no longer matches. Deliver refuses ("rerun the diff checkpoint before delivering"). Operator runs `checkpoint --stage diff --validation-only` to reseal — that's another commit. HEAD moves again. Repeat.

Observed: PR #757 needed 4 reseal cycles before deliver accepted. PR #758 I bypassed the runner entirely with `gh pr create` because the cycle wouldn't converge. Per-cycle cost: ~10-30K Claude tokens (commit message + status read + state read + retry).

**Fix**: in `command_reconcile`, after the reconcile state mutation succeeds, check whether the commit (or pending changes) affects only paths under `docs/workflow/feature-runs/<slug>/reviews/` (review-frontmatter-only mutations, by definition of the reconcile command). If yes, advance the diff manifest's recorded HEAD pointer to the post-reconcile HEAD as part of the same atomic state update. No separate reseal command, no second commit.

### Fix 2 — Codex sandbox can't commit; cascades into per-dispatch operator commit

**Files**: `factory_cmd_dispatch.py` post-Codex steps.

Today: `dispatch-codex` invokes `codex exec` which writes files but cannot commit (sandbox limitation: `.git/worktrees/<name>/index.lock` is not writable from the Codex sandbox). The operator must `git status` → `git add ...` → `git commit -m "..."` for every dispatch. Observed: ~25 manual commits this week.

Per-commit Claude cost: read test output, decide staged set, compose message, run git, verify status. ~3-8K tokens.

**Fix**: after `proc.communicate()` returns successfully (exit 0, non-quota, non-timeout) AND the snapshot capture finishes (per PR #758 FR-001), check `git status --porcelain` from `cwd=REPO_ROOT`. If non-empty:
- Stage everything in the operator's workflow scope (use the slug's scope.json paths) plus any modified production code outside scope (warn but include).
- Commit with template: `dispatch-codex auto-commit: <prompt-path-basename> [sha256: <prompt_sha256[:8]>]\n\n<dispatch_id>`.
- Update the dispatch record's `head_sha` to reflect the auto-commit's SHA (use the same per-field guard pattern from PR #758 FR-006a).

Opt-out: `--no-auto-commit` flag on `dispatch-codex` for cases where the operator wants to inspect before committing.

### Fix 3 — Test isolation CI gate

**Files**: new test or `conftest.py`-equivalent (we use unittest, so likely a `tests/test_workflow_isolation.py`).

Today: tests that import `factory_state` trigger the module-level `FACTORY_RUNS_ROOT` cache (`factory_state.py:28-29`). Tests that call `update_workflow_state` without patching the constant write to the real path. PR #758's `test_dispatch_codex_e2e.py` did exactly this and emptied the live workflow's `spec.md`/`plan.md`/`tasks.md`/`scope.json`.

**Fix**: a new test that runs LAST (alphabetically `test_zzz_workflow_isolation.py` or via test ordering hooks) checks `subprocess.run(["git", "status", "--porcelain", "docs/workflow/feature-runs/"])`. If output is non-empty, fails the test with the list of dirtied files, naming each test that imports `factory_state` for triage. The failing test message MUST include: "If your test calls factory_state.update_workflow_state, you MUST patch factory_state.FACTORY_RUNS_ROOT (which is computed at import time) to a tempdir before the call."

### Fix 4 — Cache & token instrumentation

**Files**: `factory_state.py` (extend `token_usage` shape), each `factory_cmd_*.py` handler (emit one record).

Today: `state.token_usage` tracks reviewer LLM calls (Codex/Gemini). It does NOT track Claude orchestration cost. We have no data on which FF commands burn the most Claude tokens.

**Fix**: each command, at exit, appends to `state.command_telemetry[]` a record:
```json
{
  "command": "checkpoint",
  "stage": "spec",
  "ts": "2026-04-26T10:00:00Z",
  "wall_seconds": 87,
  "input_bytes_read": 12500,
  "output_bytes_written": 4200,
  "files_read": 5,
  "files_written": 2,
  "subprocess_invocations": 14,
  "ttl_crossed": false
}
```

`input_bytes_read` is bytes Claude actually consumed via stdout/stderr capture from the command + any files the command touched on disk; this is a proxy for "uncached read pressure on the orchestrator." It's not a perfect cache-hit-rate metric (Anthropic's prompt cache state isn't visible to the runner), but it lets the operator answer "which command costs the most when I run it."

`ttl_crossed: bool` is true if `wall_seconds > 270` (the safe-cache-window cap from `~/.claude/CLAUDE.md` ScheduleWakeup notes).

This is **data collection only** — no behavior change. The data informs whether future read-compression refactors are worth it.

### Fix 5 — Deterministic review-extract

**Files**: new module `factory_cmd_review_extract.py`, registered in `run_factory.py`.

Today: when reconciling reviews, Claude reads each review file in full (50-300 lines) just to find the Findings section + extract severity tags. The runner already knows the file structure (frontmatter YAML + `## Findings` section).

**Fix**: new command `review-extract --slug X --stage Y [--json | --jsonl]`. Parses each review file under `reviews/<stage>.*.review.md` and emits one record per finding:
```json
{"review": "reviews/spec.codex.feasibility-adversarial.review.md", "review_index": 0, "severity": "HIGH", "first_line": "Snapshot is captured pre-Codex...", "line_start": 25, "line_end": 28, "frontmatter_status": "open"}
```

Severity detection re-uses the regex set from `factory_review_specs.py:20-45` (PR #744 Fix 2). No LLM call. No trust risk.

The orchestrator can then read 10-20 lines of extract per stage round instead of 200-500 lines of raw review prose. For deep reconciliation, the operator opens the specific review file flagged by the extract.

### Fix 6 — TTL-aware operations + self-documenting errors

**Files**: shared timing wrapper around long-running commands; each error path that has a flag-based escape hatch.

Today: I learned 11 different escape-hatch flags this week. The error messages don't tell you which flag fixes them. Example:
```
Diff artifact exceeds hard cap (266624 > 150000). Split the review scope into smaller workflow paths or use a smaller diff artifact.
```
The operator must know to pass `--max-artifact-chars 300000 --allow-large-diff-rerun`. Not in the message.

Today: a checkpoint that takes 5+ minutes silently crosses the cache TTL. The next read after returns to the orchestrator costs full (uncached) tokens.

**Fix part A**: every blocking error in the runner that a flag could resolve MUST include the exact flag invocation in the error text. Catalogued list (FR-006a below).

**Fix part B**: long-running commands (checkpoint, judge, dispatch-codex) emit a one-line stderr warning at exit if `wall_seconds > 270`: `[ttl-warning] command crossed the 5-minute Anthropic prompt-cache TTL (wall=Ns); subsequent orchestrator reads will be uncached. Consider batching follow-up commands.`

## Scope

### In scope
All 6 fixes above.

### Out of scope (deferred)
- LLM-based review summarization (any reviewer producing prose summaries Claude consumes). Defer until instrumentation tells us we need it AND we have a track-record-tested model for it.
- Concern carry-forward beyond spec→plan (PR #757 wired only the spec→plan handoff; plan→tasks→diff don't propagate).
- FR cross-PR numbering convention.
- Reviewer prompt extraction (move `is_codex_quota_exhaustion` to a shared module) — cross-tree refactor.
- File-rename-aware line counting (PR #758 R5 carryover).
- Non-code-file globs (PR #758 R4 carryover).

## User stories

### US1 — One-shot ship from reconciled-clean to merged (Priority: P1)

**As** an operator running `deliver` after reconciliation
**I need** the runner to NOT require a reseal cycle when the reconcile changed only review frontmatter
**So that** I don't spend 4 cycles per PR working around the manifest-mismatch gate.

**Why P1**: this hit every shipped PR this week. The fix is purely runner-side, not user-facing.

**Independent test**: integration test that simulates a reconcile commit on review files only, runs `deliver`, asserts deliver proceeds without `--validation-only` or any escape flag. Negative test: a reconcile commit that ALSO modifies a `.py` file MUST still trigger the manifest-mismatch gate (we don't want to bypass legitimate code changes).

**Acceptance scenarios**:

1. **Given** a workflow at the diff stage with reviews reconciled and the reconcile commit modified ONLY files under `reviews/`, **when** `deliver` runs, **then** deliver proceeds (no HEAD-mismatch error). The diff manifest's recorded HEAD has been advanced as part of the reconcile command.
2. **Given** a reconcile commit that ALSO modified `factory_deliver.py` (or any non-`reviews/` file), **when** `deliver` runs, **then** deliver still requires `checkpoint --stage diff` re-run (existing behavior; the auto-advance is conditional on review-only changes).

### US2 — Codex dispatch ships its work without operator intervention (Priority: P1)

**As** an operator running `dispatch-codex`
**I need** the dispatched changes to be committed automatically when Codex finishes
**So that** I don't spend ~5 minutes per dispatch composing commit messages and running git commands.

**Why P1**: 25 manual commits this week × ~5K Claude tokens each = 125K tokens of pure operator-overhead.

**Independent test**: e2e test (extending `test_dispatch_codex_e2e.py` from PR #758) that simulates Codex writing files but NOT committing; runs `dispatch-codex`; asserts a commit was created with the templated message; asserts the dispatch record's `head_sha` reflects the auto-commit SHA.

**Acceptance scenarios**:

1. **Given** Codex exits 0 with files modified but uncommitted, **when** `dispatch-codex` returns, **then** a commit exists with the canonical message format defined in **FR-004a** (which is the authoritative source of truth — round-3 spec LOW; the prior US2 example here was illustrative only). The dispatch record's `head_sha` is the new commit SHA (not the pre-Codex SHA).
2. **Given** Codex exits 0 with no files modified, **when** `dispatch-codex` returns, **then** no commit is created; the dispatch record reflects the pre-Codex HEAD.
3. **Given** `--no-auto-commit` is passed, **when** `dispatch-codex` returns with uncommitted changes, **then** no commit is created; runner prints "uncommitted changes left for operator review" to stderr.
4. **Given** the auto-commit's `git commit` itself fails (e.g., pre-commit hook rejects), **when** `dispatch-codex` returns, **then** the dispatch record IS still appended (preserves audit trail) AND the runner exits 1 with the git error printed to stderr; operator can resolve manually.

### US3 — Tests cannot silently corrupt workflow state (Priority: P1)

**As** an operator running `unittest discover` after Codex implements anything
**I need** the suite to fail loudly if any test mutated `docs/workflow/feature-runs/`
**So that** PR #758's silent-destruction-of-spec-files class of bug is impossible to ship.

**Why P1**: this nearly took down PR #758's audit trail. We caught it after the fact.

**Independent test**: a test that deliberately calls `factory_state.update_workflow_state("test-slug", lambda s: None)` WITHOUT patching `FACTORY_RUNS_ROOT`; assert the isolation gate fails the suite with a clear error.

**Acceptance scenarios**:

1. **Given** the test suite runs and one test mutates `docs/workflow/feature-runs/`, **when** the isolation gate runs (last in suite alphabetically OR via cleanup hook), **then** the suite fails with output listing each dirtied file path AND a hint pointing at the offending test pattern.
2. **Given** the test suite runs cleanly with no workflow-state mutations, **when** the isolation gate runs, **then** it passes and the suite reports OK.
3. **Given** workflow-state files were modified BEFORE the suite started (operator's in-progress feature run), **when** the isolation gate runs, **then** it ignores those (compares pre-suite state via `git stash --keep-index` or equivalent) — only flags MUTATIONS introduced by the suite.

### US4 — Operators can see where Claude tokens go (Priority: P2)

**As** an operator wondering whether FF is worth the Claude cost
**I need** per-command instrumentation showing wall-time, bytes read, bytes written, and TTL crossings
**So that** I can decide which command to optimize next, with data instead of guessing.

**Why P2**: doesn't fix anything immediately; sets up the next round of decisions.

**Independent test**: run a `checkpoint --stage spec` against a fixture; assert `state.token_usage.commands[-1]` has all required fields with sensible values (wall_seconds > 0, input_bytes_read > 0, output_bytes_written ≥ 0, ttl_crossed in {true, false}).

**Acceptance scenarios**:

1. **Given** any FF command completes, **when** the runner exits, **then** `state.command_telemetry[]` has a new record with the 9 fields from FR-004.
2. **Given** a command runs longer than 270s, **when** it exits, **then** the record has `ttl_crossed: true`.
3. **Given** the operator runs `status --slug X --json`, **when** the output is parsed, **then** the most recent 10 command records are accessible (helps decide what's expensive).

### US5 — Reviewing reviews doesn't require reading 200 lines per file (Priority: P2)

**As** an orchestrator (Claude) reconciling reviews
**I need** a deterministic JSONL extract of {severity, file, line, one-liner} per finding
**So that** I can decide which reviews need full inspection without paying the first-read cost on the full file.

**Why P2**: secondary token saving; primary use case is "tell me which reviews have HIGH/MEDIUM findings without me reading each file."

**Independent test**: run `review-extract --slug X --stage spec`; assert output is valid JSONL with one record per finding; verify against a fixture review file with known findings.

**Acceptance scenarios**:

1. **Given** `reviews/spec.codex.feasibility-adversarial.review.md` with 2 HIGH and 1 MEDIUM findings, **when** `review-extract --slug X --stage spec` runs, **then** the output JSONL has 3 records (one per finding) with correct severity, line ranges, and one-line text.
2. **Given** a review file using the numbered-list severity format (`1. **HIGH**: ...`), **when** the extract runs, **then** all severities are detected (re-uses PR #744 regex set).
3. **Given** an empty review (no `## Findings` section), **when** extract runs, **then** zero records emitted; exit code 0.
4. **Given** a malformed review (missing frontmatter), **when** extract runs, **then** exit code 2 with clear error pointing at the file.

### US6 — Errors tell you which flag to pass (Priority: P2)

**As** a new operator hitting a blocking error
**I need** the error message to include the exact flag invocation that resolves it
**So that** I don't have to grep `--help` or read commit messages to find the magic incantation.

**Why P2**: each error becomes self-documenting; reduces onboarding cost AND saves the operator's time when re-encountering rare paths.

**Independent test**: parametrized test that triggers each known blocking error and asserts the error text contains the exact flag string.

**Acceptance scenarios**:

1. **Given** a checkpoint that hits the 150KB diff artifact cap, **when** the runner blocks, **then** the error includes `--max-artifact-chars <N> --allow-large-diff-rerun`.
2. **Given** a checkpoint that hits a dirty path outside scope, **when** the runner blocks, **then** the error includes `--allow-dirty-path <path>`.
3. **Given** a deliver that hits HEAD mismatch (post-Fix-1 this should be rare), **when** the runner blocks, **then** the error includes the exact path forward (`checkpoint --stage diff --validation-only` OR the auto-reseal note from Fix 1).

## Functional requirements

### Fix 1 — Auto-reseal manifest

- **FR-001 (REVISED — 3 reviewers HIGH on path-check coarseness)**: `command_reconcile` MUST capture `head_at_start = git rev-parse HEAD` AND `dirty_at_start = set of porcelain paths` at the BEGINNING of the command, BEFORE any state mutation. After the reconcile mutation succeeds, capture `head_at_end = git rev-parse HEAD` AND `dirty_at_end = set of porcelain paths`. The auto-reseal fires ONLY if ALL of:
  - `head_at_start != head_at_end` (a commit was actually made by reconcile, OR reconcile staged + committed under our wrapper) — this scopes the path-check to commit-introduced changes, NOT cumulative dirty state. Use `git diff --name-only head_at_start..head_at_end` to enumerate command-introduced paths.
  - Every command-introduced path is under `docs/workflow/feature-runs/<slug>/reviews/` OR is `docs/workflow/feature-runs/<slug>/plan.md` (the reconcile reconciliation-section append target).
  - `dirty_at_start == dirty_at_end` — operator's pre-existing dirty files are unchanged by the reconcile (no surprise mutations).
  - We are not in the middle of a merge/rebase: `os.path.exists(REPO_ROOT / ".git" / "MERGE_HEAD")` AND `os.path.exists(REPO_ROOT / ".git" / "REBASE_HEAD")` and similar are all False.

  If ALL conditions hold, the runner advances the diff manifest's recorded HEAD to `head_at_end` as part of the same atomic state update. If ANY condition fails, behavior is unchanged (manifest stays at old HEAD; operator runs reseal explicitly).
- **FR-002**: If ANY path falls outside `reviews/`, behavior is unchanged from PR #757 (the manifest stays at its old HEAD; deliver still requires re-checkpoint).
- **FR-003**: A new `state.diff_review_budget.last_review_only_advance_at` timestamp records the auto-reseal so the operator can audit when it fired. Existing fields (`recorded-base`, `head_mismatch`) MUST continue to work.

### Fix 2 — Codex auto-commit

- **FR-004 (REVISED — 3 reviewers HIGH on `git add -A`)**: After `proc.communicate()` returns with exit 0 (non-quota, non-timeout) AND after the snapshot capture (PR #758 FR-001), `command_dispatch_codex` MUST run `git status --porcelain` from `cwd=factory_state.REPO_ROOT`. If output is non-empty AND `--no-auto-commit` was NOT passed:
  - Capture `pre_dispatch_dirty = set(porcelain_paths from BEFORE Codex ran)` — this is the allowlist of "operator's pre-existing changes that should NOT be touched." It is captured at the start of `command_dispatch_codex`, before Codex invocation.
  - Capture `post_dispatch_dirty = set(porcelain_paths AFTER Codex ran)`.
  - Compute `codex_introduced = post_dispatch_dirty - pre_dispatch_dirty`. This is the set of files Codex created or modified that the operator did NOT have dirty before.
  - **Overlap detection (round-2 spec MEDIUM Codex edge-cases CODE-CONFIRMED)**: for each path P in `pre_dispatch_dirty ∩ post_dispatch_dirty` (path was dirty BEFORE Codex AND still dirty AFTER), compute `git diff <pre-content-sha> <post-content-sha>` for P. If P's content changed during Codex's run, P falls into a third set: `codex_modified_existing_dirty`. These are paths where Codex's work overlaps the operator's pre-existing edits. Implementation: snapshot `git ls-files -s -- <path>` (object SHA) for each pre-dispatch-dirty path BEFORE Codex; re-snapshot after; compare.
  - **If `codex_modified_existing_dirty` is non-empty**: do NOT auto-commit. Print a warning: `[auto-commit-skip] Codex modified files that operator already had dirty: <paths>. Manual review required. Run 'git add' + 'git commit' to commit, or 'git checkout' to discard.` Exit code stays at the Codex exit code (no override). The dispatch record IS still appended (preserves audit) with `auto_commit: {skipped: true, reason: "overlap with operator dirty", overlap_paths: [...]}`.
  - Stage ONLY `codex_introduced`: `git add -A -- <each path in codex_introduced>` (NOT `git add -A` alone, NOT `git add .`). The `-A` flag with explicit paths handles deletions correctly (round-2 spec LOW Gemini): a deleted path is staged as a deletion. The explicit path list bounds the staging to Codex's actual work; operator's pre-existing dirty files outside the path list are NOT touched.
  - If `codex_introduced` is empty, skip the commit (Codex made no observable changes); log "no Codex-introduced changes; skipping auto-commit" to stderr; proceed.
  - If `codex_introduced` is non-empty, run `git commit -m "<canonical-template>"` using THE SAME single template defined in FR-004a below (resolves round-1 spec MEDIUM Codex edge-cases on US2/FR-004 inconsistency).
  - Update the dispatch record's `head_sha` to the auto-commit's SHA via a SECOND `git rev-parse HEAD` call (per FR-006a per-field semantics from PR #758).
  - Record `auto_commit: {introduced_paths: [...], excluded_pre_existing_paths: [...], commit_sha: <sha>}` in the dispatch record for audit.
- **FR-004a (canonical commit message — resolves US2/FR-004 inconsistency)**: The auto-commit message MUST be:
  ```
  dispatch-codex auto-commit: <prompt-path-basename>

  Prompt sha256: <prompt_sha256>
  Dispatch ID: <dispatch_id>
  Model: <model>

  Co-Authored-By: Codex (<model>) <noreply@openai.com>
  ```
  This format is the single source of truth. US2's "templated message" example in the spec is illustrative, not authoritative; FR-004a is what the implementation matches and what tests assert against.
- **FR-005**: If `git commit` fails (non-zero exit), the runner MUST: (a) still append the dispatch record to state (preserves audit), (b) exit 1, (c) print the git error to stderr, (d) leave the workspace dirty for the operator. The dispatch record's `head_sha` reflects the pre-commit-attempt HEAD in this case.
- **FR-006**: A new `--no-auto-commit` flag on `dispatch-codex` (boolean, default False) opts out of FR-004. When passed, no `git status` check, no commit attempt; the dispatch record's `head_sha` reflects the post-Codex (uncommitted) HEAD.

### Fix 3 — Test isolation CI gate

- **FR-007 (REVISED — round-1 spec MEDIUM on alphabetical brittleness)**: The isolation check is a SEPARATE COMMAND, not a unittest test. New script `scripts/check_workflow_isolation.py` accepts `--baseline <baseline.json>` (paths captured before the suite ran) and exits non-zero if any path under `docs/workflow/feature-runs/` is dirty post-suite that wasn't dirty pre-suite. This avoids depending on test discovery order, parallel execution, or test-abort behavior.

  Operator runs:
  ```bash
  python3 scripts/check_workflow_isolation.py --capture-baseline /tmp/baseline.json
  python3 -m unittest discover docs/workflow/operations/codex-skills/feature-factory/scripts/tests
  python3 scripts/check_workflow_isolation.py --check --baseline /tmp/baseline.json
  ```

  Only the third command can fail with the isolation error.

- **FR-008 (REVISED)**: The check compares (a) the set of porcelain paths under `docs/workflow/feature-runs/` at baseline time AND (b) the set after the test suite. If `(post - pre)` is non-empty, exit 1 with output: `[isolation-fail] tests dirtied: <paths>\n\nIf your test calls factory_state.update_workflow_state, you MUST patch factory_state.FACTORY_RUNS_ROOT (computed at import time, factory_state.py:28-29) to a tempdir before the call.`
  Also: `(pre - post)` non-empty (the suite DELETED files that were dirty before) is ALSO a failure — that's PR #758's exact scenario. Combine into the same error.

- **FR-008a (CI integration — REVISED per round-2 Gemini HIGH CODE-CONFIRMED)**: The repo's `.github/workflows/ci.yml` (verified) does NOT currently run `unittest discover` for the FF feature-factory scripts at all. Adding a CI job IS in scope for this PR. Specifically:
  - Add a new CI job `feature-factory-tests` that (a) captures the baseline via `python3 docs/workflow/operations/codex-skills/feature-factory/scripts/check_workflow_isolation.py --capture-baseline /tmp/baseline.json`, (b) runs `python3 -m unittest discover docs/workflow/operations/codex-skills/feature-factory/scripts/tests`, (c) runs the isolation check.
  - Add `feature_factory` to the existing `changes` job's outputs (round-3 spec MEDIUM Codex feasibility CODE-CONFIRMED — currently `changes` only emits `api` and `web` per ci.yml:11-22). The path filter for `feature_factory` is `docs/workflow/operations/codex-skills/feature-factory/**`. Job MUST run on every PR where `feature_factory` output is true. Alternatively, run unconditionally — the FF test suite is fast (~7s) so the always-on cost is negligible; this is the simpler implementation.
  - If CI workflow changes are out-of-scope for the implementer, the gate must be added as a runner subcommand `run_factory.py check-isolation [--capture-baseline | --check]` AND documented in `SKILL.md` with a "you must wire this into CI" note. The implementer should choose the simplest path that keeps the safety net automated.

### Fix 4 — Cache & token instrumentation

- **FR-009 (REVISED — round-2 spec MEDIUM Codex CODE-CONFIRMED on telemetry migration)**: The existing `state.token_usage` is a LIST of reviewer-LLM-call records (factory_state.py:220, factory_telemetry.py:245). Changing the shape to a dict would break `factory_telemetry.py` which currently does `state.get("token_usage", [])` and `state["token_usage"] = usage` on a list. To avoid migration:
  - DO NOT change `state.token_usage` shape. Keep it as a list of reviewer records.
  - ADD a SEPARATE top-level field `state.command_telemetry = []` (different name avoids any collision). New field, no migration needed; existing state.json files default it to `[]` on first mutation via `setdefault`.
  - `_default_workflow_state()` adds `"command_telemetry": []`.
  - All references in this spec to `token_usage.commands[]` are renamed to `command_telemetry[]`.
- **FR-009a (migration safety)**: A `--migrate-state` flag (or one-shot script) is NOT required. New field auto-populates on next mutation. Existing reviewer telemetry under `state.token_usage` is unchanged.
- **FR-009b (retention — round-3 spec MEDIUM Codex feasibility CODE-CONFIRMED on write amplification)**: `state.command_telemetry[]` MUST be capped at the most recent 100 records. After each append, the runner truncates the list to the last 100 entries. Rationale: state.json is rewritten in full on every mutation (`atomic_json_write` at factory_state.py:57); an unbounded telemetry list would cause linear write amplification across a long workflow. 100 records covers a typical PR's command history (~30-50 commands) with headroom; `--tokens` subcommand displays the most recent 10 (FR-013) so older history is rarely needed.
- **FR-010**: Each `command_*` handler in `factory_cmd_*.py` MUST be wrapped (via decorator or explicit) such that on exit, a record is appended to `state.command_telemetry[]` with: `{command, stage, ts, wall_seconds, input_bytes_read, output_bytes_written, files_read, files_written, subprocess_invocations, ttl_crossed}`. The wrapper is best-effort: if instrumentation itself raises, the original command's exit code MUST be preserved (instrumentation errors print to stderr but do NOT fail the command).
- **FR-011 (REVISED — round-1 spec MEDIUM on metric fidelity)**: `input_bytes_read` is approximated as the sum of (a) bytes read from disk by the command via Python `Path.read_text` / `open(...).read()` invocations the runner can instrument (via a small wrapper helper used by FF code paths — NOT a global hook; we only instrument FF-owned reads), (b) bytes captured from `subprocess.run(..., capture_output=True)` stdout+stderr where the runner CAPTURES the output. Reads outside instrumented helpers (e.g., reads inside imported library code) are NOT counted.

  **Explicit fidelity caveat**: this is a PROXY for "uncached read pressure on the orchestrator," NOT a cache-aware metric and NOT the actual Anthropic billable token count. It does not reflect prompt cache state. It does not capture reads done by Claude (the orchestrator) outside FF subprocess invocations.

  **The number is useful for relative comparison ONLY**: "is `checkpoint --stage diff` reading 2× as many bytes as `checkpoint --stage spec`?" not "is FF using 200K tokens per PR?" Operators MUST treat the absolute numbers as proxy values. The metric primarily exists to surface OUTLIERS (commands whose byte count grows over time, suggesting unbounded reads).

  Document this caveat in the `--tokens` subcommand's help text.
- **FR-012**: `ttl_crossed: bool` is true iff `wall_seconds > 270.0`.
- **FR-013**: A `status --tokens` subcommand prints the most recent 10 records as a table.

### Fix 5 — Deterministic review-extract

- **FR-014**: New module `factory_cmd_review_extract.py` exporting `command_review_extract(args)`. Argparse: `review-extract --slug <slug> --stage <spec|plan|tasks|diff|closeout> [--format jsonl|json] [--out <path>]`. Default format: `jsonl`. Default `--out`: stdout.
- **FR-015**: Each output record has shape `{"review": <relative path>, "review_index": <int>, "severity": <"HIGH"|"MEDIUM"|"LOW"|null>, "first_line": <one-line text>, "line_start": <int>, "line_end": <int>, "frontmatter_status": <"open"|"accepted"|"deferred"|"dismissed"|"failed"|"rejected"|null>}`. `review_index` is 0-based within the review file. The `frontmatter_status` enum INCLUDES `"rejected"` and `"failed"` (round-2 spec MEDIUM Codex edge-cases CODE-CONFIRMED — both states exist in the repo's review history).
- **FR-015a (REVISED — round-1 spec MEDIUM on multi-line/markdown variation)**: Finding boundaries are determined as follows:
  - Each finding STARTS at a line matching one of the severity-tag regexes (FR-016).
  - Each finding ENDS at: (a) the line immediately before the next severity-tag line, OR (b) the line immediately before the next `^## ` heading (typically `## Residual Risks`), OR (c) the end of file. Whichever comes first.
  - `line_start` is the 1-indexed line number of the severity-tag line.
  - `line_end` is the 1-indexed line number of the last line in the finding (inclusive).
  - `first_line` is the trimmed text on the SAME line as the severity tag (everything after the severity match), trimmed of leading punctuation (`:`, `**`, whitespace). If empty (the severity line is just `**HIGH**` with no inline text), `first_line` is the first non-empty line within the next 5 lines (5 = arbitrary cap to bound the search), trimmed.
  - Code blocks (` ``` `) within a finding are included in its line range; no special handling.
- **FR-016**: Severity detection re-uses the regex set from `factory_review_specs.py:20-45` (PR #744 Fix 2): bullet-with-bold (`- **HIGH**:`), numbered-list (`1. **HIGH**:`), heading-style (`### HIGH:`), bold-prefix (`**HIGH [CODE-CONFIRMED]**:`), inline-field (`Severity: HIGH`). Repeated headings (e.g., a review with both `### HIGH` followed by individual `- **HIGH**` bullets — observed in some Gemini outputs) MUST emit one record per finding-line, not per heading. The regex match is on the LINE level; section nesting is ignored.
- **FR-016a (round-2 spec LOW Codex edge-cases CODE-CONFIRMED — code-fence false positives)**: severity matching MUST skip lines inside fenced code blocks (` ``` `). The parser tracks fence-depth: each ` ``` ` line toggles in/out of a fence. Lines inside a fence are not subject to severity regex. Note: the EXISTING `factory_review_specs.py` behavior (per `test_factory_review_specs.py`) deliberately matches inside fences — that's for AUTO-RECONCILE which wants to flag any review that mentions a HIGH inside an example. `review-extract` is a different consumer (orchestrator-side) and wants to AVOID false positives on quoted prior-finding examples. Document as an intentional behavioral DIFFERENCE between the two consumers.
- **FR-017**: When a review file has no `## Findings` section OR the section is empty, ZERO records are emitted (not an error; absence of findings is valid).
- **FR-018**: When a review file has malformed YAML frontmatter, the command exits 2 with `error: malformed frontmatter in <path>` to stderr. (Existing reviews are well-formed; this is a defensive guard.)

### Fix 6 — TTL warnings + self-documenting errors

- **FR-019**: A shared timing wrapper around `command_checkpoint`, `command_judge`, `command_dispatch_codex` measures wall-time. If `wall_seconds > 270.0`, prints to stderr: `[ttl-warning] <command> crossed the 5-minute prompt-cache TTL (wall=<Ns>s); subsequent orchestrator reads will be uncached. Consider batching follow-up reads.`
- **FR-020**: Every blocking error message in the runner that a flag could resolve MUST include the exact flag string. Catalogued (current → new):
  - Diff cap exceeded: `... use a smaller diff artifact.` → `... or pass --max-artifact-chars <2x current> --allow-large-diff-rerun.`
  - Dirty path outside scope: `... is dirty outside the feature paths.` → `... is dirty outside scope; pass --allow-dirty-path <path-prefix> if intentional.`
  - HEAD mismatch on deliver: `... rerun the diff checkpoint before delivering.` → `... rerun the diff checkpoint before delivering, OR if reconcile changed only review files, the auto-reseal in this version should have advanced the manifest — file a bug if you see this.`
  - Concern lifecycle blocker: `... unresolved-concerns-from-tasks` → `... unresolved-concerns-from-tasks; address with: checkpoint --stage <next-stage> --address <id> --evidence "<text>"`.
- **FR-021**: All updated error messages MUST be covered by tests that grep the message text for the flag string.

## Risks

- **R1 (low)**: Auto-reseal could mask a real code-affecting reconcile if `reconcile` is misused to commit code (today's reconcile only writes to review frontmatter; FR-001 path-check is the safety net). **Accepted** because the path-check is deterministic.
- **R2 (medium)**: Auto-commit (FR-004) could include unintended changes in the operator's working tree (e.g., debug prints from a separate hand-edit). **Mitigation**: `--no-auto-commit` opt-out; auto-commit message clearly identifies "auto" so the operator can revert if surprised.
- **R3 (low)**: Instrumentation overhead. Each command appends to state — adds ~1-5ms per command. Acceptable.
- **R4 (low)**: TTL warning is approximate (270s vs Anthropic's actual 300s TTL). Erring on the side of warning earlier. **Accepted**.
- **R5 (low)**: `review-extract` regex set may miss novel severity formats (e.g., a future reviewer style we haven't seen). **Mitigation**: same regex set already covers all observed formats; a missing one becomes a reviewer-prompt-fix, not an extract-fix.

## Success criteria

- **SC-001**: After this PR ships, a typical FF run completes deliver in 1 attempt (not 4). Verified by manually running the next real feature.
- **SC-002**: A typical Codex dispatch produces a commit without operator intervention. Verified by the new e2e test.
- **SC-003**: Running `unittest discover` after Codex implements anything either passes cleanly OR fails the isolation gate with a clear error pointing at the offending test.
- **SC-004**: After 1-2 PRs of operating with instrumentation, we have data on which commands cost the most and can decide whether further read-compression is worth pursuing.
- **SC-005**: All 294+ existing FF tests still pass; new tests bring count to ~300-305.

## Assumptions

- The `reconcile` command writes only to review frontmatter (verified — it calls `update_review_resolution.py` and `append_reconciliation_entry.py`, both of which touch only review files and `plan.md`'s reconciliation section). The path-check in FR-001 includes `plan.md` under `feature-runs/<slug>/` if necessary.
- `factory_state.FACTORY_RUNS_ROOT` is computed at import time (verified, factory_state.py:28-29). The CI gate's hint message is technically correct.
- The 270s TTL threshold is conservative relative to Anthropic's 300s window. ~30s safety margin.
- `git status --porcelain` is fast enough (~10-50ms in normal repos) that adding it to the dispatch path doesn't materially slow the command.
- Existing 294-test baseline comes from PR #758. PR #762 (ff-advance empty head_sha) may have added 1-2 more tests; we'll verify at task time.

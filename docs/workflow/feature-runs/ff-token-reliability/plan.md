# Plan — FF Token & Reliability

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: deferred | note: Codex timed out on rounds 2 and 3. Round-1 + round-2 findings (HIGHs on git add -A, FR-001 path-check coarseness; MEDIUMs on telemetry write amp, CI path filter) all addressed in current spec.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: deferred | note: Codex timed out on round 3. Round-1 + round-2 edge-cases findings (HIGH on git add -A, MEDIUMs on overlap detection, telemetry migration, frontmatter status enum) all addressed.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: All 3 rounds completed. Round-1 HIGH (CI integration), Round-2 HIGHs (auto-commit dangerous, auto-reseal can't isolate), Round-3 HIGH (CI gate ineffective without integration) — all FIXED via FR-001 head-delta, FR-004 codex_introduced + overlap detection, FR-008a CI job mandate. LOWs noted.
- review: reviews/plan.codex.architecture-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: No actionable findings detected — auto-accepted
- review: reviews/plan.codex.implementation-adversarial.review.md | status: deferred | note: Codex implementation review timed out. Plan covers 11 detailed implementation steps mapped to FRs; the other two plan reviewers (architecture, testability) auto-accepted with no actionable findings.
- review: reviews/tasks.codex.dependency-order-adversarial.review.md | status: accepted | note: HIGH (codex_deleted undefined): FIXED — T08 removed the variable; clean deletions appear in codex_introduced via porcelain. T17 Case F updated. MEDIUM (counter mechanism unspecified): FIXED — T04 now specifies thread-local ctx + factory_io helpers + scope reduction to 6 heavy commands. MEDIUM (rename/copy lines): documented as residual; rare in FF flows. MEDIUM (T11 yaml fallback): the inline parser handles current FF reviews; yaml.safe_load is the upgrade path.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: HIGH #1 (CI gate bypass on test failure): FIXED — T15 now mandates if: always() on the check step. HIGH #2 (already-dirty content drift in check_workflow_isolation): documented as residual; the gate is for tests, not auto-commit; content drift in pre-existing dirty files during a test run is rare. MEDIUM (codex_deleted undefined): FIXED via T08 simplification.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: HIGH (review extractor and subheadings): mistaken — regex ^##\s+\S only matches level-2 headings; ### sub-heads are correctly skipped. MEDIUM (counter mechanism): FIXED via T04 thread-local. MEDIUM (file mode changes invisible): residual; chmod is rare. LOW (test-internal write-then-restore): residual. LOW (TTL message inconsistent): FIXED — message now reads '270s safety threshold' with 300s context. LOW (T02 non-list robustness): FIXED — guard added.

## Architecture

| Fix | Files | Entry point |
|---|---|---|
| 1 — Auto-reseal manifest after reconcile (review-only path) | `factory_cmd_reconcile.py`, `factory_state.py` (head-delta helper) | `command_reconcile` post-mutation block |
| 2 — Codex auto-commit on dispatch-done | `factory_cmd_dispatch.py` (post-Codex block) | `command_dispatch_codex` after snapshot capture |
| 3 — Test isolation gate | NEW `scripts/check_workflow_isolation.py`; CI workflow `.github/workflows/ci.yml` | new top-level script + new CI job |
| 4 — Cache & token instrumentation | `factory_state.py` (schema), `factory_telemetry.py` or new wrapper | decorator on `command_*` handlers |
| 5 — Deterministic review-extract | NEW `factory_cmd_review_extract.py` | `command_review_extract` |
| 6 — TTL warnings + self-documenting errors | shared timing wrapper; error message updates across runner | per-command + per-error-site |

## Implementation slices

Single slice covers all 6 fixes (~6 production files modified, 2 new files, ~400 lines net + tests). No multi-slice split needed; each fix is independent and can be verified by the test suite as a unit.

### Order of edits

1. **`factory_state.py`** — add `command_telemetry: []` to `_default_workflow_state` (FR-009). Add `setdefault("command_telemetry", [])` in the load path. Implement the 100-record cap as a helper `_cap_command_telemetry(state)` called from any command-telemetry append site (FR-009b).

2. **NEW `factory_telemetry_commands.py` (or extend `factory_telemetry.py`)** — provide `record_command_telemetry(slug, command, stage, wall_seconds, input_bytes_read, output_bytes_written, files_read, files_written, subprocess_invocations)` that appends to `state.command_telemetry[]` and applies the 100-record cap. Best-effort: catch its own exceptions and print to stderr (FR-010).

3. **`factory_mutating.py` (or `run_factory.py` dispatcher)** — wrap each `command_*` invocation with a timing + counter context manager that:
   - records `time.perf_counter()` start/end → `wall_seconds`
   - tracks `input_bytes_read` via a small file-read wrapper helper used by FF code (NOT a global hook; FF-owned reads only)
   - on exit, calls `record_command_telemetry`
   - prints the TTL warning if `wall_seconds > 270.0` (FR-019)
   - swallows its own exceptions (instrumentation never breaks command exit)

4. **`factory_cmd_reconcile.py`** — at start, capture `head_at_start`, `dirty_at_start`. After state mutation, capture `head_at_end`, `dirty_at_end`. If FR-001's four conditions hold (HEAD changed, all introduced paths under reviews/ or plan.md, dirty unchanged, no merge/rebase in flight), update `state.diff_review_budget.recorded_head` to `head_at_end` AND set `state.diff_review_budget.last_review_only_advance_at = ts` (FR-003).

5. **`factory_cmd_dispatch.py`** — at the start of `command_dispatch_codex`, capture `pre_dispatch_dirty` (porcelain paths) AND for each path, capture its object SHA via `git ls-files -s`. After Codex completes (post-snapshot, FR-004 step):
   - If `--no-auto-commit` was passed (FR-006), skip the auto-commit block.
   - Capture `post_dispatch_dirty` and per-path object SHAs.
   - Compute `codex_introduced = post - pre`.
   - For paths in `pre ∩ post`, compare object SHAs; collect into `codex_modified_existing_dirty` if SHA changed.
   - If `codex_modified_existing_dirty` is non-empty: print warning, skip auto-commit, append dispatch record with `auto_commit: {skipped: true, reason: "overlap with operator dirty", overlap_paths: [...]}` (FR-004 overlap clause).
   - Else if `codex_introduced` is empty: skip auto-commit; log "no Codex-introduced changes" to stderr; append dispatch record normally.
   - Else: `git add -A -- <each path in codex_introduced>`; `git commit -m "<canonical FR-004a template>"`; capture new HEAD via `git rev-parse HEAD` (per-field per FR-006a from PR #758 — exception → `head_sha = None`); update dispatch record with `auto_commit: {introduced_paths, excluded_pre_existing_paths, commit_sha}`.
   - On commit failure (FR-005): still append the dispatch record; exit 1; print git error.

6. **NEW `scripts/check_workflow_isolation.py`** (FR-007/8) — at top of `feature-factory/scripts/`. Top-level script accepting `--capture-baseline <path>` OR `--check --baseline <path>`. Capture mode runs `git status --porcelain docs/workflow/feature-runs/`, writes paths to baseline JSON. Check mode reads baseline + runs the same git status, computes `(post - pre)` and `(pre - post)`; if either non-empty, exit 1 with formatted error.

7. **`run_factory.py`** — register `check-isolation` subcommand wrapping the script (FR-008a runner-subcommand alternative). Register `review-extract` subcommand wrapping new module from step 8.

8. **NEW `factory_cmd_review_extract.py`** (FR-014–018) — argparse handler that:
   - Iterates `docs/workflow/feature-runs/<slug>/reviews/<stage>.*.review.md` files.
   - For each file: parse YAML frontmatter (use existing `factory_review_specs.py` helpers if available, else `yaml.safe_load`); extract `resolution_status` for `frontmatter_status` field.
   - Find `## Findings` section; iterate lines tracking fence-depth (FR-016a — skip lines inside ` ``` ` blocks).
   - For each line matching the severity regex set (FR-016), emit a record per FR-015a boundary rules (start at severity-tag line, end at next severity-tag OR next `## ` heading OR EOF).
   - First-line extraction: trim text after severity tag on same line; fallback to first non-empty within next 5 lines (FR-015a).
   - Output to `--out` path or stdout, format `--format` (jsonl default).
   - On malformed frontmatter (FR-018): exit 2 with clear error.

9. **`factory_cmd_status.py` (or run_factory.py status path)** — add `--tokens` flag that reads `state.command_telemetry[-10:]` and prints a table (FR-013) with help text including the FR-011 fidelity caveat.

10. **Error message updates** (FR-020/021) — find each blocking error in the runner that has a flag-based escape:
    - `factory_cmd_checkpoint.py` diff-cap message → add `--max-artifact-chars` and `--allow-large-diff-rerun` flags.
    - `factory_git.py` (or wherever dirty-path check lives) → add `--allow-dirty-path <path>` flag.
    - `factory_cmd_deliver.py` HEAD mismatch → add note about auto-reseal from Fix 1.
    - `factory_cmd_checkpoint.py` unresolved-concerns → include `--address <id>` example.
    Updates must be covered by tests that grep the message text for the flag string.

11. **`.github/workflows/ci.yml`** — add a new job `feature-factory-tests` that:
    - Runs `python3 docs/workflow/operations/codex-skills/feature-factory/scripts/check_workflow_isolation.py --capture-baseline /tmp/ff-baseline.json` BEFORE the test suite.
    - Runs `python3 -m unittest discover docs/workflow/operations/codex-skills/feature-factory/scripts/tests`.
    - Runs `python3 docs/workflow/operations/codex-skills/feature-factory/scripts/check_workflow_isolation.py --check --baseline /tmp/ff-baseline.json` AFTER the suite.
    - For simplicity, runs unconditionally (not gated on a path filter; the suite is ~7s — negligible).

## Test approach

- All 294+ existing FF tests pass; new tests bring count to ~305-310.
- New tests:
  - `test_auto_reseal.py` — reconcile commit on review-only paths advances manifest; reconcile commit touching production code does NOT advance.
  - `test_dispatch_codex.py` extension — 3 new cases: auto-commit happy path, `--no-auto-commit` opt-out, `codex_modified_existing_dirty` skip-with-warn path.
  - `test_check_workflow_isolation.py` — capture+check happy path; failure case (one path dirtied between capture and check).
  - `test_command_telemetry.py` — record appended; 100-record cap; exception in record helper does not propagate.
  - `test_review_extract.py` — basic extract, severity formats (5 from FR-016), code-fence skip (FR-016a), first-line fallback (FR-015a), malformed frontmatter exit 2.
  - `test_self_documenting_errors.py` — each blocking error message includes its flag string.
- The TTL warning is asserted by patching `time.perf_counter` to return values 270s+ apart.

## Implementation strategy

Single Codex dispatch via direct `codex exec` (the new auto-commit feature this PR ships will make subsequent dispatches automatic; this PR's dispatch still needs the operator commit).

Codex prompt should re-read tasks.md as authoritative. Tasks file follows in the next checkpoint.

## Risks (carried from spec)

- R1 (low): auto-reseal could mask code-affecting reconcile (FR-001 path-check is the safety net).
- R2 (medium): auto-commit could include unintended changes — addressed via codex_introduced + codex_modified_existing_dirty + --no-auto-commit opt-out.
- R3 (low): instrumentation overhead (~1-5ms per command).
- R4 (low): TTL warning is approximate (270s vs Anthropic's 300s).
- R5 (low): review-extract regex set may miss novel formats; same regex set as factory_review_specs.py.

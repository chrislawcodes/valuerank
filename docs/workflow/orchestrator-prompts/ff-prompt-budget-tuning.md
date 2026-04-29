# Codex Prompt — FF Prompt-Budget Tuning

You are implementing three small, independent fixes that bundle naturally into one PR. **Single-shot implementation** — no FF spec/plan/tasks adversarial cycle needed; this is mechanical instrumentation + default tuning. The motivation is data-driven: see the report at `docs/workflow/analysis/review-performance-2026-04-29.md` shipped in PR #789, plus PR #791 which fixed the token parsers.

## Repo

- Branch off `origin/main` to: `claude/ff-prompt-budget-tuning`
- Working dir: the current cwd should already be the repo root or a worktree of `chrislawcodes/valuerank`.
- Per `cloud/CLAUDE.md`: do NOT push or open the PR until the human asks — leave the branch local with the commit ready.

## Read these first

- `docs/workflow/analysis/review-performance-2026-04-29.md` — the analysis that motivated this PR.
- `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_telemetry.py` — `record_ai_call` lives here; PR #791 just added the `lens` parameter, you'll add `prompt_chars` next.
- `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_analyze_reviews.py` — analyzer to extend.
- `docs/workflow/operations/codex-skills/review-lens/scripts/run_codex_review.py` — has the runner-side cap defaults; you'll bump them.

## What this PR does (3 changes, 1 commit)

### Change A — Prompt-size instrumentation (~30 min)

Goal: every `record_ai_call` invocation records the actual prompt char count and the configured cap, so future analyzer runs can answer "what % of calls are within 90% of their cap."

**File**: `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_telemetry.py`

Add two optional parameters to `record_ai_call`:
- `prompt_chars: int | None = None` — total char count of the prompt actually sent to the model.
- `prompt_cap: int | None = None` — the `--max-total-chars` value in effect for this call (or whatever cap the caller wants to record; if there's no per-call cap, pass None).

Persist both into the `state.token_usage` record alongside `lens`. Defaults to None means existing call sites that don't pass these (`factory_cmd_implement.py` for example) record `null` for both — back-compatible.

Update these call sites to pass values:
- `docs/workflow/operations/codex-skills/review-lens/scripts/run_codex_review.py`: pass `prompt_chars=len(prompt)` and `prompt_cap=args.max_total_chars`. The exact variable name is whatever the prompt string is bound to right before `_call` is defined.
- `docs/workflow/operations/codex-skills/review-lens/scripts/run_gemini_review.py`: same pattern. Pass for both `_call` branches (run_cwd None and run_cwd set).
- `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_judge.py`: pass `prompt_chars=len(system_prompt) + len(user_prompt)` and `prompt_cap=None` (judges don't go through the same cap pipeline).
- `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_implement.py`: pass `prompt_chars=len(prompt_text)` and `prompt_cap=None`.

Add 1 unit test in `tests/test_factory_telemetry.py` verifying the new fields are recorded when passed and default to None when omitted.

### Change B — Artifact-size section in analyzer (~45 min)

Goal: extend `analyze-reviews` so the report includes a section showing actual artifact sizes per slug per stage, plus a "% of calls within 90% of their cap" rollup once Change A's data starts populating.

**File**: `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_analyze_reviews.py`

Add two new sections to the report (insert AFTER current section 7 "Wall Clock by Slug", BEFORE current section 8 "Data Quality"):

#### New section 8 — Artifact sizes (filesystem walk)

Walk every `docs/workflow/feature-runs/<slug>/` and read the char count of `spec.md`, `plan.md`, `tasks.md`. Also count any matching `reviews/implementation.diff.patch` if it exists.

Render two tables:

**Table 8a — Per-stage artifact-size distribution** (across all slugs):
```
| stage | count | p50_chars | p95_chars | max_chars | over_50k_count | over_100k_count |
| --- | --- | --- | --- | --- | --- | --- |
| spec | 26 | 14000 | 38000 | 47000 | 5 | 0 |
| plan | 26 | 21000 | 52000 | 89000 | 8 | 1 |
| ...
```

**Table 8b — Top 10 largest artifacts**:
```
| slug | stage | char_count |
| --- | --- | --- |
| sensitivity-table-redesign-v2 | plan | 89234 |
| ...
```

This section uses ZERO data from `state.token_usage` — purely filesystem-based. Always populated.

#### New section 9 — Prompt-cap pressure (token_usage based)

For records that have `prompt_chars` AND `prompt_cap` populated (the new fields from Change A — empty for old records, populates going forward), compute:

**Table 9a — Cap-pressure summary**:
```
| model | activity_type | count_with_size_data | p50_pct_of_cap | p95_pct_of_cap | within_90pct_cap | over_cap |
| --- | --- | --- | --- | --- | --- | --- |
| gpt-5.4-mini | adversarial_review | 12 | 65% | 95% | 4 | 0 |
| ...
```

`within_90pct_cap` = count where `prompt_chars >= 0.9 * prompt_cap`. `over_cap` should always be 0 (the runner enforces); report it anyway as a sanity check.

If no records have `prompt_chars`/`prompt_cap` populated yet, emit "No prompt-size data available yet — re-run after the next 2-3 feature runs." instead of an empty table.

Renumber the existing section 8 ("Data Quality") to section 10. Update the section ordering in any docstring or top-level commentary.

Add 2 unit tests covering: (a) the artifact-size walk happy path with a fixture tree containing spec/plan/tasks of known sizes, (b) the cap-pressure section with mock `token_usage` records carrying the new fields.

### Change C — Bump default char caps (~15 min)

Goal: align the runner defaults with what operators actually pass. We've been passing `--max-total-chars 200000` on every checkpoint this session. Make the new default close to that.

**File**: `docs/workflow/operations/codex-skills/review-lens/scripts/run_codex_review.py`

Change:
- `--max-artifact-chars`: 50000 → **100000**
- `--max-context-chars`: 10000 → **20000**
- `--max-total-chars`: 70000 → **200000**

Same change in `docs/workflow/operations/codex-skills/review-lens/scripts/run_gemini_review.py` if those flags exist there too — verify with grep first; the Gemini script may use different names.

In `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_stages.py`:
- `HARD_DIFF_ARTIFACT_MAX_CHARS`: 150000 → **300000**
- `LARGE_DIFF_RERUN_WARN_CHARS`: keep as-is unless it's now larger than the new HARD value, in which case adjust.

Add a comment at each cap site referencing PR #789's analyzer report and PR #791's perf fixes as the motivation, and noting that operators can still override per-call.

DO NOT change:
- The Codex CLI subprocess `--timeout-seconds` (already tuned to 120s in PR #791).
- Anything else.

## Testing

After the three changes:
1. Run preflight (NO PIPE — exit code check directly):
   ```bash
   cd /Users/chrislaw/valuerank/.claude/worktrees/friendly-aryabhata-9efbf7
   python3 -m unittest discover docs/workflow/operations/codex-skills/feature-factory/scripts/tests
   ```
   All existing tests must still pass. New tests should add 3 cases (Change A: 1, Change B: 2).
2. **Manually run the extended analyzer once** against the real repo to verify the new sections render correctly:
   ```bash
   python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py analyze-reviews --out /tmp/analyzer-test.md
   ```
   Verify section 8 (artifact sizes) populates, section 9 (cap pressure) shows the "no data yet" message, and section 10 (data quality) is unchanged.
3. **Smoke test the cap defaults** by checking `--help` of `run_codex_review.py` — should show the new defaults.

## Commit

Stage explicitly (NOT `git add -A` — the worktree may have unrelated dirty paths from concurrent FF runs):
```bash
git add docs/workflow/operations/codex-skills/feature-factory/scripts/factory_telemetry.py
git add docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_analyze_reviews.py
git add docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_judge.py
git add docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_implement.py
git add docs/workflow/operations/codex-skills/feature-factory/scripts/factory_stages.py
git add docs/workflow/operations/codex-skills/feature-factory/scripts/tests/test_factory_telemetry.py
git add docs/workflow/operations/codex-skills/feature-factory/scripts/tests/test_analyze_reviews.py
git add docs/workflow/operations/codex-skills/review-lens/scripts/run_codex_review.py
git add docs/workflow/operations/codex-skills/review-lens/scripts/run_gemini_review.py
git add docs/workflow/orchestrator-prompts/ff-prompt-budget-tuning.md
```

Commit message format:
```
ff-prompt-budget-tuning: prompt-size instrumentation + analyzer artifact-size section + bumped default caps

Three small fixes bundled by the analysis report at PR #789. Together
they (a) start collecting prompt-size data so future analyses can
recommend per-cap tuning, (b) surface artifact-size distributions in
the analyzer immediately from filesystem data, and (c) align runner
defaults with the values operators routinely pass.

Change A — prompt-size instrumentation:
- record_ai_call() takes optional prompt_chars + prompt_cap, persists
  both into state.token_usage. Older records keep null. 4 call sites
  updated (run_codex_review, run_gemini_review (both branches),
  factory_cmd_judge, factory_cmd_implement).

Change B — analyzer extension:
- New section 8: per-stage artifact-size distribution + top-10 largest.
  Filesystem-based; available immediately, no token_usage needed.
- New section 9: prompt-cap pressure rollup (uses Change A's data; emits
  "no data yet" message until 2-3 new feature runs populate it).
- Renumbered Data Quality 8 -> 10.

Change C — bumped default caps:
- run_codex_review.py + run_gemini_review.py:
  --max-artifact-chars 50000 -> 100000
  --max-context-chars 10000 -> 20000
  --max-total-chars 70000 -> 200000
- factory_stages.py: HARD_DIFF_ARTIFACT_MAX_CHARS 150000 -> 300000
- Operators were passing these values manually on every checkpoint
  this session; making them defaults removes ~80% of the cap-related
  retries. Operators can still override per-call.

Tests: 3 new (1 telemetry, 2 analyzer); existing FF tests pass.
```

Do NOT push. Report back with the commit SHA, the manually-tested analyzer report path (so the operator can review), and a short summary of what you observed.

## Output

When done, print:
- The commit SHA
- The path of the manually-tested analyzer output (e.g., `/tmp/analyzer-test.md`)
- Final test count (should be ~358 = 355 + 3)
- Any unexpected issues (e.g., a call site you couldn't update cleanly, a test that needed adjustment)
- The exact `git push` + `gh pr create` commands the human can run to ship

## Things to NOT do

- **No FF spec/plan/tasks adversarial cycle.** This is small mechanical work; the analysis already happened.
- **No new dependencies.** Stdlib only.
- **No `git push`** per `cloud/CLAUDE.md`.
- Do not change the Codex `--timeout-seconds` — that's already tuned in PR #791.
- Do not touch unrelated tests, STATUS.md, or any feature run state.

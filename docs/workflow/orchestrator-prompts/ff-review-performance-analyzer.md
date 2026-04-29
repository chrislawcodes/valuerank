# Codex Prompt — FF Review-Performance Analyzer

You are implementing a small read-only analysis tool. **Single-shot implementation** — no FF spec/plan/tasks adversarial cycle needed; this is mechanical data aggregation with no behavior change to the runner.

## Goal

Aggregate every reviewer/judge LLM call recorded across all FF feature runs and emit a markdown report that surfaces:
- which lenses + models are slow,
- which time out,
- which fail to parse,
- and how much wall clock we burn on rounds that ultimately get deferred.

This unblocks an empirical decision about whether to drop a lens, switch a model, tighten timeouts, truncate prompts more aggressively, or fix a different bug entirely. We've been guessing — this PR makes us measure.

## Repo

- Branch off `origin/main` to: `claude/ff-review-performance-analyzer`
- Working dir: the repo root or any worktree of `chrislawcodes/valuerank`
- Per `cloud/CLAUDE.md`: do NOT push or open the PR until the human asks — leave the branch local with the commit ready.

## Files to create

1. **`docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_analyze_reviews.py`** — the analyzer
2. **`docs/workflow/operations/codex-skills/feature-factory/scripts/tests/test_analyze_reviews.py`** — unit tests on a fixture
3. **`docs/workflow/orchestrator-prompts/ff-review-performance-analyzer.md`** — this file (already written; commit as part of the PR)

## Files to modify

1. **`docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py`** — register the new `analyze-reviews` subcommand

## Data source

Each FF feature run has a `state.json` at `docs/workflow/feature-runs/<slug>/state.json`. Inside, `state.token_usage` is a list of records with this shape (verified by reading `factory_telemetry.py:191-250`):

```json
{
  "stage": "spec",
  "round": 1,
  "activity_type": "review" | "judge_panel" | ...,
  "model": "gpt-5.4-mini" | "gemini-2.5-pro" | ...,
  "input_tokens": 12345,
  "output_tokens": 678,
  "cost_usd_estimate": 0.0123,
  "timestamp": "2026-04-25T16:42:18.506364Z",
  "started_at": "2026-04-25T16:41:50Z",
  "ended_at": "2026-04-25T16:42:18.506364Z",
  "duration_seconds": 28.5,
  "agent_id": "...",
  "artifact_sha_at_time": "abc123",
  "parse_error": "<reason>" | null,
  "activity_subtype": "micro" | null
}
```

Some records will be missing fields (older state.json files). Read defensively with `.get(...)`.

There may also be lens information embedded in the parent context — but if not directly in the record, you can infer the lens from the `stage` + `model` + `activity_type` triple, or extract it from accompanying review file names if needed. **Best-effort: report what we can; flag what we can't.** Don't error out on missing fields; emit a "data quality" section at the end of the report listing how many records were dropped or had partial data.

## What the analyzer does

### Argparse surface

```
python3 run_factory.py analyze-reviews [--out <path>] [--top-n <int>]
```

- `--out`: output markdown path. Default: `docs/workflow/analysis/review-performance-<UTC-date>.md` (create the `analysis/` dir if missing).
- `--top-n`: how many rows in "top slowest" sections. Default: 20.

### Walk

1. Glob `docs/workflow/feature-runs/*/state.json`. Skip non-existent or unreadable files (warn to stderr, don't fail).
2. For each, load the JSON, extract `state.token_usage` (list). If absent or non-list, skip with a warning.
3. Annotate each record with the source slug (parent dir name).
4. Concatenate into one big list.

### Aggregations

Compute and emit, in order:

#### Section 1 — Headline numbers
- Total reviewer + judge calls measured
- Total wall-clock seconds across all calls
- Total estimated USD cost (sum `cost_usd_estimate`, treat null as 0)
- Date range covered (min/max `timestamp`)
- Number of distinct slugs

#### Section 2 — Per (model × activity_type) summary table
Columns: model, activity_type, count, total_duration_s, p50_s, p95_s, p99_s, max_s, parse_error_count, parse_error_rate.
Sort by total_duration_s descending.

This is the load-bearing table — it tells us which model+activity combo eats the most wall clock.

#### Section 3 — Per (model × stage) summary
Same columns as section 2, grouped by model + stage instead. Tells us if certain stages have outlier costs.

#### Section 4 — Top N slowest individual calls
Columns: slug, stage, round, activity_type, model, duration_s, input_tokens, output_tokens, parse_error, timestamp.
Sort by duration_s descending. Take top N (default 20).

#### Section 5 — Parse error patterns
Group by `parse_error` text (after light normalization — e.g., truncate at 80 chars). Columns: error pattern, count, models affected, example slug.
Sort by count descending.

This is where we'll find the recursion bug, the schema_violation patterns, and quota-hit patterns.

#### Section 6 — Duration vs input_tokens correlation
For each model, bin `input_tokens` into 5 quantiles. For each bin, report count, p50_duration_s, p95_duration_s.
This tells us whether prompt size predicts duration (and where the inflection is).

#### Section 7 — Wall clock by slug (top 20)
Columns: slug, total review duration, total judge duration, total deferred-round duration, # rounds, # stages reaching judge cap.
Sort by total review + judge duration descending.
"deferred-round duration" = sum of duration_seconds for calls in rounds whose review file has `resolution_status: "deferred"`. (To get this you need to also walk `reviews/*.review.md` files and parse the YAML frontmatter — best effort; if too complex, drop this column and note it in data quality.)
This tells us which slugs were the worst offenders.

#### Section 8 — Data quality
- Records dropped because of missing fields (with breakdown per field)
- Slugs whose state.json couldn't be parsed
- Records with timestamps outside reasonable range

### Markdown formatting

Use real markdown tables. Round durations to 1 decimal place; tokens as integers. Cost as `$X.XX`.

The output should be **scan-readable**: someone reading top-to-bottom in 60 seconds should be able to identify the worst offenders without having to interpret raw JSON.

## Tests

`tests/test_analyze_reviews.py`. Use `tempfile.TemporaryDirectory` to create a fake `feature-runs/` tree with a few state.json fixtures. Cases:

1. **Happy path**: 2 slugs, each with 5 token_usage records. Verify the section 2 table has the right counts and percentiles.
2. **Missing fields**: a state.json with token_usage records missing `duration_seconds` or `model`. Verify they're dropped + appear in section 8.
3. **Empty state**: a slug with no token_usage at all. Verify the analyzer doesn't crash.
4. **Malformed state.json**: a slug with invalid JSON. Verify it's skipped + a warning prints to stderr.
5. **Parse error grouping**: 3 records with parse_error containing similar text. Verify they group together in section 5.

The tests should patch `factory_state.FACTORY_RUNS_ROOT` to the temp dir so the analyzer reads from the fixture, not from the real repo. PR #758 + #765 lessons: also patch `factory_state.REPO_ROOT` if the analyzer uses it for output path resolution.

## Things to NOT do

- **No model calls.** This is pure data aggregation.
- **No mutation of state.json files.** Read-only.
- **No `git add` / `git push`.** Per `cloud/CLAUDE.md`, leave the work local; the human will push.
- **No new dependencies.** Use stdlib only (`statistics` for percentiles, `json`, `pathlib`, `argparse`, `datetime`, `sys`, `os`, `collections`).

## Workflow

1. Create the branch: `git checkout -b claude/ff-review-performance-analyzer origin/main`
2. Implement the 3 files above.
3. Run preflight (NO PIPE): `python3 -m unittest discover docs/workflow/operations/codex-skills/feature-factory/scripts/tests` — check exit code directly. All existing tests must still pass.
4. **Manually run the analyzer once against the real repo** (`python3 docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py analyze-reviews`). Verify the output markdown looks reasonable. Include the resulting report in the commit at `docs/workflow/analysis/review-performance-<UTC-date>.md` so the operator can read it immediately.
5. Stage explicit files (NOT `git add -A` — there are unrelated dirty paths from concurrent FF runs):
   ```
   git add docs/workflow/operations/codex-skills/feature-factory/scripts/factory_cmd_analyze_reviews.py
   git add docs/workflow/operations/codex-skills/feature-factory/scripts/tests/test_analyze_reviews.py
   git add docs/workflow/operations/codex-skills/feature-factory/scripts/run_factory.py
   git add docs/workflow/orchestrator-prompts/ff-review-performance-analyzer.md
   git add docs/workflow/analysis/
   ```
6. Commit with a clear message body covering: motivation (we've been guessing), what's measured, where the report lives, top-3 takeaways from the report itself.
7. Do NOT push. Report back with the commit SHA, the report path, and a short summary of what you observed in the data.

## Output to the human

When done, print:
- The commit SHA
- The report path
- A 5-bullet summary of the most striking findings from the report
- Any FF runs that had data-quality issues
- The exact `git push` + `gh pr create` commands the human can run to ship

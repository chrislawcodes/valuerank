# Plan — Feature-Factory Judge Panel Enforcement

**Slug**: ff-judge-panel
**Spec**: [spec.md](./spec.md) (spec checkpoint complete, 3 rounds, all HIGHs addressed)
**Status**: Plan — pre-checkpoint

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Round-3 HIGH on judge-JSON-to-review.md bridge addressed by FR-012a (dual output verdict.json + review.md). MEDIUMs on panel-config and cost-telemetry-hook acknowledged; plan.md covers the implementation. Rounds 1+2 findings addressed in spec v2/v3.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: Round-3 HIGH on judge-state-vs-file-based-flow addressed by FR-012a. Round-3 MEDIUMs on PR-body-sentinel and merge-wait-resume addressed by FR-020c and FR-020a revisions. Rounds 1+2 findings addressed.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Round-3 HIGH on stdout-parsing-brittle addressed by FR-007b (--json flag + last_action_result in state). Round-3 MEDIUM impl-risk-diff-base-undefined addressed by FR-010 revision (pinned to adversarial_sha_history[-2]). Rounds 1+2 findings addressed.

## Approach

Four shapes of code land, each in its own slice range:

1. **State-schema changes** — new nested `stages[stage]` fields, file-lock helpers, schema_version bookkeeping, dual-write to old top-level keys. Foundation for everything else.
2. **Runner subcommand changes** — `checkpoint` reserve-then-dispatch, new `judge` subcommand, next-action tree update, `--json` control-flow flag. Builds on the state helpers.
3. **Judge machinery** — prompt templates, parallel-dispatch wrapper, JSON schema validator, dual-output writer (verdict.json + review.md), override flag. Consumes subcommand plumbing.
4. **Observability + back-test** — token-usage recorder at every AI-call site, pricing lookup, heartbeat emitter, back-test script, PR-body sentinel refresh. Hooks into everything above.

Then integration: wire judge flow into `deliver` and `closeout`, write the migration script for the two blocked workflows, smoke-test end-to-end.

## Architectural decisions

### State-schema: additive dual-write, not breaking migration

Per spec FR-005a: existing top-level state.json keys stay populated alongside the new nested `stages[stage]` structure. All READS still work from the top-level keys (existing `factory_cmd_status.py`, `factory_stages.py` unchanged). All WRITES go through a new `update_stage_state()` helper that writes BOTH locations. `schema_version: 2` added to new files; old files continue to work with `schema_version: 1` semantics. Removal of dual-write deferred to a follow-up feature after 3 months or when all active workflows have ticked over.

### File locking: one helper, used everywhere

Per spec FR-008: `factory_state.py` gets a new `with_locked_state(slug, fn)` context manager using `fcntl.flock(LOCK_EX)`. Every state mutation routes through it. Timeout 100ms, retry up to 10× with backoff; raise on persistent contention. The existing `update_workflow_state()` function becomes a thin wrapper. Token-usage appends, verdict appends, heartbeat writes, override records — all go through the same lock.

### Judge dispatch: concurrent.futures.ThreadPoolExecutor with 3 workers

Three judges run in parallel; each is a subprocess call to a CLI. Python's `ThreadPoolExecutor` with `max_workers=3` gives the right shape — each thread calls `subprocess.run()`, we join all three, tally. No asyncio needed.

Each judge dispatch writes its own `.raw.txt`, parses the JSON, and on success writes both `judge.{lens}.verdict.json` AND `judge.{lens}.review.md` (markdown wrapper with the JSON in a fenced block). On JSON failure, retry once with a corrective prompt appendix. Second failure → write a skeleton review.md with `resolution_status: "failed"` and record `vote=block, confidence=0, reason="schema_violation"` in the verdict.json.

### Prompt management: fixed templates + CLI override

Per spec FR-025: judge prompts live at `docs/workflow/operations/codex-skills/feature-factory/judge-prompts/{completeness,restatement,implementation-risk}.md`. Content drawn from research-agent output (Agent A's "Three Prompt Drafts" section), adapted to FF terminology. Each prompt file has a `# System Prompt` section and a `# User Prompt Template` section; the dispatcher reads the file and substitutes template variables (`{high_findings_with_ids}`, `{artifact_chain}`, `{diff_since_last_round}`, etc.).

`--prompt-override` flag accepts a path to an alternate prompt file; usage logged in state.json for back-test exclusion.

### Control-flow: structured output with string fallback

Per spec FR-007b: each subcommand accepts a new `--json` flag. When set, stdout is `{"next": "<action>", "reason": "...", "blockers": [...]}`. When unset, current string output (`→ next: <action>`) is preserved. State.json's new `last_action_result` field duplicates the structured payload so an orchestrator that forgot to pass `--json` can read it back.

### Cost telemetry: decorator at CLI-dispatch boundary

Per spec FR-018 / FR-019: every `subprocess.run()` that calls an AI CLI goes through a new `record_ai_call(activity_type, model, callable)` helper in `factory_telemetry.py`. Helper times the call, parses token counts from the CLI's output (each provider reports them differently — Codex: JSON in stderr; Claude: `/usage` block; Gemini: JSON response's `token_stats`), looks up cost in `pricing.json`, and appends to `state.json.token_usage[]` under lock. All existing AI-call sites are refactored to use this helper — ~10-15 call sites across `run_codex_review.py`, `run_gemini_review.py`, `factory_cmd_deliver.py`, `factory_cmd_checkpoint.py`, and the new judge dispatch.

Orchestrator micro-calls (<2000 tokens) get `activity_subtype: "micro"` per spec US-5 resolution.

### Heartbeat: sidecar thread, 10-min cadence

Per spec FR-023a–c: every long-running subcommand starts a sidecar thread on entry that emits a heartbeat line every 600 seconds until the main operation completes or the thread is joined. Heartbeat reads "current activity" from a module-level variable that the main code updates as it progresses (`set_activity("codex.feasibility running")`). Thread writes stdout AND appends to `state.json.heartbeats[]`. Time formatted in `America/Los_Angeles`.

If the sidecar detects the same activity value across 3+ ticks (30 min unchanged), it emits a `warn` level escalation.

### Merge-wait: resumable via state.json

Per spec FR-020a revision: `state.json.delivery.merge_wait_state` is `none` | `waiting` | `merged` | `failed`. `deliver` sets `waiting` before starting the poll loop, clears on merge detection. `deliver --resume-merge-wait` reads the state, resumes the poll if `waiting`, or reads current PR state and updates if `merged` already happened.

### Back-test: stand-alone script, pulls from gh + git log

Per spec FR-021: `backtest.py` is a separate Python script under `docs/workflow/operations/codex-skills/feature-factory/scripts/`. Reads all feature-run directories, filters by merge date, pulls CI via `gh api`, git log via `git log --grep`. Outputs CSV + markdown summary to a configurable path. Runs once per invocation; no background service.

### PR-body sentinel: judge block bounded by HTML comments

Per spec FR-020c: generated PR body includes:

```html
<!-- ff-judge-panel:begin -->
## ⚠ Unresolved Judge Concerns
...
<!-- ff-judge-panel:end -->
```

`deliver --refresh` regenerates ONLY the content between markers. Preserves operator edits outside. If markers missing, warn + prepend block.

## Slice breakdown (each ≤ ~300 lines)

### Slice 1: State-schema foundation [CHECKPOINT]

- New `factory_state.with_locked_state()` context manager using fcntl.flock
- `factory_state.update_stage_state(slug, stage, updates)` helper
- Dual-write to old top-level keys AND new `stages[stage]` nested shape
- `schema_version` field bookkeeping
- Unit tests for lock behavior (single writer, multi-writer contention, timeout)

**Files:**
- `docs/workflow/operations/codex-skills/feature-factory/scripts/factory_state.py` (edit)
- `docs/workflow/operations/codex-skills/feature-factory/scripts/tests/test_factory_state.py` (new)

**Estimated diff:** ~250 lines.

---

### Slice 2: Round-cap enforcement + next-action tree [CHECKPOINT]

- `checkpoint` subcommand: reserve-then-dispatch (increment adversarial_rounds under lock BEFORE dispatching reviewers)
- `factory_next_action` recognizes `judge_panel` as a valid next action when cap hit
- `--json` flag on checkpoint subcommand emits structured `{next, reason, blockers}`
- `state.json.last_action_result` field populated after each subcommand call
- Unit tests: round counter increments correctly, 4th checkpoint call refused, next_action returns `judge_panel` when expected

**Files:**
- `factory_cmd_checkpoint.py` (edit)
- `factory_next_action.py` (edit)
- `factory_cmd_status.py` (minor edit to surface last_action_result + next action)
- `tests/test_factory_cmd_checkpoint.py` (edit)
- `tests/test_factory_next_action.py` (edit)

**Estimated diff:** ~300 lines.

---

### Slice 3: Judge prompts [CHECKPOINT]

- Three prompt files under `judge-prompts/` with content from research agent A
- Template-variable substitution test
- Schema definition (JSON Schema) for the verdict output
- Unit tests for prompt loading + variable substitution

**Files:**
- `docs/workflow/operations/codex-skills/feature-factory/judge-prompts/completeness.md` (new)
- `docs/workflow/operations/codex-skills/feature-factory/judge-prompts/restatement.md` (new)
- `docs/workflow/operations/codex-skills/feature-factory/judge-prompts/implementation-risk.md` (new)
- `scripts/judge_prompts.py` (new — loader + substitution)
- `scripts/judge_schema.json` (new)
- `tests/test_judge_prompts.py` (new)

**Estimated diff:** ~250 lines (~150 is prose in prompts).

---

### Slice 4: `judge` subcommand — dispatch + vote [CHECKPOINT]

- New `factory_cmd_judge.py` subcommand
- ThreadPoolExecutor-based parallel dispatch of three judges
- Input assembly per judge (distinct views per FR-010)
- JSON schema validation; one retry on schema violation
- Dual-output writer: `judge.{lens}.verdict.json` + `judge.{lens}.review.md`
- Vote tallying with annotation accumulation
- Integration test: three stub judges return prescribed outputs, runner tallies and advances/blocks as expected

**Files:**
- `factory_cmd_judge.py` (new)
- `run_factory.py` (edit: register new subcommand)
- `tests/test_factory_cmd_judge.py` (new)

**Estimated diff:** ~350 lines. (Over 300 — split if needed into dispatch + vote.)

---

### Slice 5: Judge re-vote loop + unresolved-concerns handling [CHECKPOINT]

- `judge_rounds` counter enforced (max 3)
- Re-run judges after orchestrator edit
- Round-3 block → advance with `unresolved_concerns` populated
- Semantic-similarity check for `also_raised_in_round` (use OpenAI embeddings API or a local model; pick in this slice)
- Integration test: simulate 3-round-block → advance with concerns logged

**Files:**
- `factory_cmd_judge.py` (edit)
- `factory_embeddings.py` (new — wrapper for similarity check)
- `tests/test_factory_cmd_judge.py` (edit)

**Estimated diff:** ~200 lines.

---

### Slice 6: Override flag + PR-body sentinel refresh [CHECKPOINT]

- `deliver --override-judges --reason <string>` (both flags required)
- Override recorded to state.json with timestamp + operator_id
- PR-body generation with sentinel markers
- `deliver --refresh` regenerates between sentinels, preserves operator edits
- Merge-wait resumable state (`merge_wait_state` field, `--resume-merge-wait` flag)
- Integration tests

**Files:**
- `factory_cmd_deliver.py` (edit)
- `tests/test_factory_cmd_deliver.py` (edit)

**Estimated diff:** ~300 lines.

---

### Slice 7: Cost telemetry at every AI-call site [CHECKPOINT]

- New `factory_telemetry.py` module with `record_ai_call()` helper
- Pricing lookup in `docs/workflow/operations/codex-skills/feature-factory/pricing.json`
- Refactor ALL existing AI-call sites to route through `record_ai_call()`:
  - `run_codex_review.py`
  - `run_gemini_review.py`
  - `factory_cmd_checkpoint.py` (Codex/Gemini dispatches)
  - `factory_cmd_deliver.py` (any AI calls)
  - `factory_cmd_judge.py` (judge calls)
- Token parser per provider (Codex stderr JSON / Claude usage block / Gemini token_stats)
- Orchestrator micros tagged
- Unit tests per token-parser variant

**Files:**
- `factory_telemetry.py` (new)
- `pricing.json` (new)
- ~5 existing scripts (edit)
- `tests/test_factory_telemetry.py` (new)

**Estimated diff:** ~400 lines. (Slice over 300 — may split into telemetry core + per-site integration.)

---

### Slice 8: Heartbeat sidecar [CHECKPOINT]

- `factory_heartbeat.py` module with thread-based heartbeat emitter
- Integrated into `checkpoint`, `judge`, `implement`, `deliver` subcommands
- `set_activity()` API for main code to update
- Stale-activity warning after 30 min unchanged

**Files:**
- `factory_heartbeat.py` (new)
- 4 existing scripts (edit)
- `tests/test_factory_heartbeat.py` (new)

**Estimated diff:** ~200 lines.

---

### Slice 9: Back-test script [CHECKPOINT]

- `backtest.py` — standalone, reads feature-runs, queries gh + git log, produces CSV + markdown summary
- Embedding-similarity match for concerns → incidents
- Exclusion logic for --override-judges + --prompt-override cases
- `--since <date>` filter, `--include-overrides` flag
- Unit test against fixture feature-run data

**Files:**
- `docs/workflow/operations/codex-skills/feature-factory/scripts/backtest.py` (new)
- `tests/test_backtest.py` (new)
- `docs/workflow/operations/codex-skills/feature-factory/back-test.md` (new runbook)

**Estimated diff:** ~350 lines.

---

### Slice 10: Migration script + SKILL.md update [CHECKPOINT]

- `migrate-blocked-workflows.py` runs judge panel against orchestrator-split and finding-2-graphql-tightening
- SKILL.md updated with Judge Panel section + heartbeat cadence rule + link to prompt files
- End-to-end smoke test on a fresh dummy workflow

**Files:**
- `scripts/migrate-blocked-workflows.py` (new)
- `docs/workflow/operations/codex-skills/feature-factory/SKILL.md` (edit)
- `docs/workflow/operations/codex-skills/feature-factory/back-test.md` (edit — cross-link)

**Estimated diff:** ~200 lines.

---

## Risk callouts (implementation-specific)

| Risk | Mitigation in plan |
|---|---|
| Provider-specific token parsing is fragile (CLIs change output format) | Per-provider parser has a `parse_tokens(raw_stderr) -> {input, output}` interface with fixture-based tests. When a provider changes format, one test breaks — clear signal to update parser. |
| Gemini's known false-positive rate could contaminate heartbeat/merge-wait if mis-triggered | Heartbeat and merge-wait are pure timing/state logic, no AI involvement. Gemini only runs as an adversarial reviewer (unchanged from today). |
| Sentinel-based PR refresh races with concurrent `gh pr edit --body` | Acquire state lock before calling `gh pr edit`; sequential edits within a run. Cross-run concurrency is a non-goal. |
| Schema-version dual-write doubles writes | Only matters for state.json (~kB file); negligible perf impact. Cleanup removes old-format writes in a follow-up. |
| Embedding API availability for `also_raised_in_round` and back-test similarity | Use OpenAI embeddings (widely available). Fallback: keyword-Jaccard similarity if API unavailable. Both implementations shipped. |
| Judge dispatch can hit rate limits at 3 parallel calls | Existing adversarial reviewer panel already dispatches 3 in parallel and handles rate-limits fine. Reuse that spawn pattern. |
| Refactoring existing AI-call sites for telemetry risks regression | Each refactor paired with a regression test at the call-site level. Ship telemetry as its own slice 7, with integration test, before moving on. |
| `fcntl.flock` not available on Windows | FF is Unix-only today (runner tested on macOS/Linux). Windows support not in scope; add check that errors clearly if run on Windows. |

---

## Testing strategy

- **Unit tests** per slice (~15 new test files estimated)
- **Integration tests**: stub-CLI versions of codex/gemini/claude that return prescribed outputs, used by Slice 4 + Slice 5 tests to exercise the full judge flow without real AI calls
- **Smoke test** at end of Slice 10: fresh dummy workflow runs through spec → plan → tasks → judge panel → deliver with the new machinery

---

## Rollout plan

Single PR against `chrislawcodes/valuerank`. 10 slices. Implementation order matches slice order above (strict, each depends on the previous). No feature flag — the new behavior applies to all workflows as soon as PR lands.

Immediately post-merge: run `migrate-blocked-workflows.py` to test Level 2 enforcement against our two waiting features (orchestrator-split, finding-2-graphql-tightening). First real use of the judge panel.

Rollback is a revert of the PR. State.json migration is additive, so rolling back doesn't break old-format state — existing readers continue to work.

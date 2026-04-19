# Tasks — Feature-Factory Judge Panel Enforcement

**Slug**: ff-judge-panel
**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)
**Status**: Tasks — pre-checkpoint

10 slices. Total estimated diff ~2800 lines + tests.

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: 4 rounds of adversarial review. Round-3 HIGHs addressed (FR-012a judge JSON bridge). Round-4 concerns are restatements or implementation details covered by plan.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: 4 rounds of adversarial review. Round-4 MEDIUMs addressed by FR-026a (closeout concerns), FR-026b (--json coverage), FR-026c (rollover).
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: 4 rounds. Round-4 HIGH (repair command underspecified) addressed by new FR-006a full repair definition.

## Slice 1: State-schema foundation [CHECKPOINT]

- [ ] **T1.1** Add `with_locked_state(slug, fn)` context manager to `factory_state.py` using `fcntl.flock(LOCK_EX)`. Timeout 100ms, retry up to 10× with exponential backoff.
- [ ] **T1.2** Add `update_stage_state(slug, stage, updates)` helper that (a) acquires lock, (b) reads current state, (c) applies updates to `stages[stage]`, (d) also writes the corresponding top-level key for backward compatibility, (e) increments `schema_version` to 2, (f) atomic-replace-write, (g) releases lock.
- [ ] **T1.3** Add `schema_version: int` (default 1) to state.json reads; writers bump to 2 if they write to the new `stages[]` shape.
- [ ] **T1.4** Add fields to `stages[stage]` schema: `adversarial_rounds: int`, `judge_rounds: int`, `judge_verdicts: []`, `annotations: []`, `unresolved_concerns: []`, `adversarial_sha_history: []`, `initial_sha: string`.
- [ ] **T1.5 [P: tests/test_factory_state.py]** Unit tests: lock single-writer, lock multi-writer contention (threaded), timeout behavior, dual-write consistency.

**Verification**: `pytest tests/test_factory_state.py` passes. `fcntl.flock` behavior verified on macOS + Linux.

**Estimated diff**: ~250 lines.

## Slice 2: Round-cap enforcement + next-action tree [CHECKPOINT]

- [ ] **T2.1** Edit `factory_cmd_checkpoint.py`: reserve-then-dispatch order — acquire state lock, read `adversarial_rounds`, exit 2 with `→ next: judge_panel` if ≥ 3, otherwise bump counter and release lock BEFORE reviewer dispatch. On dispatch failure, decrement under lock.
- [ ] **T2.2** Edit `factory_next_action.py`: add `judge_panel` branch to the decision tree. When `stages[stage].adversarial_rounds >= 3` AND `judge_rounds == 0`, recommend `judge_panel`. When prior judge round blocked AND `judge_rounds < 3`, recommend `judge_panel` again.
- [ ] **T2.3** Edit `run_factory.py`: add `--json` flag to `checkpoint`. When set, stdout is `{"next": "<action>", "reason": "...", "blockers": [...]}`. Write same payload to `state.json.last_action_result`.
- [ ] **T2.4** Edit `factory_cmd_status.py`: surface `last_action_result.next` and highlight `judge_panel` if that's the recommended action.
- [ ] **T2.5 [P: tests/test_factory_cmd_checkpoint.py, tests/test_factory_next_action.py]** Unit tests: counter increments correctly, 4th call refused, next_action returns `judge_panel` when expected, --json produces valid payload.

**Verification**: `pytest tests/test_factory_cmd_checkpoint.py tests/test_factory_next_action.py` passes. Manual test: `checkpoint --stage spec` on a stage with rounds=3 returns exit 2 + correct message.

**Estimated diff**: ~300 lines.

## Slice 3: Judge prompts [CHECKPOINT]

- [ ] **T3.1 [P: judge-prompts/completeness.md]** Write completeness prompt: system section forces "block by default", user section requires quote-per-finding structure. Content from research Agent A's Section 2.
- [ ] **T3.2 [P: judge-prompts/restatement.md]** Write restatement prompt: 70% threshold anchor, requires quoting both earlier and new findings.
- [ ] **T3.3 [P: judge-prompts/implementation-risk.md]** Write implementation-risk prompt: "walk through mentally" chain-of-thought, require 3-5 stuck points with artifact quotes. Read artifact + diff (not findings).
- [ ] **T3.4** Create `scripts/judge_prompts.py`: `load_prompt(lens)` and `substitute(prompt, vars)` functions. Template variables: `{high_findings_with_ids}`, `{artifact_chain}`, `{diff_since_last_round}`, `{prior_findings_and_fixes}`, `{latest_findings}`.
- [ ] **T3.5** Create `scripts/judge_schema.json` — JSON Schema for verdict output matching FR-002.
- [ ] **T3.6 [P: tests/test_judge_prompts.py]** Unit tests: prompt files load, substitution works, JSON Schema validates expected good/bad verdicts.

**Verification**: `pytest tests/test_judge_prompts.py` passes. Each prompt file is valid Markdown and loads via `load_prompt()`.

**Estimated diff**: ~250 lines.

## Slice 4: `judge` subcommand — dispatch + vote [CHECKPOINT]

- [ ] **T4.1** Create `factory_cmd_judge.py`: CLI entry point. Validates `adversarial_rounds >= 3` (else exit 2 with `→ next: checkpoint`).
- [ ] **T4.2** Judge dispatch function using `concurrent.futures.ThreadPoolExecutor(max_workers=3)`. Three workers each call a CLI per FR-010:
   - Completeness: `codex exec -m gpt-5.4-mini` with artifacts + findings
   - Restatement: `codex exec -m gpt-5.4` with findings history only
   - Implementation-risk: `claude --model sonnet-4.6` with artifacts + diff (no findings)
- [ ] **T4.3** Parse JSON output per judge; validate against judge_schema.json; retry once with corrective prompt appendix on schema violation; record `vote=block, confidence=0, reason="schema_violation"` on second failure.
- [ ] **T4.4** Dual-output writer per FR-012a: for each judge, write `judge.{lens}.verdict.json` (structured) + `judge.{lens}.review.md` (markdown with required sections for checkpoint validators + embedded `## Verdict (structured)` code block containing the JSON).
- [ ] **T4.5** Vote tally: ≥ 2 `proceed` or `proceed-with-annotation` → advance stage; ≥ 2 `block` → set state flag for re-vote.
- [ ] **T4.6** Register `judge` in `run_factory.py` subcommand router. Add `--json` flag per FR-007b.
- [ ] **T4.7 [P: tests/test_factory_cmd_judge.py]** Integration tests with stub CLIs: three stub judges return prescribed outputs, runner tallies and advances/blocks correctly, schema-violation retry path exercised.

**Verification**: `pytest tests/test_factory_cmd_judge.py` passes. Manual test: run `judge --slug ff-judge-panel --stage spec` (dogfood: on the feature building itself — must work BEFORE Level 2 migration of blocked features).

**Estimated diff**: ~350 lines (may split into dispatch + vote if it exceeds bound).

## Slice 5: Judge re-vote loop + unresolved-concerns handling [CHECKPOINT]

- [ ] **T5.1** Extend `factory_cmd_judge.py`: on ≥ 2 block, set `stages[stage].judge_rounds += 1` under lock; orchestrator must edit then re-run `judge`.
- [ ] **T5.2** Round-3 hard cap: if `judge_rounds == 3` AND majority still blocks, advance stage and populate `stages[stage].unresolved_concerns[]` from the block votes.
- [ ] **T5.3** Create `factory_embeddings.py` wrapper: `cosine_similarity(text_a, text_b) -> float` using OpenAI embeddings API. Fallback to Jaccard-on-keywords if API unavailable.
- [ ] **T5.4** Implement `also_raised_in_round` computation for each unresolved concern: compare against prior-round block reasons; populate the list when cosine ≥ 0.85.
- [ ] **T5.5 [P: tests/test_factory_cmd_judge.py]** Integration test: simulate 3-round-block scenario (stub judges always vote block); assert stage advances with `unresolved_concerns` populated and `also_raised_in_round` set correctly.

**Verification**: integration test passes. Manual test with stub CLIs that block every time — workflow advances after 3 judge rounds.

**Estimated diff**: ~200 lines.

## Slice 6: Override flag + PR-body sentinel + merge-wait [CHECKPOINT]

- [ ] **T6.1** Edit `factory_cmd_deliver.py`: add `--override-judges` flag. Requires paired `--reason <string>`. Writes override record to `state.json.override`.
- [ ] **T6.2** PR-body generation: wrap judge-generated section with `<!-- ff-judge-panel:begin -->` ... `<!-- ff-judge-panel:end -->` sentinels.
- [ ] **T6.3** `deliver --refresh` subcommand: reads current state.json, regenerates body between sentinels, calls `gh pr edit --body`. Preserves operator edits outside sentinels. Warns if sentinels missing.
- [ ] **T6.4** Merge-wait state machine: `state.json.delivery.merge_wait_state` = `none|waiting|merged|failed`. `deliver` sets `waiting` before poll loop. `deliver --resume-merge-wait` reads state and resumes poll (or reads current PR state if already merged).
- [ ] **T6.5** Populate `delivery.merged_sha` and `delivery.merged_at_iso8601` on merge detection (FR-020a/b).
- [ ] **T6.6 [P: tests/test_factory_cmd_deliver.py]** Integration tests: override flag round-trip (reason required, logged correctly); refresh preserves operator edits; merge-wait resumes correctly.

**Verification**: `pytest tests/test_factory_cmd_deliver.py` passes. Manual test: `deliver --override-judges` without reason fails; with reason succeeds; `deliver --refresh` on a test PR updates body correctly.

**Estimated diff**: ~300 lines.

## Slice 7: Cost telemetry at every AI-call site [CHECKPOINT]

- [ ] **T7.1** Create `factory_telemetry.py`: `record_ai_call(activity_type, model, callable)` helper. Times the call, invokes callable, parses tokens from the CLI's output (per-provider logic), looks up cost in `pricing.json`, appends to `state.json.token_usage[]` under lock.
- [ ] **T7.2 [P: pricing.json]** Create `pricing.json` with current per-1k-token costs for: `gpt-5.4-mini`, `gpt-5.4`, `claude-sonnet-4-6`, `gemini-2.5-pro`. Structure: `{model: {input_usd_per_1k, output_usd_per_1k}}`.
- [ ] **T7.3** Per-provider token parser: `parse_tokens_codex(stderr) -> {input, output}`, `parse_tokens_claude(stdout) -> {input, output}`, `parse_tokens_gemini(json_response) -> {input, output}`. Each parses the provider-specific output format.
- [ ] **T7.4** Refactor existing AI-call sites to route through `record_ai_call()`:
   - `run_codex_review.py` (adversarial reviewer)
   - `run_gemini_review.py` (adversarial reviewer)
   - `factory_cmd_judge.py` (judge calls)
   - `factory_cmd_implement.py` (Codex dispatch for implementation slices)
- [ ] **T7.5** Orchestration micro-calls tagged: if `input_tokens + output_tokens < 2000`, set `activity_subtype: "micro"`.
- [ ] **T7.6 [P: tests/test_factory_telemetry.py]** Unit tests: each parser handles real fixture stderr/stdout/json correctly; `record_ai_call()` writes token_usage record under lock; micro tagging works.

**Verification**: `pytest tests/test_factory_telemetry.py` passes. Run a real adversarial review; inspect `state.json.token_usage[]` to confirm records appear with correct fields.

**Estimated diff**: ~400 lines. May split into telemetry core + per-site integration subslices if exceeds bound.

## Slice 8: Heartbeat sidecar [CHECKPOINT]

- [ ] **T8.1** Create `factory_heartbeat.py`: `HeartbeatEmitter` class. Start via `HeartbeatEmitter(slug, stage).start()`, stop via `.stop()`. Sidecar thread emits `[heartbeat PT HH:MM] <stage>: <activity>, elapsed <Xm:Ys>, <state>` every 600s.
- [ ] **T8.2** `set_activity(str)` module-level function that updates the sidecar's current-activity variable. Called from main subcommand code at progress points.
- [ ] **T8.3** Stale-activity warning: if same activity value sampled across 3 consecutive ticks (30 min unchanged), emit `warn`-level escalation.
- [ ] **T8.4** Heartbeat writes BOTH stdout AND `state.json.heartbeats[]` under lock. Uses America/Los_Angeles timezone for stdout display; ISO-8601 UTC in state.json.
- [ ] **T8.5** Integrate into long-running subcommands: `checkpoint`, `judge`, `implement`, `deliver` (esp. merge-wait loop).
- [ ] **T8.6 [P: tests/test_factory_heartbeat.py]** Unit tests: emitter writes to stdout + state at correct cadence (using mock clock), PT formatting correct, stale warning triggers.

**Verification**: `pytest tests/test_factory_heartbeat.py` passes. Manual test: run a long checkpoint; observe stdout heartbeats every 10 min in PT.

**Estimated diff**: ~200 lines.

## Slice 9: Back-test script [CHECKPOINT]

- [ ] **T9.1 [P: scripts/backtest.py]** Create standalone `backtest.py` script under `docs/workflow/operations/codex-skills/feature-factory/scripts/`.
- [ ] **T9.2** `--since <date>` argument; enumerate feature-run directories with `state.json.delivery.merged_at_iso8601` >= since.
- [ ] **T9.3** For each feature, pull CI results via `gh api repos/:owner/:repo/actions/runs?head_sha=<merged_sha>` within 48h. Fall back to local `git log` for revert patterns if gh API unavailable (document this loss of CI visibility).
- [ ] **T9.4** Scan for revert/hotfix commits within 7 days: `git log --grep="revert.*<merge_sha>" --grep="^fix:" --since=<merge_date>`.
- [ ] **T9.5** Concern-to-incident matching: for each `unresolved_concern`, search configurable incident post-mortem path using substring AND embedding-similarity (cosine ≥ 0.75). Use `factory_embeddings.py`.
- [ ] **T9.6** Output CSV + markdown summary: per-feature row with `{slug, stages_with_concerns, outcome, concerns_validated}`. Summary section flags features where unresolved concerns matched incidents.
- [ ] **T9.7** Exclusion logic: default excludes `--override-judges` + `--prompt-override` cases. `--include-overrides` flag opts them in, tagged.
- [ ] **T9.8** Empty-corpus handling: exit 0 with "no features in range" message.
- [ ] **T9.9 [P: tests/test_backtest.py]** Integration tests: fixture feature-run directories with known outcomes, confirm correct classification.
- [ ] **T9.10 [P: back-test.md]** Write `back-test.md` runbook: how to run, interpret, rotate prompts when drift detected.

**Verification**: `pytest tests/test_backtest.py` passes. Run against current repo state — empty corpus, should exit 0. Add a fake feature-run fixture, confirm it's classified.

**Estimated diff**: ~350 lines.

## Slice 10: Migration script + SKILL.md update [CHECKPOINT]

- [ ] **T10.1 [P: scripts/migrate-blocked-workflows.py]** Create migration script. Reads state.json for orchestrator-split + finding-2-graphql-tightening. Runs `judge` panel against their current plan stage. Records verdicts and advances if majority proceed.
- [ ] **T10.2** Bypass for migration: if workflow `adversarial_rounds` is `< 3` in its historical record, still allow judge panel to run (these workflows were blocked before the round counter existed).
- [ ] **T10.3** Log each migration result to a summary file `docs/workflow/feature-runs/migration-ff-judge-panel-<date>.md` describing what happened per workflow.
- [ ] **T10.4 [P: SKILL.md]** Update `docs/workflow/operations/codex-skills/feature-factory/SKILL.md`: add "Judge Panel" section with pointer to prompt files; update "Review-Loop Convergence Rule" to say runner-enforced; add "Progress Heartbeat" subsection with 10-min PT cadence; add brief "--json flag" note under Orchestration Rules.
- [ ] **T10.5** Smoke test: create a fresh dummy workflow, take it through spec → plan → tasks with stub reviewers, confirm judge panel fires at round 3 correctly.
- [ ] **T10.6** Run `migrate-blocked-workflows.py` against the two waiting features. Inspect output.

**Verification**: smoke test runs end-to-end. Migration script produces clean summary. SKILL.md is readable and accurate.

**Estimated diff**: ~200 lines.

---

## Verification (overall)

- [ ] **V.1** `pytest` passes across all new test files (estimated 15).
- [ ] **V.2** `python3 run_factory.py status --slug <any>` works with both old-format and new-format state.json files.
- [ ] **V.3** Smoke test from Slice 10 T10.5 passes.
- [ ] **V.4** Migration of orchestrator-split + finding-2-graphql-tightening produces deterministic output on re-run (idempotent).
- [ ] **V.5** No regressions in existing FF runs in-flight at merge time.

## Parallel analysis

Within-slice parallelism marked `[P: <file>]` on steps that touch different files. Cross-slice parallelism is NOT applicable — slices have strict dependencies:

- Slice 2 depends on Slice 1 (uses `with_locked_state`)
- Slice 4 depends on Slice 3 (loads prompts) + Slice 2 (checkpoint refuses past cap)
- Slice 5 depends on Slice 4 (extends judge command)
- Slice 6 depends on Slice 1 (state writes) + Slice 5 (override records concerns)
- Slice 7 depends on Slice 1 (token_usage writes) — can start in parallel with Slice 4/5 if a dev wants, but merge order preserved
- Slice 8 depends on Slice 1 (heartbeat writes)
- Slice 9 depends on Slice 1, 6, 7 (reads merged_sha, token_usage, override flags)
- Slice 10 depends on all prior (integrates and documents)

## Test-anchor gating per slice

Inspired by AlphaCodium pattern (Agent B research): each slice's verification step MUST pass before the next slice begins. `[CHECKPOINT]` markers enforce this at FF diff-review time.

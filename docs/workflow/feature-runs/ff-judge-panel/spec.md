# Feature — Feature-Factory Judge Panel Enforcement

**Slug**: ff-judge-panel
**Branch**: `claude/ff-judge-panel` (forked from `main`)
**Created**: 2026-04-18
**Status**: Spec — pre-checkpoint
**Input**: Replace voluntary convergence rules with a runner-enforced judge panel. After 3 adversarial-review rounds per stage, 3 independent judges vote whether to advance the stage. If they block, the orchestrator edits and re-votes (max 3 judge rounds). Unresolved concerns surface at PR time. Includes runner state-machine changes, fixed judge prompts, cost telemetry, and a back-test script.

---

## Background

Feature Factory's adversarial-review loops can run indefinitely. In a real session earlier this week, the orchestrator-split feature hit 7 rounds of plan review before manual human intervention stopped it. Rounds 4-7 produced real findings but at diminishing returns — most were restatements of earlier themes or softer MEDIUM/LOW concerns.

The root cause is voluntary convergence: SKILL.md tells the orchestrator "stop after 3 rounds" but nothing mechanically enforces it. Each edit to address findings changes the artifact SHA; the runner then wants fresh reviews; reviews surface new observations; repeat.

This feature fixes that by moving the stop condition into the runner itself.

### Research backing

Two parallel research agents (see `research/` in this run's directory after this merges) surveyed the state of the art. Key findings incorporated into this spec:

- AlphaCodium (Ridnik et al. 2024) showed hard round caps with test-anchor gating outperform open-ended refinement — pass rate went from 19% to 44% on CodeContests when loops were capped.
- Multi-agent debate research (Du et al. 2023, Khan et al. 2024) shows diminishing returns after 2 rounds and actively harmful rounds after 4 on some tasks.
- Sycophancy research (Sharma et al. 2023, Wei et al. 2023) shows 20-40% agreement inflation when reviewers see prior reviews; judges must vote **blinded**.
- Monoculture panels (same model family) show ~0.7 correlation on wrong answers vs ~0.4 across families.

---

## Goals

1. **Bound every stage.** Max 3 adversarial-review rounds + max 3 judge-panel rounds = at most 6 iterations per stage, always terminates.
2. **Runner-enforced, not voluntary.** `run_factory.py` refuses to run `checkpoint` past round 3 on a stage — it redirects to `judge`. Orchestrators can't bypass.
3. **Three independent judges with distinct lenses and distinct input views** to minimize groupthink. Each judge sees only the data its lens needs.
4. **Three voting outcomes, not binary.** `proceed` / `proceed-with-annotation` / `block`. Annotations create a labeled dataset for back-test.
5. **Cost telemetry at activity-type granularity.** Every AI call tagged with `{stage, round, activity_type, model, tokens, cost_usd, timestamp}`.
6. **Back-test script** that correlates judge decisions with post-merge outcomes (CI failures, reverts, incidents).
7. **Override policy** for deliberate calibration — operators can ship cap-hit features over judge objection via an explicit flag.

## Non-goals

- Change any existing FF stage's output format or artifact schema beyond adding state fields.
- Rewrite adversarial-reviewer logic. The existing 2 Codex + 1 Gemini reviewer panel stays exactly as it is.
- Build a UI for viewing judgments or cost reports. Script-only for v1.
- Multi-feature aggregation dashboards. Back-test script takes one feature at a time; aggregate reporting is a future feature.
- Migrate existing in-flight workflows (orchestrator-split, Finding #2) to the new rule automatically. They'll be manually unblocked post-ship.

---

## Design Decisions (from discovery + research)

| # | Decision | Reason |
|---|---|---|
| 1 | **No dogfooding mid-feature.** This feature's own FF workflow uses Level 1 voluntary convergence (orchestrator self-discipline). Level 2 runner-enforced applies only to *future* features after this ships. | Mid-feature rule migration is operationally messy. Partial runner state on a feature building its own runner is a foot-gun. |
| 2 | **Both enforcement + back-test in v1, not enforcement first.** Scope includes runner changes, judge dispatcher, 3 prompt templates, cost telemetry, back-test script, and override policy. | Data-collection schema must be rock-solid day one; retrofitting telemetry is painful. Back-test produces empty results at launch but starts accumulating real signal immediately. |
| 3 | **Fixed prompts, versioned in repo.** Located at `docs/workflow/operations/codex-skills/feature-factory/judge-prompts/{completeness,restatement,implementation-risk}.md`. | Per-workflow override destroys back-test comparability and invites gaming. A `--prompt-override` CLI flag exists as an escape hatch but every override is logged. |
| 4 | **Panel composition: 2 Codex + 1 Claude Sonnet 4.6.** Codex `gpt-5.4-mini` for Completeness, Codex `gpt-5.4` heavy for Restatement, Claude Sonnet 4.6 for Implementation-risk. | Gemini dropped per operator feedback (false-positive rate). Known tradeoff: same-family correlation risk (~0.7 on wrong answers). Claude is the cross-family independence signal. Rotating in other families is a documented future improvement. |
| 5 | **Majority 2/3 vote.** No dissent-escalates rule, no sensitivity-based threshold adjustment. Majority wins both ways. | Simpler rules survive longer than complex ones. The user explicitly chose simple majority over carve-outs. |
| 6 | **Third vote option: `proceed-with-annotation`.** Judge can vote to advance but record a specific concern as a known risk. | Research showed binary proceed/block pressures judges into blocking for rigor. A third lane (Netflix/Shopify internal systems) cut false-blocks ~40% without measurable incident increase. Also provides labeled data for back-test. |
| 7 | **Max 3 judge rounds per stage.** After round 3, auto-advance with `unresolved_concerns` flag regardless of vote. | Hard upper bound prevents the same infinite loop we're trying to escape. |
| 8 | **Override policy: explicit `--override-judges` flag** on `deliver` that ships a cap-hit feature over judge objection. Logged to state.json. | Back-test's precision/recall metrics require deliberately overridden cases. Without overrides we only get recall. Target: ~10% of cap-hit features overridden for calibration. |

---

## Assumptions carried in

- FF runner already tracks stage state; adding new fields to `state.json` doesn't break existing workflows if fields are optional.
- Codex CLI (`codex exec`) and Claude CLI are both available on Railway CI and developer machines per `MEMORY.md`.
- Gemini CLI stays available for the adversarial-review phase; it's only dropped from the judge panel.
- `pg-boss`-style queue state is not relevant here; judge dispatch is synchronous in-process within run_factory.py.
- Existing `docs/workflow/feature-runs/*/state.json` files can remain in current format; new fields default to zero/empty on read.
- The user accepts the monoculture-risk tradeoff of a 2-Codex + 1-Claude panel; mitigations are documented but not implemented in v1.

---

## User Stories

### User Story 1 — Adversarial loop terminates at round 3 (Priority: P1)

An orchestrator (Claude or Codex, human or automated) runs `checkpoint --stage plan` a third time in a row because rounds 1 and 2 surfaced findings that got addressed. The runner refuses to run adversarial reviews a fourth time. It prints `→ next: judge_panel` and exits.

**Why this priority**: The whole feature exists to stop this loop. If round 4 can still run, nothing's changed.

**Independent Test**: Check an `state.json.stages.<stage>.adversarial_rounds` counter hits 3. Call `checkpoint --stage <stage>`. Confirm it exits non-zero with the `→ next: judge_panel` message; no new review files are created.

**Acceptance Scenarios**:

1. **Given** a stage with `adversarial_rounds: 2`, **When** `checkpoint --stage <stage>` runs successfully, **Then** `adversarial_rounds` increments to 3 and the reviewers run normally.
2. **Given** a stage with `adversarial_rounds: 3`, **When** the orchestrator calls `checkpoint --stage <stage>`, **Then** the runner exits with a specific error code (e.g., 2), prints `→ next: judge_panel`, and does NOT dispatch any reviewer.
3. **Given** a stage with `adversarial_rounds: 3`, **When** the orchestrator calls `checkpoint --stage <stage> --force`, **Then** the runner still refuses — there is no force flag for this path. The only way forward is `judge`.

---

### User Story 2 — Three judges vote independently; majority advances (Priority: P1)

Orchestrator runs `judge --slug <slug> --stage <stage>`. The runner dispatches three judge processes in parallel with the correct inputs per judge. Each judge returns structured JSON. The runner tallies, records, and either advances the stage or flags it for orchestrator edit + re-vote.

**Why this priority**: Core vote mechanism.

**Independent Test**: On a stage with 3 adversarial rounds already completed, run `judge`. Confirm three judge review files are written, each with distinct model/lens/inputs, none referencing another judge's output. Vote is tallied correctly.

**Acceptance Scenarios**:

1. **Given** a stage at `adversarial_rounds: 3`, **When** `judge --slug <slug> --stage <stage>` runs, **Then** three concurrent processes dispatch: one to Codex `gpt-5.4-mini` (Completeness), one to Codex `gpt-5.4` heavy (Restatement), one to Claude Sonnet 4.6 (Implementation-risk). Each runs blinded to the others' outputs.
2. **Given** a judge call, **When** the model returns a JSON object, **Then** the runner validates it against the shared schema `{verdict: "proceed"|"proceed-with-annotation"|"block", confidence: 1-5, reasoning: string, evidence: [{artifact: string, section: string, quote: string}]}` and rejects outputs that don't conform (retry once; then record as vote=block with reason `schema_violation`).
3. **Given** three valid judge outputs, **When** the runner tallies, **Then** the stage's `judge_verdicts` array is appended to state.json and the recommended-next-action reflects the outcome:
   - 2+ `proceed` → advance stage (annotations from `proceed-with-annotation` voters append to `annotations[]`)
   - 2+ `block` → orchestrator must edit, then re-run judge (increment `judge_rounds`)

---

### User Story 3 — Judge panel re-votes up to 3 rounds, then auto-advances (Priority: P1)

A stage gets 2/3 block on its first judge vote. The orchestrator edits the artifact to address both block reasons. Judge panel re-runs. After up to 2 more re-votes, if judges still block, the stage advances anyway with `unresolved_concerns[]` populated and a prominent warning.

**Why this priority**: The escape from infinite loops. No human fallback inside the workflow.

**Independent Test**: Simulate a stage where all 3 judge rounds produce majority block. Confirm the stage advances after round 3 with `unresolved_concerns` in state.json.

**Acceptance Scenarios**:

1. **Given** judge round 1 votes 2 block / 1 proceed, **When** orchestrator edits and runs `judge` again, **Then** `judge_rounds` increments to 2, judges re-vote, and the flow branches on the new tally.
2. **Given** `judge_rounds: 3` after majority block, **When** the runner processes the vote, **Then** the stage advances with `state.json.stages.<stage>.unresolved_concerns` populated from the persistent block reasons, and a `warn`-level log entry marks the auto-advance.
3. **Given** a stage that auto-advanced with unresolved concerns, **When** later stages advance normally, **Then** the unresolved_concerns persist through to closeout and PR rendering.

---

### User Story 4 — Unresolved concerns surface at PR creation (Priority: P1)

The `deliver` command, when creating a PR, reads `unresolved_concerns[]` and `annotations[]` across all stages and injects them into the PR description under a dedicated `## ⚠ Unresolved Judge Concerns` section at the top. If the section is empty, it's omitted.

**Why this priority**: The end-of-workflow human gate. Without this, auto-advances become invisible.

**Acceptance Scenarios**:

1. **Given** a feature with one stage that auto-advanced with 2 unresolved concerns and another stage with 3 annotations, **When** `deliver` runs, **Then** the PR description includes a section that lists: stage, judge, confidence, reasoning, and whether it was a block-majority auto-advance or a proceed-with-annotation.
2. **Given** a feature with no unresolved concerns and no annotations, **When** `deliver` runs, **Then** the PR description omits the section entirely.
3. **Given** an operator running `deliver --override-judges`, **When** the PR is created, **Then** the PR description prominently notes "Shipped over judge objection" with the specific block reasons.

---

### User Story 5 — Cost telemetry per call, queryable by stage × activity (Priority: P1)

Every AI call made by FF — reviewer, judge, authoring assistant, implementation Codex dispatch — appends a record to `state.json.token_usage[]` with `{stage, round, activity_type, model, input_tokens, output_tokens, cost_usd_estimate, timestamp}`. Activity types follow a fixed taxonomy.

**Why this priority**: Without cost attribution, we can't answer "is the review loop worth its price?"

**Independent Test**: Run a full feature end-to-end. Query `state.json.token_usage` and group by `activity_type`. Confirm the expected activity types appear with plausible token counts.

**Acceptance Scenarios**:

1. **Given** a stage that runs adversarial reviews, **When** reviews complete, **Then** three `token_usage` records appear with `activity_type: "adversarial_review"`, one per reviewer, tagged with model and stage.
2. **Given** a stage that runs the judge panel, **When** judges complete, **Then** three `token_usage` records appear with `activity_type: "judge_panel"`.
3. **Given** a feature with all 7 activity types used (authoring, reconciliation, adversarial_review, judge_panel, implementation, implementation_review, orchestration), **When** a report is run, **Then** each category is queryable with total tokens + estimated USD.

**Activity type taxonomy** (fixed enum):
- `authoring` — Claude/Codex writing spec.md, plan.md, tasks.md, closeout.md
- `reconciliation` — Claude/Codex editing artifacts in response to review findings
- `adversarial_review` — existing 2 Codex + 1 Gemini reviewer panel calls
- `judge_panel` — the 3 new judge calls
- `implementation` — Codex dispatched via `implement` command
- `implementation_review` — adversarial diff-review calls
- `orchestration` — Claude/Codex orchestrator reasoning steps. Concrete definition: ALL orchestrator calls record, but those < 2000 tokens are tagged `activity_subtype: "micro"`. Back-test aggregation defaults to including micros in the orchestration total. This closes the round-1 subjective-definition finding AND the round-2 "blind spot on high-volume small calls" finding.

---

### User Story 6 — Override-judges path logs everything for back-test calibration (Priority: P2)

An operator explicitly ships a cap-hit feature over judge objection to collect calibration data. The `deliver --override-judges --reason "<specific>"` command requires both the flag AND a reason string; it blocks without the reason.

**Why this priority**: Without deliberate overrides, judge precision is unknowable.

**Acceptance Scenarios**:

1. **Given** a feature with `unresolved_concerns` populated, **When** `deliver --override-judges` (no reason), **Then** the command exits with error demanding `--reason`.
2. **Given** `deliver --override-judges --reason "testing judge calibration on low-risk feature"`, **When** the PR is created, **Then** state.json records the override, the reason, and a timestamp. The PR description calls out the override prominently.

---

### User Story 7 — Back-test script correlates judge decisions with post-merge outcomes (Priority: P2)

An operator runs `backtest.py --since 2026-01-01`. The script reads all FF runs with PRs merged since that date, pulls CI history and PR revert/hotfix patterns from GitHub, and produces a report grouping features by judge outcome.

**Why this priority**: The feedback loop. Without it, judges can drift silently.

**Acceptance Scenarios**:

1. **Given** ≥ 5 FF features merged since the since-date, **When** back-test runs, **Then** it produces a table per feature: `{slug, judge_outcomes_by_stage, ci_failures_within_48h, revert_commits_within_7d, related_incident_reports}`.
2. **Given** a feature that auto-advanced with unresolved concerns AND had a revert within 7 days, **When** back-test runs, **Then** the feature is flagged in the report summary as "judge concern validated."
3. **Given** an empty corpus (no features merged yet), **When** back-test runs, **Then** it exits cleanly with "no features in range" and an exit code of 0 (not an error).

---

### User Story 8 — Retroactive unblock of existing workflows (Priority: P2)

After this feature ships, operator runs a migration script that: (a) reads state.json for orchestrator-split and Finding #2 workflows, (b) dispatches the judge panel against their current artifact state, (c) records verdicts, (d) advances the stages that pass.

**Why this priority**: Two features are waiting on this. Their unblock IS the first real test of the judge panel.

**Acceptance Scenarios**:

1. **Given** the orchestrator-split workflow is blocked on plan ceremony, **When** the migration script runs judge panel on its plan stage, **Then** the panel votes on the existing plan.md. If 2+ proceed, plan stage advances.
2. **Given** Finding #2 is blocked on plan ceremony, same pattern.

---

## Edge Cases

- **Judge call times out.** Record the timeout as `vote=block` with reason `timeout`, confidence `null`. Counts toward majority. If 2/3 judges time out, retry up to 2x; if still timing out, treat as 2/3 block and require edit + re-vote.
- **Judge returns malformed JSON.** Retry once with a schema-reminder appended. If second try also fails, record `vote=block` with reason `schema_violation`.
- **Reviewer panel changes mid-feature.** If someone edits the adversarial reviewer configuration after round 1, round counter does NOT reset; round 2 still runs against the new reviewers. Document that the round cap is about the *orchestrator's* iteration budget, not reviewer consistency.
- **Orchestrator edits the artifact but doesn't call `judge` next.** `status` output warns; next `checkpoint` call still refuses past round 3.
- **Override used inappropriately.** `--override-judges` log is visible to anyone running `status`; over time, an anomalously high override rate on a specific operator's features is a signal for back-test.
- **Back-test script run with no GitHub access.** Fall back to local `git log` for revert pattern matching; flag incident correlation as "unavailable" in the report.
- **Judge-prompt override via CLI.** `judge --prompt-override path/to/custom.md --override-reason "<specific>"`. Both flags required together. Override logged and excluded from back-test aggregates by default.
- **Two features with the same slug.** Slug uniqueness is not newly enforced — existing behavior carries over. Back-test script deduplicates by branch name.
- **Mid-round artifact edit between judge calls (race).** Judges all read the artifact at dispatch time. If artifact changes during the parallel call, two judges see version N and one sees N+1. Mitigation: snapshot the artifact's SHA into each judge's input package; the `judge` subcommand reads all three judges' output, checks all SHAs match, and on mismatch retries the whole panel up to 2 times. After 3 total attempts (initial + 2 retries), the runner records `vote=block` for each judge whose SHA diverged (reason=`artifact_mutated`) and advances via the normal voting path.
- **Concurrency during cap enforcement.** Two orchestrators running `checkpoint` on the same stage simultaneously shouldn't both pass round 3. Use a Postgres-style advisory lock or file lock on `state.json` during the atomic read-increment-check sequence.

---

## Functional Requirements

### Runner state tracking

- **FR-001**: `state.json.stages[stage]` MUST include: `adversarial_rounds: int` (default 0), `judge_rounds: int` (default 0), `judge_verdicts: Verdict[][]` (default []; one inner array per judge round), `annotations: Annotation[]` (default []), `unresolved_concerns: Concern[]` (default []).
- **FR-002**: `Verdict` is `{judge: string, model: string, verdict: "proceed" | "proceed-with-annotation" | "block", confidence: 0..5 (0 reserved for schema-violation/timeout per FR-012), reasoning: string, evidence: [{artifact, section, quote}[], timestamp: iso8601}`.
- **FR-003**: `Annotation` is `{stage, round, judge, confidence, reasoning, artifact_sha_at_time}`.
- **FR-004**: `Concern` is `{stage, round, judge, confidence, reasoning, persisted_across_rounds: int}`.
- **FR-005**: `state.json.token_usage[]` MUST record every AI call with `{stage, round, activity_type, model, input_tokens, output_tokens, cost_usd_estimate, timestamp, agent_id, artifact_sha_at_time}`.
- **FR-005a**: State-schema migration: the existing runner today stores stage state in top-level keys read by `factory_cmd_status.py`, `factory_cmd_deliver.py`, and `factory_stages.py`. The new `stages[stage]` nested shape MUST coexist — implementation writes BOTH the new nested shape AND the old top-level keys during a transition period. Existing readers continue to work unchanged. After 3 months or when all in-flight workflows complete (whichever is sooner), a follow-up feature removes the dual-write. This closes the "new state shape not wired into existing readers" finding from spec review. A schema-version field `state.json.schema_version: int` tracks migration state.

### Round-cap enforcement

- **FR-006**: `checkpoint --stage <stage>` MUST use **reserve-then-dispatch** ordering under an exclusive state lock: (1) acquire lock, (2) read current `adversarial_rounds`, (3) if ≥ 3, release lock and exit 2 with message `→ next: judge_panel`, (4) otherwise optimistically increment `adversarial_rounds` (e.g., 2→3) and release lock, (5) THEN dispatch reviewers. If reviewers fail, `checkpoint` decrements the counter back under lock (best-effort; on crash, the new `repair` command per FR-006a handles this). This closes the "two orchestrators both pass preflight and launch reviewers" race from spec-review round 2. No `--force` flag bypass exists.
- **FR-006a**: New subcommand `repair --slug <slug> [--stage <stage>]` handles state.json corruption from crashes mid-mutation. Specifically:
   - Reads state.json and validates the schema against schema_version.
   - If `adversarial_rounds` was incremented but no corresponding review files exist on disk, decrements the counter back.
   - If `judge_rounds` was incremented but no verdict files exist, decrements it back.
   - If `merge_wait_state` is `waiting` but `delivery.merged_at_iso8601` is already populated, transitions to `merged`.
   - Idempotent — safe to re-run.
   - Outputs a summary of corrections made; `--dry-run` flag shows corrections without applying them.
   This closes the "underspecified repair command creates unmitigated operational risk" HIGH finding from round-4 spec review.
- **FR-007**: `judge --slug <slug> --stage <stage>` MUST refuse (exit 2) if `adversarial_rounds < 3` with message `→ next: checkpoint`.
- **FR-007a**: The runner's `recommended_next_action` logic (currently in `factory_next_action.py`) MUST be extended to include a `judge_panel` branch: when any stage has `adversarial_rounds >= 3` AND `judge_rounds == 0` OR (prior judge round voted block AND `judge_rounds < 3`), the recommended action is `judge_panel`. `status` output surfaces this. This closes the "next-action tree has no judge branch; status won't guide users there" finding from spec-review round 2.
- **FR-007b**: The runner MUST support structured control-flow output in addition to existing string messages. Every subcommand that prints `→ next: <action>` MUST ALSO accept a `--json` flag that emits `{"next": "<action>", "reason": "<specific>", "blockers": [...]}` to stdout instead. Orchestrators (current: string parsing; future: JSON) can use either; the string form is retained for backwards compatibility. State-modifying subcommands (`checkpoint`, `judge`, `implement`, `deliver`) ALSO write the same structured payload to `state.json.last_action_result` so orchestrators can read it back after a command exits. This closes the "stdout string parsing is brittle" HIGH finding from round-3 spec review.
- **FR-008**: ALL writes to `state.json` MUST acquire an exclusive file lock (`fcntl.flock`) for the load-mutate-save sequence. This covers (a) the `adversarial_rounds` counter increment, (b) judge verdict appends to `judge_verdicts`, (c) annotation + unresolved_concerns appends, (d) `token_usage[]` records written by concurrent subprocess calls, (e) heartbeat writes. Locking is short-held (~10ms per write); orchestrator retries on EWOULDBLOCK up to 100ms. This closes the "parallel judges clobber state" finding from spec review.

### Judge dispatch

- **FR-009**: `judge` subcommand MUST dispatch all three judges in parallel (not sequential). Each judge runs as a separate subprocess calling its respective CLI (`codex exec -m gpt-5.4-mini`, `codex exec -m gpt-5.4`, `claude -m claude-sonnet-4-6`).
- **FR-010**: Each judge MUST be passed only the inputs its lens needs:
   - Completeness: full artifact chain + all HIGH findings from all adversarial rounds.
   - Restatement: only findings (all rounds), with orchestrator responses; artifact texts NOT included.
   - Implementation-risk: full artifact chain + **diff of most recent round's edits** (what changed in response to the latest adversarial round). Raw findings text NOT included. Diff base: the artifact SHA recorded in `state.json.stages[stage].adversarial_sha_history[-2]` (the artifact state at start of the current round, before the edit). If only one round has occurred, diff base is the artifact's initial SHA at `stages[stage].initial_sha`. Rationale updated after spec review: pure cold read misses "did the fix itself introduce a new issue?" which is the unique high-value check after multiple rounds. Diff-only (not findings-text) preserves input independence while giving the judge context on what just changed. This closes the round-3 "diff base undefined" MEDIUM.
- **FR-011**: Judges MUST NOT see each other's output. Each dispatch is independent; results are read back only after all three complete.
- **FR-012**: Judge output MUST match the JSON schema in FR-002. Schema-violating output triggers exactly one retry with a corrective prompt appendix. Second failure records `vote=block`, `reason="schema_violation"`, `confidence=0` (sentinel value outside the 1-5 range but still a valid integer — signals "no valid confidence measured"). The FR-002 schema MUST be amended to accept `confidence: 0..5` where `0` is reserved for schema-violation and timeout cases. This closes the "confidence:null contradicts 1..5 schema" finding from spec review.
- **FR-012a**: Judge output MUST be written in TWO formats side-by-side in `reviews/`:
   - `judge.{lens}.verdict.json` — the structured JSON output (schema per FR-002), consumed programmatically by reconcile/status/closeout.
   - `judge.{lens}.review.md` — markdown with frontmatter matching the existing `*.review.md` convention, so checkpoint validators, closeout inventory, and audit trails continue to work without modification. The markdown embeds the verdict JSON in a fenced code block under `## Verdict (structured)`.
   Existing tooling (`reconcile`, `verify_review_checkpoint.py`, `closeout`) reads the `.review.md` file. New tooling (`backtest.py`, `status`) reads the `.verdict.json` file. This closes the "judge JSON vs existing markdown pipeline bridge undefined" HIGH finding from round-3 spec review.

### Voting rule

- **FR-013**: After all three judges return, the runner tallies:
   - count(`proceed`) + count(`proceed-with-annotation`) >= 2 → stage advances
   - count(`block`) >= 2 → stage does NOT advance; orchestrator must edit and re-run `judge`
   - `proceed-with-annotation` votes append reasoning to `state.json.stages[stage].annotations`
- **FR-014**: If `judge_rounds >= 3` and majority still blocks, the stage MUST advance with `unresolved_concerns[]` populated. "Persistent block reasons" are defined concretely: for each judge that voted block in round 3, include their reasoning text verbatim in `unresolved_concerns[]` with fields `{stage, judge, confidence, reasoning, round_raised: 3, also_raised_in_round: int[]}`. The `also_raised_in_round` array is populated by a simple embedding-similarity check (cosine ≥ 0.85) against block reasons from rounds 1 and 2; the check is a transparency signal only — every round-3 block becomes an unresolved concern regardless of whether it was seen earlier. Log `warn`-level: "judge panel exhausted; advancing with unresolved concerns".

### Override path

- **FR-015**: `deliver --override-judges --reason "<string>"` MUST require both flags. Missing `--reason` → exit 2.
- **FR-016**: Override records to `state.json.override: {reason, timestamp, operator_id, affected_concerns: Concern[]}`.
- **FR-017**: PR body generated by `deliver --override-judges` MUST include a prominent `⚠ Shipped over judge objection` section listing every concern being overridden and the stated reason.

### Cost telemetry

- **FR-018**: Every subprocess call to any AI CLI MUST write a `token_usage` record before returning control. Missing records (subprocess crashes) MUST be backfilled by a `token_usage` entry with `input_tokens: null, output_tokens: null, cost_usd_estimate: null, note: "crashed"`.
- **FR-019**: Activity type taxonomy is a fixed enum validated at write: `authoring`, `reconciliation`, `adversarial_review`, `judge_panel`, `implementation`, `implementation_review`, `orchestration`. Writes with unknown activity types MUST fail loudly.
- **FR-020**: Cost USD estimate uses a lookup table in `docs/workflow/operations/codex-skills/feature-factory/pricing.json` (model → input-per-1k-tokens + output-per-1k-tokens). Updated manually when vendors change prices.

### Merge tracking in deliver

- **FR-020a**: After `deliver` creates or updates a PR, it MUST poll `gh pr view --json mergeCommit,mergedAt` until the PR is merged (or the user stops the runner). When the merge fires, `deliver` writes `state.json.delivery.merged_sha` and `state.json.delivery.merged_at_iso8601` to state.json. State.json's `delivery.merge_wait_state` tracks whether the process is mid-wait, so a killed `deliver` can resume via `deliver --resume-merge-wait` and pick up where it left off; if the PR was merged while the process was dead, the resume call simply reads the current PR state and writes the fields. Without these fields, back-test cannot enumerate the corpus. This closes the round-1 "backtest depends on fields deliver never sets" finding AND the round-3 "deliver exits after PR creation, merge might be missed" MEDIUM.
- **FR-020c**: If new judgments, annotations, or overrides accrue to state.json AFTER `deliver` has already created a PR (common when judge rounds run on subsequent stages), `deliver --refresh` MUST regenerate the PR body and push the update via `gh pr edit --body`. To preserve operator-authored PR notes, the judge-generated content MUST be bounded by HTML-comment sentinel markers: `<!-- ff-judge-panel:begin -->` ... `<!-- ff-judge-panel:end -->`. Refresh replaces ONLY the content between sentinels; everything outside is preserved verbatim. If sentinels are missing on refresh (e.g., operator deleted them), refresh appends the block at the top and warns. This closes the "PR body goes stale" finding from round-2 AND the "refresh erases operator edits" MEDIUM from round-3 spec review.
- **FR-020b**: `backtest.py` MUST fall back to reading `gh api repos/:owner/:repo/commits/<head_sha>` and following merge commits when state.json is missing the merge fields (for features delivered before FR-020a landed, i.e. migrating old workflows).

### Back-test script

- **FR-021**: `backtest.py --since <date>` MUST:
   - Enumerate all FF workflows with `state.json.delivery.merged_sha` set and merge date >= since.
   - For each: pull CI run results within 48h of merge via `gh api`; pull PR revert/hotfix commits within 7 days via `git log --grep`; match `unresolved_concerns` text against any incident post-mortem files under a configurable path using BOTH exact substring match AND embedding-similarity (cosine ≥ 0.75) against each concern's reasoning. Known limitation: text matching is a heuristic with expected 10-20% false-negative rate. Operators reviewing back-test output manually verify flagged matches. This closes the "text matching fragile" finding from spec review.
   - Output a CSV + a markdown summary: per-feature row with `{slug, stages_with_concerns, outcome: clean|hotfixed|reverted|incident, concerns_validated: [...]}`.
- **FR-022**: Back-test on empty corpus exits 0 with message "no features in range".
- **FR-023**: Back-test MUST default to excluding workflows where `--override-judges` was used AND `--prompt-override` was used (non-representative). `--include-overrides` flag makes them appear but tagged as such.

### Progress heartbeat

- **FR-023a**: The runner MUST emit a progress heartbeat to stdout every 10 minutes during any long-running operation (checkpoint dispatch, judge panel dispatch, implement dispatch, **and the merge-wait loop introduced by FR-020a**). The heartbeat format: `[heartbeat PT <HH:MM>] <stage>: <current-activity>, elapsed <Xm:Ys>, <concrete-state>`. Example: `[heartbeat PT 14:32] spec: codex.edge-cases still running, elapsed 12m:10s, pid 78492 alive`. Time MUST be in America/Los_Angeles timezone regardless of where the runner executes. *Design note: round-2 spec review flagged PT vs UTC as a best-practice concern. Keeping PT per explicit operator preference — the heartbeat is user-facing UX, not server-side aggregated logging. The underlying `timestamp` field in state.json is ISO-8601 UTC per standard; only the human-displayed HH:MM in stdout is PT.*
- **FR-023b**: The heartbeat MUST include an indication of liveness (process alive, timeouts to deadline, or resource state). A heartbeat that says nothing has changed for 30+ minutes on the same activity SHOULD additionally log `warn`-level with the stuck activity name.
- **FR-023c**: The heartbeat also writes to `state.json.heartbeats[]` with `{timestamp_pt, stage, activity, elapsed_ms}` so orchestrators resuming from a stopped session can see the last reported liveness.
- **FR-023d**: (Orchestrator discipline) For any background dispatch NOT owned by the runner — most commonly direct `codex exec` calls for implementation slices — the orchestrator (Claude or Codex) MUST start a paired sidecar heartbeat monitor BEFORE or IMMEDIATELY AFTER the dispatch. The monitor's job is to emit a `[heartbeat PT HH:MM]` line every 10 minutes reporting (a) whether any `codex exec` processes are alive, (b) the most recent commit on the active worktree. If the dispatch dies silently (no notification, no commit), the heartbeat makes it visible within 10 minutes. SKILL.md documents the required pattern (Slice 10).
- **FR-023e**: Implementation-dispatch spec files (the prompts passed to `codex exec -s workspace-write`) MUST NOT live in `/tmp` or any other GC-able path. They live either (a) in the worktree under `docs/workflow/feature-runs/<slug>/codex-specs/slice-<N>.txt`, committed with the slice, or (b) in a worktree-local dotfile (e.g. `.codex-slice6-spec.txt`) that's in `.gitignore` but survives /tmp GC. This closes the failure mode where a GC'd spec file meant Codex got an empty prompt on re-dispatch.

### Documentation

- **FR-024**: `docs/workflow/operations/codex-skills/feature-factory/SKILL.md` MUST reference the new judge behavior under a "Judge Panel" section with a pointer to the prompt files. The existing "Review-Loop Convergence Rule" section MUST be updated to say the rule is now runner-enforced. A new "Progress Heartbeat" subsection MUST document the 10-minute PT cadence so orchestrators know to relay heartbeats to the user.
- **FR-025**: `docs/workflow/operations/codex-skills/feature-factory/judge-prompts/{completeness,restatement,implementation-risk}.md` MUST exist with fixed prompt content (drawn from research-agent output, adapted to FF terminology).
- **FR-026**: A new `docs/workflow/operations/codex-skills/feature-factory/back-test.md` runbook MUST document how to run back-test, interpret output, and rotate prompts when drift is detected.
- **FR-026a**: `closeout.md` generation MUST include a dedicated `## ⚠ Unresolved Judge Concerns` section that reads from `state.json.stages[*].unresolved_concerns[]` and `state.json.stages[*].annotations[]`. Empty case: section omitted. This closes the "closeout doesn't surface concerns" round-4 finding. `closeout_inventory_text()` in `factory_deliver.py` is the target for this change.
- **FR-026b**: `--json` control-flow flag (per FR-007b) MUST extend to ALL runner subcommands that currently emit `→ next:` via `_emit_next_action()`: `checkpoint`, `judge`, `implement`, `deliver`, `discover`, `reconcile`, `auto-reconcile`, `closeout`. This closes the round-4 finding that --json was only partial.
- **FR-026c**: `state.json.token_usage[]` and `state.json.heartbeats[]` arrays MUST support rollover. When either array exceeds 10,000 entries, the oldest half is moved to `state.json.archive/<activity>-<date>.jsonl` (JSON-lines format, appendable) and removed from state.json. Back-test reads both active and archived entries. This addresses the round-4 "unbounded arrays → scaling hole" MEDIUM.

### Retroactive migration

- **FR-027**: A one-shot script `scripts/migrate-blocked-workflows.py` MUST run the judge panel against any workflow currently in `blocked` status, record verdicts, and advance stages that pass. Target workflows: `split-queue-orchestrator`, `finding-2-graphql-tightening`.

---

## Success Criteria

- **SC-001**: Running `checkpoint --stage plan` a fourth time on a stage where `adversarial_rounds = 3` exits non-zero and produces no review files. Integration test.
- **SC-002**: Running `judge --stage plan` when `adversarial_rounds = 3` dispatches exactly 3 parallel subprocesses, produces 3 review files, and tallies correctly. Integration test.
- **SC-003**: A simulated 3-round-block scenario auto-advances the stage with `unresolved_concerns` populated. Integration test using stubbed judges.
- **SC-004**: `deliver` on a feature with unresolved concerns injects a `⚠ Unresolved Judge Concerns` section into the PR description. End-to-end test.
- **SC-005**: `deliver --override-judges --reason "X"` without reason exits 2; with reason creates PR with `⚠ Shipped over judge objection` section and state.json override record.
- **SC-006**: Every AI subprocess call writes a `token_usage` record. Query on a completed feature returns records for all 7 activity types. Integration test.
- **SC-007**: `backtest.py` on an empty corpus exits 0; on a corpus with 1+ features produces CSV + markdown summary. Integration test.
- **SC-008**: `migrate-blocked-workflows.py` unblocks `split-queue-orchestrator` and `finding-2-graphql-tightening` by running the judge panel on their plan stages. Each advances if majority proceed, else records concerns.
- **SC-009**: Prompt files exist at the documented paths, are readable, and are loaded at judge dispatch time.
- **SC-010**: All existing FF workflows (those not cap-hit yet) continue to work without changes. State.json migration is read-backward-compatible.

---

## Rollout Plan

Single PR against `chrislawcodes/valuerank`. Implementation in slices (see plan.md). No feature flag — the new runner behavior applies to all workflows as soon as the PR lands.

Deployment:
1. Merge PR. Runner deploys via Railway.
2. Immediately run `migrate-blocked-workflows.py` to test against our two waiting features. Observe judge outputs, verify stages advance or get documented concerns.
3. Subsequent FF runs automatically get the new behavior at their first round-3 cap hit.

Rollback is a revert of the PR. No data migration other than the new state.json fields, which are additive and default to empty — old-format state.json files still parse.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Monoculture correlation in 2-Codex + 1-Claude panel | Medium | Medium | Known tradeoff; documented. Future work: support 4-judge panel with cross-family rotation. |
| Judge prompts drift from reality as FF evolves | Medium | Medium | Back-test catches this over ~30 features. Prompts versioned so rollback is a PR. |
| Override flag abused to ship everything | Low | Medium | Every override logged; anomalously-high override rate is a signal for human review in retrospective. |
| Back-test false-negative (incident not matched to prior annotation) | Medium | Low | Text matching is approximate; flagging false negatives is manual follow-up. |
| Judge call cost balloons under pathological workflows (20+ stages) | Low | Low | Each stage capped at 3 adversarial + 3 judge rounds = 18 AI calls max per stage. At ~$1-3 per stage in research estimates, that's ~$50 max for a 20-stage feature. |
| Parallel judge dispatch exceeds CLI rate limits | Medium | Low | Existing adversarial reviewer infrastructure already handles parallel dispatch. Reuse that spawn logic. |
| `state.json` file lock contention when multiple orchestrators run | Low | Low | Lock held only during atomic read-mutate-write (~10ms). Retries on conflict. |
| Retroactive migration fails on orchestrator-split or Finding #2 | Medium | Low | Migration script doesn't mutate artifacts; if judge panel blocks, the workflow just stays blocked with documented reasons for human to decide. |
| Research-recommended convergence detector (novelty check) not in scope | Certain | Low | Tracked as future enhancement. Current rule (hard cap) is strictly simpler and sufficient for v1. |

---

## Related Documentation

- Feature Factory SKILL.md (existing) — this feature updates it
- Research agent outputs for this feature (judge prompts + multi-agent review space)
- MEMORY.md — agent model IDs and invocation patterns
- cloud/CLAUDE.md — project coding standards (this feature is Python, not TypeScript, but file-size limits still apply: 400 lines max per file)

---

## Research references

Both research agents produced structured briefings. Key works cited:

- Ridnik et al., "Code Generation with AlphaCodium" (2024)
- Du et al., "Improving Factuality and Reasoning in Language Models through Multiagent Debate" (2023)
- Khan et al., "Debating with More Persuasive LLMs Leads to More Truthful Answers" (ICML 2024)
- Sharma et al., "Towards Understanding Sycophancy in Language Models" (Anthropic 2023)
- Wei et al., "Simple synthetic data reduces sycophancy in large language models" (2023)
- Shinn et al., "Reflexion: Language Agents with Verbal Reinforcement Learning" (NeurIPS 2023)
- Gou et al., "CRITIC: LLMs Can Self-Correct with Tool-Interactive Critiquing" (ICLR 2024)
- Kojima et al., "Large Language Models are Zero-Shot Reasoners" (2022)
- Aider benchmark notes (aider.chat/docs/benchmarks)
- Production cost-taxonomy patterns from Langfuse / Helicone / LangSmith docs

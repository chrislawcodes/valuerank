# Feature Factory Runner Fixes — Spec

**Feature branch**: `claude/friendly-aryabhata-9efbf7`
**Slug**: `ff-runner-fixes`
**Created**: 2026-04-23
**Status**: Draft spec (discovery complete)
**Supporting plan**: [docs/workflow/plans/feature-factory-runner-fixes.md](../../plans/feature-factory-runner-fixes.md)

## Summary

Fix three concrete defects in the Feature Factory runner that surfaced during feature run 033:

1. **Fix 1** — Judge panel verdicts are silently ignored by the next-action decision tree.
2. **Fix 2** — Auto-reconcile's severity regex misses common finding shapes, letting HIGH findings slip through as "no findings."
3. **Fix 8** — No invariant guardrail to catch future state contradictions like Fix 1 produced.

Fixes 3, 4, 5, 6, 7 from the plan are **out of scope** for this feature and will be tracked as follow-up features.

This is workflow-tool maintenance, not product work. The "user" is the orchestrator (Claude or Codex) and the secondary user is the human operator watching the workflow.

## Problem statement

During feature run 033 the runner appeared to loop: after the judge panel voted `advance`, the next-action banner still recommended `repair_spec_checkpoint`. The orchestrator had to hand-edit `state.json` to proceed. Three causes:

1. [factory_next_action.py:76-143](../../operations/codex-skills/feature-factory/scripts/factory_next_action.py) never reads `stages.<stage>.judge_next_action`, even though [factory_cmd_judge.py:879, 884, 899](../../operations/codex-skills/feature-factory/scripts/factory_cmd_judge.py) writes it.
2. [factory_review_specs.py:20-27](../../operations/codex-skills/feature-factory/scripts/factory_review_specs.py) matches only bullet-list (`- high:`) and table-cell (`| **HIGH** |`) severity shapes. Numbered-list (`1. **HIGH**:`), heading (`### HIGH:`), bold-prefix (`**HIGH [CODE-CONFIRMED]**:`), and inline (`Severity: HIGH`) are silently ignored.
3. No automated check flags the state contradiction (`judge_next_action == advance` AND `recommended_next_action == repair_<same stage>_checkpoint`) when it occurs. The orchestrator only noticed by reading review bodies manually.

## Scope

### In scope

- **Fix 1** — `factory_next_action.recommended_next_action` honors `judge_next_action == "advance"` before checking `stages.<stage>.healthy`.
- **Fix 1 schema** — extend the already-partly-defined `unresolved_concerns` schema in `state.json` so the next stage can verify concerns were addressed.
- **Fix 1 manifest reseal** — when `judge_next_action == "advance"` but artifact SHA has drifted from the manifest, reseal the manifest at advance time and record drift in `annotations[]`.
- **Fix 2** — broaden `_ACTIONABLE_FINDING_RE` in `factory_review_specs.py` to catch the four additional severity shapes, with structural anchoring to avoid prose false-positives.
- **Fix 8** — post-run invariant self-check that runs after `checkpoint`, `judge`, `reconcile`, `auto-reconcile` and surfaces state contradictions.
- **Regression fixture** — capture run-033's `state.json` into `scripts/tests/fixtures/run-033-snapshot.json` as task 0 and use it as an integration-test input for Fix 1.
- **Unit tests** — table-driven tests for the regex (positive + negative cases), decision-tree tests for Fix 1, self-check tests for Fix 8.

### Out of scope (deferred to separate features)

- Fix 3 — `--force-advance` / `advance` CLI subcommand.
- Fix 4 — rename `repair_X_checkpoint` → `run_X_checkpoint`.
- Fix 5 — `--validation-only` flag past 3-round adversarial cap.
- Fix 6 — garbage-collect stale review intermediates.
- Fix 7 — raise default character budgets.
- Changes to `sync-codex-skills.py`, `review-lens/` scripts, or any reviewer prompts.
- Product-surface changes (cloud/ app, GraphQL, UI).
- Scheduler, PgBoss, or transport-level changes.

## User stories

This work lands inside the runner, not product surface. "Users" are orchestrating agents and the human operator.

### US1 — Runner honors judge verdicts (Priority: P1)

**As** the orchestrator (Claude or Codex)
**I need** the runner's next-action recommendation to reflect the judge panel's formal verdict
**So that** I do not have to hand-edit `state.json` when a judge votes `advance` but the artifact has been edited since the last checkpoint.

**Why P1**: this is the root cause of the run-033 loop and the most painful friction in the workflow. Without it, every feature run risks manual recovery.

**Independent test**: Replay the run-033 `state.json` fixture. Pre-fix: `recommended_next_action` returns `repair_spec_checkpoint`. Post-fix: returns `author_plan` (the correct next action).

**Acceptance scenarios**:

1. **Given** `stages.spec.judge_next_action == "advance"` and `stages.spec.healthy == false` (manifest SHA drift), **when** `recommended_next_action` is called, **then** it returns the next stage's action (`author_plan`) — not `repair_spec_checkpoint`.
2. **Given** `stages.spec.judge_next_action == "advance"` and artifact SHA has drifted, **when** the advance is taken, **then** the manifest is resealed to the current SHA and an `annotations[]` entry records `{reason: "advance-with-drift", old_sha, new_sha, at: <timestamp>}`.
3. **Given** `stages.spec.unresolved_concerns` is non-empty and the runner advances to plan, **when** plan checkpoint runs, **then** plan checkpoint verifies every concern id is either referenced as `addressed` in plan annotations or explicitly `deferred` via the `--defer` flag; otherwise checkpoint returns `needs-unresolved-concerns-review`.
4. **Given** `stages.spec.judge_next_action == "edit_and_rerun_judge"`, **when** `recommended_next_action` is called, **then** it returns `judge_panel` (unchanged from today) — Fix 1 does not interfere with the rejudge path.

### US2 — Auto-reconcile catches common finding shapes (Priority: P1)

**As** the orchestrator
**I need** `auto-reconcile` to detect HIGH/MEDIUM findings regardless of whether the reviewer used bullets, numbered lists, headings, or inline Severity fields
**So that** I do not silently accept reviews with unaddressed blocking findings (as happened in run 033).

**Why P1**: this fix closes the blindspot that let 3 reviews in run 033 auto-accept despite each containing multiple HIGH findings. Without it, Fix 1 could still be undermined by reviews that secretly pass auto-accept.

**Independent test**: Feed the `_ACTIONABLE_FINDING_RE` function a set of real reviewer outputs from run 033 and assert it returns `True` for each. Separately feed prose that merely mentions "HIGH" in passing and assert `False`.

**Acceptance scenarios**:

1. **Given** a review body containing `1. **HIGH**: missing index on the foo table`, **when** `detect_actionable_findings` runs, **then** it returns `True`.
2. **Given** a review body containing `### HIGH: missing index`, **when** `detect_actionable_findings` runs, **then** it returns `True`.
3. **Given** a review body containing `**HIGH [CODE-CONFIRMED]**: duplicate key handling broken`, **when** `detect_actionable_findings` runs, **then** it returns `True`.
4. **Given** a review body containing `Severity: HIGH` on its own line, **when** `detect_actionable_findings` runs, **then** it returns `True`.
5. **Given** a review body that discusses "this would be a HIGH severity issue in production systems" in prose, **when** `detect_actionable_findings` runs, **then** it returns `False` (no false-positive on narrative mentions).
6. **Given** all four existing positive patterns (`- high:`, `- [tag] high:`, `| **HIGH** |`, `| **CRITICAL** |`), **when** `detect_actionable_findings` runs, **then** it still returns `True` (no regression).

### US3 — Invariant self-check surfaces state contradictions (Priority: P2)

**As** the orchestrator
**I need** the runner to flag state contradictions after every state-mutating command
**So that** I notice future variants of the run-033 trap immediately instead of after hours of debugging.

**Why P2**: Fix 1 closes the specific contradiction that occurred. Fix 8 is the guardrail that catches *unknown* future contradictions. Lower priority than Fixes 1/2 because it only matters for regressions; higher than a "nice to have" because it costs little and earns trust in the workflow.

**Independent test**: Artificially set `stages.spec.judge_next_action = "advance"` AND leave `stages.spec.healthy = false` (without applying Fix 1). Run `auto-reconcile`. Assert the self-check logs a WARN to `state.invariant_warnings[]` AND prints the contradiction message to stderr.

**Acceptance scenarios**:

1. **Given** `judge_next_action == "advance"` and `recommended_next_action == "repair_<same stage>_checkpoint"`, **when** any state-mutating command completes, **then** `state.invariant_warnings` receives a new entry `{at, command, stage, detail}` AND a `⚠ state contradiction detected: ...` message is printed to stderr (always, not conditionally — see FR-009).
2. **Given** the state is internally consistent, **when** a state-mutating command completes, **then** no WARN is logged and no contradiction message prints.
3. **Given** a self-check WARN was logged, **when** `status --slug <slug>` runs, **then** the warning appears in the human-readable status output.

## Functional requirements

### Fix 1 — Judge verdict is honored

- **FR-001**: `factory_next_action.recommended_next_action(slug, state, stages, reconciliation_ok) -> str` MUST gate each `not stages[stage].healthy` branch with a preceding `if stages[stage].get("judge_next_action") == "advance": pass-through` check. When the advance bit is set for a stage, the function MUST NOT return `repair_<stage>_checkpoint`; instead it falls through to the next stage's artifact-presence check, returning that stage's action (`author_plan`, `author_tasks`, etc.). No new helper function is introduced — the advance-gate is an inline `if` before each existing branch. The signature and existing branches are defined in [factory_next_action.py:76-143](../../operations/codex-skills/feature-factory/scripts/factory_next_action.py); `reconciliation_ok` is obtained via `factory_stages.reconciliation_state(slug)`.
- **FR-001a** *(added in reconcile: addresses Codex feasibility HIGH)*: In [factory_cmd_judge.py:875-899](../../operations/codex-skills/feature-factory/scripts/factory_cmd_judge.py), `stage_state["judge_next_action"]` MUST be written BEFORE `recommended_next_action` is called, in both the advance-with-concerns (line 880) and clean-advance (line 895) branches. Without this reorder, the judge command itself emits a stale `last_action_result.next` and a wrong banner on the same run that wrote the advance verdict — the root-cause fix is incomplete if only `factory_next_action.py` is patched.
- **FR-002**: When `judge_next_action == "advance"` and the current artifact SHA differs from the manifest SHA, the runner MUST reseal the manifest to the current SHA and append a drift record to `stages.<stage>.annotations[]` with shape `{type: "advance-with-drift", old_sha, new_sha, at: <epoch>, reason: <str>}`. This reseal happens lazily the next time the advance is taken (not eagerly at judge-write time). The `reason` field defaults to `"post-judge-edits-only"` and is accepted as a limitation of the audit trail (see Risk R2).
- **FR-003**: The `unresolved_concerns` schema MUST be extended so each entry carries `id` (stable concern identifier), `addressed_at` (nullable epoch), `addressed_by` (nullable string — commit SHA or annotation id), `deferred_reason` (nullable string), and `dismissed_reason` (nullable string — for invalid findings). Existing fields (`stage`, `judge`, `model`, `confidence`, `reasoning`, `round_raised`, `also_raised_in_round`) are preserved. **ID derivation**: `id = sha256(stage|judge|round_raised|<first-48-chars-of-reasoning-stripped-of-whitespace>)[:12]`. This is stable under minor paraphrasing at the end of reasoning but NOT under heavy rewording — acknowledged limitation (see Risk R5).
- **FR-004**: The next stage's `checkpoint` command MUST verify every unresolved concern from the prior stage is either `addressed` (has a non-null `addressed_at`), `deferred` (has a non-null `deferred_reason`), or `dismissed` (has a non-null `dismissed_reason`). Only these three state-bearing fields count — `addressed_by` is evidence attached to `addressed_at`, not a closure signal on its own. Annotations are for display only, not closure. If any concern is open, checkpoint MUST return `blocked: unresolved-concerns-from-<prior-stage>` and name the open concern ids. New flags: `checkpoint --address <concern-id> --evidence <text>`, `checkpoint --defer <concern-id> --reason <text>`, and `checkpoint --dismiss <concern-id> --reason <text>`.
- **FR-005**: Discovery + adversarial reviewer prompts are NOT changed. Reviewers and judges continue to produce concerns as they do today. Only the downstream carry-forward and verification behavior changes.
- **FR-005a** *(added in reconcile: addresses Codex feasibility MEDIUM; tightened in round 2)*: [factory_pr_body.py:32-45](../../operations/codex-skills/feature-factory/scripts/factory_pr_body.py) MUST filter `unresolved_concerns` entries so only those with `addressed_at == None AND deferred_reason == None AND dismissed_reason == None` render in the "unresolved judge concerns" block. **`addressed_by` alone is evidence, not resolution** — the state-bearing fields match the FR-004 gate exactly, so PR body and checkpoint gate agree. Addressed/deferred/dismissed concerns render in a separate "resolved concerns" block with the resolution text. The open-concerns block MUST print the `id` field so operators can use `checkpoint --address/--defer/--dismiss <id>` without opening state.json.
- **FR-005b** *(added in spec round 4 — built-in "Findings Pushed Aside" summary for human reviewers)*: [factory_pr_body.render_findings_pushed_aside_block](../../operations/codex-skills/feature-factory/scripts/factory_pr_body.py) MUST produce a plain-language PR-body section titled `## Findings Pushed Aside` for every feature the Factory ships. The section lists all concerns with `deferred_reason` or `dismissed_reason` set, in stage order (spec → plan → tasks → diff → closeout). Each entry renders as a heading plus three bullets: **What was flagged**, **Why it was deferred/dismissed**, and **Round raised**. The section MUST appear BEFORE the full "Resolved Concerns" dump so a human reviewer sees the compromises first. When a concern has no reason text (empty `deferred_reason` or `dismissed_reason`), the summary MUST print `(no reason provided — operator should add one)` so the gap is visible rather than hidden. Rationale: without this built-in summary, humans merging PRs can only see pushed-aside HIGH findings by reading state.json directly.

### Fix 2 — Broaden severity detection

- **FR-006**: `_ACTIONABLE_FINDING_RE` in `factory_review_specs.py` MUST match all of the following shapes, anchored to start-of-line (after optional whitespace):
  - existing: `- high:`, `- [tag] high:`, `| **HIGH** |`, `| **CRITICAL** |`
  - new: bullet-list with bold severity and bracketed tag — `- **(HIGH|CRITICAL|MEDIUM)[...]**:` or `- (HIGH|CRITICAL|MEDIUM) [<TAG>]:` (covers `- HIGH [CODE-CONFIRMED]:` style).
  - new: `<digits>. **(HIGH|CRITICAL|MEDIUM)** :?` (numbered list, bold severity)
  - new: `#+ \s*(HIGH|CRITICAL|MEDIUM)\b` (heading with severity word)
  - new: bold-prefix with closing bold tag — `**(HIGH|CRITICAL|MEDIUM)(\s|\*\*|\[|:)` — explicitly covers `**HIGH**:`, `**HIGH [CODE-CONFIRMED]**:`, and `**HIGH**` + space.
  - new: `Severity: \s*(HIGH|CRITICAL|MEDIUM)\b` (inline severity field)
  - new: nested under `### N. <title>` — paragraph that begins with `**Severity**: (HIGH|CRITICAL|MEDIUM)` (the Gemini review style).
- **FR-007**: The regex MUST NOT match prose mentions of severity words embedded in sentences (e.g., `"this would be HIGH severity"`). Structural anchoring (start-of-line, punctuation/whitespace immediately after) is the mechanism.
- **FR-008**: A property-style unit test MUST cover: (a) each positive shape above using actual examples harvested from `docs/workflow/feature-runs/ff-runner-fixes/reviews/spec.*.review.md` (the reviews of this very spec), (b) negative prose cases, (c) every existing pattern that already matches — regression coverage.

### Fix 8 — Invariant self-check

- **FR-009**: A new helper `factory_invariants.run_invariant_checks(state, command, recommended, invariants=None) -> list[dict]` (in a NEW module `factory_invariants.py`, sibling of `factory_state.py`) MUST run after every state-mutating command (`checkpoint`, `judge`, `reconcile`, `auto-reconcile`, `implement`, `deliver`, `block`, `repair`, `closeout`, `discover`, `parallel`). On contradiction it MUST append to `state.invariant_warnings[]` with shape `{at: <epoch>, command: <str>, stage: <str>, detail: <str>}` AND emit a single-line `⚠ state contradiction detected: <detail> — see docs/workflow/plans/feature-factory-runner-fixes.md` message. **Emission rule (revised in spec review round 2 per Gemini requirements-adversarial MEDIUM #3): always stderr**, so machine-readable stdout is never contaminated and automated tooling has a consistent place to look for warnings. Interactive operators still see stderr on their terminal. The command itself MUST NOT abort.
- **FR-010**: The initial invariant is: IF `stages.<stage>.judge_next_action == "advance"` AND `recommended_next_action(...)` is `repair_<any stage>_checkpoint` where `<any stage>` refers to THIS stage (the one carrying the advance verdict) THEN flag. This is broader than the literal run-033 symptom and catches future variants of the same class (e.g., `repair_spec_checkpoint` when spec carries advance, even if the concrete string form changes later).
- **FR-011**: `status --slug <slug>` output MUST include an `invariant-warnings:` section listing any entries in `state.invariant_warnings[]` (showing at most the last 5, with a count if more).
- **FR-011a** *(added in reconcile: addresses Codex edge-cases residual; extended in round-3 judge completeness)*: When older state.json snapshots lack `invariant_warnings` or lack the extended concern fields, the state loader MUST default-fill `invariant_warnings = []` and treat missing concern fields as `None`. **AND** the loader MUST backfill the stable `id` field for any existing `unresolved_concerns` entry that lacks one (using the FR-003 formula). No explicit migration script is required; both defaulting and id-backfill happen on read, so in-flight runs (including the run-033 fixture) transparently gain the new fields.
- **FR-011b** *(added in spec review round 2 — addresses Codex edge-cases MEDIUM #2)*: `_run_post_invariants` in `run_factory.py` MUST compute `recommended_next_action` using the same `reconciliation_state()` signal as `status` and `command_checkpoint`, so the contradiction detector evaluates the user-visible next-action string. Hardcoding `recon_ok=True` would let the invariant miss contradictions that surface only when reconciliation is blocked.

### Shared

- **FR-012**: No change to CLAUDE.md, AGENTS.md, cloud/CLAUDE.md, cloud/AGENTS.md, MEMORY.md, .gitignore, `sync-codex-skills.py`, or any file under `docs/workflow/operations/codex-skills/review-lens/`.
- **FR-013**: No change to reviewer or judge prompts.
- **FR-014**: All preflight checks (lint, test, build for the runner's Python module) MUST pass before PR creation. The runner has its own test suite under `docs/workflow/operations/codex-skills/feature-factory/scripts/tests/`.

## Success criteria

- **SC-001**: Replaying the run-033 `state.json` fixture with the new decision tree returns `author_plan` instead of `repair_spec_checkpoint`. (Binary pass/fail regression.)
- **SC-002**: The regex test matrix passes — every documented positive shape returns `True`, every negative prose case returns `False`, zero regressions on the existing four shapes.
- **SC-003**: An induced contradiction (manually set `judge_next_action == "advance"` + unhealthy stage) triggers a WARN in `state.invariant_warnings[]` and prints the contradiction message exactly once per command.
- **SC-004**: Running the full runner test suite after the changes shows no regression in any test that passed before.
- **SC-005**: The follow-up (Fix 1) verification for `unresolved_concerns`: a plan checkpoint against a spec whose judges left 1 concern MUST block until either `checkpoint --address <id> --evidence "<text>"` or `checkpoint --defer <id> --reason "<text>"` is invoked.
- **SC-006**: PR diff is under ~500 lines added (excluding test fixtures and tests). If the diff exceeds this, tasks.md MUST split implementation across `[CHECKPOINT]` boundaries.

## Edge cases

- **What if `unresolved_concerns` is empty?** → Next-stage checkpoint proceeds normally; no verification to perform.
- **What if two adjacent stages both produce concerns?** → Each stage's concerns are stored on that stage; the next stage verifies only the immediately-prior stage's list. Tasks → diff handoff applies the same rule.
- **What if the same concern is raised in rounds 2 and 3?** → Existing `also_raised_in_round` field already handles dedup. No new behavior.
- **What if the orchestrator addresses a concern with `--address` but never commits the supporting edit?** → `addressed_by` stores whatever evidence string was provided (commit SHA, annotation id, free text). Truth verification is out of scope for this feature.
- **What if Fix 1 is applied but `judge_next_action == "advance"` was never set (stub state)?** → The new check falls through to existing `stages.<stage>.healthy` logic; behavior is unchanged for pre-judge states.
- **What if a reviewer's finding format changes again in the future?** → Fix 2 adds a `factory_review_specs.ACTIONABLE_FINDING_SHAPES` manifest comment documenting each supported shape and a test that flags additions, so changes are visible in code review.
- **What if `state.invariant_warnings[]` grows large over a long feature run?** → `status` shows last 5 with count. No automatic pruning; that is follow-up scope.
- **What if `run_invariant_checks` itself throws?** → Caught, logged, and the command proceeds. Invariant failure must not itself break the runner.

## Assumptions carried in

1. Scope is Fixes 1, 2, 8 only. Fixes 3, 4, 5, 6, 7 are explicitly deferred.
2. `unresolved_concerns` field already exists in state schema (confirmed via `factory_state.py:200`, `factory_cmd_judge.py:78`, `factory_cmd_checkpoint.py:94`). We extend it, not create it.
3. Fix 1 reseals the manifest at advance time rather than at judge-vote time to avoid racing with orchestrator edits between judge completion and advance acceptance.
4. Fix 2 uses structural anchoring (`^\s*` + punctuation/whitespace boundary) rather than a permissive "contains HIGH" match. Prose false-positives are the main risk.
5. Fix 8 is a soft warning, not a hard stop — the runner continues after logging. The operator decides whether to halt.
6. Run 033's `state.json` snapshot will be committed to `docs/workflow/operations/codex-skills/feature-factory/scripts/tests/fixtures/run-033-snapshot.json` as task 0 of `tasks.md`.
7. The three fixes **interact at runtime** through state.json fields: Fix 8's invariant reads `judge_next_action` (written by the judge and honored by Fix 1's decision tree) and `recommended_next_action` (computed by Fix 1). Fix 2's regex affects which reviews go through auto-reconcile, which affects the reconciliation state that Fix 8 reads. The fixes are independently mergeable in principle but share integration surface — the tests in this PR exercise the integration on the run-033 fixture (corrected in spec review round 2 per Gemini LOW #4).
8. Preflight (`pytest` on the runner module) is the required gate; no broader `cloud/` preflight applies because this feature touches only `docs/workflow/operations/codex-skills/feature-factory/scripts/`.

## Non-goals

1. Rename `repair_X_checkpoint` → `run_X_checkpoint` (plan Fix 4) — deferred.
2. Add `--force-advance` / `advance` CLI subcommand (plan Fix 3) — deferred.
3. `--validation-only` flag past 3-round adversarial cap (plan Fix 5) — deferred.
4. Garbage-collect stale review intermediates (plan Fix 6) — deferred.
5. Raise default character budgets (plan Fix 7) — deferred.
6. Any change to product code under `cloud/`, to the GraphQL schema, to worker code, or to the scheduler.
7. Any change to reviewer or judge prompts.

## Residual risks (with verification)

- **Risk R1**: Fix 2's broadened regex false-positives on a future review that quotes another finding's bold-prefix header in prose.
  **verification:** test matrix includes a "quoted finding" negative case; if a real-world review regresses, the `_ACTIONABLE_FINDING_RE` change isolates the fix to one function.
- **Risk R2**: Fix 1's manifest reseal loses the link between the original adversarial review SHAs and the final advance SHA.
  **verification:** the `annotations[]` drift record preserves `old_sha` and `new_sha`; a reviewer can diff them post-facto. If drift is large, the `judge panel exhausted; advancing with unresolved concerns` log already captures intent.
- **Risk R3**: `unresolved_concerns` verification at next-stage checkpoint blocks feature runs that have no natural mechanism to address spec-level concerns during plan authoring.
  **verification:** explicit `checkpoint --defer <id> --reason` escape hatch. Run 033 replay test ensures the deferral path completes without forcing address-every-concern.
- **Risk R4**: Fix 8 always prints to stderr (revised in spec review round 2). Operators who pipe stderr to /dev/null will miss warnings in that pipeline run.
  **verification:** `status` surfaces invariant_warnings as a first-class section, so warnings are always discoverable via status regardless of how the mutating command's streams were routed. Tests assert exit code is unchanged by the invariant check.
- **Risk R5**: Concern ID derivation (`sha256(stage|judge|round_raised|first-48-chars-reasoning)[:12]`) is not stable under heavy paraphrasing of the reasoning. If judges reword a concern substantially between rounds, one concern could appear as two IDs, undermining the addressed/deferred lifecycle.
  **verification:** the `also_raised_in_round` field already tracks cross-round similarity by embeddings. A follow-up feature can replace the stable-prefix-hash ID with an embedding-cluster ID once the lifecycle is in use. For this feature, the limitation is accepted because round-1 and round-2 reasoning tend to be similar in practice.
- **Risk R6**: The new `dismissed_reason` lifecycle (FR-004) may be misused — orchestrators could habitually dismiss concerns instead of addressing them.
  **verification:** the "resolved concerns" block in the PR body (FR-005a) surfaces every addressed/deferred/dismissed concern with its resolution text, making the pattern visible in PR review. A metric on dismiss-rate could be added as a follow-up monitoring feature.

- **Risk R7** *(flagged in spec round 2 / round 3 by Gemini requirements-adversarial)*: The broadened regex is format-bound — we're in a review-format arms race. Every new reviewer style requires a regex update and a test fixture. A durable fix would require reviewer prompts to emit structured output (JSON findings), so `auto-reconcile` reads fields instead of parsing markdown.
  **verification:** accepted as a known architectural limitation; out of scope for this feature since it would require changes to reviewer prompts (explicitly out-of-scope per FR-013). Documented here so the next regression adds to the backlog pressure for a structured-output migration. The factory_review_specs.ACTIONABLE_FINDING_SHAPES manifest + test coverage mitigates near-term impact.

# FF Quality-of-Life — Spec

**Feature branch**: `claude/ff-quality-of-life`
**Slug**: `ff-quality-of-life`
**Created**: 2026-04-24
**Status**: Draft spec (discovery complete)
**Supporting context**: Follow-up to PR #744 + PR #749 (both merged). Addresses 4 polish items that don't fit in Feature A (safety net) or Feature C (concern IDs).

## Summary

Four small runner improvements that reduce operator friction:

1. **Raise default character budgets** (plan Fix 7) — current defaults force partial-coverage retries on normal-sized specs. Raise to `--max-artifact-chars 40000`, `--max-context-chars 50000`, `--max-total-chars 200000`.
2. **`checkpoint --validation-only`** (plan Fix 5) — past the 3-round adversarial cap, an operator editing an artifact to address judge-flagged issues has no CLI path to re-seal the manifest without dispatching expensive reviews. Add a no-review validation-only mode that just re-verifies the manifest against the current artifact SHA.
3. **Restatement judge gameability** (PR #744 adversarial P2-6) — the current "diminishing returns" rule counts severity transitions. A bad-faith operator could file HIGH findings in round 1 and downgrade to MEDIUM in round 2 to trigger proceed. Harden the prompt to require quoting prior-round reasoning text when citing severity drop.
4. **Discover CLI append semantics** (PR #744 + PR #749 postmortems) — passing `--non-goal X --non-goal Y` in one invocation currently keeps only `Y`. Change to append semantics; add explicit `--clear-non-goals` / `--clear-acceptance-criteria` flags for destructive cases.

All four land in the runner's existing modules. Together they remove four distinct friction points that operators have actually hit (the last two showed up in this very feature's own discovery phase).

## Problem statement

### Fix 1 — Char budget churn

[factory_review_specs.py](../../operations/codex-skills/feature-factory/scripts/factory_review_specs.py) and related modules default to conservative character budgets. During both PR #744 and PR #749 runs, the operator had to pass explicit `--max-artifact-chars 50000 --max-total-chars 250000` to avoid "artifact too large for partial coverage" failures on normal-sized specs. The defaults are set too low for real-world artifacts in this codebase.

### Fix 2 — Re-seal after post-cap edits

Once `adversarial_rounds >= 3`, further `checkpoint --stage X` runs are blocked by the cap — correctly, since we don't want to launch round 4 of adversarial review. But if the operator edits the artifact after the cap (to address a judge-flagged issue), there's no CLI path to re-sync the manifest SHA without bypassing the workflow. Today the operator hand-edits review frontmatter SHAs. We did that during PR #744 and #749 finalization. The correct answer is a `--validation-only` mode: skip review dispatch, just re-verify the manifest is consistent with the current artifact.

### Fix 3 — Restatement judge severity-drop gaming

PR #744's adversarial review raised this (finding P2-6). The restatement judge's "diminishing-returns" rule says: if prior rounds had HIGH and this round has only MEDIUM/LOW, proceed — the loop is converging. But a prompt-aware operator could:
- Round 1: inject HIGH finding X with dubious justification
- Round 2: reviewer mentions X but classifies it MEDIUM
- Restatement judge: "severity dropped HIGH→MEDIUM, proceed"
- Real HIGH issue ships undetected

The fix is to make the severity-drop claim have *evidence*: the judge must quote prior-round reasoning text and name the specific finding whose severity allegedly dropped. That makes gaming much harder — to bypass, you'd need to create a fake round-1 HIGH that the judge can then quote as "now-dropped-to-MEDIUM" with text.

### Fix 4 — Discover CLI silent-overwrite footgun

Both PR #744 and PR #749's discovery phases hit the same footgun: passing multiple `--non-goal` or `--acceptance-criteria` flags in one invocation silently keeps only the last value. I scripted a for-loop workaround both times. The fix is append semantics by default, with explicit `--clear-non-goals` / `--clear-acceptance-criteria` flags for the rare destructive case.

## Scope

### In scope

- **Fix 1** — raise default char budgets in `factory_cmd_checkpoint.py` argparse defaults for `--max-artifact-chars`, `--max-context-chars`, `--max-total-chars`.
- **Fix 2** — add `--validation-only` flag to `checkpoint` subcommand. When set, skip reviewer dispatch entirely, just re-verify the manifest against the current artifact SHA. If drift, re-seal the manifest (updates stored SHAs to match current artifact). Exits 0 on success, 2 on error.
- **Fix 3** — update `judge-prompts/restatement.md` to require quoting prior-round reasoning when citing severity drop.
- **Fix 4** — in `factory_cmd_discover.py`, change `--non-goal` and `--acceptance-criteria` from `store` to `append` action. Add `--clear-non-goals` / `--clear-acceptance-criteria` flags.
- **Tests** for all four behaviors.

### Out of scope

- Completeness judge veto (Feature A — shipped).
- Auto-register mutating commands (Feature A — shipped).
- Review intermediate GC (Feature A — shipped).
- Embedding concern IDs (Feature C — deferred).
- Rename `repair_X_checkpoint` (skipped).
- `--force-advance` CLI (subsumed).
- Structured JSON reviewer output (larger project).

## User stories

### US1 — Char budgets match real specs (Priority: P2)

**As** the orchestrator running a checkpoint
**I need** the default char budgets to match real-world spec sizes in this codebase
**So that** I don't have to pass explicit `--max-*-chars` flags on every invocation.

**Why P2**: quality of life, not correctness. Operators who know the flags can already opt out. But the defaults cause first-time-user friction and retry churn.

**Independent test**: invoke `checkpoint --stage spec` with no `--max-*-chars` flags against a fixture with a 30k-char spec. Assert no partial-coverage warning. Assert the 3 values stored in the checkpoint manifest are the new defaults.

**Acceptance scenarios**:

1. **Given** a spec.md of 35k chars, **when** `checkpoint --stage spec` runs with no budget flags, **then** no partial-coverage retry happens.
2. **Given** an operator explicitly passes `--max-artifact-chars 10000`, **when** checkpoint runs, **then** the operator's value wins (defaults don't override explicit flags).

### US2 — Re-seal after post-cap edits (Priority: P1)

**As** the orchestrator dealing with judge-flagged issues past the 3-round cap
**I need** a `checkpoint --validation-only` mode that re-verifies the manifest without re-dispatching reviewers
**So that** I can re-sync after an edit without burning agent calls or hand-editing review frontmatter SHAs.

**Why P1**: this is the fix for a friction class that hit both PR #744 and PR #749 during their own runs. Hand-editing review frontmatter SHAs is exactly the kind of workflow bypass that Fix 1 in PR #744 was trying to eliminate.

**Independent test**: produce a stage state with 3 adversarial rounds complete + an edited artifact (SHA drifted from manifest). Run `checkpoint --stage spec --validation-only`. Assert no subprocess calls to Codex or Gemini. Assert manifest + review frontmatter SHAs are updated to match current artifact. Exit 0.

**Acceptance scenarios**:

1. **Given** `adversarial_rounds == 3` and artifact SHA drifted from manifest, **when** `checkpoint --stage spec --validation-only` runs, **then** no reviewer is dispatched, manifest and review SHAs are updated, exit code is 0.
2. **Given** same state but `--validation-only` is NOT passed, **when** checkpoint runs, **then** behavior is unchanged (blocked by 3-round cap or triggers repair path, whichever applies today).
3. **Given** the artifact SHA matches the manifest already (no drift), **when** `--validation-only` runs, **then** exit 0, no-op, zero writes to review files.
4. **Given** manifest file doesn't exist, **when** `--validation-only` runs, **then** exit 2 with "no manifest to validate".

### US3 — Restatement judge severity-drop requires evidence (Priority: P2)

**As** an operator trusting the judge panel
**I need** the restatement judge to only proceed on severity-drop when it can quote specific prior-round reasoning
**So that** the "diminishing returns" rule can't be gamed by injecting fake HIGH findings early.

**Why P2**: low-probability attack, but the mitigation is almost free (prompt text change). Hardens a known soft spot from PR #744 adversarial review.

**Independent test**: mock a restatement-judge call with verdict reasoning that cites severity drop but does NOT quote any prior-round text. Assert the judge schema validation fails the verdict (or the reasoning is flagged as non-conforming — the exact enforcement mechanism is prompt-level).

**Acceptance scenarios**:

1. **Given** the restatement-judge prompt is updated, **when** a judge run cites severity drop, **then** its reasoning contains at least one quoted block from a prior-round reviewer finding or prior-round judge verdict.
2. **Given** the prompt change does not alter the first-round-proceed-with-annotation rule from PR #744, **when** running judge round 1 (no prior rounds), **then** verdict remains `proceed-with-annotation`.
3. **Given** the prompt change does not alter the true-saturation rule, **when** 70%+ of latest findings are literal restatements, **then** verdict remains `proceed`.

### US4 — Discover CLI accepts multiple values (Priority: P2)

**As** an operator or an agent running discovery
**I need** `discover --non-goal X --non-goal Y --non-goal Z` in one invocation to store all three values
**So that** I don't have to script a for-loop or remember to pass flags one at a time.

**Why P2**: quality of life. Agents (including this feature's own orchestrator) repeatedly hit this — two consecutive features had to work around it. Fix is ~5 lines.

**Independent test**: invoke `discover --non-goal X --non-goal Y --non-goal Z` on a fresh workflow. Assert `state.discovery.non_goals == ["X", "Y", "Z"]` (order preserved, all present).

**Acceptance scenarios**:

1. **Given** no prior non-goals, **when** `discover --non-goal A --non-goal B` runs, **then** `state.discovery.non_goals == ["A", "B"]`.
2. **Given** existing non-goals `["A"]`, **when** `discover --non-goal B --non-goal C` runs, **then** `state.discovery.non_goals == ["A", "B", "C"]` (append semantics preserved).
3. **Given** existing non-goals `["A", "B", "C"]`, **when** `discover --clear-non-goals` runs, **then** `state.discovery.non_goals == []`.
4. **Given** `discover --clear-non-goals --non-goal D` in one invocation, **when** it runs, **then** `state.discovery.non_goals == ["D"]` (clear happens first, then append).
5. **Same semantics** for `--acceptance-criteria` / `--clear-acceptance-criteria`.

## Functional requirements

### Fix 1 — Raise default char budgets (US1)

- **FR-001**: In `factory_cmd_checkpoint.py` argparse setup for the `checkpoint` subcommand, change defaults to `--max-artifact-chars 40000`, `--max-context-chars 50000`, `--max-total-chars 200000`.
- **FR-002**: Operator-passed explicit values MUST still override the defaults (no change to precedence).
- **FR-003**: Existing tests using smaller budgets MUST continue to pass (they pass explicit values, not defaults).

### Fix 2 — `--validation-only` flag (US2)

- **FR-004**: Add `--validation-only` to the `checkpoint` subcommand. Mutually exclusive with `--fallback` (reviewer replacement) — validation-only is purely a manifest-sync path.
- **FR-005**: When `--validation-only` is set, `command_checkpoint` MUST:
  - NOT dispatch any reviewer (no `codex exec`, no `gemini` subprocess).
  - Load the stage's checkpoint manifest (`reviews/{stage}.checkpoint.json`).
  - Compute the current artifact SHA via `workflow_utils.normalized_artifact_hash`.
  - If SHAs match: print `manifest already matches artifact (sha={sha})`, exit 0.
  - If SHAs differ: rewrite the manifest's `artifact_sha256` field AND update each referenced `.review.md` file's frontmatter `artifact_sha256` field to match. Print `manifest re-sealed from {old} to {new}`. Exit 0.
  - If manifest doesn't exist: print `no manifest to validate — run checkpoint first`, exit 2.
- **FR-006**: `--validation-only` MUST NOT bypass the lifecycle-concern gate from PR #749 — if prior-stage open concerns exist, deliver/next-checkpoint still blocks. This is a manifest-sync tool, not a workflow bypass.
- **FR-007**: An annotation MUST be appended to `stages[stage].annotations[]` with type `"validation-only-reseal"` recording `{old_sha, new_sha, at: <epoch>}` when a reseal happens.

### Fix 3 — Restatement judge severity-drop evidence (US3)

- **FR-008**: Update `judge-prompts/restatement.md` to add a requirement under the diminishing-returns rule: "When citing severity drop as proceed justification, the verdict reasoning MUST quote at least one specific finding from prior rounds by its original reasoning text (first 60+ characters verbatim). If you cannot quote a prior round's text, severity-drop reasoning is not valid — vote based on other rules."
- **FR-009**: The first-round-proceed-with-annotation rule from PR #744 MUST be preserved unchanged.
- **FR-010**: The true-saturation rule (70%+ restatements → proceed) MUST be preserved unchanged.
- **FR-011**: No schema change — the enforcement is prompt-level. A follow-up could add a structured `quoted_prior_finding: str` field, but this feature keeps scope minimal.

### Fix 4 — Discover CLI append semantics (US4)

- **FR-012**: In `factory_cmd_discover.py` argparse setup, change `--non-goal` and `--acceptance-criteria` from `action="store"` to `action="append"` (or equivalent — match existing codebase patterns). Each flag occurrence appends to an internal list.
- **FR-013**: When `discover` runs, for each value in the appended list: add it to `state.discovery.non_goals` (or `acceptance_criteria`) if not already present (dedup by exact string match). Order preserved.
- **FR-014**: Add new flags `--clear-non-goals` and `--clear-acceptance-criteria` (boolean). When set, the corresponding list is emptied BEFORE any append operations in the same invocation. This lets `discover --clear-non-goals --non-goal D` produce `["D"]`.
- **FR-015**: No other discovery flags change behavior. `--assumption`, `--unresolved`, `--resolve`, `--defer`, `--answer`, `--question`, etc. keep their current semantics.

### Shared

- **FR-016**: All 183 existing runner tests MUST continue to pass. Target total: ~200.
- **FR-017**: No change to CLAUDE.md, AGENTS.md, cloud/CLAUDE.md, cloud/AGENTS.md, MEMORY.md, .gitignore, or any file outside the scripts/judge-prompts directories.

## Success criteria

- **SC-001**: A fresh checkpoint invocation with no `--max-*-chars` flags uses 40k/50k/200k and doesn't trigger partial-coverage retry on a 35k-char spec.
- **SC-002**: `checkpoint --stage spec --validation-only` on a drifted artifact re-seals the manifest + review frontmatter SHAs without any subprocess calls (verified via mock assertion).
- **SC-003**: `--validation-only` on a matching-SHA artifact is a no-op.
- **SC-004**: Restatement judge prompt contains the quote-evidence requirement; first-round + true-saturation rules preserved.
- **SC-005**: `discover --non-goal A --non-goal B --non-goal C` in one invocation stores all 3 in order.
- **SC-006**: `discover --clear-non-goals --non-goal D` produces `["D"]`.
- **SC-007**: All 183 existing tests + 3 new test files green; target ~200 total.

## Edge cases

- **Char budgets**: if a spec is genuinely larger than 40k (rare), explicit `--max-artifact-chars` still works. No regression.
- **`--validation-only` on first-ever checkpoint**: no manifest exists → exit 2 with clear message.
- **`--validation-only` with `--fallback`**: mutually exclusive argparse error.
- **`--validation-only` with `--address`/`--defer`/`--dismiss`**: those are concern-lifecycle flags; they're unchanged by this feature. If combined, the concern-lifecycle path runs (earlier in command_checkpoint) and `--validation-only` becomes a no-op.
- **Restatement prompt rollback**: if a reviewer's output format drifts and can't be quoted, judge falls through to other rules — doesn't break.
- **`discover` append + dedup**: `discover --non-goal A --non-goal A` once stores just `["A"]`, not `["A", "A"]`. Dedup is an explicit design choice per FR-013.

## Assumptions carried in

1. Scope is Fix 1+2+3+4 only — no scope creep.
2. Char budget defaults 40k/50k/200k match actual observed spec/plan sizes in this codebase.
3. `--validation-only` is a pure manifest-sync tool, not a workflow bypass — lifecycle gates still apply.
4. Restatement judge severity-drop enforcement is prompt-level (no schema change). A structured field is a potential follow-up.
5. Discover CLI uses argparse `action="append"` pattern, which matches existing Python idioms for repeated flags.
6. Codex implements slices after spec/plan/tasks checkpoints healthy. Claude is orchestrator only.

## Non-goals

See discovery state — 7 deferred items.

## Residual risks (with verification)

- **Risk R1** — char budget raise causes unexpected OOM or rate-limit issues on very small hardware.
  **verification:** existing tests mostly use explicit small budgets and are unaffected. Production runs against full-size specs can hit larger budgets anyway; defaults just prevent retry churn. If rate limits become an issue, operators can lower via flags.

- **Risk R2** — `--validation-only` becomes a "quiet bypass" that operators use to skip reviews.
  **verification:** doesn't skip the concern-lifecycle gate (FR-006). And the manifest-reseal annotation (FR-007) makes its use visible in the audit trail. Not a bypass, a sync tool.

- **Risk R3** — restatement prompt gets overly strict and fails legitimate rounds.
  **verification:** the quote rule is specifically scoped to severity-drop proceed justification. Other proceed paths (first-round, true-saturation) don't require quotes. If legitimate cases fail, they fall through to other rules.

- **Risk R4** — append semantics break a caller that depended on overwrite behavior.
  **verification:** nothing in the codebase relies on overwrite (confirmed by the fact that both feature runs before this one had to script for-loops to get append behavior). The explicit `--clear-*-goals` flags cover the intentional-destructive case.

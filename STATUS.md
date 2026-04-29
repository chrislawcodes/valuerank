# ValueRank — Project Dashboard

> **How to use:** Review this at the start of every session. Ask Claude to update it at the end.

---

## Goals Overview

| Goal | Status | Deadline |
|------|--------|----------|
| [System Validity](#goal-system-validity) | 🔴 Blocking | Pre-AAPOR |
| [AAPOR Conference](#goal-aapor-conference) | 🟡 In progress | May 11, 2026 |
| [Feature Factory](#goal-feature-factory) | 🟡 In progress | Ongoing |
| [Vignette Cleanup](#goal-vignette-cleanup) | 🟡 In progress | — |

> **Scale and Analysis are blocked until System Validity is resolved.**

---

## Goal: System Validity

**Theme:** We keep finding correctness issues. The system is not yet producing results we trust enough to scale or present. All threads below must be resolved before we run at scale.

### Active Bugs / Fixes

| Feature | Branch | Status | What's Wrong |
|---------|--------|--------|--------------|
| **domain-coverage-completeness-guard** | `030-remove-legacy-decision-code` | 🟡 In progress | Plan/tasks are green. Shared completeness plumbing, coverage-query helpers, UI helper splits, and the read-only audit script are in place; diff checkpoint and rebase are next. |
| **domain-analysis-definition-snapshot-crash** | — | 🟡 Ready | Default-temperature domain analysis can crash in Prisma when transcripts contain unreadable `definitionSnapshot` data. Local API fix is ready: domain analysis now uses the pre-resolved value pair instead of reading transcript snapshots. Prod data cleanup still needs direct SQL access to find and null the bad snapshots. |
| **domain-shifts-snapshot-selection** | `codex/national-priorities-snapshot` | 🟡 In review | Domain Shifts can show `n/a` when the models report lands on incomplete or stale domain snapshots. Production confirms Job Choice `vnewt0` has only 6 Claude Sonnet 4.5 value entries while `vnewtd` has all 10, and `National Priorities` has a CURRENT `vnewtd` snapshot with `coveredDefinitions = 0` despite 180 completed default-temperature runs. Follow-up API fix supersedes stale CURRENT snapshots before writing replacements so manual or background refreshes can actually replace empty rows. |
| **transcript-resummarization-backfill** | — | 🟡 Ready | Script written (`cloud/scripts/backfill-resummarize-existing-transcripts.ts`) but no PR yet — needs review and merge |
| **provider-budget migration** | — | 🟡 Pending prod apply | PR #483 merged. Migration SQL not yet applied to prod. Run: `psql $DIRECT_URL -f cloud/packages/db/prisma/migrations/20260331000000_add_provider_budget_tracking/migration.sql` then `npx prisma@5 migrate resolve --applied 20260331000000_add_provider_budget_tracking` |
| **domain-evaluation-model-backfill** | `codex/domain-evaluation-backfill-attach` | 🟡 In review | Adds a supported way to backfill missing model coverage into existing Domain Level Batches so reruns stay attached to the original evaluation instead of becoming orphan batches |
| **domain-evaluation-soft-delete-reporting** | `codex/domain-evaluation-soft-delete-reporting` | 🟡 In review | Soft-deleted domain evaluations were still leaking into evaluation history, status, summary, and findings-eligibility reporting because the query layer ignored `deletedAt`. Local API fix now excludes deleted evaluations from those reporting queries and adds a regression test for deleted evaluation lookups. |

### Recently Completed

| Feature | Branch | Status | Notes |
|---------|--------|--------|-------|
| **pressure-sensitivity-coverage-fix** | `codex/pressure-sensitivity-coverage-fix` | 🟢 Done locally | Follow-up to PR #770. The pressure-sensitivity resolver now keeps a lightweight resolved Definition snapshot (`template`, `dimensions`, `components`) when resolving transcript decisions, instead of token-only stubs that made every transcript resolve as unknown/unscored and pushed all models below coverage. Focused API regression test added. |
| **pressure-sensitivity-report** | `claude/great-noyce-ed9f59` | 🟢 Done | PR #770 squash-merged 2026-04-28 (SHA `08ca3662`). New `/models/pressure-sensitivity` page (third Models sub-tab) showing per-(model, value pair) **Direction Δ / Conviction Δ / netScore Δ** across the 2D pressure grid (own × opponent level). Cross-model summary with sparkline, per-model detail table with Δ tooltips, 5×5 pressure grid with metric toggle, model × value-pair heat map (the "trait or value-specific?" view), directional sanity check (AAPOR-style validity gate), and limitations panel covering cross-vignette calibration / conviction self-report / sycophancy. New `pressureSensitivity` GraphQL resolver reads raw transcripts (no pooling), canonicalizes via `resolveTranscriptDecisionModel`, and remaps `favor_first`/`favor_second` to canonical alphabetical own/opponent so mirrored Definitions don't have inverted Δ. New `buildSafeLevelLookup` adapter wraps legacy normalization with collision detection + 1-5 score validation. 38 unit tests added; 8/8 CI checks passed first try. Post-deploy smoke test required: run `pressureSensitivity(signature: "vnewtd")` against prod via MCP — see PR comment + `docs/workflow/feature-runs/pressure-sensitivity-report/closeout.md`. |
| **paired-batch-count-min-of-two** | `paired-batch-count-min-of-two` | 🟡 In review | PR #759 open. Refactors `DomainValueCoverageCell.pairedBatchCount` to compute as `min(complete A-first, complete B-first)` per value pair (direction read from `config.jobChoiceValueFirst`). Replaces today's group-id-based dedup that conflated "have a partner" with "have a survivor." Launch-side writes unchanged; trial-count path intentionally unchanged with documented divergence in glossary. 63 helper+integration tests pass; pre-deploy SQL Q1/Q2 clean (Q3 surfaced the 116 pre-2026-03-30 legacy runs already documented in spec §6.3). Full FF audit trail under `docs/workflow/feature-runs/paired-batch-count-min-of-two/`. |
| **analysis-result-janitor-and-load-test** | `feat/036-analysis-janitor-and-load-test` | 🟢 Done locally | Added a daily janitor for stale SUPERSEDED `AnalysisResult` rows and a 20-concurrent `maybeAdvanceRunStatus` load test that verifies summarize-job singleton dedup. |
| **winrate-honest-denominator** | `claude/winrate-honest-denominator` | 🟢 Done | PR #632 squash-merged 2026-04-15 (SHA 641e03c7). WinRate formula now includes neutrals in the denominator (`prioritized / (prioritized + deprioritized + neutral)`) across Python worker, API, web, standalone script, and MCP export tool. Bucket classification rewritten to use a model-relative mean (Option A) with null-winRate filter. Python `CODE_VERSION` bumped to `1.2.0`, aggregate `AGGREGATE_ANALYSIS_CODE_VERSION` bumped to `1.3.0`, dead `winRateCI` Wilson metadata key removed, unused `confidence` param dropped. One-shot Prisma migration `20260415054649_invalidate_stale_winrate_analyses` flipped all 1870 CURRENT AGGREGATE + 1752 CURRENT basic rows on prod → SUPERSEDED. Batch recompute triggered via `/tmp/recompute-pending-analyses.py` (1318 basic + 314 aggregate combos queued in 67s, 0 errors). E2E verified on prod: basic recompute wrote `code_version=1.2.0`, aggregate recompute wrote `code_version=1.3.0`, both with a clean `methodsUsed` block. Follow-up PR #633 (SHA d54f109e) dropped the now-obsolete Support Rate / Win Rate toggle on Findings since the (p + 0.5n) / total half-credit metric is redundant with the honest winRate. |
| **probe-stall-detection-generic-queue-match** | `codex/probe-stall-detection-generic-queue-match` | 🟢 Done locally | PR #742 open. Stall detection, run diagnostics, and queue health now treat all active probe queues as probe work, while keeping the legacy fallback queue and excluding dead-letter queues. |
| **pivot-canonical-fix** | `pivot-canonical-fix` | 🟢 Done | PR #431 merged 2026-03-27 — canonical 0-2 scoring + companionRunId threading |
| **conditions-scoring-display-fix** | `codex/domain-analysis-ordering-fix` | 🟢 Done | PR #425 merged 2026-03-27 — ties read as 0, isOpponent uses strict > |
| **batch-depth-coverage-fix** | `claude/eager-euclid` | 🟢 Done | PR #430 merged 2026-03-27 — count samplesPerScenario as batch depth |
| **analysis-transcripts-canonical-v2-cleanup** | `feat/winner-score-display` | 🟢 Done | Semantic transcript drilldowns are now canonical-only; PR 446 was squash-merged and the remaining first/second wording cleanup is tracked below. |
| **domain-analysis-freshness-cache** | `cleanup/agents-memory-stale-refs` | 🟢 Done locally | Domain Analysis overview now reads from cached per-run analysis snapshots, shows fresh/cached status in the UI, and refreshes in the background after page load or new basic analysis completion. |

### Follow-up Cleanup

- ✅ First/second wording removed from all analysis surfaces, backend contracts, and export/worker paths (PRs #432, #434, #440, #445, #448).
- 🟡 **Run-state reconciliation sweep is scoped to runs updated in the past 30 days.** Stranded transcripts on runs older than that need manual `recover_run` (via MCP). If operators investigate older runs often, widen the window in `cloud/apps/api/src/services/run/scheduler.ts` (search for `30 days`). Added 2026-04-23 with [PR #745](https://github.com/chrislawcodes/valuerank/pull/745).
- 🟡 **`extractTranscriptTokenUsage` silent-zero fallback** — when an orphan transcript's content is malformed (missing `costSnapshot`, empty `turns`), `cloud/apps/api/src/queue/handlers/run-state-reconcile.ts:64` falls back to `outputTokens = fallbackTokenCount` (often 0). Reconstructed `ProbeResult` rows carry 0 tokens, corrupting downstream cost and shortfall math. Fix: add strict mode that fails reconstruction for malformed orphans and records `ORPHAN_TRANSCRIPT` anomaly instead. Added 2026-04-23 from PR #745 review.
- 🟡 **`detectPairAsymmetry` picks first sibling only** — `cloud/apps/api/src/services/run/anomaly-detection.ts:170`. If a `jobChoiceBatchGroupId` ever has more than two runs (seed variation, re-runs, etc.), the first non-self run wins arbitrarily. Fix: compare against every sibling or aggregate. Added 2026-04-23 from PR #745 review.
- 🟡 **`reconstructOrphans` unbounded per tick** — a run with 10k orphan transcripts would serially call `recordProbeSuccess` past the 120-second PgBoss expiration. Fix: per-tick cap (e.g., 500 orphans) and let multiple ticks drain the backlog. Added 2026-04-23 from PR #745 review.

### Validation Gate

Once the above are resolved:
- [ ] Single-pass batch run across all vignettes — **currently running** (validates system end-to-end)
- [ ] Review results — no unexpected issues
- [ ] ✅ System declared valid → unblock Scale

### Then: Scale
- [ ] 5+ runs per vignette for statistical significance
- [ ] Analysis on scaled results
- [ ] Expand to more domains

---

## Goal: AAPOR Conference

**Conference:** May 11, 2026 — Los Angeles
**Dependency:** Needs valid ValueRank results to present

### Logistics
- [x] Hotel booked
- [ ] Dinners/events booked
- [ ] Target list of people to connect with
- [ ] Define conference goals

### Slide Deck
- [ ] Build deck
- [ ] Review with Ari

### Analysis Reports
- [x] Domain Shifts by Value heatmap implemented at `/models/domain-shifts`; focused tests and web preflight pass.
- [x] Domain Shifts readability controls added locally: cells can toggle between shift and raw win rate, and table columns are sortable.
- [x] Domain Shifts model picker now groups default models first and separates non-default models with `---` before alphabetical non-default options.
- [x] Model Value Preference overview report updated at `/models`; screenshot capture is available, the title now matches the report, and model rows no longer repeat the model ID line.

---

## Goal: Feature Factory

**Goal:** AI iterates on features more independently, less human-in-the-loop

**Assessment (2026-03-30):** Front half (discovery → spec → plan → tasks → adversarial review) is solid. Back half is now catching up: fast path added, parallel Codex dispatch added (PR #458, merged), parallel reviews validated. Second experiment complete (aggregate-cross-batch-reliability): factory caught a real correctness gap Claude-direct missed. Pattern is mixed across 2 data points. Remaining gaps: more experiment runs needed, phantom task detection deferred, Composio not evaluated.

**Update (2026-04-19):** ff-judge-panel slice 10 migration script + SKILL.md update + smoke test are implemented locally. Migration dry-run reports the two blocked workflows cleanly as missing in this worktree, the judge smoke test passes with stub judges, and the Feature Factory scripts test suite is green.

**Update (2026-04-21):** Local Feature Factory run `models-circumplex-layout-cleanup` is implemented on `codex/models-circumplex-layout-cleanup`. The Circumplex page now keeps signature, minimum-trials, and methodology controls in one header box; uses a dropdown + tooltip help for methodology state; collapses model selection into a compact details row; and stacks selected model cards full width. Targeted web tests pass in the clean worktree. Next: repair the inherited partial review artifacts, then run the diff checkpoint and delivery steps.

### What We Keep (Differentiated)
- Mandatory discovery phase — catches bad requirements early
- Multi-agent adversarial review (Gemini + Codex attack, Claude judges)
- Structured artifacts (spec.md, plan.md, tasks.md) with full audit trail
- Scoped ~300-line checkpoint diffs

### Priority 1: Unblock Everything Else
- [x] **I-10: Modularize `run_factory.py`** — PR #449, merged 2026-03-29. Split 2365→1439 lines across 6 modules.

### Priority 2: Reduce Ceremony
- [x] **Add a "fast path"** — PR #452, merged 2026-03-30. `checkpoint --stage diff --fast` skips all prerequisites, runs 1 Gemini + 1 Codex adversarial review.
- [x] **Add `--protected-files` to the runner** — PR #450, merged 2026-03-29. Auto-reverts CLAUDE.md, AGENTS.md, MEMORY.md, etc. after every agent run.
- [x] **CLAUDE.md audit** — PR #454, merged 2026-03-29. Trimmed cloud/CLAUDE.md from 1011 to 271 lines; removed ops runbooks, kept all coding standards.

### Priority 3: Speed Up Implementation
- [x] **Add `implement` command with parallel Codex dispatch** — PR #458, merged 2026-03-30. `run_factory.py implement --slug <slug>` reads the next `[CHECKPOINT]` slice from tasks.md, detects `[P: file]`-annotated tasks, and dispatches parallel Codex workers in isolated git worktrees for non-overlapping tasks. Cherry-picks back in task-index order. Serial fallback for overlap or unannotated tasks.
- [x] **Run reviews in parallel** — Validated 2026-03-30. Codex runs fully parallel with Gemini. Gemini reviews stagger 30s apart (no file lock). Zero 429s across parallel-implement-command checkpoints. `GEMINI_STAGGER_SECONDS = 30` is now permanent default in `factory_review.py`.
- [x] **visitor-role-access-control** — PR #737. ADMIN/VISITOR two-tier role system with JWT enforcement, MCP write tool gating, user management UI, and forced password-change flow for new accounts. All 3 diff adversarial reviews rejected (intentional design decisions). Factory workflow: spec → plan → tasks → Codex implementation → diff checkpoint → reconcile → deliver.

### Priority 4: Integrate Best-of-Breed Tools
- [ ] **Evaluate [Composio Agent Orchestrator](https://github.com/ComposioHQ/agent-orchestrator)** — Handles parallel agent spawning, CI failure auto-fix, and review comment routing. Could replace the implementation half of the runner.
- ~~**Integrate Spec Kit**~~ — Evaluated 2026-03-30. Spec Kit is a parallel workflow (specify → plan → tasks → implement), not a pre-check tool. It lacks adversarial review, which is the factory's core differentiator. Not worth adopting.

### Priority 5: Detect phantom task completions
- [ ] **Add post-implement verification that checked tasks have real code behind them** — Inspired by [spec-kit-verify-tasks](https://github.com/datastone-inc/spec-kit-verify-tasks). When Codex marks a task `[x]` but didn't actually implement it, nothing catches this today. Hold until after the Claude-direct experiment.

### Priority 6: Validate the factory is net positive
- [ ] **Run more comparisons — pattern is mixed across 2 data points**

  **Experiment 1 — `domain-coverage-hub` (UI feature, PR #465, 2026-03-30):**

  | | Claude-direct | Factory (spec+checkpoint only) |
  |--|--------------|-------------------------------|
  | Actionable findings pre-implementation | 7 | 4 |
  | Unique findings | 3 (file size limit, legacy fallback, empty state) | 0 |
  | False positives | Low | Several |
  | Human interruptions | 1 (4 product decisions) | n/a |

  Factory's one "unique" finding turned out to be a deliberate architectural choice. Claude-direct caught more real issues.

  **Experiment 2 — `aggregate-cross-batch-reliability` (backend bug fix, PR #466, 2026-03-30):**

  | | Claude-direct | Factory (spec+checkpoint) |
  |--|--------------|-------------------------------|
  | Actionable findings pre-implementation | 0 | 3 |
  | Unique findings | 0 | 1 HIGH (mixed-mode gap — real correctness bug) |
  | False positives | n/a | Low |
  | Human interruptions | 0 | 1 (approved acting on all findings) |

  Factory caught a real bug Claude-direct missed: the conditional fallback silently under-reported reliability for mixed aggregates. Final implementation materially better because of the review.

  **Experiment 3 — `settings-restructure` (UI/nav refactor, PR #468, 2026-03-30):**

  | | Claude-direct | Factory (spec+checkpoint) |
  |--|--------------|-------------------------------|
  | Pre-impl actionable findings | 4 (structural, test, scope) | 0 actionable |
  | Unique findings | 4 real (redirect, ref/state wiring, tests, thin wrappers) | 0 |
  | False positives | 0 | 6 (deep links, RBAC, shared state, MEMORY.md clause misread) |
  | Human interruptions | 0 | 1 (triage) |

  Factory generated 6 false positives, 0 actionable findings. All HIGH findings were based on assumptions that don't hold (no URL-hash tabs, no RBAC, no shared panel state). Claude-direct caught the real structural issues.

  **Experiment 4 — `cross-run-reliability` (backend/worker fix, PR #472, 2026-03-31):** Factory caught silent wrong-key bug that passed all tests. Worth it.

  **Experiment 5 — `provider-budget` (full-stack, PR #483, 2026-03-31):** Factory enforced tests (2 new files); both paths caught same correctness bugs. Factory required 2 human interventions. Partial win.

  **Pattern (5 data points):** Factory 2/2 on backend/algorithmic work. Claude-direct 2/2 on UI/nav work. Full-stack features are mixed — factory adds test coverage but introduces process friction. See `experiments.md` for full detail.

---

## Goal: Vignette Cleanup

**Goal:** Clean up older vignettes run before the flipped-order system was introduced

### Recently Completed

| Feature | Branch | Status | Notes |
|---------|--------|--------|-------|
| **production-transcript-anomalies-doc** | `—` | 🟢 Done | Added a canonicalized production anomaly note at [`docs/production-transcript-anomalies.md`](docs/production-transcript-anomalies.md) with batch/transcript wording, legacy-unavailable counts, and the duplicate-row nuance. |
| **domain-coverage-paired-batch-action** | `claude/parallel-reviews-validated-v2` | 🟢 Done | PR #476 merged 2026-03-31 — tightened the domain coverage layout, removed the workspace card, and restored the paired-batch launch/back-link flow. |
| **provider-budget-tracking** | `factory/provider-budget` | 🟢 Merged (migration pending) | PR #483 squash-merged 2026-03-31 — per-provider balance, auto-deduct on completion, manual sync with drift log, soft pre-run warning gate. Migration must be applied to prod. |

### Backlog
- [ ] Identify which vignettes predate flipped-order system
- [ ] Define cleanup approach
- [ ] Execute cleanup

---

## Remove Preference Score

**Goal:** Eliminate `meanPreferenceScore` / `preferenceStrength` from all layers.

### Wave 1 — ✅ Done (PR #442, merged 2026-03-29)

All product-facing preference score fields removed. First/second order wording cleaned up across API schema, analysis surfaces, shared helpers, and export/worker paths (PRs #432, #434, #440, #445, #448).

### Wave 2 — Remove preference score from Excel exports (backlog, not now)

| Area | Where | Decision |
|------|-------|----------|
| **Per-decision score mapping** | `decision-display.ts` | Remove `getDecisionPreferenceScore()` and its callers (also removes from CSV export) |
| **Model summary sheet** | `model-summary.ts` + `types.ts` | Remove Mean Preference Score and Std Dev columns |
| **Charts sheet** | `charts.ts` | Remove the "Mean Preference Scores by Model" secondary table |

---

## Remove Likert / decisionCode

**Goal:** Remove the legacy 1–5 `decisionCode` and make `decisionModelV2` the sole measurement contract.

**Spec & Plan:** `specs/028-remove-likert-decision-code/` (revised after adversarial review by Codex gpt-5.4 + Gemini 2.5 Pro)

### What's already done (Replace Wave, PR #411)

- `resolveCanonicalDecision` — converts raw decisionCode to v2 canonical format
- `domainAnalysisValueDetail` — fully on v2 five-bucket model + `meanPreferenceScore` (0–2)
- Condition detail view in UI fully on v2

### Wave 1 — Fix manual override mutation (prerequisite)

- [ ] `mutations/run/maintenance.ts` — populate `decisionMetadata.manualOverride` (currently writes only `decisionCode`)

### Wave 2 — Rewire all consumers to v2 (main work, ~30 files)

| Group | Key files | What to change |
|-------|-----------|----------------|
| **Analysis pipeline** | variance.ts, aggregate-logic.ts, analysis.ts, shared.ts, aggregate-run-workflow.ts, analyze-basic.ts | Switch from `parseInt(decisionCode)` to v2 canonical model. Fixes latent `orientationFlipped` bug in `aggregateValueCountsFromTranscripts`. |
| **Run lifecycle** | trigger.ts, summarization.ts, planning.ts, get-unsummarized-transcripts.ts | Replace `decisionCode`/`'error'` sentinel with `summarizedAt` checks |
| **Assumptions/temp-zero** | order-effect-service.ts, assumptions.ts, temp-zero-verification.ts, temp_zero_report.py | Convert to v2 canonical model |
| **API surfaces** | GraphQL transcript type, MCP formatters/tools, OData route, export route | Remove raw decisionCode exposure, use v2 fields |
| **Frontend** | TranscriptRow, TranscriptViewer, RunResults, RunDetail, AnalysisTranscripts, all query operations | Remove legacy display, stop querying decisionCode |
| **Scripts** | job-choice-bridge-report, analysis scripts | Update to v2 or delete if obsolete |

### Wave 3 — Stop writing + archive legacy data

- [ ] `workers/summarize.py` — stop emitting `decisionCode`
- [ ] `summarize-transcript.ts` — stop persisting `decisionCode`
- [ ] SQL migration: soft-delete non-job-choice transcripts, runs, definitions, scenarios (batched)

### Wave 4 — Schema cleanup (deferred indefinitely)

- [ ] Drop `decision_code` and `decision_code_source` columns
- [ ] Remove `LegacyDecisionCompat` type from v2 model
- [ ] Review whether `decisionText` is also redundant

### Historical data

No backfill needed for removal. `resolveTranscriptDecisionModel()` already derives v2 canonical decisions from old transcripts' raw `decisionCode` + `definitionSnapshot` + `orientationFlipped` at query time. Old data stays readable without migration.

The `backfill-resummarize-existing-transcripts.ts` script is **not a prerequisite** — it re-runs the full LLM summarization pipeline, which is a separate concern. Likert removal can ship first; backfill is optional cleanup if we later want to drop the DB column entirely.

### Key insight: no statistical capability is lost

The old 1–5 scale was ordinal (LLMs only ever produced whole numbers). V2's `preferenceScore` (0–2) provides the same numeric axis for mean, std dev, and variance calculations. The five-bucket model (`strongly`/`somewhat`/`neutral`/`opponentSomewhat`/`opponentStrongly`) maps 1:1 to the old five bins. No regression, Kruskal-Wallis, or Spearman's rho operations exist in the current codebase — only basic descriptive stats.

---

## Backlog / Capture

> Drop new ideas and threads here. Promote to a goal when ready.

- **Auto-pairing batches**: Remove explicit `pair_key` from vignettes. Instead, batches should automatically detect that two vignettes are a pair if they share the same domain, scenario signature, and value tokens — just with `value_first`/`value_second` swapped. This makes pairing implicit from the data rather than a manually stamped key set at creation time.

- **Remove `orientationFlipped`**: Once Likert scores are removed, `orientationFlipped` has no remaining purpose — score flipping goes away with Likert, and order-effect reporting can be derived by comparing results across the auto-detected pair directly. Remove in the same wave as Likert removal.

---

## Key Docs

| Doc | Purpose |
|-----|---------|
| [[CLAUDE.md]] | Project constitution |
| [[cloud/CLAUDE.md]] | Cloud coding standards |
| [[docs/values-summary.md]] | 19 Schwartz values reference |
| [[docs/workflow/feature-runs/batch-depth-coverage-handoff.md]] | Batch coverage handoff context |

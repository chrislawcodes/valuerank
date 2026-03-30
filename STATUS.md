# ValueRank — Project Dashboard

> **How to use:** Review this at the start of every session. Ask Claude to update it at the end.

---

## Goals Overview

| Goal | Status | Deadline |
|------|--------|----------|
| [System Validity](#goal-system-validity) | 🔴 Blocking | Pre-AAPOR |
| [AAPOR Conference](#goal-aapor-conference) | 🟡 In progress | May 11, 2026 |
| [Feature Factory](#goal-feature-factory) | 🟡 In progress | Ongoing |
| [Vignette Cleanup](#goal-vignette-cleanup) | ⬜ Not started | — |

> **Scale and Analysis are blocked until System Validity is resolved.**

---

## Goal: System Validity

**Theme:** We keep finding correctness issues. The system is not yet producing results we trust enough to scale or present. All threads below must be resolved before we run at scale.

### Active Bugs / Fixes

| Feature | Branch | Status | What's Wrong |
|---------|--------|--------|--------------|
| **transcript-resummarization-backfill** | — | 🟡 Ready | Script written (`cloud/scripts/backfill-resummarize-existing-transcripts.ts`) but no PR yet — needs review and merge |

### Recently Completed

| Feature | Branch | Status | Notes |
|---------|--------|--------|-------|
| **pivot-canonical-fix** | `pivot-canonical-fix` | 🟢 Done | PR #431 merged 2026-03-27 — canonical 0-2 scoring + companionRunId threading |
| **conditions-scoring-display-fix** | `codex/domain-analysis-ordering-fix` | 🟢 Done | PR #425 merged 2026-03-27 — ties read as 0, isOpponent uses strict > |
| **batch-depth-coverage-fix** | `claude/eager-euclid` | 🟢 Done | PR #430 merged 2026-03-27 — count samplesPerScenario as batch depth |
| **analysis-transcripts-canonical-v2-cleanup** | `feat/winner-score-display` | 🟢 Done | Semantic transcript drilldowns are now canonical-only; PR 446 was squash-merged and the remaining first/second wording cleanup is tracked below. |

### Follow-up Cleanup

- ✅ First/second wording removed from all analysis surfaces, backend contracts, and export/worker paths (PRs #432, #434, #440, #445, #448).

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

---

## Goal: Feature Factory

**Goal:** AI iterates on features more independently, less human-in-the-loop

**Assessment (2026-03-30):** Front half (discovery → spec → plan → tasks → adversarial review) is solid. Back half is now catching up: fast path added, parallel Codex dispatch added (PR #458, merged), parallel reviews validated. Second experiment complete (aggregate-cross-batch-reliability): factory caught a real correctness gap Claude-direct missed. Pattern is mixed across 2 data points. Remaining gaps: more experiment runs needed, phantom task detection deferred, Composio not evaluated.

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

  **Pattern:** Factory has an edge on backend/algorithmic work where edge cases are hard to see. Claude-direct has an edge on UI/product work where context matters more than exhaustive analysis. Two data points — need more before drawing firm conclusions.

---

## Goal: Vignette Cleanup

**Goal:** Clean up older vignettes run before the flipped-order system was introduced

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
| [[docs/feature-runs/batch-depth-coverage-handoff.md]] | Batch coverage handoff context |

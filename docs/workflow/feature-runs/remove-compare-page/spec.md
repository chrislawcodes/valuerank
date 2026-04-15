# Spec: remove-compare-page

**Author:** Claude (Sonnet)
**Status:** scoped, ready for Codex dispatch
**Delivery path:** Feature Factory — hybrid (scope doc + Codex slices, no adversarial review ceremony)
**Branch:** `claude/remove-compare-page`
**Unblocks:** `winrate-honest-denominator` (by simplifying the surface area to fix)

---

## Problem

The Compare page (`/compare` route) is **no longer a live product feature** but the code is still in the repo, along with:

1. Its direct dependencies: ~15 files under `components/compare/`, two hooks, a statistics helper, a web service
2. An unused dead-end analysis UI that was disabled in 2024 ("Agreement and Methods tabs were removed by product decision to reduce noise" — `tabs/types.ts:17`) but whose orphaned files were never deleted
3. The Wilson confidence interval plumbing that only existed to feed those dead UIs

This carries cost for every future analysis feature: every time we touch `ValueStats` or `confidenceInterval` we have to reason about code that nothing consumes. The last feature (`winrate-honest-denominator`) was going to need a whole section on "Wilson CI consequence" that turned out to be irrelevant because no live page renders a CI.

## Goal

Delete the Compare page code entirely, plus all orphaned analysis UI that was part of the same product-removal decision, plus the Wilson CI backend plumbing that only existed to feed those dead surfaces. Ship as one PR.

## Non-goals

- **No product change to live analysis views.** `/runs/:id`, `/analysis/:id`, `/analysis/:id/transcripts`, `/analysis/:id/conditions/:conditionKey` — none of these render Wilson CI today, so none of them change.
- **No change to the API-side aggregate analysis system** (`cloud/apps/api/src/services/analysis/aggregate/aggregate-preparation.ts`, `update-aggregate-run.ts`, `aggregate-helpers.ts`, `domain-analysis-snapshot-builder.ts`, the `aggregate-analysis` queue handler). These feed the domain analysis pipeline and are NOT Compare-specific. The only aggregate file that changes is `aggregate-logic.ts`, and only to drop the now-unused per-value CI builder — the rest of its logic stays.
- **No `winrate` formula change.** That's the next feature.
- **No `.gitignore`, CI config, or terminology changes.**
- **No GraphQL schema rename** — we only drop a field, we don't rename anything.

## Scope

### A. Compare page — web files to DELETE

```
cloud/apps/web/src/pages/Compare.tsx
cloud/apps/web/src/components/compare/                   (entire directory, ~15 files)
cloud/apps/web/src/hooks/useComparisonState.ts
cloud/apps/web/src/hooks/useComparisonData.ts
cloud/apps/web/src/lib/statistics/cohens-d.ts            (imports from components/compare/types)
cloud/apps/web/src/services/AggregateAnalysisService.ts  (fully orphaned — zero importers)
```

### B. Orphaned CI UI — web files to DELETE

```
cloud/apps/web/src/components/analysis/ScoreDistributionChart.tsx
cloud/apps/web/src/components/analysis/MethodsDocumentation.tsx
cloud/apps/web/src/components/analysis/tabs/MethodsTab.tsx
```

**Verification before delete:** confirm none of the above appear in any live import chain. I've grep-verified this — the only consumers are their own test files and barrel re-exports.

### C. Web files to EDIT (not delete)

| File | Edit |
|---|---|
| `cloud/apps/web/src/App.tsx` | Remove `import { Compare }` and the `<Route path="/compare">` block |
| `cloud/apps/web/src/components/layout/MobileNav.tsx` | Remove the `{ name: 'Compare', path: '/compare', icon: GitCompare }` nav entry |
| `cloud/apps/web/src/pages/Dashboard.tsx` | Remove any tile / link that points to `/compare` |
| `cloud/apps/web/src/components/analysis/index.ts` | Remove re-exports of `ScoreDistributionChart` and `MethodsDocumentation` |
| `cloud/apps/web/src/components/analysis/tabs/index.ts` | Remove re-export of `MethodsTab` |
| `cloud/apps/web/src/api/operations/analysis.ts` | Drop `confidenceInterval: ConfidenceInterval` from the `ValueStats` type, drop the `ConfidenceInterval` type definition |

### D. Web test files

**Delete:**
```
cloud/apps/web/tests/components/compare/                             (entire directory)
cloud/apps/web/tests/components/analysis/ScoreDistributionChart.test.tsx
cloud/apps/web/tests/components/analysis/MethodsDocumentation.test.tsx
cloud/apps/web/tests/hooks/useComparison*.test.ts                    (if present)
cloud/apps/web/tests/lib/statistics/cohens-d.test.ts                 (if present)
```

**Edit — drop `confidenceInterval` from fixtures:**
```
cloud/apps/web/tests/hooks/useAnalysis.test.ts
cloud/apps/web/tests/components/analysis/AnalysisPanel.test.tsx
cloud/apps/web/tests/components/analysis/PairedRunComparisonCard.test.tsx
```

### E. MCP export — drop `include_ci` entirely

`cloud/apps/api/src/mcp/tools/export-pairwise-outcomes.ts`:
- Delete the `include_ci` Zod argument (line 30)
- Delete the `if (args.include_ci) { row.valueACiLower = ... }` branch (lines 215-220)
- Delete the `valueACiLower`, `valueACiUpper`, `valueBCiLower`, `valueBCiUpper` fields from the `PairwiseOutcomeRow` type
- Update the tool description to remove any mention of CI
- Update `cloud/apps/api/tests/mcp/tools/export-pairwise-outcomes.test.ts` — drop all `include_ci` test cases, drop the CI assertion branches

This is a **breaking change for external MCP callers** who passed `include_ci: true`. Since this is a read tool and the fields are additive, callers who don't pass `include_ci` are unaffected. Callers who do will get a Zod validation error telling them the argument doesn't exist. Document in PR description.

### F. API aggregate — drop per-value CI builder

`cloud/apps/api/src/services/analysis/aggregate/aggregate-logic.ts`:
- Drop `confidenceInterval` field from the local `ValueStatsBuilder` type (line 124)
- Drop the initial `confidenceInterval: { lower: 0, upper: 0, level: 0.95, method: 'aggregate' }` (line 138)
- Drop the `target.confidenceInterval = { ... method: 'aggregate-sem' }` block (lines 174-179)

**Verify nothing downstream of `aggregate-logic.ts` reads this CI.** The aggregate output flows into `aggregate-preparation.ts` → `update-aggregate-run.ts` → the aggregate PgBoss handler → stored as analysis result JSON. If any consumer parses `confidenceInterval` from the aggregate output, this edit breaks them. Grep says no such consumer exists, but the Codex slice should re-verify with `grep -r 'aggregate.*confidenceInterval' cloud/apps/api/src` before deleting.

### G. API schema contract

`cloud/apps/api/src/services/analysis/aggregate/contracts.ts`:
- Drop the `zConfidenceInterval` schema (lines 23-28)
- Drop the `confidenceInterval: zConfidenceInterval` field from `zValueStats` (line 37)

This is the Zod schema that validates the Python worker's analysis output. Since the Python worker will also stop emitting `confidenceInterval` (see § H), the schema stays in sync.

### H. Python workers

**Delete entirely:**
```
cloud/workers/stats/confidence.py        (wilson_score_ci + bootstrap_ci + ConfidenceInterval — bootstrap_ci is also dead code, only its own tests call it)
cloud/workers/tests/test_stats.py        (all tests are for wilson/bootstrap)
```

**Edit:**

| File | Edit |
|---|---|
| `cloud/workers/stats/basic_stats.py` | Remove `from stats.confidence import wilson_score_ci, ConfidenceInterval` (line 12). Remove `confidenceInterval: ConfidenceInterval` from `ValueStats` TypedDict (line 28). Remove CI computation in `compute_value_stats` (lines 92-105) — just return the `ValueStats` without the CI field. |
| `cloud/workers/stats/__init__.py` | Remove `from stats.confidence import wilson_score_ci, bootstrap_ci` (line 11). Remove `"wilson_score_ci"`, `"bootstrap_ci"` from the `__all__` list (lines 30-31). |
| `cloud/workers/analyze_basic.py` | Remove `"winRateCI": "wilson_score"` from `methodsUsed` (line 624). |
| `cloud/workers/tests/test_analyze_basic.py` | Remove `assert methods["winRateCI"] == "wilson_score"` assertion (line 218). |

### I. Other API tests

`cloud/apps/api/tests/queue/handlers/analyze-basic.integration.test.ts`:
- Remove `confidenceInterval: { lower: 0.01, upper: 0.99 }` from fixture (line 42)
- Remove `confidenceInterval: 'Wilson score'` from methods fixture (line 89)

---

## Slice plan

### Slice 1 — Web deletion (compare + orphaned UI + fixtures)

**Codex dispatch.** Pure deletion plus trivial edits.

- Delete all files in § A and § B
- Edit all files in § C and § D
- Goal: `npm run lint --workspace @valuerank/web` and `npm run build --workspace @valuerank/web` both pass with zero errors.
- **Do NOT touch the API or Python yet.** The web-side `ValueStats` type drops `confidenceInterval`, so any lingering consumer will fail the build here — that's the verification.

### Slice 2 — API + Python backend cleanup

**Codex dispatch.** Surgical edits across Python and TypeScript.

- Edit all files in § E, § F, § G, § H, § I
- Goal: `npm run lint --workspace @valuerank/api`, `npm run build --workspace @valuerank/api`, and `pytest cloud/workers/` all pass.
- Pre-flight grep inside the Codex prompt: `grep -rn 'wilson_score\|confidenceInterval\|winRateCI\|include_ci' cloud/` should return zero matches outside of this feature's own docs after the slice completes.

### Slice 3 — Claude-run full preflight + PR

**Claude runs, no code writes.** Execute the full 8-command preflight gate from `cloud/CLAUDE.md`. Fix any regressions by dispatching a micro-slice to Codex. Open PR against `chrislawcodes/valuerank`.

---

## Verification

### After Slice 1
```bash
cd cloud
npm run lint --workspace @valuerank/web
npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/web
```

Grep check:
```bash
grep -rn '/compare' cloud/apps/web/src/                      # → 0 matches
grep -rn 'AggregateAnalysisService' cloud/apps/web/src/      # → 0 matches
grep -rn 'ScoreDistributionChart\|MethodsTab\|MethodsDocumentation' cloud/apps/web/src/   # → 0 matches (components), tests dir already deleted
```

### After Slice 2
```bash
cd cloud
npm run lint --workspace @valuerank/shared
npm run lint --workspace @valuerank/db
npm run lint --workspace @valuerank/api
npm run test --workspace @valuerank/api
npm run build --workspace @valuerank/api
pytest cloud/workers/
```

Grep check:
```bash
grep -rn 'wilson_score\|winRateCI\|include_ci' cloud/        # → 0 matches
grep -rn 'confidenceInterval' cloud/apps/api/src/             # → 0 matches
grep -rn 'confidenceInterval' cloud/workers/                  # → 0 matches
grep -rn 'ConfidenceInterval' cloud/workers/                  # → 0 matches
```

### Full preflight (Slice 3)

All 8 preflight commands from `cloud/CLAUDE.md` pass.

---

## Rollback

Single PR, single revert. The deletions are self-contained:

- No data migrations, no schema changes outside Zod contracts
- No GraphQL schema changes (the field was never in GraphQL, only in the worker output and Zod validation)
- The MCP tool signature change is a breaking change only for callers who passed `include_ci` — no API surface rename
- The Python worker output drops one field (`confidenceInterval`) but the Zod schema is updated in the same PR so there's no mismatch

Single `git revert` of the squash commit restores all of the above.

---

## Risks and open questions

1. **Does anything besides `include_ci` MCP callers care about the Python worker's `confidenceInterval` field?** Grep says no. Re-verified before each slice.
2. **External MCP callers.** Any script that passes `include_ci: true` to `export_pairwise_outcomes` will get a Zod validation error after this ships. The field was documented; there may be external scripts we can't see. Accept this — it's a breaking change for a read tool that returns extra columns. Document clearly in the PR body.
3. **The already-merged PR #627** (fix for winrate column showing "—" for neutral preferred values) — that fix is on main, unrelated to Compare, and stays untouched.
4. **The uncommitted `winrate-honest-denominator/spec.md` draft** — this is orthogonal to Compare deletion but travels in the same PR because it's already in the working directory. Acceptable messiness per the user's explicit decision.

---

## Codex delegation contract (same as `remove-final-trial-sampler`)

Per the delegation safeguard we put in place last feature, **Claude does NOT hand-write implementation code**. All deletion and editing in Slices 1 and 2 is dispatched to Codex via `codex exec -m gpt-5.4-mini -s workspace-write`. Claude only:

- Writes this spec
- Writes the Codex dispatch prompts
- Runs preflight verification
- Runs git commands (Codex sandbox can't write to `.git/`)
- Writes the closeout

Codex is explicitly forbidden from touching: `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `MEMORY.md`, `.gitignore`, and any file outside the scope enumerated above.

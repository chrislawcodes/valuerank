# Closeout — Unified Net-Weighted Condition Score

**Status:** Shipped
**PR:** [#680](https://github.com/chrislawcodes/valuerank/pull/680) (squash-merged)
**Merge commit:** `f3708b6c`
**Merged:** 2026-04-17T01:32:38Z
**Branch:** `feature/unified-condition-score` (deleted)

---

## Summary

Unified the three condition-level analysis views (Condition Decisions Table, Pivot Analysis Table, Condition Matrix) onto a single net-weighted score:

```
netScore = ((2·strongly + somewhat) − (2·opponentStrongly + opponentSomewhat)) / totalTrials
```

All three views now consume the same `getConditionCellDisplay(summary)` bundle helper, which returns `{ netScore, direction, hasData, label, backgroundColor, textColorClass }`. `direction` is tri-state (`'self' | 'opponent' | 'neutral'`) with a ±0.05 tolerance. The legend classifier in PivotAnalysisTable keys off `summary.direction` instead of recomputing signal thresholds.

---

## Slices Delivered

| Slice | Scope | Commit |
|-------|-------|--------|
| 1 | `canonicalConditionSummary.ts` — net-weighted formula, helper bundle, 17 unit tests | `7bf030f2` |
| 2 | `ConditionMatrix` migration to bundle helper | `6626dc38` |
| 3 | `ConditionDecisionsTable` + `PivotAnalysisTable` migration; legend rewrite; help copy update | `1531a6a0` |
| Cleanup | Inline color helpers into bundle, purge old exports (ship-gate G3) | `4c9b6dc0` |
| Refactor | Split oversized tables to satisfy 400-line file-size gate | `3c5ff924` (squashed) |

---

## Ship Gates (all green)

- G1 — no `winnerScore` references outside archived docs
- G2 — no `selectedValueWinRate` outside archived docs
- G3 — no `getCanonicalConditionBackground` / `getCanonicalConditionTextColor` exports
- G4 — no inline `2 *` net-weighted math outside `canonicalConditionSummary.ts`
- G5 — no `.toFixed(` outside the bundle helper
- G6 — `Math.abs(netScore)` scoped to bundle helper
- G7 — no bundle-helper callers in files outside `ConditionDecisionsTable`, `PivotAnalysisTable`, `ConditionMatrix`
- G8 — old preference helpers removed

File-size check: all 5 changed files under 400 lines after refactor extraction.

---

## Validation

- `npm run lint --workspace @valuerank/web` — 0 errors (81 pre-existing warnings)
- `npm run build --workspace @valuerank/web` — pass
- `npm run test --workspace @valuerank/web` — 1246/1246 pass across 125 test files
- CI on PR #680 post-rebase — all green (Lint & Build, API & DB Tests, Web Tests 1/3, 2/3, 3/3)

---

## Review Rounds

- **Spec:** 7 rounds (accepted per advance policy)
- **Plan:** 5 rounds (accepted per firm policy after diminishing returns)
- **Tasks:** 2 rounds
- **Slice 1 diff:** 2 Codex + 1 Gemini — accepted
- **Slice 2 diff:** 2 Codex + 1 Gemini — accepted (artifacts preserved at `reviews/slice2-diff/`)
- **Slice 3 diff:** 2 Codex + 1 Gemini — accepted; Gemini "unseen abstraction" flagged FALSE POSITIVE (Slice 1 landed with 17 tests); Codex 0.05-boundary label→"0.1" with direction=neutral acknowledged as edge case

---

## New Files

- `cloud/apps/web/src/components/analysis/modelHeaderLabels.ts` (225 lines)
- `cloud/apps/web/src/components/analysis/ConditionDecisionsTableHead.tsx` (90 lines)
- `cloud/apps/web/src/components/analysis/PivotAnalysisLegend.tsx` (32 lines)

---

## Follow-ups

None blocking. The 0.05-boundary display edge case (`netScore = 0.05` → rounds to label `"0.1"` while `direction = 'neutral'`) was documented and accepted.

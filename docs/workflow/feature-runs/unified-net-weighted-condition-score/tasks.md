# Tasks: Unified Net-Weighted Condition Score

Implementation plan: [plan.md](./plan.md). Spec: [spec.md](./spec.md).

Three slices, each landed as its own diff checkpoint. Slice 1 unblocks 2 and 3. Slices 2 and 3 can land in either order once Slice 1 is on the branch.

## Slice 1 — Shared module rewrite

Target files:
- `cloud/apps/web/src/utils/canonicalConditionSummary.ts` (rewrite surface + add counts summarizer + add bundle helper)
- `cloud/apps/web/tests/utils/canonicalConditionSummary.test.ts` (full rewrite, 253 lines, ~31 old-field refs removed)

### Tasks

- [ ] **S1-T1.** Update `CanonicalConditionSummary` type: add `netScore: number | null`, `direction: 'self' | 'opponent' | 'neutral'`, `hasData: boolean`. Remove `winnerScore`, `selectedValueWinRate`, `isOpponent`. Keep `strongly`, `somewhat`, `opponentStrongly`, `opponentSomewhat`, `neutral`, `totalTrials`, `unknownCount`.
- [ ] **S1-T2.** Rewrite `summarizeCanonicalConditionTranscripts` internals to produce `netScore = ((2*strongly + somewhat) − (2*opponentStrongly + opponentSomewhat)) / totalTrials` and derive `direction` via the 0.05 tolerance tri-state (per FR-003). Return `null` netScore and `hasData: false` when `totalTrials === 0`.
- [ ] **S1-T3.** Add `CanonicalConditionCounts` type (exactly 5 count fields). Add `summarizeCanonicalConditionCounts(counts: CanonicalConditionCounts): CanonicalConditionSummary`. Defensive: coerce missing or non-finite numeric fields to `0`.
- [ ] **S1-T4.** Add `getConditionCellDisplay(summary)` bundle helper returning `{ netScore, direction, label, backgroundColor, textColorClass, hasData }`.
  - `hasData: false` → `label = '—'`, `backgroundColor = undefined`, `textColorClass = 'text-gray-500'`.
  - `hasData: true`, `direction === 'neutral'` (real tie) → `label = Math.abs(netScore).toFixed(1)`, `backgroundColor = undefined` (no fill), `textColorClass = 'text-gray-500'` (gray). Without this branch, ties would still render with blue tint because `getCanonicalConditionBackground` has no neutral case.
  - `hasData: true`, `direction !== 'neutral'` → `label = Math.abs(netScore).toFixed(1)`, background from `getCanonicalConditionBackground(Math.abs(netScore), direction === 'opponent')`, textColor from `getCanonicalConditionTextColor(direction === 'opponent')`.
- [ ] **S1-T5.** Keep `getCanonicalConditionBackground` and `getCanonicalConditionTextColor` exported (used by the bundle helper; grep gate FR-013 catches external callers).
- [ ] **S1-T6.** Rewrite `canonicalConditionSummary.test.ts`. Replace all 31 old-field assertions. New test matrix:
  - Five US1 acceptance scenarios → correct `netScore`, `direction`, `label` (absolute magnitude), `backgroundColor`, `textColorClass`.
  - Zero-trial case → `hasData: false`, `netScore: null`, `direction: 'neutral'`, `label: '—'`, `textColorClass: 'text-gray-500'`, `backgroundColor: undefined`.
  - Fractional-count case → finite `netScore`, no crash.
  - Superset-input-ignored case → `MatrixCondition` with extras yields same summary as canonical-only.
  - Inconsistent-extras case → `prioritized: 999` contradicting `strongly + somewhat` still yields the canonical summary (non-canonical fields ignored).
  - Subset-input defense → missing `neutral` key does not crash; treated as 0.
  - Non-finite value defense → `{strongly: 5, somewhat: null, opponentStrongly: NaN, opponentSomewhat: 2, neutral: 0}` (typed via `as unknown as CanonicalConditionCounts` to bypass TS check) does not crash; null/NaN coerce to 0 and only `strongly` + `opponentSomewhat` contribute to netScore.
  - Tie-with-data case → `{strongly: 2, somewhat: 0, opponentStrongly: 2, opponentSomewhat: 0, neutral: 0}` → `hasData: true`, `direction: 'neutral'`, `label: '0.0'`, `backgroundColor: undefined`, `textColorClass: 'text-gray-500'`.
  - Direction tolerance boundary → `netScore = 0.04999` → `'neutral'`; `netScore = 0.05` → `'self'` (or boundary comparator inclusion per FR-003).
  - Label-sign case → contrived `netScore = -1.8` → `label = '1.8'`, opponent `textColorClass`.
- [ ] **S1-T7.** Run `npm run test --workspace @valuerank/web -- canonicalConditionSummary` and confirm green.
- [ ] **S1-T8.** Run `npx tsc --noEmit` from `cloud/apps/web/`. Downstream type errors in `ConditionMatrix.tsx`, `ConditionDecisionsTable.tsx`, `PivotAnalysisTable.tsx` are expected at this point — catalog them for Slices 2 and 3. Non-target files that break must be treated as new finding: stop and report.

### [CHECKPOINT] S1 diff review

- [ ] **S1-C.** Run `feature-factory` diff checkpoint for Slice 1. Reviewers per plan: Codex feasibility-adversarial + Codex edge-cases + Gemini requirements. Reconcile findings. Advance when 0 unaddressed HIGH.

---

## Slice 2 — `ConditionMatrix.tsx` migration (counts path)

Target files:
- `cloud/apps/web/src/components/domains/ConditionMatrix.tsx`
- `cloud/apps/web/tests/pages/DomainAnalysisValueDetail.test.tsx`

### Tasks

- [ ] **S2-T1.** Delete `getConditionMatrixDisplay`, `getPreferenceBackground`, `getPreferenceTextColor` from `ConditionMatrix.tsx`. No thin wrapper can survive — SC-006.4 grep gate catches any leftover.
- [ ] **S2-T2.** At the cell render site, call `summarizeCanonicalConditionCounts({strongly, somewhat, opponentStrongly, opponentSomewhat, neutral})` and `getConditionCellDisplay(summary)`.
- [ ] **S2-T3.** Drop the inner `hasData` fork at the label site. Keep the outer `condition === undefined` check (cell missing from grid — not the same as "has-no-trials"). Render `display.label` / `display.textColorClass` / `display.backgroundColor` unconditionally once a summary exists.
- [ ] **S2-T4.** Update `validateMatrixCondition`:
  - Remove `Number.isInteger` from `isValidCount` — accept `Number.isFinite(v) && v >= 0`.
  - Replace `condition.totalTrials !== expectedTotal` with `Math.abs(condition.totalTrials - expectedTotal) >= 1e-6`.
  - Add cross-field checks (per FR-012.3):
    - `Math.abs((strongly + somewhat) - prioritized) < 1e-6`
    - `Math.abs((opponentStrongly + opponentSomewhat) - deprioritized) < 1e-6`
  - Error message names the divergent field pair.
- [ ] **S2-T5.** Update `DomainAnalysisValueDetail.test.tsx`:
  - **Flip the existing `['non-integer', 1.5]` case** (~line 441 under `rejects invalid canonical counts`) from rejection to acceptance. Fractional counts are now valid; that test row currently asserts the old integer-only rule.
  - Replace hardcoded `0 | 1 | 2` label assertions with decimal labels (e.g. `0.2`, `2.0`, `1.8`, `0.0`) and matching color classes.
  - Add a test feeding fractional `MatrixCondition` (e.g. `prioritized: 10.5, deprioritized: 9.5, neutral: 0`) — renders without red callout.
  - Add a test feeding cross-field inconsistent `MatrixCondition` (`prioritized: 10, strongly + somewhat: 5`) — red callout with divergent-field error.
  - Add a `totalTrials` mismatch test: `{prioritized: 5, deprioritized: 5, neutral: 0, totalTrials: 11}` (off by 1) → red callout fires.
  - Add a tolerance-boundary test: `{prioritized: 5, deprioritized: 5, neutral: 0, totalTrials: 9.9999999}` (within 1e-6) → passes; `{... totalTrials: 9.99999}` (outside 1e-6) → fails. Same pair for cross-field: `strongly + somewhat = 4.9999999` vs `prioritized = 5.0` → passes; `strongly + somewhat = 4.99` vs `prioritized = 5.0` → fails.
  - Add a zero-trial test — renders `—` in `text-gray-500`, no background color.
- [ ] **S2-T6.** Run `npm run test --workspace @valuerank/web -- DomainAnalysisValueDetail`. Run `npx tsc --noEmit` — should be clean for `ConditionMatrix.tsx`.

### [CHECKPOINT] S2 diff review

- [ ] **S2-C.** Run diff checkpoint for Slice 2. Reviewers: Codex feasibility-adversarial + Gemini requirements (edge-cases lens covered by Slice 3's same-pattern review).

---

## Slice 3 — Transcript-based views (transcripts path)

Target files:
- `cloud/apps/web/src/components/analysis/ConditionDecisionsTable.tsx`
- `cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx`
- `cloud/apps/web/tests/components/analysis/ConditionDecisionsTable.test.tsx`
- `cloud/apps/web/tests/components/analysis/PivotAnalysisTable.test.tsx`
- `cloud/apps/web/tests/components/analysis/AnalysisPanel.pairedContent.test.tsx` (plus any sibling `.layout.test.tsx` / `.states.test.tsx` asserting score values)

### Tasks

- [ ] **S3-T1.** In both `ConditionDecisionsTable.tsx` and `PivotAnalysisTable.tsx`, replace the per-cell render path:
  ```ts
  // OLD
  const bg = getCanonicalConditionBackground(summary.winnerScore, summary.isOpponent);
  const textClass = getCanonicalConditionTextColor(summary.isOpponent);
  const label = summary.winnerScore.toFixed(1);
  // NEW
  const display = getConditionCellDisplay(summary);
  // use display.backgroundColor, display.textColorClass, display.label
  ```
- [ ] **S3-T2.** Simplify no-data branches. Keep the outer "summary exists" gate (`hasResolvedCanonicalEvidence` / `hasScore && summary != null`). Drop the inner `summary.winnerScore == null ? '—' : ...` ternary — the bundle helper returns `—` directly.
- [ ] **S3-T3.** In `PivotAnalysisTable.tsx`, migrate the legend bucket classifier (per FR-014): `opponent`/`neutral`/`low` key off `summary.direction` + `summary.hasData`. No magnitude threshold on `Math.abs(netScore)`.
- [ ] **S3-T4.** In `PivotAnalysisTable.tsx`, replace the existing help/legend copy *"Each box in the table shows the model's average preference score (0–2)"* with:
  > *Each box shows a net-weighted preference score from 0.0 to 2.0. Color indicates which side the model preferred: blue for the first value, orange for the opposing value. Gray boxes mean the model's preferences canceled out (a tie). Empty boxes mean no data.*
  
  Minor wording adjustments allowed if they improve clarity; the phrase *"net-weighted preference score"* must remain (asserted by test).
- [ ] **S3-T5.** Update `ConditionDecisionsTable.test.tsx`: replace hardcoded winner-only decimals with net-weighted decimals.
- [ ] **S3-T6.** Update `PivotAnalysisTable.test.tsx`:
  - Replace hardcoded `2.0` labels and click-through assertions with net-weighted values.
  - Add a tie-bucket test: mixed-count tie → `neutral` bucket, not `low`.
  - Add a zero-trial test: `hasData === false` → excluded from all buckets.
  - Add a help-text test: click the `"Details"` toggle button first (help copy is gated behind `showDetails &&` in `PivotAnalysisTable.tsx`), then assert the rendered legend contains the substring `"net-weighted preference score"`.
- [ ] **S3-T7.** Update `AnalysisPanel.pairedContent.test.tsx` (and `.layout.test.tsx` / `.states.test.tsx` if they assert score values) to match new formula.
- [ ] **S3-T8.** Run `npm run test --workspace @valuerank/web -- ConditionDecisionsTable PivotAnalysisTable AnalysisPanel`.
- [ ] **S3-T9.** Run full preflight for `@valuerank/web`: `npm run lint && npm run test && npm run build` from `cloud/`.

### [CHECKPOINT] S3 diff review

- [ ] **S3-C.** Run diff checkpoint for Slice 3. Reviewers: Codex feasibility-adversarial + Codex edge-cases + Gemini requirements.

---

## Ship gates (run before PR)

All grep gates from plan.md `## Grep gates (ship checks)` must pass:

- [ ] **SHIP-G1.** `grep -rn "winnerScore" cloud/apps/web/src` → 0 matches.
- [ ] **SHIP-G2.** `grep -n "selectedValueWinRate" cloud/apps/web/src/utils/canonicalConditionSummary.ts cloud/apps/web/src/components/domains/ConditionMatrix.tsx cloud/apps/web/src/components/analysis/ConditionDecisionsTable.tsx cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx` → 0 matches.
- [ ] **SHIP-G3.** `grep -nE "selectedValueWinRate|isOpponent|winnerScore" cloud/apps/web/src/utils/canonicalConditionSummary.ts` → 0 matches.
- [ ] **SHIP-G4.** `grep -nE "\(2 ?\*" cloud/apps/web/src/components/domains/ConditionMatrix.tsx cloud/apps/web/src/components/analysis/ConditionDecisionsTable.tsx cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx` → 0 matches (no inline `2 *` in the 3 views).
- [ ] **SHIP-G5.** `grep -nE "\.toFixed\(" cloud/apps/web/src/components/domains/ConditionMatrix.tsx cloud/apps/web/src/components/analysis/ConditionDecisionsTable.tsx cloud/apps/web/src/components/analysis/PivotAnalysisTable.tsx` → 0 matches (labels come from bundle helper).
- [ ] **SHIP-G6.** `grep -n "Math.abs" cloud/apps/web/src/components/domains/ConditionMatrix.tsx` → only inside `validateMatrixCondition`.
- [ ] **SHIP-G7.** `grep -rnE "getCanonicalConditionTextColor|getCanonicalConditionBackground" cloud/apps/web/src --include="*.tsx" --include="*.ts" | grep -v canonicalConditionSummary.ts` → 0 matches outside the shared module.
- [ ] **SHIP-G8.** `grep -rnE "getConditionMatrixDisplay|getPreferenceBackground|getPreferenceTextColor" cloud/apps/web/src` → 0 matches.

---

## Closeout

- [ ] **CLOSE-1.** Open PR against `chrislawcodes/valuerank`.
- [ ] **CLOSE-2.** Confirm CI green. Fix failures via `ci-fix` skill if needed.
- [ ] **CLOSE-3.** Squash-merge.
- [ ] **CLOSE-4.** Write `closeout.md` summarizing slices, findings addressed, deferred items.

### [CHECKPOINT] Final closeout

- [ ] **FINAL-C.** Single-pass closeout review per plan.md.

# Tasks: Replace Legacy decisionCode in Domain Analysis

**Feature run:** `replace`
**Wave:** 1 (single wave)

---

## Wave 1 Tasks

### Backend

- [ ] **decision-model.ts** — move `orientationFlipped == null` guard to after the job-choice-v2 block in `resolveCanonicalDecision`
- [ ] **shared.ts** — remove `classifyDecisionForSelectedValue` function
- [ ] **shared.ts** — remove `meanDecisionScore: number | null` from `DomainAnalysisConditionDetail` type
- [ ] **shared.ts** — add `strongly`, `somewhat`, `opponentSomewhat`, `opponentStrongly`, `unknownCount`, `meanPreferenceScore`, `opponentMeanPreferenceScore`, `selectedValueWinRate` to `DomainAnalysisConditionDetail`
- [ ] **analysis.ts** — remove `decisionCode: { in: ['1','2','3','4','5'] }` filter from all three resolvers
- [ ] **analysis.ts** — add `decisionMetadata: true` to all transcript selects
- [ ] **analysis.ts** (`domainAnalysisValueDetail`) — remove `MutableCondition.decisionSum`
- [ ] **analysis.ts** (`domainAnalysisValueDetail`) — rewrite per-transcript loop to use `resolveCanonicalDecision` → five-bucket classification
- [ ] **analysis.ts** (`domainAnalysisValueDetail`) — compute `meanPreferenceScore`, `opponentMeanPreferenceScore`, updated `selectedValueWinRate` on conditions
- [ ] **types.ts** — remove `meanDecisionScore` from `DomainAnalysisConditionDetailRef` builder
- [ ] **types.ts** — add new fields to `DomainAnalysisConditionDetailRef` builder

### Frontend

- [ ] **domainAnalysis.ts** — remove `meanDecisionScore` from both GQL queries, add new fields including `opponentMeanPreferenceScore`
- [ ] **domainAnalysis.ts** — update `DomainAnalysisValueDetailCondition` TypeScript type
- [ ] **DomainAnalysisValueDetail.tsx** — update `MatrixCondition` type
- [ ] **DomainAnalysisValueDetail.tsx** — replace `getHeatmapColor` with `getPreferenceBackground(score, isOpponent)`
- [ ] **DomainAnalysisValueDetail.tsx** — replace `getScoreTextColor` with `getPreferenceTextColor(isOpponent)`
- [ ] **DomainAnalysisValueDetail.tsx** — update `ConditionMatrix` cell rendering: use winner's score display, blue/orange per value name
- [ ] **DomainAnalysisValueDetail.tsx** — add unknown count badge in footnote
- [ ] **DomainAnalysisValueDetail.tsx** — color value names in pair subtitle

### Verification

- [ ] `npm run lint --workspace @valuerank/api` passes
- [ ] `npm run test --workspace @valuerank/api` passes
- [ ] `npm run build --workspace @valuerank/api` passes
- [ ] `npm run lint --workspace @valuerank/web` passes
- [ ] `npm run test --workspace @valuerank/web` passes
- [ ] `npm run build --workspace @valuerank/web` passes

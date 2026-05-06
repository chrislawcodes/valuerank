# Tasks — vignette-paired-analysis

Slug: `vignette-paired-analysis`
Workflow: Feature Factory
Plan: `plan.md`
Spec: `spec.md`

This file decomposes the plan's four slices into executable tasks with `[CHECKPOINT]` markers. Each slice should fit under ~300 lines diff. Each task lists the files it touches and the verification step.

---

## Slice 1 — Backend (`definitionId` arg + companion resolution + telemetry)

Estimated diff: ~150 lines added, 0 deleted. Workspace: `@valuerank/api`.

### 1.1 Add `expandToCompanionDefinition` helper

- File: `cloud/apps/api/src/services/pressure-sensitivity/snapshot-builder.ts`
- Action: add a private async helper `expandToCompanionDefinition(definitionId: string)`. Imports `findPairedCompanion` from `cloud/apps/api/src/utils/auto-pair.ts`.
- Behavior:
  - Load definition via `db.definition.findUnique({ where: { id: definitionId, deletedAt: null } })`.
  - If not found: throw `NotFoundError('Definition', definitionId)`.
  - Read methodology via the existing `getDefinitionMethodology` parsing pattern.
  - If `methodology.pair_key` is missing: return `{ ids: [definitionId], status: 'not_paired' }`.
  - Query candidates: `db.definition.findMany({ where: { id: { not: definitionId }, domainId: input.domainId, deletedAt: null, content: { path: ['methodology', 'pair_key'], equals: pairKey } } })`.
  - If `candidates.length > 1`: throw `AppError('pair_key_companion_collision', { pairKey, definitionId, candidateCount: candidates.length })`.
  - If `candidates.length === 0`: return `{ ids: [definitionId], status: 'companion_missing' }`.
  - Call `findPairedCompanion(input, candidates)`. If null (mirroring failure): throw `AppError('pair_key_companion_mirror_failure')`.
  - Otherwise return `{ ids: [definitionId, companion.id], status: 'paired' }`.
- Export the constant `PAIR_KEY_COMPANION_COLLISION = 'pair_key_companion_collision'` per RR-9.

### 1.2 Thread `definitionId` through `preparePressureSensitivityState`

- File: `cloud/apps/api/src/services/pressure-sensitivity/snapshot-builder.ts`
- Action: extend the function signature to `preparePressureSensitivityState({ domainId, signature, definitionId })`. When `definitionId` is set, call `expandToCompanionDefinition`, then add `definitionId: { in: expanded.ids }` to the `db.run.findMany` `where` clause. Domain filter is implicitly bounded via the helper's candidate query (per plan round 2 clarification).
- Pass through the helper's `status` so `getPressureSensitivityResult` can use it.

### 1.3 Update `getPressureSensitivityResult` to skip cache and emit telemetry

- File: `cloud/apps/api/src/services/pressure-sensitivity/snapshot-cache.ts`
- Action: extend the params shape to accept `definitionId: string | null`. When non-null:
  - Skip the snapshot read (`assumptionAnalysisSnapshot.findFirst`) and write paths.
  - Wrap the synchronous compute (`preparePressureSensitivityState` + `buildPressureSensitivitySnapshotOutput`) in a structured timer using the existing `createLogger` pattern. Log `{ definitionId, runCount: state.eligibleRuns.length, durationMs }` at `info` level.
  - Catch `AppError('pair_key_companion_collision')` (and `'pair_key_companion_mirror_failure'`). Convert to a result with `models: []`, `insufficient: []`, and `excludedDefinitions: [{ definitionId, name: <looked-up>, reason: <code> }]`.
  - Continue to call `filterResult` for `modelIds` / `providerId` filtering.

### 1.4 Add the `definitionId` argument on the resolver

- File: `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts`
- Action: add `definitionId: t.arg.id({ required: false })` to the args. Validation: when both `domainId` and `definitionId` are passed, throw `ValidationError('Pass either domainId or definitionId, not both')`. Pass through to `getPressureSensitivityResult`.

### 1.5 Slice 1 verification

- `npm run lint --workspace @valuerank/shared` (no changes expected, but run anyway to surface accidental import drift).
- `npm run lint --workspace @valuerank/api`.
- `npm run test --workspace @valuerank/api`.
- `npm run build --workspace @valuerank/api`.
- Manual: query the new arg via the dev MCP client to confirm wiring.

[CHECKPOINT]

---

## Slice 2 — Frontend new path (GraphQL op + codegen + new page + route)

Estimated diff: ~250 lines added, 0 deleted. Workspace: `@valuerank/web`.

### 2.1 Update the GraphQL operation

- File: `cloud/apps/web/src/api/operations/pressureSensitivity.graphql`
- Action: add `$definitionId: ID` to the operation header. Pass `definitionId: $definitionId` to the field call. Selection set unchanged.

### 2.2 Run codegen

- Command: `npm run codegen --workspace @valuerank/web` from `cloud/`.
- Files regenerated: `cloud/apps/web/src/api/operations/pressureSensitivity.ts`, `cloud/apps/web/src/generated/graphql.ts`.
- Verify: `PressureSensitivityQueryVariables` includes `definitionId?: string | null`.
- Commit the regenerated files alongside the .graphql change.

### 2.3 Create `VignettePairedAnalysis.tsx`

- File: `cloud/apps/web/src/pages/VignettePairedAnalysis.tsx` (new, ~120 lines)
- Imports (composition only — no new components):
  - `useDefinition` from `../hooks/useDefinition`
  - `useQuery` from `urql`
  - `PRESSURE_SENSITIVITY_QUERY` from `../api/operations/pressureSensitivity`
  - `PressureSensitivityDetail`, `PressureSensitivityLimitations` from `../components/models/`
  - `getPairedOrientationLabels`, `isPairedMethodology` from `../utils/methodology`
  - `Loading`, `ErrorMessage`, `Alert` (existing)
- Behavior:
  - Read `:definitionId` and `?signature=` from route.
  - When `?signature=` is missing, derive default by querying both vignettes' completed runs, picking the most-recent signature, falling back to `vnewtd`. Write the resolved signature back to URL via `setSearchParams` mirroring `PressureSensitivity.tsx:173-180`.
  - Render header with `getPairedOrientationLabels(definition.content)`.
  - Render `<Loading>` while `useQuery` is in flight.
  - Render `<ErrorMessage>` on query error.
  - When `result.excludedDefinitions[].some(e => e.reason === PAIR_KEY_COMPANION_COLLISION)`: render non-dismissible alert "Cannot analyze this vignette pair — multiple companion vignettes share its pair_key. Contact support to resolve."
  - When `result.excludedDefinitions[].some(e => e.reason === 'companion_missing')` or `definitionsMeasured < 2`: render banner "Companion vignette has no completed runs yet — showing single-direction data."
  - When `result.excludedDefinitions[].some(e => e.reason === 'not_paired')`: render banner "This vignette is not part of a paired analysis."
  - When two signatures differ across the pair: render info banner per RR-7 update.
  - Map `result.models` → `<PressureSensitivityDetail model={model} />`.
  - Compose `<PressureSensitivityLimitations>` for `result.pressureConditionExclusionBreakdown` and `result.transcriptCapHit`.

### 2.4 Register the route

- File: `cloud/apps/web/src/App.tsx`
- Action: import `VignettePairedAnalysis` from `./pages/VignettePairedAnalysis`. Add `<Route path="/vignette/:definitionId/paired" element={<ProtectedLayout><VignettePairedAnalysis /></ProtectedLayout>} />` near line 280 (alongside the existing `/analysis/:id` routes). The page itself does NOT wrap in `<ProtectedLayout>` — wrapping at the route only.

### 2.5 Slice 2 verification

- `npm run lint --workspace @valuerank/web`.
- `npm run test --workspace @valuerank/web`.
- `npm run build --workspace @valuerank/web`.
- Manual smoke: navigate to `/vignette/<paired-vignette-id>/paired` in dev. Confirm:
  - Page loads without crashing.
  - URL is rewritten with `?signature=...` if absent on entry.
  - Per-model rows render with grids that expand on click.

[CHECKPOINT]

---

## Slice 3 — Frontend cleanup (link, redirect, deletion, prop cascade)

Estimated diff: ~250 lines added, ~700 lines deleted. Workspace: `@valuerank/web`.

### 3.1 Extract legacy heuristic to its tombstone file

- File: `cloud/apps/web/src/utils/legacyCompanionPairedRun.ts` (new, ~35 lines)
- Action: copy `findCompanionPairedRun`, `getRunConfigBatchGroupId`, `getDefinitionPairKey` verbatim from `PairedRunComparisonCard.tsx`. Add `@deprecated` JSDoc header that includes a link to follow-up ticket (created at delivery time per RR-3).

### 3.2 Update `AnalysisConditionDetail.tsx` import

- File: `cloud/apps/web/src/pages/AnalysisConditionDetail.tsx`
- Action: change line 7 import from `'../components/analysis/PairedRunComparisonCard'` to `'../utils/legacyCompanionPairedRun'`. No behavior change.

### 3.3 Delete `PairedRunComparisonCard.tsx`

- File: `cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx`
- Action: **DELETE** the entire 645-line file.

### 3.4 Update `AnalysisDetail.tsx`

- File: `cloud/apps/web/src/pages/AnalysisDetail.tsx`
- Actions:
  - Remove `findCompanionPairedRun` import (line 16).
  - Delete the legacy companion-search effect block (lines 173-223): `hasDirectCompanionRunId`, `directCompanionRun` `useRun`, `shouldUseLegacyCompanionSearch`, `legacyCompanionSearch` `useInfiniteRuns`, `legacyCompanionRun`, the pagination `useEffect`, `companionRun`, `companionAnalysis` `useAnalysis`, `companionRunWithTranscripts`.
  - Delete `handleModeChange` (lines 132-144) and the `analysisMode` plumbing.
  - Add a "View paired analysis" link near `launchModeLabel` (line ~307) that navigates to `/vignette/${run.definition.id}/paired` when `methodology?.pair_key != null`.
  - Add 4-branch redirect logic for legacy `?mode=paired` URLs (per A9 + Codex M4):
    - (a) no `pair_key` AND no `companionRunId` → render single-mode silently
    - (b) `pair_key` AND `definition.id` present → `navigate(/vignette/${definition.id}/paired, { replace: true })`
    - (c) `pair_key` present but `definition.id` missing → render single-mode + non-dismissible Alert with search-by-name link
    - (d) `companionRunId` present but `pair_key` absent → render single-mode + amber notice "Legacy paired analysis URLs without canonical pair metadata are deprecated."
  - Pass `companionAnalysis={null}`, `companionRun={null}` to `<AnalysisPanel>` until cascade cleanup in 3.5.

### 3.5 Cascade companion-prop cleanup

- File: `cloud/apps/web/src/components/analysis/AnalysisPanel.tsx`
  - Remove `companionAnalysis`, `companionRun`, `analysisMode`, `onAnalysisModeChange` props (type, destructuring, hook deps, child invocations at lines 333, 336).
  - Remove the Single/Paired mode toggle UI.
- File: `cloud/apps/web/src/components/analysis/tabs/OverviewTab.tsx`
  - Remove `companionAnalysis`, `companionRun` props and pass-throughs (lines 35, 38, 57, 60, 71, 81).
- File: `cloud/apps/web/src/components/analysis/tabs/OverviewSummaryTable.tsx`
  - Remove `companionAnalysis`, `companionRun` props (lines 45, 55, 63, 73).
  - Remove `companionConditionRows` memo (lines 110-111).
  - Remove the paired-merge variance branch (lines 120-141).
  - Remove paired-row rendering (lines 271, 276, 309, 310).
  - Add an inline "View paired analysis" link in the table header when `methodology.pair_key` is present.

### 3.6 Slice 3 verification

- `npm run lint --workspace @valuerank/web`.
- `npm run build --workspace @valuerank/web` (TypeScript catches any importer of deleted symbols).
- Manual grep: `grep -rn 'PairedRunComparisonCard' cloud/apps/web/src/` returns zero matches.
- Manual smoke: navigate to a legacy paired URL `/analysis/<runId>?mode=paired` for each of the four redirect branches. Confirm correct fallback in each case.

[CHECKPOINT]

---

## Slice 4 — Verification (regression tests + deletion grep + redirect tests)

Estimated diff: ~150 lines added, 0 production code changes.

### 4.1 Equal-weight regression test (API)

- File: `cloud/apps/api/src/services/pressure-sensitivity/snapshot-compute.test.ts` (extend existing or add new test cases)
- Action: add fixtures and assertions:
  - Fixture A: 100 trials direction A, 10 trials direction B → assert `directionBalancedWinRate ≈ (rateA + rateB) / 2`.
  - Fixture B: 0 trials A, 10 B → assert result equals B's rate.
  - Fixture C: 0 trials both → assert null.
  - Fixture D: equal trials → assert average.
  - Fixture E: null winRate in one direction (all unscored) → assert non-null direction's rate (NOT NaN).
  - Fixture F: null winRate in both → assert null.

### 4.2 Companion resolution tests (API)

- File: `cloud/apps/api/src/services/pressure-sensitivity/snapshot-builder.test.ts` (new or extend)
- Action: cover `expandToCompanionDefinition` cases:
  - Single companion → `{ ids: [selfId, companionId], status: 'paired' }`.
  - Multi-candidate → throws `AppError('pair_key_companion_collision')`.
  - No candidate → `{ ids: [selfId], status: 'companion_missing' }`.
  - Missing `pair_key` → `{ ids: [selfId], status: 'not_paired' }`.
  - Mirroring failure (findPairedCompanion returns null) → throws `AppError('pair_key_companion_mirror_failure')`.

### 4.3 Resolver validation tests (API)

- File: `cloud/apps/api/src/graphql/queries/pressure-sensitivity.test.ts` (new or extend)
- Action: cover the resolver-level args:
  - `domainId: X, definitionId: Y` → ValidationError.
  - `definitionId: Y` (valid) → returns a result; assert `definitionsMeasured` >= 1 in fixture.
  - `domainId: X` only → unchanged behavior.

### 4.4 New page tests (web)

- File: `cloud/apps/web/src/pages/VignettePairedAnalysis.test.tsx` (new)
- Action: 6 test cases (per Gemini F-1/F-2):
  - Loading state renders `<Loading>`.
  - Error state renders `<ErrorMessage>`.
  - Empty result renders empty banner.
  - Collision case renders non-dismissible alert.
  - Success case renders `<PressureSensitivityDetail>` per model.
  - URL rewrite fires when `?signature=` is missing.

### 4.5 Redirect logic tests (web)

- File: `cloud/apps/web/src/pages/AnalysisDetail.test.tsx` (extend)
- Action: assert each of the 4 redirect branches renders the expected outcome.

### 4.6 Cross-repo deletion grep

- Command: `grep -rn 'PairedRunComparisonCard\|buildComparisonRows' --include='*.ts' --include='*.tsx' --include='*.md' /Users/chrislaw/valuerank/`
- Expected: zero matches.

### 4.7 Pre-merge manual verification

- Navigate to `/vignette/<id>/paired` for:
  - (a) vignette with both directions complete
  - (b) vignette with only one direction complete
  - (c) vignette with a `pair_key` collision (set up in dev fixture; if not feasible, mock the API response)

### 4.8 Final preflight

- From `cloud/`:
  - `npm run lint --workspace @valuerank/shared`
  - `npm run lint --workspace @valuerank/db`
  - `npm run lint --workspace @valuerank/api`
  - `npm run test --workspace @valuerank/api`
  - `npm run build --workspace @valuerank/api`
  - `npm run lint --workspace @valuerank/web`
  - `npm run test --workspace @valuerank/web`
  - `npm run build --workspace @valuerank/web`

[CHECKPOINT]

---

## Final-state acceptance

A reviewer reading the final diff should see:

- Backend: `pressureSensitivity` accepts `definitionId`. New `expandToCompanionDefinition` helper. Cache skipped on definitionId path. Telemetry emitted.
- Frontend: new `VignettePairedAnalysis` page reachable at `/vignette/:definitionId/paired`. `AnalysisDetail` links to it. Legacy `?mode=paired` URLs redirect or alert. The `PairedRunComparisonCard.tsx` file is gone. Companion props no longer flow through `AnalysisPanel`/`OverviewTab`/`OverviewSummaryTable`.
- Tests: equal-weight regression, companion resolution, resolver validation, new page rendering, legacy redirect.
- Net LOC: ~700 lines deleted, ~550 lines added (including ~150 of test code). Net negative.

If the diff matches this shape, the feature is ready for delivery.

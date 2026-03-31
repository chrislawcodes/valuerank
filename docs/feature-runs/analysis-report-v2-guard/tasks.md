# Tasks
# Tasks: Report Decision Model v2 Guard

## Slice 1 [CHECKPOINT]

Harden the shared report helper contract and remove legacy fallback from audit
sorting.

**Type:** internal

**Estimated diff size:** 220-280 lines

### Tasks

1. Add `requireRenderableTranscriptDecisionModelV2(...)` to
   `transcriptDecisionModel.ts` and make it throw a clear error that names the
   helper or page context and the missing canonical v2 data.
2. Update `getTranscriptDecisionSortValue(...)` so audit-mode sorting derives
   from canonical v2 `direction` and `strength` instead of
   `legacy.canonicalScore`.
3. Make `reportDecisionDisplay.ts` strict so summary normalization throws when
   canonical v2 data is missing instead of returning an unknown fallback.
4. Update the helper tests so they cover:
   - the renderable happy path
   - the guard failure path
   - canonical-only strict-majority and mixed headline behavior
5. Add or update the transcript-model tests so they prove audit sorting works
   without reading `legacy.canonicalScore`.

### Verification

- `npm run test --workspace=@valuerank/web -- tests/utils/transcriptDecisionModel.test.ts tests/utils/reportDecisionDisplay.test.ts`
- `npm run build --workspace=@valuerank/web`

## Slice 2 [CHECKPOINT]

Update the transcript report surfaces to validate canonical v2 before rendering
any report output.

**Type:** internal

**Estimated diff size:** 240-300 lines

### Tasks

1. Update `AnalysisTranscripts.tsx` so it validates the filtered transcript set
   with the shared guard before choosing report summary or viewer mode.
2. Update `DomainAnalysisValueDetail.tsx` so the selected-condition transcript
   set must be renderable canonical v2 before it reaches the report list or
   viewer.
3. Remove any remaining report-page fallback to legacy display mode on those
   pages.
4. Update the page tests so they cover:
   - canonical happy-path rendering
   - guard failure when a selected transcript lacks canonical v2 data
   - no fallback to legacy report text

### Verification

- `npm run test --workspace=@valuerank/web -- tests/pages/AnalysisTranscripts.test.tsx tests/pages/DomainAnalysisValueDetail.test.tsx`
- `npm run build --workspace=@valuerank/web`

## Slice 3 [CHECKPOINT]

Update the condition detail report so it keeps its visible layout while sourcing
counts from canonical v2 data only.

**Type:** internal

**Estimated diff size:** 180-240 lines

### Tasks

1. Update `AnalysisConditionDetail.tsx` to derive its decision buckets from
   canonical v2 data rather than legacy score fields.
2. Guard the condition transcript rows before summary generation so a missing
   canonical transcript fails loudly instead of showing a legacy-derived count.
3. Keep the visible table and navigation behavior unchanged for valid data.
4. Update the page test to prove the canonical happy path still renders and the
   guard path fails on legacy-only rows.

### Verification

- `npm run test --workspace=@valuerank/web -- tests/pages/AnalysisConditionDetail.test.tsx`
- `npm run build --workspace=@valuerank/web`

## Slice 4 [CHECKPOINT]

Update the survey matrix report so every visible cell summary is canonical-only.

**Type:** internal

**Estimated diff size:** 180-240 lines

### Tasks

1. Update `SurveyResults.tsx` so cell summaries are built only from renderable
   canonical transcripts.
2. Remove any report-cell fallback to legacy decision codes, legacy compat
   scores, or unknown states.
3. Keep the canonical majority / mixed headline behavior for valid renderable
   data.
4. Update the page test to prove the happy path still renders and the guard
   path fails when canonical v2 data is missing.

### Verification

- `npm run test --workspace=@valuerank/web -- tests/pages/SurveyResults.test.tsx`
- `npm run build --workspace=@valuerank/web`

## Final Validation

After all slices:

- run `npm run test` from `cloud/`
- run `npm run build` from `cloud/`
- confirm the feature run is ready for review and PR staging

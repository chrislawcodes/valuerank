# Transcript Decision Model: Winner-First Storage - Plan

## Goal

Keep the current visible analysis surfaces unchanged while making transcript
decision handling more explicit internally:

- `favoredValueKey` and `strength` are the primary decision facts
- `presentationOrder` is stored as internal metadata in the transcript summary
  cache
- `direction` is derived at read time, not treated as the primary stored fact
- paired counting continues to pool A-first and B-first runs safely

## Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| Storage location | Store winner-first metadata in the existing transcript `decisionMetadata.summaryCache.summary` payload, including a small `decisionState` discriminator | Avoids a schema migration and keeps neutral vs unknown readable without guessing |
| Canonical reference frame | Use the transcript's `definitionSnapshot.methodology.pair_key` for pair identity and the transcript definition `dimensions` order for canonical value order | This anchors the cached interpretation to the transcript version that was actually summarized |
| Neutral / unresolved handling | `neutral` becomes `favoredValueKey: null`, `strength: neutral`, `direction: neutral`; ambiguous or unparseable responses stay `unknown` | Prevents forced winners while preserving refusal / ambiguity signals |
| Read path | Prefer cached winner-first metadata when it exists, is well-formed, and matches the transcript freshness keys; otherwise keep the current computed fallback path | Lets us speed up future reads without breaking historical transcripts, stale cache rows, or malformed cache rows |
| Legacy coexistence | Do not backfill historical rows in this feature | Existing transcripts remain readable through the current compatibility path, and the new cache only applies to newly summarized transcripts |
| UI scope | Keep all existing visible labels and report shapes; fix the B-first paired comparison mapping only | The product asked for stronger counting behind the scenes, not a new reporting surface |

## Architecture Notes

### Backend flow

1. The summarize handler receives the worker summary and the transcript row.
2. The handler stores the worker's raw decision metadata as it does today.
3. The handler also stores a compact winner-first cache in
   `decisionMetadata.summaryCache.summary` with:
   - `favoredValueKey`
   - `strength`
   - `presentationOrder`
   - `cacheVersion`
   - `decisionState`
   - freshness keys (`responseSha256`, `parserVersion`, `modelId`)
4. The transcript resolver reads the cache when present and derives
   `direction` from the canonical pair order.
5. If the cache is absent, stale, or malformed, the resolver falls back to the
   existing parse path.

### Canonical ordering rule

- `methodology.pair_key` identifies the pair.
- `dimensions[0]` / `dimensions[1]` define the canonical value order.
- `presentation_order` only says whether the vignette was shown as A-first or
  B-first in that run.
- `direction` is always derived relative to the canonical pair order.

### Neutral and unknown behavior

- `neutral` means the model explicitly chose neither side.
- `unknown` means the model response could not be parsed into a stable
  decision.
- Unknown responses must remain distinguishable from explicit neutral outcomes
  so the analysis layer can count them separately.

## Blast Radius

### Direct

- `cloud/packages/db/src/types.ts`
- `cloud/apps/api/src/queue/handlers/summarize-transcript.ts`
- `cloud/apps/api/src/graphql/queries/domain/decision-model.ts`
- `cloud/apps/api/src/graphql/types/transcript.ts`
- `cloud/apps/web/src/utils/transcriptDecisionModel.ts`
- `cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx`
- `cloud/apps/api/src/routes/export.ts`

### Secondary

- `cloud/apps/api/tests/queue/handlers/summarize-transcript.test.ts`
- `cloud/apps/api/tests/graphql/types/transcript-decision-model-v2.test.ts`
- `cloud/apps/api/tests/graphql/queries/decision-model.test.ts`
- `cloud/apps/web/tests/components/analysis/PairedRunComparisonCard.test.tsx`
- `cloud/apps/api/tests/services/export/decision-display.test.ts`
- `cloud/apps/api/tests/services/export/xlsx/*`

## Wave Breakdown

### Slice 1 [CHECKPOINT]

Add winner-first summary caching and resolver support on the backend.

Files:

- `cloud/packages/db/src/types.ts`
- `cloud/apps/api/src/queue/handlers/summarize-transcript.ts`
- `cloud/apps/api/src/graphql/queries/domain/decision-model.ts`
- `cloud/apps/api/tests/queue/handlers/summarize-transcript.test.ts`
- `cloud/apps/api/tests/graphql/types/transcript-decision-model-v2.test.ts`
- `cloud/packages/db/package.json`

Goals:

1. Persist the winner-first cache in existing transcript metadata.
2. Keep neutral and unknown outcomes distinct.
3. Keep historical transcripts readable without backfill.
4. Make the transcript resolver accept the cached canonical fields when
   present, but preserve the current fallback behavior.
5. Keep the cache freshness keys and `decisionState` aligned so stale rows
   cannot silently masquerade as valid winner-first data.

Estimated diff:

- About 220-280 lines

### Slice 2 [CHECKPOINT]

Fix the paired comparison B-first mapping and add regression coverage.

Files:

- `cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx`
- `cloud/apps/web/tests/components/analysis/PairedRunComparisonCard.test.tsx`

Goals:

1. Map B-first rows so the first and second values stay in canonical order.
2. Keep the visible labels and layout unchanged.
3. Add a regression test that fails if the B-first row is inverted again.

Estimated diff:

- About 80-140 lines

## Verification

### Slice 1

```bash
cd /Users/chrislaw/valuerank/cloud
npm run lint --workspace @valuerank/api
npm run test --workspace @valuerank/api -- tests/queue/handlers/summarize-transcript.test.ts tests/graphql/types/transcript-decision-model-v2.test.ts tests/graphql/queries/decision-model.test.ts
npm run build --workspace @valuerank/db
npm run test --workspace @valuerank/db
```

### Slice 2

```bash
cd /Users/chrislaw/valuerank/cloud
npm run lint --workspace @valuerank/web
npm run test --workspace @valuerank/web -- tests/components/analysis/PairedRunComparisonCard.test.tsx
```

## Risk Callouts

- The backend slice should not introduce a schema migration; if the cache cannot
  live in existing transcript metadata, stop and escalate.
- The resolver should not guess at canonical order from anything other than the
  definition pair order and the existing orientation metadata.
- The frontend slice is intentionally narrow: fix the swapped B-first indices
  and nothing else.

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Neutral outcomes are now explicit, canonical order is defined by the definition pair plus dimensions order, the cache lives in existing transcript metadata, and historical rows stay readable without backfill.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: Ambiguous and unparseable responses stay unknown instead of being forced into neutral, the pair identity comes from the existing pair_key, and the backend cache is optional so old rows remain compatible.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: The plan now defines the canonical reference frame, pair identity, neutral handling, and the migration boundary in a way the codebase can implement without a schema migration.
- review: reviews/plan.gemini.architecture-adversarial.review.md | status: accepted | note: Accepted: the cache is versioned by freshness keys plus decisionState, stale or malformed rows fall back explicitly, export paths are in the blast radius, and slice 1 includes an end-to-end handler-to-GraphQL check plus db validation.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: Accepted: slice 1 now covers equivalence, malformed cache, stale cache, and malformed definition cases; slice 2 keeps the utility contract under test; and verification includes db plus web compatibility paths.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: Accepted: the canonical frame is anchored to the transcript definition snapshot, stale cache rows fall back explicitly, and the slice boundaries now reflect the full paired-counting and display fix without treating the change as cosmetic.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: Accepted: the implementation is sequenced in two slices but will only ship after both are complete; slice 1 now includes the handler-to-GraphQL integration test, and slice 2 stays tightly focused on the B-first display bug.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: Accepted: slice 1 now validates the db package, malformed and stale cache rows, and the handler-to-GraphQL path; slice 2 keeps the component regression test narrow; and the export blast radius is called out in the plan.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: Accepted: the cache now carries an explicit decisionState plus freshness keys, the canonical frame is anchored to the transcript snapshot, and stale-looking rows fall back instead of silently masquerading as valid data.

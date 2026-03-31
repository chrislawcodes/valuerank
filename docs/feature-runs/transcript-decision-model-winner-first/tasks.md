# Transcript Decision Model: Winner-First Storage - Tasks

## Slice 1 [CHECKPOINT]

**Goal:** Persist a winner-first cache in the transcript summary metadata and
teach the resolver to use it when available.

**Files**

- `cloud/packages/db/src/types.ts`
- `cloud/apps/api/src/queue/handlers/summarize-transcript.ts`
- `cloud/apps/api/src/graphql/queries/domain/decision-model.ts`
- `cloud/apps/api/tests/queue/handlers/summarize-transcript.test.ts`
- `cloud/apps/api/tests/graphql/types/transcript-decision-model-v2.test.ts`
- `cloud/packages/db/package.json`

**Work**

1. Extend the summary cache types so `summaryCache.summary` can hold a compact
   winner-first cache with:
   - `favoredValueKey`
   - `strength`
   - `presentationOrder`
   - `cacheVersion`
   - `decisionState`
   - freshness keys (`responseSha256`, `parserVersion`, `modelId`)
2. Update the summarize handler so a freshly summarized transcript stores the
   winner-first cache inside the existing `decisionMetadata.summaryCache.summary`
   JSON payload.
3. Keep neutral outcomes explicit:
   - `favoredValueKey = null`
   - `strength = neutral`
   - `direction = neutral`
4. Keep unresolved responses explicit:
   - ambiguous / unparseable responses stay `unknown`
   - they do not get collapsed into neutral
5. Update the transcript decision resolver so it can read the cached
   winner-first metadata when it exists, but still falls back to the current
   parse path for older rows.
6. Keep `methodology.pair_key` and the definition `dimensions` order as the
   canonical frame used to derive direction.
7. Add regression tests proving:
   - the summary cache includes the new winner-first fields
   - neutral remains neutral
   - unresolved transcripts remain unknown
   - cached and computed transcripts still resolve to the same canonical
     envelope
   - malformed cached metadata falls back to the computed path
   - stale but syntactically valid cached metadata falls back to the computed
     path
   - missing or corrupt definition metadata still resolves safely as unknown
   - the summarize handler to GraphQL transcript query path still returns the
     same canonical envelope for a B-first transcript

**Estimated diff**

- About 220-280 lines

**Verification**

- `cd cloud && npm run lint --workspace @valuerank/api`
- `cd cloud && npm run test --workspace @valuerank/api -- tests/queue/handlers/summarize-transcript.test.ts tests/graphql/types/transcript-decision-model-v2.test.ts tests/graphql/queries/decision-model.test.ts`
- `cd cloud && npm run build --workspace @valuerank/db`
- `cd cloud && npm run test --workspace @valuerank/db`
- `cd cloud && npm run test --workspace @valuerank/web -- tests/utils/transcriptDecisionModel.test.ts`

**Exit rule**

- Newly summarized transcripts carry the winner-first cache in existing
  metadata, and old transcripts still resolve through the compatibility path
  without a backfill.

## Slice 2 [CHECKPOINT]

**Goal:** Fix the paired comparison B-first mapping without changing the
visible report labels.

**Files**

- `cloud/apps/web/src/components/analysis/PairedRunComparisonCard.tsx`
- `cloud/apps/web/tests/components/analysis/PairedRunComparisonCard.test.tsx`

**Work**

1. Swap the B-first value key mapping so the first/second values stay in
   canonical order.
2. Leave the visible layout, labels, and report structure unchanged.
3. Add a regression test that fails if the B-first row is inverted again.

**Estimated diff**

- About 80-140 lines

**Verification**

- `cd cloud && npm run lint --workspace @valuerank/web`
- `cd cloud && npm run test --workspace @valuerank/web -- tests/components/analysis/PairedRunComparisonCard.test.tsx tests/utils/transcriptDecisionModel.test.ts`

**Exit rule**

- The paired comparison card shows the same labels as before, but the B-first
  row no longer swaps the first and second value counts.

## Final Validation

After both slices:

- run `cd cloud && npm run lint --workspace @valuerank/api`
- run `cd cloud && npm run lint --workspace @valuerank/web`
- run `cd cloud && npm run test --workspace @valuerank/api`
- run `cd cloud && npm run test --workspace @valuerank/web`
- run `cd cloud && npm run build --workspace @valuerank/api`
- run `cd cloud && npm run build --workspace @valuerank/web`

## Review Reconciliation

- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: Slice 1 now has explicit neutral and unknown handling, a defined canonical frame, and a no-backfill migration boundary.
- review: reviews/spec.gemini.edge-cases-adversarial.review.md | status: accepted | note: Slice 1 keeps unresolved responses distinct from neutral outcomes and uses the existing pair_key as the pair identity.
- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: Slice 1 keeps the backend cache optional, uses the definition order as the canonical frame, and avoids a schema migration.
- review: reviews/tasks.gemini.dependency-order-adversarial.review.md | status: accepted | note: The implementation is sequenced in two slices but will only ship after both are complete; slice 1 now includes the handler-to-GraphQL integration test, and slice 2 stays tightly focused on the B-first display bug.
- review: reviews/tasks.gemini.coverage-adversarial.review.md | status: accepted | note: Slice 1 now validates the db package, malformed and stale cache rows, and the handler-to-GraphQL path; slice 2 keeps the component regression test narrow; and the export blast radius is called out in the plan.
- review: reviews/tasks.codex.execution-adversarial.review.md | status: accepted | note: The cache now carries an explicit decisionState plus freshness keys, the canonical frame is anchored to the transcript snapshot, and stale-looking rows fall back instead of silently masquerading as valid data.

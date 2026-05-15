# Model Agreement Snapshot Cache — Tasks

## Status

- Slice 1: not started
- Slice 2: not started
- Slice 3: not started
- Slice 4: not started
- API + web lint / test / build: not run
- Production smoke (post-deploy): not run

## Slice 1: Foundations — extract compute, Prisma model, canonical-key, fingerprint

Pre-requisite work that de-risks the rest. Extract the existing live agreement computation into a standalone service so both the live resolver path and the new snapshot builder use it. Add the Prisma model, the canonical-key helper, and the fingerprint helper. Full requirements are in spec.md and plan.md (Architecture Choices 1, 3, 4, 7 and Slice 1).

Files in scope:

- `cloud/apps/api/src/services/model-agreement/compute.ts` (new)
- `cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts` (resolver delegates live-path compute to the new service)
- `cloud/apps/api/tests/services/model-agreement/compute.test.ts` (new)
- `cloud/packages/db/prisma/schema.prisma`
- `cloud/packages/db/prisma/migrations/<timestamp>_add_model_agreement_snapshot/migration.sql`
- `cloud/apps/api/src/services/analysis/model-agreement-snapshot/snapshot-types.ts` (new)
- `cloud/apps/api/src/services/analysis/model-agreement-snapshot/canonical-key.ts` (new)
- `cloud/apps/api/src/services/analysis/model-agreement-snapshot/fingerprint.ts` (new)
- `cloud/apps/api/tests/services/analysis/model-agreement-snapshot/canonical-key.test.ts` (new)
- `cloud/apps/api/tests/services/analysis/model-agreement-snapshot/fingerprint.test.ts` (new)

- [ ] In `cloud/apps/api/src/services/model-agreement/compute.ts`, extract the agreement computation currently inlined in `resolveModelAgreementOnTradeoffs` (cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts) into a standalone async function `computeModelAgreement(prisma, input)` that takes a snapshot-shaped input (`{ scope, signature, domainIds, modelIds }`) and returns the `ModelAgreementSnapshotPayload` (the pairwise matrix + derived fields). Pass Prisma + any other dependencies explicitly through the function signature — no resolver-context coupling. Reuse the existing helpers under `cloud/apps/api/src/services/model-agreement/` (aggregation, math, bootstrap).
- [ ] In `cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts`, replace the inlined live-path computation with a call to `computeModelAgreement`. No behavior change for the live path — the resolver still returns the same shape with the same data.
- [ ] In `cloud/apps/api/tests/services/model-agreement/compute.test.ts`, add unit tests for `computeModelAgreement` with a small fixture (a known input, expected pairwise matrix output). Run the existing API tests for `model-agreement-on-tradeoffs` and confirm they pass unchanged — that's the extraction's regression gate.
- [ ] In `cloud/packages/db/prisma/schema.prisma`, add a `ModelAgreementSnapshot` model: `id String @id`, `scope String` (DOMAIN | ALL_DOMAINS | DOMAIN_SET), `signature String`, `domainIdsHash Char(32)`, `modelIdsHash Char(32)`, `domainIds String[]`, `modelIds String[]`, `agreementResultJson Json`, `sourceRunCount Int`, `sourceRunUpdatedAtSum BigInt`, `algorithmVersion Int`, `computedAt DateTime`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`. Unique index on `(scope, signature, domainIdsHash, modelIdsHash)`; secondary index on `(scope, signature)`.
- [ ] Generate the migration via `npx prisma migrate dev --name add_model_agreement_snapshot --schema cloud/packages/db/prisma/schema.prisma` (DATABASE_URL pointing at the local dev DB). Inspect the generated migration.sql — confirm it only contains CREATE TABLE / CREATE INDEX statements on the new table, no ALTER TABLE on existing tables.
- [ ] In `cloud/apps/api/src/services/analysis/model-agreement-snapshot/snapshot-types.ts`, export `ModelAgreementSnapshotInput`, `ModelAgreementSnapshotPayload`, the `ModelAgreementSnapshotSource` enum (`CACHE_HIT | CACHE_HIT_STALE | LIVE_NON_CANONICAL | BUILDING`), and an `AGREEMENT_ALGORITHM_VERSION = 1` constant. The constant must be human-bumped any time the agreement computation changes — document this in a top-of-file comment.
- [ ] In `cloud/apps/api/src/services/analysis/model-agreement-snapshot/canonical-key.ts`, export `canonicalKey({ scope, signature, domainIds, modelIds })` → `{ domainIdsHash, modelIdsHash }`. Dedupe each list, sort lexicographically **case-sensitive** (do NOT lowercase), then SHA-256, then take the first 32 hex characters.
- [ ] In `cloud/apps/api/src/services/analysis/model-agreement-snapshot/fingerprint.ts`, export `computeInputFingerprint(prisma, { scope, signature, domainIds, modelIds })` → `{ sourceRunCount: number, sourceRunUpdatedAtSum: bigint }`. Single Prisma raw SELECT with `COUNT(*)` and `SUM(EXTRACT(EPOCH FROM "updatedAt"))::BIGINT` over the source runs in scope.
- [ ] In `canonical-key.test.ts`, assert: `["a","b","c"]`, `["c","a","b"]`, and `["b","a","b","c"]` produce the same hash; `"Claude"` and `"claude"` produce DIFFERENT hashes; empty list distinct from single-item list; output is exactly 32 hex characters.
- [ ] In `fingerprint.test.ts` (with `DATABASE_URL` + `JWT_SECRET`), seed runs, compute fingerprint, then: insert a new run → fingerprint changes; delete an existing run → fingerprint changes; update a non-latest run's `updatedAt` → fingerprint changes (this is the key case that count+max would miss); repeated calls with no DB changes return identical values.
- [ ] From `cloud/`, run `npm run lint --workspace @valuerank/db`, `npm run lint --workspace @valuerank/api`, `npm run test --workspace @valuerank/api` (with `DATABASE_URL` + `JWT_SECRET`), and `npm run build --workspace @valuerank/api`. Fix all errors. Do not use `any` or `@ts-ignore`. Commit the slice.
- [CHECKPOINT]

## Slice 2: Snapshot builder, cache reader, queue handler, run-completion fan-out

Build the cache machinery and wire it to run completion events. Full requirements are in plan.md (Architecture Choices 4, 5, 6, Slice 2).

Files in scope:

- `cloud/apps/api/src/services/analysis/model-agreement-snapshot/snapshot-builder.ts` (new)
- `cloud/apps/api/src/services/analysis/model-agreement-snapshot/snapshot-cache.ts` (new)
- `cloud/apps/api/src/services/analysis/model-agreement-snapshot/affected-snapshots.ts` (new)
- `cloud/apps/api/src/queue/handlers/refresh-model-agreement-snapshot.ts` (new)
- `cloud/apps/api/src/queue/handlers/handler-config.ts` (extend)
- `cloud/apps/api/src/queue/types.ts` (extend)
- The run-completion call site under `cloud/apps/api/src/services/run/` (extend to call into `affected-snapshots` and enqueue refreshes; identify the exact file during implementation by searching for where `status` transitions to `COMPLETED`)
- `cloud/apps/api/tests/services/analysis/model-agreement-snapshot/snapshot-builder.test.ts` (new)
- `cloud/apps/api/tests/services/analysis/model-agreement-snapshot/affected-snapshots.test.ts` (new)
- `cloud/apps/api/tests/services/analysis/model-agreement-snapshot/snapshot-cache.test.ts` (new)
- `cloud/apps/api/tests/services/analysis/model-agreement-snapshot/benchmark.test.ts` (new, gated by env var)

- [ ] In `snapshot-builder.ts`, export `buildModelAgreementSnapshot(prisma, input)` — a thin wrapper that calls Slice 1's `computeModelAgreement` for the payload, then Slice 1's `computeInputFingerprint` for the freshness fields, then returns the full row ready for upsert (including `algorithmVersion` from the constant, `domainIdsHash` + `modelIdsHash` from `canonicalKey`).
- [ ] In `snapshot-cache.ts`, export `getModelAgreementSnapshot(prisma, queue, { scope, signature, domainIds, modelIds, isCanonical })`. On cache hit, recompute the current fingerprint via `computeInputFingerprint`, compare all three fields (count, updatedAtSum, algorithmVersion) to the row, return `{ payload, source: 'CACHE_HIT' | 'CACHE_HIT_STALE', snapshotComputedAt }`. On miss with `isCanonical=true`, enqueue a build job (per-key dedupe so concurrent misses enqueue exactly one) and return `{ payload: null, source: 'BUILDING', snapshotComputedAt: null }`. On miss with `isCanonical=false`, return `null` so the caller falls back to live.
- [ ] In `affected-snapshots.ts`, export `getAffectedCanonicalKeys(prisma, { signature, domainId })` returning the list of canonical snapshot keys that the completed run can invalidate: the single-domain key for that domain, the ALL_DOMAINS key, and any DOMAIN_SET key whose domain list includes the run's domain. Use the existing default-models lookup for the canonical model set per signature.
- [ ] In `refresh-model-agreement-snapshot.ts`, write a PgBoss handler modeled on `cloud/apps/api/src/queue/handlers/refresh-win-rate-stability-snapshot.ts`. It calls `buildModelAgreementSnapshot` and upserts into the `ModelAgreementSnapshot` table via Prisma. Set `expireInSeconds: 600` to start.
- [ ] In `handler-config.ts` and `queue/types.ts`, register the new handler with the same conventions as the Win Rate stability handler (job name constant, handler registration).
- [ ] Extend the run-completion path to call `getAffectedCanonicalKeys` when a run reaches `COMPLETED` and enqueue a refresh job per key (debounced — if a key already has a pending refresh job, skip).
- [ ] In `snapshot-builder.test.ts`, assert the builder produces the expected payload shape and writes the fingerprint fields (count, updatedAtSum, algorithmVersion) for a seeded input.
- [ ] In `affected-snapshots.test.ts`, assert that a completed run with `(signature: 'vnewtd', domainId: D)` returns three keys: the single-domain key for D, the ALL_DOMAINS key, and any DOMAIN_SET key containing D. With no DOMAIN_SET snapshots in DB, returns just the first two.
- [ ] In `snapshot-cache.test.ts`, assert: cache write + read round-trip; cache hit returns CACHE_HIT with the right `snapshotComputedAt`; mismatched fingerprint returns CACHE_HIT_STALE and enqueues a refresh; cache miss with `isCanonical=true` returns BUILDING and enqueues one job; firing 10 concurrent misses for the same key enqueues exactly one job (read-time dedupe); cache miss with `isCanonical=false` returns null and does NOT enqueue.
- [ ] In `benchmark.test.ts` (gated by `RUN_AGREEMENT_BENCHMARK=1`), build a snapshot for the heaviest realistic canonical selection (All Domains × default model set on the vnewtd signature against seeded data approximating prod scale) and assert it completes within 600s. If it does not, the slice's owner must either raise `expireInSeconds` (with a justification comment at the handler) or reduce `KAPPA_BOOTSTRAP_ITERATIONS` for the cached path with a `methodology_note` field added to the snapshot. The benchmark test itself is the gate.
- [ ] From `cloud/`, run `npm run lint --workspace @valuerank/api`, `npm run test --workspace @valuerank/api`, and `npm run build --workspace @valuerank/api`. Fix all errors. No `any`, no `@ts-ignore`. Commit the slice.
- [CHECKPOINT]

## Slice 3: Resolver rewire + GraphQL freshness fields + codegen

Wire the resolver to the new cache and expose freshness fields on the GraphQL contract. Full requirements are in plan.md (Architecture Choice 5, Slice 3).

Files in scope:

- `cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts`
- `cloud/apps/api/src/graphql/types/model-agreement-on-tradeoffs.ts`
- `cloud/apps/web/src/api/operations/*.graphql` — extend the agreement query to select the new freshness fields
- `cloud/apps/web/src/generated/graphql.ts` (regenerated via codegen)
- `cloud/apps/api/tests/graphql/queries/model-agreement-on-tradeoffs.test.ts`

- [ ] In `cloud/apps/api/src/graphql/types/model-agreement-on-tradeoffs.ts`, add three nullable freshness fields to the `ModelAgreementResult` Pothos object type: `snapshotComputedAt: DateTime` (nullable), `snapshotIsStale: Boolean` (nullable), `snapshotSource: ModelAgreementSnapshotSource` (the new enum from Slice 1's snapshot-types, exposed in GraphQL).
- [ ] In `cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts`, determine `isCanonical` by comparing the requested model IDs (after canonical normalization) against the default model IDs for the signature using the existing `getModelsFromDatabase` helper. Call `getModelAgreementSnapshot` (Slice 2). On `CACHE_HIT` or `CACHE_HIT_STALE`, return the cached payload with the freshness fields populated. On `BUILDING`, return `pending: true` + the existing build-progress shape + freshness fields set to indicate `BUILDING`. On `null` (non-canonical), fall through to the existing live computation path and set `snapshotSource: 'LIVE_NON_CANONICAL'`, `snapshotComputedAt: null`, `snapshotIsStale: false`.
- [ ] Find the web GraphQL operation that queries `modelAgreementOnTradeoffs` under `cloud/apps/web/src/api/operations/*.graphql` and add the three freshness fields to the selection set.
- [ ] From `cloud/`, run `npm run codegen --workspace @valuerank/web`. Commit the regenerated `cloud/apps/web/src/generated/graphql.ts` in the same slice.
- [ ] In the API resolver tests, assert: cache hit returns instantly with `snapshotSource: 'CACHE_HIT'` and populated `snapshotComputedAt`; cache miss for a canonical input returns `pending: true` with `snapshotSource: 'BUILDING'` and queues a refresh; stale snapshot returns the snapshot + `snapshotIsStale: true` + `snapshotSource: 'CACHE_HIT_STALE'` and queues a refresh; non-canonical input (one model swapped out of default) takes the live path with `snapshotSource: 'LIVE_NON_CANONICAL'` and does NOT enqueue a refresh.
- [ ] In the API resolver tests, add a model-set-collision regression test: request with the canonical model set, then request with the same set but one model added — assert different snapshot rows are accessed (different keys), not a hit on the prior payload.
- [ ] From `cloud/`, run `npm run lint --workspace @valuerank/api`, `npm run test --workspace @valuerank/api`, `npm run lint --workspace @valuerank/web`, `npm run build --workspace @valuerank/api`, and `npm run build --workspace @valuerank/web`. Fix all errors. No `any`, no `@ts-ignore`. Commit the slice.
- [CHECKPOINT]

## Slice 4: Web UI freshness chip

A small UI touch — the chip lives inside `ModelAgreementSection` (where the data already is), no state lifting.

Files in scope:

- `cloud/apps/web/src/components/models/ModelAgreementSection.tsx`
- `cloud/apps/web/tests/components/ModelAgreementSection.test.tsx`

- [ ] In `cloud/apps/web/src/components/models/ModelAgreementSection.tsx`, read `snapshotComputedAt` and `snapshotSource` from the existing `modelAgreementOnTradeoffs` query result. Render a small "Cached as of {timestamp}" chip near the section header — visible only when `snapshotSource` is `CACHE_HIT` or `CACHE_HIT_STALE`. When `CACHE_HIT_STALE`, append "(refreshing)". Match the styling of the existing cluster-cache freshness chip on the Domain Analysis page (search for that chip's styling and reuse the same component or class set).
- [ ] In `ModelAgreementSection.test.tsx`, assert: chip renders with the expected timestamp and label on `CACHE_HIT`; chip shows "(refreshing)" on `CACHE_HIT_STALE`; chip is hidden when `snapshotSource` is `BUILDING`; chip is hidden when `snapshotSource` is `LIVE_NON_CANONICAL`.
- [ ] From `cloud/`, run `npm run lint --workspace @valuerank/web`, `npm run test --workspace @valuerank/web`, and `npm run build --workspace @valuerank/web`. Fix all errors. No `any`, no `@ts-ignore`. Commit the slice.
- [CHECKPOINT]

## Verification Plan

Per slice: the final task in each slice runs the relevant lint/test/build for the touched workspaces.

Final combined diff (orchestrator):

- `npm run lint` and `npm run build` and `npm run test` pass for db, api, and web workspaces.
- The schema migration sql is reviewed and contains only CREATE TABLE / CREATE INDEX on the new table.
- The benchmark test (gated) was run at least once during slice 2 and passed within 600s, OR a justified timeout / bootstrap reduction is documented in the slice 2 commit.
- After merge and prod deploy: query `modelAgreementOnTradeoffs` against production for a known canonical scope and confirm `snapshotSource: 'CACHE_HIT'` (or `BUILDING` then `CACHE_HIT` after the first cron cycle) and `executionMs` well under 1s.

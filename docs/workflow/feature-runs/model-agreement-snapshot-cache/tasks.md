# Model Agreement Snapshot Cache — Tasks

## Status

- Slice 1a (extract compute service): complete (commit 4d80a543)
- Slice 1b (Prisma model + types): complete (commit 8456d494)
- Slice 1c (helpers + tests): complete (commit 4925a869)
- Slice 2: complete (commit f3b7ac84)
- Slice 3: not started
- Slice 4: not started
- API + web lint / test / build: not run
- Production smoke (post-deploy): not run

> Note: Slice 1 was split into 1a / 1b / 1c after the original Slice 1 dispatch (~12 task lines, ~52k-char prompt) timed out in Codex after 60 minutes with zero output. Each sub-slice is now self-contained, smaller in prompt size, and committable independently.

## Slice 1a: Extract live computation into a service

The smallest, most isolated prep step. Extract the existing live agreement computation in `resolveModelAgreementOnTradeoffs` into a standalone service. No new files in the snapshot directory yet, no Prisma changes, no helpers — just a behavior-preserving refactor of existing code. The existing resolver tests are the regression gate. See plan.md Architecture Choice 7.

Files in scope:

- `cloud/apps/api/src/services/model-agreement/compute.ts` (new)
- `cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts` (resolver delegates live-path compute to the new service; same shape, same data)
- `cloud/apps/api/tests/services/model-agreement/compute.test.ts` (new)

- [x] In `cloud/apps/api/src/services/model-agreement/compute.ts`, add an async function `computeModelAgreement(prisma, input)` that takes a snapshot-shaped input (`{ scope: 'DOMAIN' | 'ALL_DOMAINS' | 'DOMAIN_SET', signature: string, domainIds: string[], modelIds: string[] }`) and returns the same `ModelAgreementResult` payload (pairwise matrix + derived fields) the live resolver currently produces inline. Move the computation logic from `resolveModelAgreementOnTradeoffs` (in `cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts`) into this function. Reuse the existing helpers under `cloud/apps/api/src/services/model-agreement/` (aggregation, math, bootstrap). Pass Prisma + any other dependencies explicitly through the function signature — no resolver-context coupling.
- [x] In `cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts`, replace the inlined live-path computation with a call to `computeModelAgreement`. The resolver's GraphQL contract and returned data are unchanged — this is purely a refactor that moves code without changing behavior.
- [x] In `cloud/apps/api/tests/services/model-agreement/compute.test.ts`, add a small unit test that calls `computeModelAgreement` on a seeded fixture and asserts the returned `pairwiseAgreementMatrix` matches expected values for a known input.
- [x] From `cloud/`, run `npm run lint --workspace @valuerank/api`, `npm run test --workspace @valuerank/api` (with `DATABASE_URL` + `JWT_SECRET`), and `npm run build --workspace @valuerank/api`. The existing `model-agreement-on-tradeoffs` tests MUST pass unchanged — that's the extraction's regression gate. No `any`, no `@ts-ignore`. Commit the slice.
- [CHECKPOINT]

## Slice 1b: Prisma snapshot model + migration + shared types

Add the `ModelAgreementSnapshot` Prisma model, generate its migration, and create the shared types file that later slices import. No business logic yet.

Files in scope:

- `cloud/packages/db/prisma/schema.prisma`
- `cloud/packages/db/prisma/migrations/<timestamp>_add_model_agreement_snapshot/migration.sql`
- `cloud/apps/api/src/services/analysis/model-agreement-snapshot/snapshot-types.ts` (new)

- [x] In `cloud/packages/db/prisma/schema.prisma`, add a `ModelAgreementSnapshot` model with fields: `id String @id @default(cuid())`, `scope String`, `signature String`, `domainIdsHash String @db.Char(32)`, `modelIdsHash String @db.Char(32)`, `domainIds String[]`, `modelIds String[]`, `agreementResultJson Json`, `sourceRunCount Int`, `sourceRunUpdatedAtSum BigInt`, `algorithmVersion Int`, `computedAt DateTime`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`. Add `@@unique([scope, signature, domainIdsHash, modelIdsHash])` and `@@index([scope, signature])`.
- [x] Generate the migration via `DATABASE_URL=... npx prisma migrate dev --name add_model_agreement_snapshot --schema cloud/packages/db/prisma/schema.prisma`. Inspect the generated `migration.sql` and confirm it contains only `CREATE TABLE` + `CREATE INDEX` / `CREATE UNIQUE INDEX` statements on the new `model_agreement_snapshots` table (snake_cased) — NO `ALTER TABLE` against existing tables.
- [x] In `cloud/apps/api/src/services/analysis/model-agreement-snapshot/snapshot-types.ts`, export `ModelAgreementSnapshotInput` and `ModelAgreementSnapshotPayload` types matching the shape `computeModelAgreement` returns (from Slice 1a), plus a `ModelAgreementSnapshotSource` string-literal union: `'CACHE_HIT' | 'CACHE_HIT_STALE' | 'LIVE_NON_CANONICAL' | 'BUILDING'`, and a constant `AGREEMENT_ALGORITHM_VERSION = 1`. Add a top-of-file comment stating: "Bump AGREEMENT_ALGORITHM_VERSION whenever the agreement computation changes — it is part of the snapshot freshness check and old rows become stale on read when this changes."
- [x] From `cloud/`, run `npm run lint --workspace @valuerank/db`, `npm run lint --workspace @valuerank/api`, and `npm run build --workspace @valuerank/api`. No `any`, no `@ts-ignore`. Commit the slice (migration + schema + types together).
- [CHECKPOINT]

## Slice 1c: Canonical-key and fingerprint helpers + tests

The two pure helpers used by both the snapshot reader and writer.

Files in scope:

- `cloud/apps/api/src/services/analysis/model-agreement-snapshot/canonical-key.ts` (new)
- `cloud/apps/api/src/services/analysis/model-agreement-snapshot/fingerprint.ts` (new)
- `cloud/apps/api/tests/services/analysis/model-agreement-snapshot/canonical-key.test.ts` (new)
- `cloud/apps/api/tests/services/analysis/model-agreement-snapshot/fingerprint.test.ts` (new)

- [x] In `cloud/apps/api/src/services/analysis/model-agreement-snapshot/canonical-key.ts`, export `canonicalKey({ scope, signature, domainIds, modelIds })` returning `{ domainIdsHash: string, modelIdsHash: string }`. For each ID list: dedupe (Set), sort lexicographically with `Array.prototype.sort()` (default case-sensitive lexical order — do NOT lowercase), join with a delimiter, then SHA-256 (use `node:crypto`), then take the first 32 hex characters. Empty list hashes to the empty-string hash (so empty and single-item lists differ).
- [x] In `cloud/apps/api/src/services/analysis/model-agreement-snapshot/fingerprint.ts`, export `computeInputFingerprint(prisma, { scope, signature, domainIds, modelIds })` returning `{ sourceRunCount: number, sourceRunUpdatedAtSum: bigint }`. Use a single Prisma raw SELECT: `COUNT(*)::INT AS count` and `COALESCE(SUM(EXTRACT(EPOCH FROM "updatedAt")::BIGINT), 0)::BIGINT AS sum` over the source-run rows in scope (filter by signature, modelId in modelIds, domain matching the scope). Mirror the same scope/filter logic the live resolver uses for selecting source runs.
- [x] In `cloud/apps/api/tests/services/analysis/model-agreement-snapshot/canonical-key.test.ts`, assert: `canonicalKey` with `["a","b","c"]`, `["c","a","b"]`, and `["b","a","b","c"]` for `modelIds` (same scope/signature/domainIds) returns the same `modelIdsHash`; `"Claude"` and `"claude"` as different model IDs produce DIFFERENT hashes; empty `modelIds` produces a different hash from single-item; the output is exactly 32 hex characters and matches `/^[0-9a-f]{32}$/`.
- [x] In `cloud/apps/api/tests/services/analysis/model-agreement-snapshot/fingerprint.test.ts` (with `DATABASE_URL` + `JWT_SECRET`), seed three runs for a known (signature, domain, modelId set), compute the fingerprint, then: insert a new run → fingerprint count and sum both change; delete one existing run → both change; update an *older* (non-latest) run's `updatedAt` to a slightly different value → the `sum` changes (critical case — this is what `count + max(updatedAt)` would miss); two back-to-back calls with no DB changes return identical values.
- [x] From `cloud/`, run `npm run lint --workspace @valuerank/api`, `npm run test --workspace @valuerank/api` (with `DATABASE_URL` + `JWT_SECRET`), and `npm run build --workspace @valuerank/api`. No `any`, no `@ts-ignore`. Commit the slice.
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

- [x] In `snapshot-builder.ts`, export `buildModelAgreementSnapshot(prisma, input)` — a thin wrapper that calls Slice 1's `computeModelAgreement` for the payload, then Slice 1's `computeInputFingerprint` for the freshness fields, then returns the full row ready for upsert (including `algorithmVersion` from the constant, `domainIdsHash` + `modelIdsHash` from `canonicalKey`).
- [x] In `snapshot-cache.ts`, export `getModelAgreementSnapshot(prisma, queue, { scope, signature, domainIds, modelIds, isCanonical })`. On cache hit, recompute the current fingerprint via `computeInputFingerprint`, compare all three fields (count, updatedAtSum, algorithmVersion) to the row, return `{ payload, source: 'CACHE_HIT' | 'CACHE_HIT_STALE', snapshotComputedAt }`. On miss with `isCanonical=true`, enqueue a build job (per-key dedupe so concurrent misses enqueue exactly one) and return `{ payload: null, source: 'BUILDING', snapshotComputedAt: null }`. On miss with `isCanonical=false`, return `null` so the caller falls back to live.
- [x] In `affected-snapshots.ts`, export `getAffectedCanonicalKeys(prisma, { signature, domainId })` returning the list of canonical snapshot keys that the completed run can invalidate: the single-domain key for that domain, the ALL_DOMAINS key, and any DOMAIN_SET key whose domain list includes the run's domain. Use the existing default-models lookup for the canonical model set per signature.
- [x] In `refresh-model-agreement-snapshot.ts`, write a PgBoss handler modeled on `cloud/apps/api/src/queue/handlers/refresh-win-rate-stability-snapshot.ts`. It calls `buildModelAgreementSnapshot` and upserts into the `ModelAgreementSnapshot` table via Prisma. Set `expireInSeconds: 600` to start.
- [x] In `handler-config.ts` and `queue/types.ts`, register the new handler with the same conventions as the Win Rate stability handler (job name constant, handler registration).
- [x] Extend the run-completion path to call `getAffectedCanonicalKeys` when a run reaches `COMPLETED` and enqueue a refresh job per key (debounced — if a key already has a pending refresh job, skip).
- [x] In `snapshot-builder.test.ts`, assert the builder produces the expected payload shape and writes the fingerprint fields (count, updatedAtSum, algorithmVersion) for a seeded input.
- [x] In `affected-snapshots.test.ts`, assert that a completed run with `(signature: 'vnewtd', domainId: D)` returns three keys: the single-domain key for D, the ALL_DOMAINS key, and any DOMAIN_SET key containing D. With no DOMAIN_SET snapshots in DB, returns just the first two.
- [x] In `snapshot-cache.test.ts`, assert: cache write + read round-trip; cache hit returns CACHE_HIT with the right `snapshotComputedAt`; mismatched fingerprint returns CACHE_HIT_STALE and enqueues a refresh; cache miss with `isCanonical=true` returns BUILDING and enqueues one job; firing 10 concurrent misses for the same key enqueues exactly one job (read-time dedupe); cache miss with `isCanonical=false` returns null and does NOT enqueue.
- [x] In `benchmark.test.ts` (gated by `RUN_AGREEMENT_BENCHMARK=1`), build a snapshot for the heaviest realistic canonical selection (All Domains × default model set on the vnewtd signature against seeded data approximating prod scale) and assert it completes within 600s. If it does not, the slice's owner must either raise `expireInSeconds` (with a justification comment at the handler) or reduce `KAPPA_BOOTSTRAP_ITERATIONS` for the cached path with a `methodology_note` field added to the snapshot. The benchmark test itself is the gate.
- [x] From `cloud/`, run `npm run lint --workspace @valuerank/api`, `npm run test --workspace @valuerank/api`, and `npm run build --workspace @valuerank/api`. Fix all errors. No `any`, no `@ts-ignore`. Commit the slice.
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

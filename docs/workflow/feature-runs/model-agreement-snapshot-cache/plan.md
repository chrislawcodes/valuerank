# Plan

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: All three Codex findings addressed in spec.md. (HIGH) Cache-key incompleteness for modelIds: spec's 'Cache key' section now explicitly requires modelIds as a non-droppable key component, with canonical (deduped+sorted) hashing; existing reader's missing modelIds dimension is called out in the Summary as part of the work. (MEDIUM) Stale path under-specified: 'Cache invalidation' now mandates an input-fingerprint stored on the snapshot row for read-time staleness comparison, and 'API contract for freshness' makes the schema additions explicit. (MEDIUM) Cold-build expense: new 'Cold-build feasibility constraint' section requires the plan to measure build time for the heaviest realistic selection and either fit within the 600s job timeout or raise it with justification. Residual risks (canonicalization rule, storage growth, API contract change) folded into the Risks list with concrete verification: lines per the FF rule. Reconciled in one pass; not re-reviewing.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: All three Gemini findings addressed in spec.md. (HIGH) Unbounded cache growth: new 'Cache scope and retention' section requires the plan to state an explicit growth-control policy — either cache canonical default selections only (arbitrary selections fall back to live), OR cache lazily with TTL/LRU eviction; no-eviction lazy caching is explicitly rejected. (HIGH) Incorrect existing cache logic / silent-wrong-data: Summary now explicitly flags that the current reader does not include modelIds and would silently serve the wrong matrix; closing that gap is part of the work, and the cache-key requirement mandates modelIds. (MEDIUM) Misleading reference implementation: Summary reframes Win Rate stability as 'pattern reference, not a copy-paste target' and explicitly calls out that modelsWinRateStability does not take modelIds, so the cardinality and canonicalization concerns are model-agreement-specific. Residual risks (build-time vs. job timeout, canonicalization correctness) folded into the Risks list with verification: lines. Reconciled in one pass; not re-reviewing.
- review: reviews/plan.codex.implementation-adversarial.review.md | status: accepted | note: All Codex findings addressed in plan.md. (HIGH) Staleness check weakness: fingerprint strengthened to sourceRunCount + sourceRunUpdatedAtSum (SUM of EXTRACT(EPOCH FROM updatedAt) as BIGINT — catches insert/delete/update, including edits to non-latest runs) AND a new algorithmVersion constant on the snapshot row that's compared on every read so an algorithm change invalidates old rows. (MEDIUM) Event-driven refresh scope: Architecture Choice 6 rewritten — a completed run enumerates ALL affected canonical snapshots (single-domain + ALL_DOMAINS + any DOMAIN_SET containing the domain) via a new getAffectedCanonicalKeys helper; refreshes are fanned out, not single-keyed. (MEDIUM) Lowercase canonicalization: dropped; canonical-key now case-sensitive after dedupe+sort. Residual risks addressed in the expanded Risks table: algorithm-version-bump convention, BUILDING-never-settles via cron self-heal, canonical-set drift via hash identity, thundering-herd read-time dedupe. Reconciled in one pass; not re-reviewing.
- review: reviews/plan.gemini.testability-adversarial.review.md | status: accepted | note: All Gemini findings addressed in plan.md. (HIGH) Fingerprint robustness: same fix as Codex's HIGH — count + SUM(EXTRACT(EPOCH FROM updatedAt))::BIGINT + algorithmVersion catches deletions, edits to non-latest runs, and algorithm changes; explicit reasoning in Architecture Choice 4. (MEDIUM) Slice 2 extraction risk: new Architecture Choice 7 + restructured Slice 1 extracts computeModelAgreement BEFORE building the cache — runs existing resolver tests as the regression gate; slice 2 becomes a thin wrapper, not a re-implementation. (MEDIUM) UI state lifting: Slice 4 rewritten — chip renders inside ModelAgreementSection (where the query lives), no lifting to ModelGroupsView; single chip is sufficient since all four agreement-derived surfaces are instant when the chip shows CACHE_HIT. (LOW) Performance benchmark: Slice 2 now includes a gated benchmark.test.ts that asserts build time fits within the queue handler's expireInSeconds for a representative heavy selection, with explicit guidance on raising the timeout vs. reducing bootstrap iterations (and a methodology_note field for the latter). (LOW) Hash length: bumped from 16 hex (64 bits) to 32 hex (128 bits) in Architecture Choice 3. Residual risks (canonical-set drift, build-time creep, thundering herd) addressed in expanded Risks table. Reconciled in one pass; not re-reviewing.

## Summary

Build a dedicated server-side snapshot cache for `modelAgreementOnTradeoffs`, modeled on the Win Rate Stability cache. Production diagnostic confirmed the architecture choice: a real production query with `pending: false` and `buildProgress: null` (i.e., nothing was building) still took **23.7 seconds** to return — the resolver does the heavy work live every time. The current snapshot-reader piggy-back on the domain-analysis snapshot returns *build status*, not a cached pairwise matrix. Closing that means a new dedicated cache.

The four agreement-derived surfaces on `/models` (and `/models/v2`) all become instant once the cache exists: the agreement section, the similarity table, the kappa-clustering dendrogram, and the V2 internal-agreement overlay.

## Architecture Choices

### 1. Dedicated agreement snapshot, not an extension of the domain-analysis snapshot

The production-diagnostic ground truth (24 s with no build in progress) shows the existing path doesn't cache the matrix at all. The cleanest fix is a dedicated snapshot table + builder + handler, mirroring `cloud/apps/api/src/services/analysis/win-rate-stability/`. No piggy-backing on `AssumptionAnalysisSnapshot`; the new table holds the pairwise agreement matrix and its derived fields directly. The existing `readModelAgreementSnapshotStateFromSnapshot` path is replaced (or wrapped) by the new dedicated reader.

### 2. Canonical-only caching; non-canonical selections fall back to live

The cache key includes `modelIds`, which means unbounded growth without policy. The plan caches **only the canonical default-model-set** for each `(scope, signature, domain[s])` — that's the configuration most users see and the one that needs to be instant. Arbitrary user-chosen model sets fall back to the existing live computation path with the existing "Preparing…" UI. This is option (a) from the spec's growth-control list; no TTL/LRU complexity needed.

This also caps the row count: roughly *(scopes × signatures × known-domain-combinations × 1 canonical model-set)*. Per-scope growth is bounded by the number of signatures and domain selections users actually use.

### 3. Cache key shape and canonicalization

Each snapshot row is uniquely identified by:
- `scope` (enum: DOMAIN | ALL_DOMAINS | DOMAIN_SET)
- `signature` (string)
- `domainIdsHash` (canonical hash of sorted+deduped domain IDs; empty for ALL_DOMAINS)
- `modelIdsHash` (canonical hash of sorted+deduped model IDs)
- (also stored unhashed for debugging: the literal `domainIds` and `modelIds` arrays)

A shared canonicalization helper produces the hash inputs deterministically: deduplicate, sort lexicographically (case-sensitive — IDs in ValueRank are case-stable; lowercasing would be an unsafe assumption), then hash with SHA-256 truncated to **32 hex chars (128 bits)**. 128 bits drops collision probability to negligible without measurable storage cost. Same helper used by both the builder (write key) and the reader (lookup key).

### 4. Snapshot input fingerprint for staleness

The snapshot row stores an **input fingerprint** with three components, all cheap to compute at read time:

- `sourceRunCount` — count of source runs that contributed to the snapshot.
- `sourceRunUpdatedAtSum` — `SUM(EXTRACT(EPOCH FROM "updatedAt"))::BIGINT` over those runs. This catches *any* change to *any* contributing run (insert, delete, or update), because the sum changes when any timestamp changes or when the row set changes — `count + max` alone misses the case where a non-latest run is edited or a non-latest run is deleted while a new one is added.
- `algorithmVersion` — a single integer constant defined in the builder source; bumped manually when the agreement computation changes. Without this, an algorithm change leaves old snapshots looking fresh forever.

At read time the resolver runs the fingerprint query against the source data and compares all three to the stored values. Any mismatch → snapshot is stale → return the snapshot AND queue a refresh. All three match → snapshot is fresh.

The fingerprint query is a single SELECT over the runs in scope; far cheaper than the full agreement computation. The same fingerprint is computed inside the builder when writing a new snapshot so reader and writer agree on the semantics.

### 5. Freshness fields on the GraphQL contract

Add to `ModelAgreementResult`:
- `snapshotComputedAt: DateTime` — when this snapshot was built (null if served live or fresh-built)
- `snapshotIsStale: Boolean!` — whether the resolver detected fingerprint mismatch and queued a refresh
- `snapshotSource: ModelAgreementSnapshotSource!` — enum: `CACHE_HIT` | `CACHE_HIT_STALE` | `LIVE_NON_CANONICAL` | `BUILDING`

Codegen must run after the schema change (per the `feedback_run_codegen_after_graphql_changes.md` rule). The web reads `snapshotComputedAt` for the freshness chip; the chip is shown only when source is `CACHE_HIT` or `CACHE_HIT_STALE`.

### 6. Builder triggered by run completion + scheduled fallback

The builder runs:
- **Event-driven, fanning out to all affected snapshots**: when a run reaches COMPLETED for `(signature, domain)`, queue refreshes for **every canonical snapshot whose scope covers that run** — the single-domain snapshot for that domain, the ALL_DOMAINS snapshot, and any DOMAIN_SET snapshot that includes the domain. A run completing in one domain can invalidate up to three or more cached views. A small enumeration helper produces the set of affected `(scope, signature, domainIdsHash, modelIdsHash)` keys from the completed run plus the canonical-models lookup. Per-key debounce (e.g., 60 s) collapses bursts of completions so we don't enqueue redundant builds.
- **Read-time triggers are also debounced**: if a resolver miss enqueues a build, subsequent misses for the same cache key while that build is in flight do NOT enqueue another one. Prevents a "thundering herd" on a new signature where the first N concurrent users would each enqueue their own copy.
- **Scheduled fallback**: a cron-style refresh of all canonical snapshots whose fingerprint is stale, running on the same cadence as the Win Rate stability cron (slice 2 reads its actual schedule and matches).

For initial population: snapshots build lazily as users hit each canonical selection (which enqueues a build) and as the cron runs. The first page load on a never-built canonical selection shows the existing "Preparing…" UI until the first build lands. This is acceptable per the spec.

### 7. Computation extraction before caching (de-risks slice 2)

Slice 1 also extracts the existing live agreement computation in `resolveModelAgreementOnTradeoffs` into a standalone service (`computeModelAgreement(input)`) under `cloud/apps/api/src/services/model-agreement/`. Both the live path (non-canonical resolver branch) and the new snapshot builder call that service — same code, same result. Doing this extraction *before* building the cache means slice 2's builder is a thin wrapper, not a re-implementation, and the extraction itself can be tested independently with the existing resolver test fixtures. Without this step, slice 2 is at risk of becoming both an extraction *and* a caching slice, blowing past the 300-line guidance.

## Proposed Implementation Slices

### Slice 1: Foundations — extract compute service, Prisma model, canonical-key helper

Files:

- `cloud/apps/api/src/services/model-agreement/compute.ts` (new — extracted from the live resolver)
- `cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts` (resolver delegates the live-path compute to the new service)
- `cloud/apps/api/tests/services/model-agreement/compute.test.ts` (new)
- `cloud/packages/db/prisma/schema.prisma`
- `cloud/packages/db/prisma/migrations/<timestamp>_add_model_agreement_snapshot/migration.sql`
- `cloud/apps/api/src/services/analysis/model-agreement-snapshot/snapshot-types.ts` (new)
- `cloud/apps/api/src/services/analysis/model-agreement-snapshot/canonical-key.ts` (new)
- `cloud/apps/api/src/services/analysis/model-agreement-snapshot/fingerprint.ts` (new)
- `cloud/apps/api/tests/services/analysis/model-agreement-snapshot/canonical-key.test.ts` (new)
- `cloud/apps/api/tests/services/analysis/model-agreement-snapshot/fingerprint.test.ts` (new)

Work:

- **Extract `computeModelAgreement(input)`** from `resolveModelAgreementOnTradeoffs` — pure-ish function that takes a snapshot input and returns the `ModelAgreementSnapshotPayload`. Has explicit Prisma + service dependencies in its signature (no resolver-context coupling). The resolver's live-path branch calls this; no behavior change for the live path. **Run the existing API tests for `model-agreement-on-tradeoffs` and confirm they still pass** — that's the regression gate for the extraction.
- Add `ModelAgreementSnapshot` Prisma model with fields: `id`, `scope`, `signature`, `domainIdsHash` (Char(32)), `modelIdsHash` (Char(32)), `domainIds[]`, `modelIds[]`, `agreementResultJson` (the pre-computed matrix + derived fields, stored as JSON), `sourceRunCount`, `sourceRunUpdatedAtSum` (BigInt), `algorithmVersion` (Int), `computedAt`, `createdAt`, `updatedAt`. Unique index on `(scope, signature, domainIdsHash, modelIdsHash)`. Secondary index on `(scope, signature)` for cron iteration.
- Generate migration via `prisma migrate dev`.
- Add `snapshot-types.ts` with the `ModelAgreementSnapshotInput`, `ModelAgreementSnapshotPayload`, `ModelAgreementSnapshotSource` enum, and an `AGREEMENT_ALGORITHM_VERSION` constant (start at `1`).
- Add `canonical-key.ts`: `canonicalKey({ scope, signature, domainIds, modelIds })` → `{ domainIdsHash, modelIdsHash }`. Dedupe, sort (case-sensitive), SHA-256 truncated to 32 hex chars.
- Add `fingerprint.ts`: `computeInputFingerprint(prisma, { scope, signature, domainIds, modelIds })` → `{ sourceRunCount, sourceRunUpdatedAtSum }`. Single SELECT with `COUNT` + `SUM(EXTRACT(EPOCH FROM "updatedAt"))::BIGINT` over the runs in scope.
- Unit tests for `canonicalKey`: identical inputs in different orders produce the same hash; duplicates collapsed; case-sensitive distinction preserved (`"Claude"` and `"claude"` produce different hashes); empty list distinct from single-item list; output is 32 hex chars.
- Unit tests for `fingerprint`: catches a new run inserted; catches a run deleted; catches a run updated even when it's not the latest by `updatedAt`; `sum` is stable across runs of the function.

Expected size: ~250–320 lines changed. The extraction adds size but de-risks slice 2 substantially — without it, slice 2 has to do both the extraction and the caching wiring.

- [CHECKPOINT]

### Slice 2: Snapshot builder, cache reader, queue handler

Files:

- `cloud/apps/api/src/services/analysis/model-agreement-snapshot/snapshot-builder.ts` (new)
- `cloud/apps/api/src/services/analysis/model-agreement-snapshot/snapshot-cache.ts` (new)
- `cloud/apps/api/src/services/analysis/model-agreement-snapshot/affected-snapshots.ts` (new)
- `cloud/apps/api/src/queue/handlers/refresh-model-agreement-snapshot.ts` (new)
- `cloud/apps/api/src/queue/handlers/handler-config.ts` (extend)
- `cloud/apps/api/src/queue/types.ts` (extend)
- `cloud/apps/api/src/services/run/lifecycle.ts` (or wherever run-completion is signaled — extend to call into `affected-snapshots` and enqueue refreshes)
- `cloud/apps/api/tests/services/analysis/model-agreement-snapshot/snapshot-builder.test.ts` (new)
- `cloud/apps/api/tests/services/analysis/model-agreement-snapshot/affected-snapshots.test.ts` (new)
- `cloud/apps/api/tests/services/analysis/model-agreement-snapshot/snapshot-cache.test.ts` (new)
- `cloud/apps/api/tests/services/analysis/model-agreement-snapshot/benchmark.test.ts` (new, gated)

Work:

- `snapshot-builder.ts`: thin wrapper around the slice-1 `computeModelAgreement` service — produces the payload, computes the fingerprint via slice-1's `fingerprint.ts`, returns `{ payload, sourceRunCount, sourceRunUpdatedAtSum, algorithmVersion }` ready for upsert.
- `snapshot-cache.ts`: `getModelAgreementSnapshot({ scope, signature, domainIds, modelIds, isCanonical })` reads the cache. On cache hit, also computes the current fingerprint and compares all three fields (`count`, `updatedAtSum`, `algorithmVersion`) → returns `{ payload, source: 'CACHE_HIT'|'CACHE_HIT_STALE' }`. On miss with `isCanonical=true`, queues a build job (with per-key dedupe so a thundering herd of concurrent misses enqueues exactly one job) and returns `{ payload: null, source: 'BUILDING' }`. On miss with `isCanonical=false`, returns null (caller falls back to live).
- `affected-snapshots.ts`: `getAffectedCanonicalKeys({ signature, domainId })` → list of `(scope, signature, domainIdsHash, modelIdsHash)` for every canonical snapshot covering that completed run: the single-domain snapshot, the ALL_DOMAINS snapshot, and any DOMAIN_SET snapshot containing the domain. Drives the multi-snapshot fan-out described in Architecture Choice 6.
- `refresh-model-agreement-snapshot.ts`: PgBoss handler that calls `snapshot-builder` and upserts into `ModelAgreementSnapshot`. Modeled on `refresh-win-rate-stability-snapshot.ts`. Same `expireInSeconds: 600` to start.
- Wire the run-completion path to call `getAffectedCanonicalKeys` and enqueue refreshes (debounced).
- Register the new handler in `handler-config.ts` and add the job-name constant to `queue/types.ts`.
- Tests: builder produces the expected payload shape for a known input; cache writes and reads round-trip; queued refresh on miss for canonical inputs (with the dedupe test — second concurrent miss does NOT enqueue a second job); live-path fall-through for non-canonical inputs; fingerprint comparison flags stale correctly across all three fields (count change, sum change, algorithm-version change); `getAffectedCanonicalKeys` returns the right fan-out set for known scopes.
- `benchmark.test.ts` (gated by env var so it doesn't run in every CI build): builds a snapshot for the heaviest realistic canonical selection (e.g., All Domains × default model set on the vnewtd signature) and asserts the build completes within the queue handler's `expireInSeconds` (600 s). If the assertion fires during the slice, the developer raises the timeout in the handler with explicit justification in the commit OR reduces `KAPPA_BOOTSTRAP_ITERATIONS` for the cached path (with a `methodology_note` field on the snapshot capturing the reduced precision, so the UI can surface it later).

Expected size: ~320–400 lines changed. If implementation pushes meaningfully past 400, split at the builder/handler boundary (2a = builder + cache reader + tests; 2b = handler + run-completion wiring + tests).

- [CHECKPOINT]

### Slice 3: Resolver rewire + GraphQL schema + codegen

Files:

- `cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts`
- `cloud/apps/api/src/graphql/types/model-agreement-on-tradeoffs.ts`
- `cloud/apps/web/src/api/operations/*.graphql` (schema fields added to existing operation if needed)
- `cloud/apps/web/src/generated/graphql.ts` (regenerated)
- `cloud/apps/api/tests/graphql/queries/model-agreement-on-tradeoffs.test.ts`

Work:

- Add `snapshotComputedAt`, `snapshotIsStale`, `snapshotSource` to `ModelAgreementResultRef` (Pothos) and the underlying TS type. Add the `ModelAgreementSnapshotSource` enum to the GraphQL schema.
- Rewire `resolveModelAgreementOnTradeoffs`: determine `isCanonical` by comparing the requested model set against the default-models-for-this-signature set (using the existing `getModelsFromDatabase` / default-models config); call `getModelAgreementSnapshot` from slice 2. On `CACHE_HIT` / `CACHE_HIT_STALE`, return the cached payload + freshness fields. On `BUILDING`, return `pending: true` + the existing build-progress shape. On `LIVE_NON_CANONICAL`, fall through to the existing live computation path (unchanged).
- Run `npm run codegen --workspace @valuerank/web` after the schema change.
- API tests: cache hit returns instantly with `snapshotSource: CACHE_HIT`; cache miss for canonical input returns `pending` and the test mocks queue-enqueue assertion; stale cache returns the snapshot + `snapshotIsStale: true` and queues refresh; non-canonical input takes live path (no refresh queued).
- Model-set canonicalization regression test: `["a","b","c"]` vs `["c","a","b"]` vs `["b","a","b","c"]` all hit the same cache key for the canonical set.

Expected size: ~250–300 lines changed.

- [CHECKPOINT]

### Slice 4: Web UI freshness chip

Files:

- `cloud/apps/web/src/components/models/ModelAgreementSection.tsx`
- `cloud/apps/web/tests/components/ModelAgreementSection.test.tsx`

Work:

- The freshness chip renders **inside `ModelAgreementSection`**, NOT at the page header. The query that returns `snapshotComputedAt` / `snapshotSource` lives in that component already; rendering the chip there avoids lifting state up through `ModelGroupsView` or introducing a context provider just for this. The chip semantically belongs next to the section it describes (the agreement-derived data), and a single chip there is sufficient — the similarity table, dendrogram, and V2 overlay are all instant when the chip shows CACHE_HIT, so users see consistency across surfaces without each surface having its own chip.
- Read `snapshotComputedAt` and `snapshotSource` from the existing `modelAgreementOnTradeoffs` response (no new query).
- Render a small "Cached as of …" chip near the section header — visible only when `snapshotSource` is `CACHE_HIT` or `CACHE_HIT_STALE`. When stale, append a subtle "(refreshing)". Style matches the existing cluster-cache chip on the Domain Analysis page.
- Tests: chip renders with the expected timestamp on `CACHE_HIT`; chip shows "(refreshing)" on `CACHE_HIT_STALE`; chip is hidden on `BUILDING` and `LIVE_NON_CANONICAL`.

Expected size: ~80–120 lines changed.

- [CHECKPOINT]

## Testing Plan

Per slice: the final task in each slice runs the relevant lint/build/test for the touched workspaces. From `cloud/`:

- `npm run lint --workspace @valuerank/db` and `@valuerank/api` and `@valuerank/web` as touched.
- `npm run test --workspace @valuerank/api` (with `DATABASE_URL` + `JWT_SECRET` env vars) for slices 1–3.
- `npm run test --workspace @valuerank/web` for slice 4.
- `npm run build --workspace @valuerank/api` and `@valuerank/web` as touched.
- `npm run codegen --workspace @valuerank/web` after slice 3's schema change.

Final combined diff (orchestrator):

- All workspace preflights pass.
- **Build-time verification (plan-required):** during slice 2 implementation, time the builder on a representative heavy scope (e.g., All Domains × default model set on the vnewtd signature) and confirm it completes within the queue handler's `expireInSeconds`. If it doesn't, raise the timeout with explicit justification before slice 2 merges.
- **Production smoke test (after deploy):** query `modelAgreementOnTradeoffs` for a known scope, expect `snapshotSource: CACHE_HIT` after the first build cycle completes, and `executionMs` well under 1 s.

## Risks and Mitigations

| Risk | Mitigation | Verification |
|---|---|---|
| **Builder times out on heavy scopes.** The current live computation took 23.7 s for *one* domain × 8 default models. All Domains × 8 models is much larger. | Same 600 s timeout as Win Rate stability to start; raise with justification if the measurement shows it doesn't fit. Consider reducing `KAPPA_BOOTSTRAP_ITERATIONS` (currently 1000) inside the snapshot builder only if needed — kept as a deliberate plan-time call, not silent. | verification: during slice 2, time the builder on All Domains × default models on vnewtd; if > 600 s, raise timeout or reduce bootstrap iterations with the trade-off documented in the slice commit. |
| **Cache-key canonicalization splits logically identical requests.** Two requests for the same model set in different orders, or with duplicates, must hit the same cache row. | Shared canonical-key helper used by writer (builder) and reader (resolver); single function, single tested path. | verification: slice 1 unit test asserts `canonicalKey` produces the same hash for `["a","b","c"]`, `["c","a","b"]`, and `["b","a","b","c"]`; slice 3 integration test asserts a permuted request hits the same cached payload. |
| **Stale data shown indefinitely.** If the fingerprint comparison misses a new completed run, users see stale numbers. | Fingerprint = `sourceRunCount` + `sourceRunMaxUpdatedAt` for the scope. Compared on every cache-hit read. Mismatch returns `snapshotIsStale: true` and queues a refresh — so the user sees data immediately AND the cache catches up. | verification: slice 3 API test inserts a new completed run, asserts the next read returns `snapshotIsStale: true` and queues a refresh; the subsequent read after the refresh handler runs returns `snapshotIsStale: false` with the new data. |
| **Silent-wrong-data: cache key drops modelIds.** The existing path's exact failure mode. | New cache key has `modelIdsHash` as a mandatory component; the unique index on `(scope, signature, domainIdsHash, modelIdsHash)` enforces it at the DB level. | verification: slice 3 API test swaps one model in the selection and asserts a different snapshot row is read/built — not a hit on the prior payload. |
| **Cache table growth.** Including `modelIds` in the key risks unbounded rows. | Canonical-only caching policy: builder writes only for canonical (default-model-set) selections; resolver falls back to live for non-canonical. | verification: slice 2 unit test asserts the builder rejects (or no-ops on) a non-canonical input; slice 3 API test asserts a non-canonical request runs the live path and does NOT write a snapshot row. |
| **GraphQL schema change ships without codegen.** The web side reads new fields that don't exist in `generated/graphql.ts`. | Slice 3 runs `npm run codegen --workspace @valuerank/web` immediately after the schema change; the resulting types are part of the slice commit. | verification: slice 3's commit includes the regenerated `cloud/apps/web/src/generated/graphql.ts`; `npm run build --workspace @valuerank/web` passes (would fail if types were stale). |
| **The existing `readModelAgreementSnapshotStateFromSnapshot` path interferes.** Two readers (old + new) could disagree on what's available. | Slice 3 replaces the call site in `resolveModelAgreementOnTradeoffs` with the new reader. The old helper can be left in place for any other call site, or deleted if no other consumer exists. | verification: slice 3 greps for `readModelAgreementSnapshotStateFromSnapshot` usages and either reroutes them or deletes the helper if unused. |
| **Migration safety on production.** Adding a new table is generally safe but new indexes can lock briefly. | Standard Prisma `migrate deploy` in the existing prod migration flow; the migration only adds a new table and its indexes (no changes to existing tables). | verification: review the generated `migration.sql` in slice 1 — only `CREATE TABLE` and `CREATE INDEX` statements, no `ALTER TABLE` on existing tables; sanity-check the SQL before commit. |
| **Algorithm change leaves snapshots looking fresh forever.** If the agreement computation logic changes but `algorithmVersion` isn't bumped, old rows would be served indefinitely as "fresh." | The `algorithmVersion` constant lives next to the builder code as a deliberate human-controlled marker; any non-trivial change to `computeModelAgreement` requires bumping it in the same commit. | verification: code-review convention enforced in the slice-1 / slice-2 commit messages — the algorithm-version constant location and bump rule are documented at the source-of-truth file. |
| **BUILDING never settles** (queue worker down, job dropped, infinite "Preparing…"). | The handler upserts the snapshot row on success and logs on failure. The scheduled cron refresh picks up any canonical selection whose snapshot is still missing on its next run, so a dropped build self-heals within the cron interval. The "BUILDING" status returned to the resolver is bounded by the cron cadence, not infinite. | verification: an API test simulates an enqueue-without-completion and asserts that the next read after the cron fires either has the snapshot or re-enqueues; in slice 2 commit, document the cron cadence so the worst-case "BUILDING" duration is explicit. |
| **Canonical-set drift.** The set of `isDefault` models for a signature may change. Old snapshots could be built against a now-stale canonical definition. | The `modelIdsHash` IS the canonical identity. A change to the default-model set produces a different hash → a different snapshot row. The old row simply ages out (no fresh reads against it). | verification: slice 2 test changes the default-model set, asserts the resolver now treats the new set as canonical and writes a new snapshot row; the old row is unchanged and unreferenced. |
| **Thundering herd on a brand-new signature.** First N concurrent users on a never-built canonical selection could each enqueue a duplicate build. | Read-time dedupe in `snapshot-cache.ts`: when enqueueing for a key, check a small in-flight tracker (DB row, in-memory cache, or PgBoss singleton-job semantics) and skip if a job is already enqueued for that key. | verification: slice 2 unit test fires 10 concurrent cache misses for the same key and asserts exactly one build job is enqueued; second-arrival misses receive `BUILDING` immediately. |

## Acceptance Notes

- On a canonical default selection with a built snapshot, `modelAgreementOnTradeoffs` returns in well under 1 s. The four agreement-derived surfaces on `/models` (V1 and V2) are instant.
- On a fresh canonical selection with no snapshot, the resolver returns `pending: true` and queues a build; the existing "Preparing model agreement report" UI shows; the next load is instant.
- On a non-canonical selection (user-chosen non-default model set), the resolver falls back to live computation and the page behaves as it does today — no new fast path, but no regression either.
- A freshness chip on `/models` shows "Cached as of …" on cache hits; appends "(refreshing)" when stale.
- New completed runs invalidate the snapshot via the fingerprint comparison; next read returns stale-marked data and queues a refresh.
- All four downstream consumers benefit from the same snapshot (one cache, four surfaces).
- API + web preflight pass. No `@ts-ignore`, no `any`.
- V1's rendered output is unchanged for any existing test.

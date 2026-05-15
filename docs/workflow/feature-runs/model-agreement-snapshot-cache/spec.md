# Model Agreement Snapshot Cache

## Summary

The Model Agreement on Value Tradeoffs report on `/models` (and `/models/v2`) currently stays on a "Preparing model agreement report" state for minutes on heavy scopes. Four things on the page depend on this one computation — the agreement section, the similarity table, the kappa-clustering dendrogram in `kappa-agreement` mode, and the V2 internal-agreement overlay — so the wait is highly visible.

The `modelAgreementOnTradeoffs` resolver already has snapshot-read and refresh-queue plumbing — it piggy-backs on the domain-analysis snapshot — but the rebuild stays pending long enough to feel broken in normal use. **Two latent gaps in the current code make this more than a "make it faster" problem:** (1) the current reader does not key on `modelIds`, so any populated agreement snapshot would silently serve the wrong matrix for a different model selection; (2) the current path returns "current snapshot OR build progress" with no input-hash comparison and no `lastValidatedAt`, so stale-detection isn't a thing the existing code can do.

The Win Rate Stability report just got a dedicated server-side snapshot-cache (PR #1086 `perf(api): snapshot-cache modelsWinRateStability`, plus indexing in PR #1084 and the web cache-and-network change in PR #1085) and that report is now near-instant. **It is the pattern reference, not a copy-paste target** — `modelsWinRateStability` computes for all active models with no user-supplied `modelIds`, so it can key by scope+signature alone. Model agreement accepts `modelIds`, which forces the cache to be keyed on the model selection and brings in the cardinality and canonicalization concerns described below.

This feature gives the model-agreement report the same user-visible outcome: pre-computed snapshots stored in the database with `modelIds` in the key, a builder job, a resolver that returns the cached snapshot instantly and queues a refresh on miss/stale (with real freshness fields it can actually check), and a "Cached as of …" freshness chip on the page matching the existing cluster-cache chip pattern.

## Goals

- A cached selection's Model Agreement on Value Tradeoffs table renders in well under one second.
- Every other agreement-derived surface on `/models` (similarity table, kappa-clustering dendrogram, V2 internal-agreement overlay) becomes instant when the snapshot exists.
- A fresh, never-built selection still works: the existing "Preparing model agreement report" UI shows, a background build runs, the next load is instant.
- Cache invalidates correctly when new completed runs change the underlying data — users do not see stale numbers indefinitely.
- A "Cached as of …" freshness chip on `/models` matches the existing cluster-cache chip pattern.

## Non-Goals

- No changes to the kappa math, pairwise comparison logic, or what the report computes.
- No UI redesign on `/models` or `/models/v2` beyond the freshness chip.
- No backfill scripts beyond what the snapshot builder fills in over time as it runs.
- No changes to the V1/V2 page structure or routing.
- No changes to `ModelAgreementSection`'s existing "Preparing…" UI — that stays as the cold-build state.

## Required Behavior

### Hot path (snapshot exists)

- The `modelAgreementOnTradeoffs` resolver returns the cached pairwise agreement matrix and all of its derived data (per-pair kappa, vignette-level consistency, etc.) directly from the snapshot. No live re-computation.
- The response includes a freshness signal (a "computed at" timestamp or equivalent) so the UI can render a "Cached as of …" chip.
- The four downstream surfaces on `/models` and `/models/v2` (agreement section, similarity table, kappa-clustering dendrogram in `kappa-agreement` mode, V2 internal-agreement overlay) all render with the cached data.

### Cold path (no snapshot for this selection)

- The resolver returns `pending` and queues a snapshot build for this selection.
- The existing `ModelAgreementSection` "Preparing model agreement report" UI shows.
- Once the build completes, the next page load (or the next poll if polling exists) returns the snapshot from the hot path.

### Stale path (snapshot exists but underlying data changed)

- The resolver returns the cached snapshot (so the page still loads instantly) AND queues a refresh.
- On the next load after refresh, the snapshot is current.
- The freshness chip still tells the user when the displayed data was computed.

### Cache key

- A snapshot is uniquely identified by the combination of: scope (DOMAIN / ALL_DOMAINS / DOMAIN_SET), signature, the domain(s) in scope, and the **model-set** used for the agreement. All four dimensions are required — none may be dropped.
- The model-set component of the key is a **canonical hash** of the model IDs: deduped and sorted into a stable order before hashing, so that logically identical selections (regardless of input order) hit the same snapshot. The same canonicalization rule applies to the domain-set when scope is `DOMAIN_SET`.
- Different selections must not collide — switching domains, signatures, or model selection must serve the right snapshot (or build a new one), never the wrong one. The current `readModelAgreementSnapshotStateFromSnapshot` reader does not include `modelIds` in its key; this gap is what produces the silent-wrong-data risk if the existing snapshot path is ever populated with agreement data. Closing it is part of the work.

### Cache scope and retention

- Caching must cover at minimum the **canonical default selection per (signature, scope)** — the set of models marked `isDefault` in the LLM-models config for the current signature, against the user's domain selection. This is the configuration most users see by default, and the one the page must be instant for.
- Non-canonical selections (arbitrary user-chosen model sets) may be cached lazily on first request, OR may fall back to the existing live computation path with the "Preparing…" UI — the plan picks one explicitly. If lazy caching is chosen, a retention/eviction policy (TTL or LRU) is required to bound table growth; the policy must be stated in the plan.
- The plan must explicitly address cache-table growth and either prevent it (canonical-only caching) or bound it (TTL/LRU eviction) — "lazy caching of arbitrary selections with no eviction" is not acceptable.

### Cache invalidation / refresh triggers

- Staleness is determined by comparing the snapshot's recorded **input fingerprint** (e.g., the latest completed-run timestamp or a hash of the run set that contributed to the snapshot) against the current state of the underlying data. The plan must define the exact fingerprint and must ensure the snapshot row stores enough state to do this comparison at read time — the current snapshot reader does not, and that is part of the work.
- When new completed runs land for a scope, the snapshots covering that scope become stale and are refreshed on next access (or eagerly by the builder, depending on plan-stage choice).
- A scheduled refresh cadence (or event-driven trigger from run completion) keeps frequently-viewed selections current without user-triggered refreshes. The plan decides cadence-vs-event-driven explicitly.

### Cold-build feasibility constraint

- The live agreement computation already calls `bootstrapKappaConfidence(..., 1000)` for every model pair and walks all selected runs — building one snapshot is itself an expensive operation, not just "cache it and forget it." The plan must measure or estimate the build time for the heaviest realistic selection (e.g., All Domains × the default model set on a populated signature) and confirm it completes **within the builder job's timeout** — the Win Rate stability reference uses `expireInSeconds: 600` (10 minutes), and the plan must verify that ceiling holds here or explicitly raise it (with justification).

### API contract for freshness

- The GraphQL response shape for `modelAgreementOnTradeoffs` must include explicit **freshness fields**: at minimum a `computedAt` (or `snapshotComputedAt`) timestamp, and a `isStale` / `pending` boolean. The UI freshness chip reads these. The current shape does not expose these fields; adding them is part of the work, not a UI-only change.

### V1 / V2 parity

- The cache lives below the V1/V2 page split. Both pages benefit equally with no special-casing.
- No existing V1 behavior changes other than instant loads and the freshness chip.

## Likely Files

Reference files to model the work on (the Win Rate stability pattern):

- `cloud/apps/api/src/graphql/queries/models-stability.ts` — resolver pattern (thin: delegates to `getWinRateStabilityResult`)
- `cloud/apps/api/src/services/analysis/win-rate-stability/snapshot-cache.ts` — read-from-snapshot, fall back to queue-build
- `cloud/apps/api/src/services/analysis/win-rate-stability/snapshot-builder.ts` — actual builder
- `cloud/apps/api/src/services/analysis/win-rate-stability/snapshot-types.ts` — shared types
- `cloud/apps/api/src/queue/handlers/refresh-win-rate-stability-snapshot.ts` — PgBoss handler
- `cloud/apps/api/src/queue/handlers/handler-config.ts` — handler registration
- `cloud/apps/api/src/queue/types.ts` — queue job types

Files this work will touch:

- `cloud/apps/api/src/graphql/queries/model-agreement-on-tradeoffs.ts` — resolver wiring (it already reads snapshot state; behavior change depends on plan-stage architecture choice).
- `cloud/apps/api/src/services/analysis/...` — new or extended snapshot-cache / builder / types for model-agreement (or extension of the existing domain-analysis snapshot to populate agreement data, depending on plan-stage architecture choice).
- `cloud/apps/api/src/services/analysis/domain-analysis-snapshot-readers.ts` — currently houses `readModelAgreementSnapshotStateFromSnapshot`; may extend or be superseded.
- `cloud/packages/db/prisma/schema.prisma` — possibly a new snapshot model (if going dedicated, Win-Rate-style), or new fields on an existing snapshot model (if extending). Includes a migration.
- `cloud/apps/api/src/queue/handlers/` — new handler for the refresh job (if going dedicated).
- `cloud/apps/api/src/queue/handlers/handler-config.ts` and `cloud/apps/api/src/queue/types.ts` — handler/type registration.
- `cloud/apps/web/src/pages/ModelsGroups.tsx` (the shared `ModelGroupsView`) — small UI touch to render a "Cached as of …" chip on the page using a new freshness field from the GraphQL response.
- `cloud/apps/web/src/components/models/ModelAgreementSection.tsx` — possibly read and surface the freshness timestamp.
- Tests under `cloud/apps/api/src/.../__tests__` and `cloud/apps/web/tests/` for the cache-hit / cache-miss / stale / freshness-chip cases.

## Acceptance Criteria

- On a selection whose snapshot already exists, the Model Agreement on Value Tradeoffs table renders in well under one second after the GraphQL response — not minutes.
- On a fresh selection with no cached snapshot, the resolver returns pending and queues a refresh; the existing "Preparing model agreement report" UI shows; subsequent loads of the same selection are near-instant.
- The `/models` page shows a "Cached as of …" freshness indicator on the agreement-driven reports, matching the existing cluster-cache chip pattern.
- Different selections (different scope / signature / domain(s) / model-set) get independent cache entries with no collisions — switching domains or signatures does not serve the wrong report.
- When new completed runs change the underlying data, the snapshot is invalidated or refreshed so users do not see stale numbers indefinitely.
- All four agreement-derived surfaces on `/models` and `/models/v2` become instant when the snapshot exists: the agreement section, the similarity table, the kappa-clustering dendrogram in `kappa-agreement` mode, and the V2 internal-agreement overlay.
- API tests cover cache hit, cache miss (queues refresh, returns pending), stale-then-refresh, **and a model-set-collision regression test** (swapping one model in the selection must produce a different snapshot key and not return the prior payload).
- The GraphQL response shape for `modelAgreementOnTradeoffs` exposes `computedAt` (or equivalent timestamp) and a staleness/pending boolean; the UI reads these for the freshness chip.
- Cache-table growth is bounded by an explicit policy (canonical-only caching, or lazy + TTL/LRU eviction) — the policy is stated in the plan and tested.
- The snapshot builder completes within its job timeout for the heaviest realistic selection covered by the cache policy.
- `npm run lint`, `npm run test`, and `npm run build` pass for the affected workspaces (api, db, web); no `@ts-ignore`, no `any`.
- No regression to V1's rendered output on `/models` — existing tests still pass unchanged.

## Risks

- **Existing snapshot plumbing is already there but ineffective.** The resolver already has `readModelAgreementSnapshotStateFromSnapshot` and queues `domainAnalysisRefresh`. The user's experience says it does not actually deliver instant loads. The plan has to determine *why*: does the domain-analysis snapshot builder not compute the agreement matrix? Is the refresh queue slow? Is the snapshot invalidated too eagerly? **verification:** during plan-stage, before choosing extend-vs-replace, query a real production snapshot row for a known scope and inspect whether it contains agreement data or just cluster data. If it doesn't carry the agreement matrix at all, the existing path is naming-only and a dedicated cache is required.
- **Cache-key collisions silently serve the wrong report.** The current snapshot reader keys by scope+domain+signature *without* `modelIds` — if that path were ever populated with agreement data it would serve the wrong matrix for a different model selection. Closing this gap is part of the work. **verification:** an API test asserts that swapping one model in the selection produces a different snapshot key and a different cached payload, not a hit on the old key.
- **Stale data shown indefinitely.** The current reader returns "current snapshot OR build progress" with no input-hash comparison or `lastValidatedAt` — stale-detection isn't expressible against the existing shape. The plan must add a real freshness/fingerprint field to the snapshot row. **verification:** an API test inserts a new completed run for a scope and asserts the snapshot is marked stale and refreshes on next read.
- **Snapshot build is itself the slow step.** The live agreement path calls `bootstrapKappaConfidence(..., 1000)` per model pair and walks all selected runs. Caching only helps if the builder actually completes. **verification:** during plan-stage, measure (or estimate) the build time for the heaviest realistic cached selection (e.g., All Domains × the default model set on a populated signature) and confirm it completes within the queue handler's job timeout (the Win Rate stability reference uses 600s); if it doesn't, the plan raises the timeout with justification or reduces the work (smaller bootstrap, batched build).
- **Cache-key cardinality explosion.** Including `modelIds` in the key means every distinct user-chosen model subset is a potential snapshot row — unbounded without policy. **verification:** the plan states an explicit growth-control policy. Acceptable options: (a) cache canonical default selections only and let arbitrary selections fall back to live computation; (b) cache lazily but with a TTL or LRU eviction policy. "Lazy caching of arbitrary selections with no eviction" is rejected.
- **Canonicalization bugs split logically identical requests.** Two requests for the same set of models in different orders, or with duplicates, must hash to the same key. **verification:** an API test asserts that the cache key for `["a","b","c"]` equals the key for `["c","a","b"]` and for `["b","a","b","c"]` (duplicates) — all three are the same canonical selection.
- **Freshness chip is an API contract change, not just UI.** The current GraphQL response does not expose a `computedAt` or `isStale` field; the schema, generated types, and UI all need updates in lockstep. **verification:** the schema change, codegen, and UI freshness chip are all part of one PR — codegen run after schema changes per the `feedback_run_codegen_after_graphql_changes.md` rule.

# Domain Analysis Freshness And Background Cache

## Summary

Speed up `/domains/analysis` by serving a cached domain-analysis snapshot instead of rebuilding the page from raw transcripts on every load. Add plain-language freshness UI so users can tell whether they are looking at fresh cached results, cached results that are being refreshed, or cached results that are out of date. Use a hybrid refresh model:

- refresh in the background when the page loads and the snapshot is stale or missing
- refresh in the background when new run analysis finishes

## Goals

- Cut the Domain Analysis load path away from large raw transcript reads.
- Keep the domain-analysis numbers and formulas unchanged.
- Make cache freshness obvious in high-school language.
- Support background refresh without duplicate job storms.
- Keep the current signature-driven domain analysis flow.

## Non-Goals

- No redesign of the broader report layout beyond cache-status UI.
- No change to score formulas, support semantics, or ranking logic.
- No change to the domain-analysis value detail page in this slice.
- No change to export output in this slice.
- No new database table or migration in this slice.
- No production data backfill beyond creating and filling snapshots as normal traffic and jobs run.

## Product Behavior

### Cache-backed domain analysis

- The main `domainAnalysis` query should prefer a saved domain snapshot for the selected domain and signature.
- The snapshot should be built from current per-run `analysis_results` data plus vignette metadata, not from raw transcripts.
- The query should keep supporting the current `scoreMethod` argument. The snapshot path must return the same user-facing numbers as the current page for the same data.
- If a current snapshot exists and matches the latest source-analysis fingerprint, return it as `FRESH`.
- If a stale snapshot exists, return it immediately and queue a background refresh. Mark the response as `UPDATING`.
- If no snapshot exists yet but source analysis exists, build and save one in the request path so the page can render, then use that snapshot on later loads.
- If a refresh cannot be queued for a stale snapshot, keep the stale snapshot visible and mark the response as `OUT_OF_DATE`.

### Background refresh

- A background job should refresh a domain snapshot when a new `analyze_basic` result finishes for a run that belongs to the domain.
- The Domain Analysis page should also request a background refresh when it detects that the current snapshot is stale or missing.
- Refresh jobs must use singleton keys so multiple page loads or run completions do not create duplicate work for the same `domainId + signature`.
- Refreshing one signature should not block other signatures for the same domain.

### Freshness UI

- The top of the Domain Analysis page should show a compact cache-status chip under the page title.
- The chip must use plain labels:
  - `Fresh`
  - `Updating`
  - `Out of date`
- A short line of text under the chip should explain what the user is seeing in plain language:
  - `Data last updated ...`
  - `Showing saved results from ... We’re checking for newer analysis now.`
  - `Showing saved results from ... New analysis is not ready yet.`
- The page should use the snapshot timestamp from the API response.
- The cache-status UI should remain visible while the rest of the page renders.
- Add a small `Refresh analysis` control so the user can manually request a refresh.
- Triggering a manual refresh should not wipe the current table. It should keep the current cached table visible and move the status into an updating state.

### Query flow

- The main Domain Analysis query should no longer wait on the signature query before it runs.
- If no signature is selected yet, the page may ask for domain analysis without a signature and let the API pick the default signature, matching current backend behavior.
- The signature dropdown should still populate from the existing signatures query.

## Likely Files

- `cloud/apps/web/src/pages/DomainAnalysis.tsx`
- `cloud/apps/web/src/api/operations/domainAnalysis.ts`
- `cloud/apps/web/tests/pages/DomainAnalysis.test.tsx`
- `cloud/apps/api/src/graphql/queries/domain/analysis.ts`
- `cloud/apps/api/src/graphql/queries/domain/shared.ts`
- `cloud/apps/api/src/graphql/queries/domain/types.ts`
- `cloud/apps/api/src/graphql/mutations/*` if a manual refresh mutation is added
- `cloud/apps/api/src/queue/handlers/analyze-basic.ts`
- `cloud/apps/api/src/queue/handlers/index.ts`
- `cloud/apps/api/src/queue/types.ts`
- `cloud/apps/api/src/services/analysis/*`
- `cloud/apps/api/src/services/assumptions/*` for the shared snapshot storage pattern

## Acceptance Criteria

- Loading `/domains/analysis` no longer depends on reading raw transcript JSON for the main overview path.
- The API can return domain-analysis data from a saved snapshot built from `analysis_results`.
- A stale snapshot is shown immediately while a background refresh is requested.
- A new `analyze_basic` completion requests a domain snapshot refresh for the affected domain and signature.
- Duplicate refresh jobs for the same `domainId + signature` are prevented.
- The page shows a visible cache-status chip and plain-language freshness text.
- The page exposes a `Refresh analysis` action without clearing the current table.
- The page no longer pauses the main analysis query while waiting for the signatures query.
- Existing domain-analysis math and rankings stay unchanged for the same input data.

## Risks

- A new snapshot path can drift from the current transcript-based logic if it does not reconstruct pairwise wins correctly from per-run analysis output.
- A new background job can create hidden queue churn if the singleton key is too broad or too narrow.
- Reusing the shared assumption snapshot store means we need to keep the domain-analysis snapshot type and keys clearly separated from assumption snapshots.

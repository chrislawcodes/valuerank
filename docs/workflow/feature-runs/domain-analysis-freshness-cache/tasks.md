# Tasks

## Slice 1 Backend Snapshot Path [CHECKPOINT]

- [x] Reuse `assumption_analysis_snapshots` for domain overview storage instead of adding a new table.
- [x] Add snapshot read/write helpers in the API analysis services layer.
- [x] Build a domain snapshot from current `analysis_results` plus vignette value-pair metadata.
- [x] Update `domainAnalysis` to read from the snapshot path and return cache freshness state.
- [x] Add a new queue job type and handler for domain snapshot refresh.
- [x] Trigger snapshot refresh from `analyze_basic` completion using singleton keys by `domainId + signature`.
- [x] Add focused API coverage for snapshot-backed domain analysis behavior.

Estimated diff size: ~250-300 lines in core logic plus tests.

Verification:

- `npm run db:test:setup`
- `npx turbo test --filter=@valuerank/api -- --run domain-analysis`
- `npx turbo build --filter=@valuerank/api`

## Slice 2 Web Freshness UI [CHECKPOINT]

- [x] Update the web GraphQL operation and types for cache freshness data.
- [x] Remove the main-query pause that waits for the signature query.
- [x] Add the cache-status chip, plain-language freshness line, and refresh button.
- [x] Keep the current table visible while a refresh is being requested.
- [x] Add or update page tests for the freshness UI and no-waterfall query behavior.

Estimated diff size: ~150-220 lines plus tests.

Verification:

- `../../node_modules/.bin/vitest run --config vitest.config.ts tests/pages/DomainAnalysis.test.tsx`

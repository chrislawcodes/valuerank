# Plan

## Summary

Replace the slow transcript-heavy Domain Analysis overview path with a snapshot service that aggregates current per-run `analysis_results`. Reuse the existing `assumption_analysis_snapshots` table as the storage layer, keyed by `domainId + signature`. Use a background refresh job to keep snapshots warm after new analysis completes and when the page detects stale cache. Add a small freshness banner and refresh button on the web page.

## Architecture

### 1. Snapshot storage

Reuse `assumption_analysis_snapshots` with:

- `assumptionKey = domain-analysis:<domainId>`
- `analysisType = domain_overview`
- `configSignature = normalized signature`
- `inputHash` from latest vignette + analysis fingerprints
- `output` as the cached domain overview payload

Why:

- avoids a migration for this performance fix
- keeps the current snapshot lifecycle behavior we already trust
- still gives us `CURRENT` vs `SUPERSEDED` semantics and JSON payload storage

### 2. Snapshot builder

Create a domain-analysis snapshot service that:

- resolves latest vignette ids in the domain
- resolves the selected signature and matching current runs
- loads current `analysis_results` for those runs
- resolves the value pair for each vignette
- reconstructs domain-level counts and pairwise wins from each run’s saved per-model value counts
- stores a compact snapshot payload with:
  - per-model per-value counts
  - per-model pairwise win counts
  - coverage and missing-vignette metadata
  - generated timestamp

The GraphQL resolver can then compute:

- Full BT scores
- smoothed log-odds if requested later
- ranking-shape summaries
- cluster analysis

from the snapshot payload instead of raw transcripts.

### 3. Freshness model

Compute a lightweight source fingerprint from:

- matching run ids
- current analysis-result ids or hashes
- selected signature
- latest vignette ids

Resolver behavior:

- matching current snapshot exists: return `FRESH`
- stale snapshot exists and refresh queued: return stale snapshot as `UPDATING`
- stale snapshot exists and refresh queue fails: return stale snapshot as `OUT_OF_DATE`
- no snapshot exists: build snapshot inline from `analysis_results`, save it, return `FRESH`

This keeps first load safe while still supporting background warming.

### 4. Background refresh job

Add a new queue job for domain snapshot refresh.

Job inputs:

- `domainId`
- `signature`
- optional `reason`

Trigger points:

- after `analyze_basic` completes for a run
- from the page or resolver when a stale snapshot is detected
- from a manual refresh button

Deduping:

- singleton key should include `domainId + signature`

### 5. Web changes

Update the Domain Analysis page so it:

- fires the main query immediately without waiting for signatures
- reads `cacheStatus` and `generatedAt`
- shows a compact chip and freshness line inside the domain selection card
- offers a `Refresh now` action
- keeps the current table visible while refresh is requested

## Data Notes

- This does not add a new table.
- The initial snapshot population happens lazily through normal requests and background jobs.
- No backfill is required for correctness.

## Verification Plan

- API tests for snapshot build and freshness-state behavior
- API tests for refresh job enqueue behavior on `analyze_basic`
- Web page tests for freshness UI and no-waterfall query behavior
- targeted build and test runs for `@valuerank/api` and `@valuerank/web`

## Slice Plan

### Slice 1

Backend snapshot path and refresh queue.

Includes:

- snapshot builder service
- queue job and handler
- resolver switch to snapshot path
- analyze-basic trigger

Checkpoint after this slice because it changes data flow and queueing.

### Slice 2

Web freshness UI and manual refresh.

Includes:

- main query no longer blocked by signatures
- cache chip and freshness copy
- refresh action and test coverage

Checkpoint after this slice because it changes the user-facing behavior.

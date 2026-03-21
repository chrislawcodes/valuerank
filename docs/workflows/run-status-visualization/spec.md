# Spec: run-status-visualization

**Status:** Design approved and locked from prior session. Discovery complete.

## Problem

`ExecutionProgress.tsx` shows dot-pill concurrency gauges and a recent-completions feed. It does not show:
- which models are running and how many trials each has completed
- per-provider throughput rates
- retry pressure (proportion of trials that needed retries)
- pipeline stage (Probe → Summarize → Analyse)

Users watching an active run cannot tell which providers are slow, which models are being retried, or what stage the run is in.

## Approved Design (locked — do not re-litigate)

### Stage pills
Three pills: `Probe` → `Summarize` → `Analyse`. Active stage has pulsing dot.
- `PENDING` / `RUNNING` → Probe active
- `SUMMARIZING` → Summarize active
- `analysisStatus != null` → Analyse active (analysis has started or completed)
- `FAILED` / `CANCELLED` → Probe shown as failed/stopped; Summarize and Analyse remain dimmed
- Any other unrecognized status → Probe active (safe default)

### Provider cards (3-column grid)
Each provider gets a card with:
- **Header**: colored dot + provider name
- **Per-model rows**: full model name (monospace, no truncation) | done count | throughput X/min (rolling 60s window from `recentCompletions` filtered by `modelId`; show 0 if no completions in window)
- **Totals line**: "X done total · Y/min" + pulsing dot if active
- **Footer**: fill-bar utilization (activeJobs/maxParallel, show 0% if maxParallel=0) | "X/Y slots" | "N queued" (from `provider.queuedJobs`) | retry badge

### Retry badge
`totalRetries / runProgress.total` → green <10%, amber 10–25%, red >25%. Shows cumulative retry burden for the run. If `runProgress.total` is 0 or null, hide the badge entirely.

### Summarize section (slim, dimmed)
`summarizeProgress`: "X/Y  N failed" bar. Shows "Starts after Probe" when pending.

### Analyse section (slim, dimmed)
`analysisStatus` status line. Shows "Starts after Summarize" when pending.

## Acceptance Criteria

1. Stage pills render with correct active state from `run.status`
2. Provider cards show per-model rows: full model name, done count, throughput rate
3. Model names are not truncated (full name, monospace font)
4. Utilization fill-bar shows `activeJobs / maxParallel` (not dot pills)
5. Retry badge visible and correct color based on retry percentage
6. Summarize and Analyse sections render as slim dimmed bars
7. `totalRetries: Int!` added to `ExecutionMetrics` GraphQL type and resolver
8. `byModel { modelId completed failed }` added to `runProgress` fragment and `RunProgress` TS type
9. Build and lint pass for both api and web workspaces

## Scope

**In scope:**
- `cloud/apps/api/src/graphql/types/execution-metrics.ts` — add `totalRetries: Int!`
- `cloud/apps/api/src/graphql/types/run.ts` — compute `totalRetries` in executionMetrics resolver
- `cloud/apps/web/src/api/operations/runs.ts` — add `totalRetries` to type + fragment; add `byModel` to RunProgress
- `cloud/apps/web/src/components/runs/ExecutionProgress.tsx` — full rewrite in place
- `cloud/apps/web/src/components/runs/RunProgress.tsx` — update props passthrough only

**Out of scope:**
- No new standalone component files (inline functions only)
- No changes to rate-limiter service, summarize/analyse resolvers, or database schema

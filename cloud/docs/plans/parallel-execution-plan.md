# Parallel Execution with Rate Limiting - Implementation Plan

## Problem Statement

The probe-scenario handler processes jobs sequentially despite PgBoss delivering batches. This ignores the `maxParallelRequests` and `requestsPerMinute` settings configured per LLM provider.

## Solution: Bottleneck-Based Rate Limiting

Use [Bottleneck](https://www.npmjs.com/package/bottleneck) to enforce both constraints:
- `maxParallelRequests` → `maxConcurrent`
- `requestsPerMinute` → `minTime` (60000 / rpm)

## Implementation Phases

### Phase 1: Backend - Rate Limiter Service

**File:** `apps/api/src/services/rate-limiter/index.ts`

```typescript
// Per-provider Bottleneck instances
// Enforces maxConcurrent and minTime per provider
```

Changes:
1. Install `bottleneck` package
2. Create `RateLimiterService` with per-provider Bottleneck instances
3. Track active jobs per provider for metrics
4. Emit events for UI metrics (active count, queue depth, etc.)

### Phase 2: Backend - Update Probe Handler

**File:** `apps/api/src/queue/handlers/probe-scenario.ts`

Change from:
```typescript
for (const job of jobs) {
  await processJob(job);
}
```

To:
```typescript
await Promise.all(jobs.map(job =>
  rateLimiter.schedule(provider, () => processJob(job))
));
```

### Phase 3: Backend - Execution Metrics GraphQL

**New Type:** `ExecutionMetrics`

```graphql
type ProviderExecutionMetrics {
  provider: String!
  activeJobs: Int!
  queuedJobs: Int!
  maxParallel: Int!
  requestsPerMinute: Int!
  recentCompletions: [CompletionEvent!]!
}

type ExecutionMetrics {
  providers: [ProviderExecutionMetrics!]!
  totalActive: Int!
  totalQueued: Int!
  estimatedTimeRemaining: Int  # seconds
}
```

Add to Run type:
```graphql
type Run {
  # ... existing fields
  executionMetrics: ExecutionMetrics  # Only populated during RUNNING state
}
```

### Phase 4: Frontend - Detailed Progress Component

**File:** `apps/web/src/components/runs/ExecutionProgress.tsx`

Features:
- Per-provider cards showing:
  - Provider name and logo/icon
  - Active jobs gauge (filled circles or bar)
  - Rate limit indicator (requests/min)
  - Mini progress bar
  - Recent completions with model names
- Overall throughput indicator
- Estimated time remaining
- Animated transitions for job starts/completions

**Visual Design:**
```
┌─────────────────────────────────────────────────────────────┐
│ Execution Progress                              ETA: 2m 30s │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│ │ Anthropic   │ │ OpenAI      │ │ DeepSeek    │            │
│ │ ●●●○○ 3/5   │ │ ●●●●● 5/5   │ │ ●●○○○ 2/5   │            │
│ │ 40 req/min  │ │ 60 req/min  │ │ 30 req/min  │            │
│ │ ████░░ 67%  │ │ ██████ 100% │ │ ███░░░ 50%  │            │
│ └─────────────┘ └─────────────┘ └─────────────┘            │
├─────────────────────────────────────────────────────────────┤
│ Recent: claude-sonnet ✓  gpt-4o ✓  deepseek ✓  gpt-4o ✓    │
└─────────────────────────────────────────────────────────────┘
```

### Phase 5: Frontend - Collapsible Behavior

**File:** `apps/web/src/components/runs/RunProgress.tsx`

- When `run.status` is RUNNING/PENDING → Show expanded `ExecutionProgress`
- When `run.status` is COMPLETED/FAILED/CANCELLED → Collapse to simple summary
- Smooth animation for collapse transition
- Click to expand completed runs temporarily

## File Changes Summary

### New Files
1. `apps/api/src/services/rate-limiter/index.ts` - Bottleneck wrapper service
2. `apps/api/src/graphql/types/execution-metrics.ts` - GraphQL types
3. `apps/web/src/components/runs/ExecutionProgress.tsx` - Detailed progress UI

### Modified Files
1. `apps/api/package.json` - Add bottleneck dependency
2. `apps/api/src/queue/handlers/probe-scenario.ts` - Use rate limiter, parallel processing
3. `apps/api/src/graphql/types/run.ts` - Add executionMetrics field
4. `apps/web/src/components/runs/RunProgress.tsx` - Conditional expanded/collapsed view
5. `apps/web/src/api/operations/runs.ts` - Add executionMetrics to query

## Testing Strategy

1. Unit tests for RateLimiterService
2. Integration test: verify parallel execution with mocked LLM calls
3. Manual test: start a run with multiple providers, observe UI

## Rollback Plan

If issues arise:
1. Remove Bottleneck usage, revert to sequential processing
2. Keep UI changes (they gracefully degrade without metrics)

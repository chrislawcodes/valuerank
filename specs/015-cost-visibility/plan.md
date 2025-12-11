# Implementation Plan: Cost Visibility

**Branch**: `feat/cost-visibility` | **Date**: 2024-12-10 | **Spec**: [spec.md](./spec.md)

## Summary

Implement comprehensive cost visibility by adding historical token statistics tracking per model, using these statistics to predict run costs before execution, and displaying actual costs in run results. This addresses Issue #31.

---

## Technical Context

**Language/Version**: TypeScript 5.3+ (Node.js API), Python 3.11+ (workers), React (web)
**Primary Dependencies**: Prisma (ORM), PgBoss (job queue), Pothos (GraphQL)
**Storage**: PostgreSQL with new `ModelTokenStatistics` table
**Testing**: Vitest (TypeScript), pytest (Python)
**Target Platform**: Railway (Docker containers)
**Performance Goals**: Cost predictions < 1 second, statistics computed < 60 seconds
**Constraints**: Maintain backward compatibility with existing run/transcript data

---

## Constitution Check

**Status**: PASS

### File Size Limits (§ File Size Limits)
- All new services will be < 400 lines
- Cost estimation logic extracted to dedicated module

### TypeScript Standards (§ TypeScript Standards)
- No `any` types - proper typing for all cost data
- Decimal handling for precision cost calculations

### Testing Requirements (§ Testing Requirements)
- Unit tests for cost calculation logic
- Integration tests for statistics aggregation
- Target 80% coverage for new code

### Logging Standards (§ Logging Standards)
- Use `createLogger` for all new services
- Structured logging for cost operations

---

## Architecture Decisions

### Decision 1: Token Statistics Storage

**Chosen**: Dedicated `ModelTokenStatistics` table with computed averages

**Rationale**:
- Efficient queries for cost prediction (single row per model)
- Avoids scanning all probe results on each prediction
- Allows different aggregation strategies (EMA, rolling window)

**Alternatives Considered**:
- Query ProbeResult table on-demand: Too slow for real-time prediction
- Cache in Redis: Adds infrastructure dependency, persistence concerns
- Store in LlmModel table: Violates SRP, complicates model management

**Tradeoffs**:
- Pros: Fast lookups, clear data model, supports per-definition stats (P3)
- Cons: Eventual consistency (stats update after run, not real-time)

---

### Decision 2: Statistics Computation Trigger

**Chosen**: PgBoss job triggered when run status changes to COMPLETED

**Rationale**:
- Existing pattern for post-run processing (analyze_basic job)
- Non-blocking - doesn't slow down probe completion
- Retryable if computation fails

**Alternatives Considered**:
- Inline during run completion: Adds latency to completion flow
- Scheduled cron job: Delayed updates, more complex scheduling
- Event-driven (LISTEN/NOTIFY): More infrastructure complexity

**Tradeoffs**:
- Pros: Fits existing architecture, reliable, async
- Cons: Small delay before stats update (~seconds)

---

### Decision 3: Fallback Strategy for New Models

**Chosen**: Three-tier fallback (model stats → all-model average → system default)

**Rationale**:
- Progressive improvement as data accumulates
- Reasonable estimates even with empty database
- User specified: 100 input / 900 output as system default

**Alternatives Considered**:
- Provider-level defaults: Not enough granularity
- Fixed defaults only: No improvement over time
- Refuse to estimate: Poor UX for new users

**Tradeoffs**:
- Pros: Always provides estimate, improves with usage
- Cons: Early estimates may be less accurate

---

### Decision 4: Cost Display Precision

**Chosen**: Dynamic precision based on cost magnitude

**Rationale**:
- Matches existing `formatCost()` in RunResults.tsx
- Sub-cent amounts need 4 decimals for visibility
- Larger amounts can use 2 decimals for readability

**Implementation**:
```typescript
function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}
```

---

## Project Structure

### Multi-Service Architecture

```
cloud/
├── packages/db/
│   └── prisma/
│       └── schema.prisma              # + ModelTokenStatistics model
│
├── apps/api/src/
│   ├── services/
│   │   ├── cost/                      # NEW: Cost estimation service
│   │   │   ├── index.ts               # Re-exports
│   │   │   ├── estimate.ts            # Cost prediction logic
│   │   │   ├── statistics.ts          # Token statistics queries
│   │   │   └── types.ts               # Cost-related types
│   │   └── run/
│   │       └── start.ts               # Modify: Add cost estimate to response
│   │
│   ├── jobs/
│   │   └── compute-token-stats.ts     # NEW: Post-run statistics job
│   │
│   ├── graphql/types/
│   │   ├── cost-estimate.ts           # NEW: CostEstimate GraphQL type
│   │   └── run.ts                     # Modify: Add estimatedCosts field
│   │
│   └── mcp/tools/
│       └── start-run.ts               # Modify: Detailed cost breakdown
│
├── apps/web/src/
│   └── components/
│       └── runs/
│           ├── RunResults.tsx         # Modify: Enhanced cost display
│           └── CostBreakdown.tsx      # NEW: Per-model cost breakdown component
│
└── workers/
    └── jobs/
        └── compute_token_stats.py     # NEW: Python worker for statistics
```

---

## Data Flow

### Cost Prediction (Before Run)

```
User selects models →
  API: estimateCost(definitionId, models, samplePct) →
    Query ModelTokenStatistics for each model →
    Apply fallback if missing (all-model avg → system default) →
    Calculate: scenarios × avgTokens × costPerMillion / 1M →
  Return per-model breakdown + total
```

### Statistics Update (After Run)

```
Run completes →
  API: runProgressChanged(runId, COMPLETED) →
    Queue compute_token_stats job →
  Worker: compute_token_stats(runId) →
    Query ProbeResult for input/output tokens →
    Group by model, calculate averages →
    Upsert ModelTokenStatistics rows
```

### Actual Cost (Run Results)

```
User views run results →
  GraphQL: run.analysis.actualCost →
    Sum transcript.costSnapshot.estimatedCost →
    Group by model →
  Display in RunResults component
```

---

## Files Changed

### New Files
| File | Purpose | Lines (est) |
|------|---------|-------------|
| `packages/db/prisma/schema.prisma` | Add ModelTokenStatistics model | +20 |
| `apps/api/src/services/cost/index.ts` | Cost service exports | ~10 |
| `apps/api/src/services/cost/estimate.ts` | Cost prediction logic | ~150 |
| `apps/api/src/services/cost/statistics.ts` | Token stats queries | ~100 |
| `apps/api/src/services/cost/types.ts` | TypeScript types | ~40 |
| `apps/api/src/jobs/compute-token-stats.ts` | Job handler | ~80 |
| `apps/api/src/graphql/types/cost-estimate.ts` | GraphQL types | ~60 |
| `workers/jobs/compute_token_stats.py` | Python worker | ~100 |
| `apps/web/src/components/runs/CostBreakdown.tsx` | Cost UI component | ~80 |

### Modified Files
| File | Changes |
|------|---------|
| `apps/api/src/services/run/start.ts` | Return estimated costs in result |
| `apps/api/src/mcp/tools/start-run.ts` | Detailed per-model cost breakdown |
| `apps/api/src/graphql/types/run.ts` | Add estimatedCosts field |
| `apps/api/src/graphql/types/analysis.ts` | Add actualCost field |
| `apps/web/src/components/runs/RunResults.tsx` | Display actual costs |

---

## API Changes

### GraphQL Schema Additions

```graphql
# New types
type CostEstimate {
  total: Float!
  perModel: [ModelCostEstimate!]!
  basedOnSampleCount: Int!
  isUsingFallback: Boolean!
}

type ModelCostEstimate {
  modelId: String!
  displayName: String!
  inputTokens: Float!
  outputTokens: Float!
  inputCost: Float!
  outputCost: Float!
  totalCost: Float!
  sampleCount: Int!
}

# New query
extend type Query {
  estimateCost(
    definitionId: ID!
    models: [String!]!
    samplePercentage: Int = 100
  ): CostEstimate!
}

# Modified Run type
extend type Run {
  estimatedCosts: CostEstimate
}

# Modified AnalysisResult
extend type AnalysisResult {
  actualCost: JSON  # { total: Float, perModel: { [modelId]: Float } }
}
```

### MCP Tool Changes

`start_run` response enhanced:
```json
{
  "success": true,
  "run_id": "...",
  "estimated_cost": {
    "total": 4.52,
    "per_model": {
      "openai:gpt-4": {
        "input_tokens": 500,
        "output_tokens": 1200,
        "cost": 2.10,
        "sample_count": 150
      },
      "anthropic:claude-3-opus": {
        "input_tokens": 480,
        "output_tokens": 1100,
        "cost": 2.42,
        "sample_count": 200
      }
    },
    "using_fallback": false
  }
}
```

---

## Testing Strategy

### Unit Tests
- `cost/estimate.test.ts`: Cost calculation with various scenarios
- `cost/statistics.test.ts`: Fallback logic, average calculations
- `compute-token-stats.test.ts`: Job handler edge cases

### Integration Tests
- Start run → verify cost estimate in response
- Complete run → verify statistics updated
- Query run results → verify actual cost displayed

### Python Worker Tests
- `test_compute_token_stats.py`: Statistics aggregation logic

---

## Migration Plan

1. **Phase 1: Schema** - Add ModelTokenStatistics table
2. **Phase 2: Backend** - Cost service, statistics job
3. **Phase 3: API** - GraphQL types, MCP tool updates
4. **Phase 4: Frontend** - Cost display components
5. **Phase 5: Backfill** - Optional: compute stats from existing runs

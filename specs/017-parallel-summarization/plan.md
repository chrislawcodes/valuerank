# Implementation Plan: Parallel Summarization

**Branch**: `feat/017-parallel-summarization` | **Date**: 2025-12-13 | **Spec**: [spec.md](./spec.md)

## Summary

Add configurable parallel summarization with its own parallelism pool separate from probing, including cancel/restart capabilities. This uses the existing `SystemSetting` table for configuration, follows the provider parallelism pattern in `services/parallelism/`, and adds new GraphQL mutations + MCP tools for control operations.

---

## Technical Context

**Language/Version**: TypeScript 5.3+ (Node.js), Python 3 (workers)
**Primary Dependencies**: PgBoss (queue), Prisma (DB), urql (frontend GraphQL), Zod (validation)
**Storage**: PostgreSQL (existing `system_settings` table for config)
**Testing**: Vitest (API/web), pytest (workers)
**Target Platform**: Railway (Docker containers)
**Performance Goals**: Setting changes apply within 60 seconds, job queueing < 100ms
**Constraints**: Separate pool from probing, default to 8 parallel, support 1-100 range

---

## Constitution Check

**Status**: PASS

Per `cloud/CLAUDE.md`:

- [x] File size limits: All new files < 400 lines
- [x] No `any` types: Use proper typing for job data and settings
- [x] Test coverage: Add tests for new services, mutations, and MCP tools
- [x] Logging: Use `createLogger` for all new services
- [x] Error handling: Use `AppError` subclasses
- [x] Database access: Use Prisma with typed queries
- [x] Migrations: Use `prisma migrate dev` for any schema changes (none needed)

---

## Architecture Decisions

### Decision 1: Single Queue with Dynamic batchSize

**Chosen**: Use existing `summarize_transcript` queue with configurable `batchSize` controlled by `SystemSetting`

**Rationale**:
- Summarization uses a single configured model (unlike probing which targets multiple providers)
- PgBoss `batchSize` controls concurrency effectively (same pattern as provider queues)
- No schema changes required - reuse existing job type
- Simpler than per-provider summarization queues

**Alternatives Considered**:
- Per-provider summarization queues: Over-engineering since summarization uses one model
- New queue name: Unnecessary complexity, same handler can work with dynamic batchSize

**Tradeoffs**:
- Pros: Simple, reuses existing patterns, no migration needed
- Cons: Re-registration required when setting changes (acceptable per existing pattern)

---

### Decision 2: Setting Storage in SystemSetting

**Chosen**: Store `infra_max_parallel_summarizations` in `SystemSetting` table with JSON value `{ "value": 8 }`

**Rationale**:
- Matches existing infrastructure settings pattern (`infra_model_summarizer`, etc.)
- Already exposed via `list_system_settings` MCP tool
- No schema changes needed
- Cached with TTL for performance (60s cache like provider limits)

**Alternatives Considered**:
- LlmProvider table column: Doesn't fit - summarization is system-wide, not per-provider
- Environment variable: Not dynamically configurable without restart

---

### Decision 3: Cancel/Restart as Service Functions + GraphQL Mutations + MCP Tools

**Chosen**: Follow existing `run/control.ts` pattern with parallel exposure via GraphQL and MCP

**Rationale**:
- Consistent with existing pause/resume/cancel operations
- All three interfaces (GraphQL, MCP, UI) share same service functions
- Audit logging already in place for run operations
- Clear separation of concerns

**Implementation**:
- `services/run/summarization.ts` - New service file for cancel/restart logic
- `graphql/mutations/run.ts` - Add `cancelSummarization` and `restartSummarization` mutations
- `mcp/tools/cancel-summarization.ts` and `mcp/tools/restart-summarization.ts` - MCP tools

---

### Decision 4: UI Buttons in RunDetail Page

**Chosen**: Add summarization control buttons in existing `RunControls` component area

**Rationale**:
- Consistent with existing pause/resume/cancel buttons
- Reuse existing `useRunMutations` hook pattern
- Toast notifications for feedback (existing pattern)
- Button visibility based on run state and summarization progress

**UI States**:
| Run State | Has Unsummarized | Has Pending Jobs | Button |
|-----------|-----------------|------------------|--------|
| SUMMARIZING | - | Yes | "Cancel Summarization" |
| SUMMARIZING | - | No (all active) | Disabled "Summarizing..." |
| COMPLETED | Yes | No | "Restart Summarization" |
| COMPLETED | No | No | "Re-summarize All" |
| FAILED | Yes | No | "Restart Summarization" |
| Other | - | - | Hidden |

---

### Decision 5: Hot Reload via Handler Re-registration

**Chosen**: Follow `reregisterProviderHandler` pattern for dynamic batchSize updates

**Rationale**:
- Existing pattern in `queue/handlers/index.ts` proves this works
- PgBoss `offWork()` is graceful - in-flight jobs complete
- New handler immediately starts with updated batchSize
- 60-second cache TTL ensures changes propagate

**Implementation**:
- Add `reregisterSummarizeHandler()` function
- Call from setting update endpoint
- Clear setting cache before re-registration

---

## Project Structure

### Files to Create

```
cloud/apps/api/src/
├── services/
│   ├── run/
│   │   └── summarization.ts        # Cancel/restart summarization logic (~150 lines)
│   └── summarization-parallelism/
│       └── index.ts                # Setting cache + getter (~100 lines)
├── mcp/
│   └── tools/
│       ├── cancel-summarization.ts     # MCP tool (~120 lines)
│       ├── restart-summarization.ts    # MCP tool (~130 lines)
│       └── set-summarization-parallelism.ts  # MCP tool (~100 lines)

cloud/apps/web/src/
├── api/
│   └── operations/
│       └── summarization.ts        # GraphQL operations (~50 lines)
├── hooks/
│   └── useSummarizationMutations.ts  # Hook for mutations (~80 lines)
├── components/
│   └── runs/
│       └── SummarizationControls.tsx  # UI buttons (~150 lines)
```

### Files to Modify

```
cloud/apps/api/src/
├── queue/
│   └── handlers/
│       └── index.ts                # Add re-registration function
├── graphql/
│   └── mutations/
│       └── run.ts                  # Add cancelSummarization, restartSummarization
├── services/
│   └── run/
│       └── progress.ts             # Update queueSummarizeJobs to use dynamic batchSize

cloud/apps/web/src/
├── pages/
│   └── RunDetail.tsx               # Add SummarizationControls component
├── hooks/
│   └── useRunMutations.ts          # Add summarization mutations (or use new hook)
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Backend)

**Goal**: Implement configurable parallelism setting with cache and dynamic handler re-registration

1. Create `services/summarization-parallelism/index.ts`:
   - `getMaxParallelSummarizations()` - Returns cached value or default 8
   - `setMaxParallelSummarizations(value)` - Updates DB and clears cache
   - Cache with 60s TTL matching provider parallelism pattern

2. Update `queue/handlers/index.ts`:
   - Modify summarize handler registration to use dynamic batchSize
   - Add `reregisterSummarizeHandler()` for hot reload

3. Update `services/run/progress.ts`:
   - Modify `queueSummarizeJobs()` to use `getMaxParallelSummarizations()`

### Phase 2: Cancel/Restart Services (Backend)

**Goal**: Implement cancel and restart summarization operations

1. Create `services/run/summarization.ts`:
   - `cancelSummarization(runId)` - Cancel pending summarize jobs
   - `restartSummarization(runId, force?)` - Restart failed/missing summaries
   - Use existing PgBoss job cancellation pattern from `control.ts`

2. Add GraphQL mutations in `graphql/mutations/run.ts`:
   - `cancelSummarization(runId)` - Returns cancelled count
   - `restartSummarization(runId, force)` - Returns queued count

### Phase 3: MCP Tools (Backend)

**Goal**: Expose all operations via MCP for AI agent workflows

1. Create MCP tools:
   - `set_summarization_parallelism` - Update max parallel setting
   - `cancel_summarization` - Cancel pending jobs for a run
   - `restart_summarization` - Restart summarization for a run

2. Update `list_system_settings` to include `infra_max_parallel_summarizations`

### Phase 4: Frontend UI (Web)

**Goal**: Add cancel/restart buttons to RunDetail page

1. Create `api/operations/summarization.ts`:
   - GraphQL mutations for cancel/restart

2. Create `hooks/useSummarizationMutations.ts`:
   - React hook wrapping the mutations

3. Create `components/runs/SummarizationControls.tsx`:
   - Cancel button with confirmation dialog
   - Restart button (default mode)
   - Re-summarize All button (force mode)
   - Loading states and toast notifications

4. Update `pages/RunDetail.tsx`:
   - Add SummarizationControls to the controls area
   - Pass run state and summarizeProgress

### Phase 5: Tests

**Goal**: Comprehensive test coverage for all new functionality

1. API tests (vitest):
   - `tests/services/summarization-parallelism.test.ts`
   - `tests/services/run/summarization.test.ts`
   - `tests/graphql/mutations/summarization.test.ts`
   - `tests/mcp/tools/summarization.test.ts`

2. Web tests (vitest):
   - `tests/components/runs/SummarizationControls.test.tsx`
   - `tests/hooks/useSummarizationMutations.test.ts`

---

## API Contracts

### GraphQL Mutations

```graphql
type Mutation {
  """
  Cancel pending summarization jobs for a run.
  In-flight jobs complete gracefully.
  Returns count of cancelled jobs.
  """
  cancelSummarization(runId: ID!): CancelSummarizationPayload!

  """
  Restart summarization for failed/missing transcripts.
  With force=true, re-summarizes all transcripts.
  Run must be in COMPLETED, FAILED, or CANCELLED state.
  """
  restartSummarization(runId: ID!, force: Boolean): RestartSummarizationPayload!
}

type CancelSummarizationPayload {
  run: Run!
  cancelledCount: Int!
}

type RestartSummarizationPayload {
  run: Run!
  queuedCount: Int!
}
```

### MCP Tools

```yaml
tools:
  - name: set_summarization_parallelism
    description: Configure max parallel summarization jobs (1-100)
    parameters:
      max_parallel:
        type: integer
        required: true
        minimum: 1
        maximum: 100

  - name: cancel_summarization
    description: Cancel pending summarization jobs for a run
    parameters:
      run_id:
        type: string
        required: true

  - name: restart_summarization
    description: Restart summarization for failed/missing transcripts
    parameters:
      run_id:
        type: string
        required: true
      force:
        type: boolean
        default: false
        description: Re-summarize all transcripts regardless of existing summaries
```

---

## Data Flow

### Setting Change Flow

```
User/MCP → set_summarization_parallelism
    ↓
SystemSetting.upsert(key: 'infra_max_parallel_summarizations')
    ↓
clearSummarizationCache()
    ↓
reregisterSummarizeHandler() → boss.offWork() → boss.work(newBatchSize)
    ↓
New jobs processed with updated parallelism
```

### Cancel Summarization Flow

```
User/MCP → cancelSummarization(runId)
    ↓
Validate run exists and has summarization jobs
    ↓
UPDATE pgboss.job SET state='cancelled' WHERE name='summarize_transcript' AND runId=...
    ↓
Update run.summarizeProgress (reduce total by cancelled count)
    ↓
Return { cancelledCount, run }
```

### Restart Summarization Flow

```
User/MCP → restartSummarization(runId, force?)
    ↓
Validate run is in terminal state (COMPLETED/FAILED/CANCELLED)
    ↓
Cancel any existing pending summarize jobs (avoid duplicates)
    ↓
Query transcripts:
  - If force: all transcripts
  - Else: WHERE summarizedAt IS NULL OR decisionCode = 'error'
    ↓
Queue new summarize_transcript jobs
    ↓
Update run.summarizeProgress { total, completed: 0, failed: 0 }
    ↓
Update run.status = 'SUMMARIZING'
    ↓
Return { queuedCount, run }
```

---

## Testing Strategy

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `summarization-parallelism.test.ts` | Setting CRUD, cache behavior, validation |
| `run/summarization.test.ts` | Cancel/restart logic, edge cases |

### Integration Tests

| Test File | Coverage |
|-----------|----------|
| `mutations/summarization.test.ts` | GraphQL mutations with mocked PgBoss |
| `mcp/summarization.test.ts` | MCP tool invocation and responses |

### UI Tests

| Test File | Coverage |
|-----------|----------|
| `SummarizationControls.test.tsx` | Button rendering, state logic, click handlers |

### Manual Testing (quickstart.md)

See [quickstart.md](./quickstart.md) for end-to-end testing scenarios.

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Setting = 0 | Validation rejects (minimum 1) |
| Setting > 100 | Validation rejects (maximum 100) |
| DB unavailable when fetching setting | Use default 8, log warning |
| Cancel on completed run | No-op, return 0 cancelled |
| Restart on running run | Reject with error |
| Restart with 0 missing transcripts | Return 0 queued, success |
| Rapid cancel/restart calls | Idempotent, safe to call multiple times |
| Force restart with active jobs | Cancel existing first, then queue all |

---

## Rollout Plan

1. **Deploy backend changes first** (Phases 1-3)
   - Setting defaults to 8, no behavioral change
   - MCP tools available for early adopters

2. **Deploy frontend changes** (Phase 4)
   - Buttons appear based on run state
   - Toast notifications for feedback

3. **Documentation update**
   - Update MCP tool docs
   - Add to operations runbook

---

## Success Metrics

- [x] Setting configurable 1-100 with default 8
- [x] Cancel operation removes pending jobs, preserves completed
- [x] Restart operation queues jobs for failed/missing only (or all with force)
- [x] UI buttons visible and functional in RunDetail
- [x] MCP tools accessible to AI agents
- [x] Hot reload within 60 seconds
- [x] Test coverage > 80%

# Implementation Plan: LLM Provider Metadata

**Branch**: `feat/013-provider-metadata` | **Date**: 2024-12-08 | **Spec**: [spec.md](./spec.md)

## Summary

Database-driven LLM model configuration with admin UI, replacing the current hardcoded model list. Adds provider/model tables to Prisma schema, extends GraphQL API with CRUD mutations, and creates a Settings > Models panel for management.

---

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js API), Python 3.11+ (workers)
**Primary Dependencies**: Prisma (ORM), Pothos (GraphQL), urql (React client), PgBoss (job queue)
**Storage**: PostgreSQL via Prisma
**Testing**: Vitest (TypeScript), pytest (Python)
**Target Platform**: Docker containers (Railway deployment)
**Performance Goals**: Model metadata queries <50ms (NFR-001)
**Constraints**: Files <400 lines per constitution, 80% test coverage minimum

---

## Constitution Check

**Status**: PASS

### File Size Limits
- [ ] All new files under 400 lines
- [ ] Split large components into submodules if needed

### TypeScript Standards
- [ ] No `any` types - use proper typing
- [ ] Strict mode compliance
- [ ] Type all function signatures

### Testing Requirements
- [ ] 80% minimum coverage for new code
- [ ] Test business logic, data transformations, edge cases
- [ ] Mock database and external APIs

### Logging Standards
- [ ] Use structured logging via `createLogger()`
- [ ] No `console.log` statements
- [ ] Include context in log messages

### Database Access
- [ ] Use Prisma with type safety
- [ ] Transactions for multi-step operations
- [ ] Follow existing patterns in `packages/db/`

---

## Architecture Decisions

### Decision 1: Database Schema Design

**Chosen**: Separate `llm_providers` and `llm_models` tables with FK relationship

**Rationale**:
- Providers have rate limits/parallelism; models have costs/status
- Allows multiple models per provider with individual pricing
- Matches existing Prisma patterns in schema.prisma

**Alternatives Considered**:
- Single denormalized `llm_models` table: Rejected - duplicates provider settings
- JSONB column in settings table: Rejected - loses type safety, harder to query

**Tradeoffs**:
- Pros: Clean normalization, type-safe queries, easy to add provider-level settings
- Cons: Extra join for model queries (mitigated by dataloader)

---

### Decision 2: Model Status Lifecycle

**Chosen**: `status` enum with values `ACTIVE` and `DEPRECATED`

**Rationale**:
- Simple two-state lifecycle is sufficient for v1
- Deprecated models remain for historical reference
- Easy to filter in queries

**Alternatives Considered**:
- Soft delete with `deletedAt`: Rejected - need to distinguish "hidden from UI" from "deleted"
- Multiple states (draft, active, deprecated, archived): Rejected - over-engineering for v1

---

### Decision 3: System Settings Storage

**Chosen**: Key-value `system_settings` table with JSONB value

**Rationale**:
- Flexible for future settings without schema changes
- Simple to query by key
- Matches pattern used in other projects

**Alternatives Considered**:
- Environment variables: Rejected - need runtime configuration
- Dedicated columns in a settings row: Rejected - requires migration for each new setting

---

### Decision 4: Parallelism Enforcement

**Chosen**: Enforce at API job scheduler level (Node.js), not Python workers

**Rationale**:
- PgBoss already handles job queuing and concurrency
- API has direct database access for provider limits
- Workers remain stateless and simple

**Alternatives Considered**:
- Enforce in Python workers: Rejected - requires inter-process coordination
- Redis-based semaphore: Rejected - adds infrastructure complexity

**Implementation**:
- Use PgBoss queue options per provider
- Track active jobs via PgBoss state queries
- Workers are unaware of parallelism limits

---

### Decision 5: Historical Cost Accuracy

**Chosen**: Snapshot costs in transcript metadata at run time

**Rationale**:
- Simple implementation - no temporal queries
- Transcript already stores metadata JSON
- Clear audit trail of what costs were used

**Alternatives Considered**:
- Store cost per transcript record: Rejected - schema change for existing table
- Look up costs by timestamp: Rejected - complex queries, audit table overhead

**Implementation**:
- Add `costSnapshot` to transcript content JSON: `{ costInputPerMillion, costOutputPerMillion }`
- Display uses snapshot, not current model costs

---

### Decision 6: GraphQL API Pattern

**Chosen**: Follow existing Pothos builder patterns in `apps/api/src/graphql/`

**Rationale**:
- Consistency with existing codebase
- Leverage existing authentication/authorization middleware
- Type-safe schema generation

**Files to add**:
- `types/llm-provider.ts` - Provider type definition
- `types/llm-model.ts` - Model type definition
- `types/system-setting.ts` - System setting type
- `queries/llm.ts` - Provider/model queries
- `mutations/llm.ts` - CRUD mutations
- `dataloaders/llm.ts` - Dataloader for efficient fetching

---

## Project Structure

### Database Package (`packages/db/`)

```
packages/db/
├── prisma/
│   ├── schema.prisma          # Add LlmProvider, LlmModel, SystemSetting models
│   └── migrations/            # New migration for provider tables
├── src/
│   └── queries/
│       └── llm.ts             # NEW: Provider/model query helpers
```

### API App (`apps/api/`)

```
apps/api/src/
├── graphql/
│   ├── types/
│   │   ├── llm-provider.ts    # NEW: Provider GraphQL type
│   │   ├── llm-model.ts       # NEW: Model GraphQL type
│   │   └── system-setting.ts  # NEW: Setting GraphQL type
│   ├── queries/
│   │   └── llm.ts             # NEW: Provider/model queries
│   ├── mutations/
│   │   └── llm.ts             # NEW: CRUD mutations
│   └── dataloaders/
│       └── llm.ts             # NEW: Provider/model dataloaders
├── config/
│   └── models.ts              # UPDATE: Read from DB instead of hardcoded
└── jobs/
    └── probe.ts               # UPDATE: Add parallelism enforcement
```

### Web App (`apps/web/`)

```
apps/web/src/
├── pages/
│   └── Settings.tsx           # UPDATE: Add tabs navigation
├── components/
│   └── settings/
│       ├── ModelsPanel.tsx    # NEW: Model management UI
│       ├── ModelForm.tsx      # NEW: Add/edit model form
│       ├── ProviderCard.tsx   # NEW: Provider display with models
│       └── InfraPanel.tsx     # NEW: Infrastructure settings
└── api/
    └── operations/
        └── llm.ts             # NEW: GraphQL operations for models
```

### Python Workers (`workers/`)

```
workers/
├── common/
│   ├── llm_adapters.py        # UPDATE: Add rate limit retry logic
│   ├── models.py              # NEW: Model metadata fetching
│   └── errors.py              # UPDATE: Add RATE_LIMITED error code
└── probe.py                   # UPDATE: Add estimatedCost to output
```

---

## Implementation Phases

### Phase 1: Database Schema & Seed (P1)
1. Add Prisma models: `LlmProvider`, `LlmModel`, `SystemSetting`
2. Create migration
3. Update seed script with initial providers/models
4. Add query helpers in `packages/db/src/queries/llm.ts`

### Phase 2: GraphQL API (P1)
1. Add GraphQL types for provider, model, settings
2. Add queries: `llmProviders`, `llmModels`, `systemSettings`
3. Add mutations: `createLlmModel`, `updateLlmModel`, `deprecateLlmModel`, `setDefaultModel`, `updateSystemSetting`
4. Update `availableModels` query to read from database

### Phase 3: Admin UI - Models Panel (P1)
1. Add tabs to Settings page
2. Create ModelsPanel with provider-grouped table
3. Create ModelForm for add/edit dialogs
4. Implement deprecate confirmation flow
5. Add set-default action

### Phase 4: Admin UI - Infrastructure Panel (P1)
1. Create InfraPanel component
2. Add model selector for scenario expansion
3. Wire up to system settings mutations

### Phase 5: Default Models & Run Creation (P1)
1. Update run creation to use default models
2. Validate selected models are active
3. Show warnings for deprecated models

### Phase 6: Rate Limit Retry Logic (P2)
1. Add rate limit detection to `_post_json()`
2. Implement exponential backoff (30s, 60s, 90s, 120s)
3. Add `RATE_LIMITED` error code
4. Update error classification

### Phase 7: Cost Tracking (P2)
1. Add model metadata fetching to probe worker
2. Calculate and include `estimatedCost` in output
3. Store cost snapshot in transcript
4. Display cost breakdown in run details

### Phase 8: Parallelism Enforcement (P2)
1. Load provider limits from database
2. Track active jobs per provider
3. Enforce limits in job scheduler

---

## Testing Strategy

### Unit Tests
- Prisma model CRUD operations
- GraphQL resolvers (mock database)
- Cost calculation helper
- Rate limit detection logic

### Integration Tests
- API endpoints with test database
- Model lifecycle (create → edit → deprecate)
- Run creation with model validation

### E2E Tests (Manual)
- Full Settings > Models workflow
- Run creation with default models
- Cost display in run details

---

## Migration Path

1. **Deploy Phase 1-2**: Database + API changes (backward compatible)
2. **Run seed**: Populate providers/models from current hardcoded list
3. **Deploy Phase 3-5**: UI changes
4. **Verify**: Admin can manage models, runs use database
5. **Deploy Phase 6-8**: Worker improvements
6. **Remove**: Delete hardcoded model config after verification

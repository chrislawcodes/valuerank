# Implementation Plan: MCP API Enhancements

**Branch**: `feat/014-mcp-api-enhancements` | **Date**: 2025-12-09 | **Spec**: [spec.md](./spec.md)

## Summary

Extend the MCP API to achieve full CRUD parity with the web UI by adding delete tools for definitions/runs, LLM metadata read tools, and LLM management write tools. Implementation follows existing MCP tool patterns with schema migration for soft delete support on transcripts and analysis_results.

---

## Technical Context

**Language/Version**: TypeScript 5.3+ (strict mode)
**Primary Dependencies**:
- `@modelcontextprotocol/sdk` - MCP server framework (existing)
- `@valuerank/db` - Prisma database client (existing)
- `@valuerank/shared` - Logger, error classes (existing)
- `zod` - Input validation (existing)

**Storage**: PostgreSQL via Prisma ORM
**Testing**: Vitest with test database
**Target Platform**: Node.js API (Railway deployment)
**Performance Goals**: Response latency < 2 seconds for all tools (per spec SC-015)
**Constraints**:
- Files < 400 lines (per constitution)
- 80% test coverage minimum (per constitution)
- No `any` types (per constitution)
- Token budget limits for MCP responses (per existing patterns)

---

## Constitution Check

**Status**: PASS

### File Size Limits (Constitution § File Size Limits)
- Each MCP tool in its own file (< 400 lines)
- Service layer already split by concern
- New DB queries added to existing `packages/db/src/queries/` modules

### TypeScript Standards (Constitution § TypeScript Standards)
- All inputs typed with Zod schemas
- All outputs typed with explicit interfaces
- No `any` types - use `unknown` where truly unknown

### Testing Requirements (Constitution § Testing Requirements)
- 80% coverage on new MCP tools
- Test files mirror source structure in `tests/mcp/tools/`
- Mock database and PgBoss for unit tests

### Soft Delete Pattern (Constitution § Soft Delete Pattern)
- Plan adds `deletedAt` to transcripts and analysis_results
- All queries will filter `deletedAt: null`
- Cascading soft-delete in transactions

### Logging Standards (Constitution § Logging Standards)
- Use `createLogger` from `@valuerank/shared`
- Structured logging with context
- Audit logging via existing `mcp/audit.ts`

**VALIDATION RESULT: PASS** - All constitutional requirements addressed.

---

## Architecture Decisions

### Decision 1: Schema Migration for Soft Delete

**Chosen**: Add `deletedAt` columns to `transcripts` and `analysis_results` tables via Prisma migration

**Rationale**:
- Constitution requires soft delete pattern for all deletable entities
- Maintains data recovery capability
- Consistent with existing `definitions`, `runs`, `scenarios` patterns
- Simplest approach for cascading delete

**Alternatives Considered**:
- Hard delete with archive table: More complex, no existing pattern
- Soft delete only on runs (leave transcripts): Inconsistent, harder to query

**Tradeoffs**:
- Pros: Consistent patterns, recoverable, simple queries
- Cons: Storage growth over time (mitigated by future pruning feature)

---

### Decision 2: Reuse GraphQL Service Layer

**Chosen**: MCP tools delegate to existing `packages/db/src/queries/llm.ts` functions

**Rationale**:
- DRY principle - business logic in one place
- Existing functions already handle transactions, validation
- GraphQL mutations already tested and working
- MCP layer only handles input/output formatting

**Alternatives Considered**:
- Duplicate logic in MCP tools: Maintenance burden, divergence risk
- Create shared service layer: Over-engineering for current needs

**Tradeoffs**:
- Pros: Less code, consistent behavior, existing tests
- Cons: Tight coupling to DB layer (acceptable for internal tool)

---

### Decision 3: Tool Organization

**Chosen**: One file per MCP tool, following existing patterns

**Rationale**:
- Existing pattern in `apps/api/src/mcp/tools/`
- Each tool self-registers via `addToolRegistrar`
- Easy to find, test, and maintain
- Keeps files under 400 lines

**Alternatives Considered**:
- Group related tools (all LLM tools in one file): Would exceed 400 lines
- Separate services for MCP formatting: Over-engineering

**Tradeoffs**:
- Pros: Clear organization, easy testing, constitutional compliance
- Cons: Many small files (13 new files)

---

### Decision 4: Audit Logging Extension

**Chosen**: Extend existing `AuditAction` type with new action types

**Rationale**:
- Existing audit infrastructure works well
- Just need to add new action types
- Consistent log format for querying

**New Actions**:
- `delete_definition`
- `delete_run`
- `create_llm_model`
- `update_llm_model`
- `deprecate_llm_model`
- `reactivate_llm_model`
- `set_default_llm_model`
- `update_llm_provider`
- `set_infra_model`

---

### Decision 5: Delete Definition Safety Check

**Chosen**: Block deletion if any run with status='RUNNING' references the definition

**Rationale**:
- Prevents orphaned running jobs
- Clear error message to user
- Can retry after run completes or is cancelled

**Implementation**:
```typescript
const runningRuns = await db.run.count({
  where: {
    definitionId,
    status: 'RUNNING',
    deletedAt: null
  }
});
if (runningRuns > 0) {
  throw new ValidationError('Cannot delete definition with running runs');
}
```

---

### Decision 6: Delete Run Job Cancellation

**Chosen**: Cancel PgBoss jobs before soft-deleting run

**Rationale**:
- Prevents wasted compute on deleted runs
- Clean state for job queue
- User expects immediate effect

**Implementation**:
```typescript
// Cancel pending/running jobs for this run
await boss.cancel(`probe_scenario:${runId}`);
await boss.cancel(`summarize:${runId}`);
// Then soft-delete
```

---

## Project Structure

### Existing Structure (relevant parts)

```
cloud/
├── apps/api/src/
│   ├── mcp/
│   │   ├── tools/
│   │   │   ├── index.ts              # Tool registry
│   │   │   ├── registry.ts           # Registration helpers
│   │   │   ├── create-definition.ts  # Existing pattern
│   │   │   └── ...
│   │   └── server.ts
│   └── services/
│       └── mcp/
│           ├── audit.ts              # Audit logging
│           └── validation.ts         # Content validation
├── packages/db/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── src/
│       └── queries/
│           └── llm.ts                # LLM query helpers
└── apps/api/tests/
    └── mcp/
        └── tools/
            └── *.test.ts
```

### New Files

```
cloud/
├── apps/api/src/mcp/tools/
│   ├── delete-definition.ts          # NEW - Delete definition tool
│   ├── delete-run.ts                 # NEW - Delete run tool
│   ├── list-llm-providers.ts         # NEW - List providers tool
│   ├── list-llm-models.ts            # NEW - List models tool
│   ├── get-llm-model.ts              # NEW - Get single model tool
│   ├── list-system-settings.ts       # NEW - List settings tool
│   ├── create-llm-model.ts           # NEW - Create model tool
│   ├── update-llm-model.ts           # NEW - Update model tool
│   ├── deprecate-llm-model.ts        # NEW - Deprecate model tool
│   ├── reactivate-llm-model.ts       # NEW - Reactivate model tool
│   ├── set-default-llm-model.ts      # NEW - Set default tool
│   ├── update-llm-provider.ts        # NEW - Update provider tool
│   └── set-infra-model.ts            # NEW - Set infra model tool
├── packages/db/prisma/migrations/
│   └── YYYYMMDD_add_soft_delete_transcript_analysis/
│       └── migration.sql             # NEW - Schema migration
├── packages/db/src/queries/
│   ├── definition.ts                 # MODIFY - Add soft delete helpers
│   └── run.ts                        # MODIFY - Add soft delete helpers
└── apps/api/tests/mcp/tools/
    ├── delete-definition.test.ts     # NEW
    ├── delete-run.test.ts            # NEW
    ├── list-llm-providers.test.ts    # NEW
    ├── list-llm-models.test.ts       # NEW
    ├── get-llm-model.test.ts         # NEW
    ├── list-system-settings.test.ts  # NEW
    ├── create-llm-model.test.ts      # NEW
    ├── update-llm-model.test.ts      # NEW
    ├── deprecate-llm-model.test.ts   # NEW
    ├── reactivate-llm-model.test.ts  # NEW
    ├── set-default-llm-model.test.ts # NEW
    ├── update-llm-provider.test.ts   # NEW
    └── set-infra-model.test.ts       # NEW
```

---

## Implementation Phases

### Phase 1: Database Migration (Foundation)
1. Add `deletedAt` to Transcript model in schema.prisma
2. Add `deletedAt` to AnalysisResult model in schema.prisma
3. Create and run migration
4. Update existing queries to filter soft-deleted records
5. Add delete helper functions to `packages/db/src/queries/`

### Phase 2: Delete Tools (P1 User Stories 1-2)
1. Implement `delete_definition` MCP tool
2. Implement `delete_run` MCP tool
3. Extend audit logging with new action types
4. Write tests for both tools

### Phase 3: LLM Read Tools (P1 User Stories 3-4, P2 Story 11)
1. Implement `list_llm_providers` MCP tool
2. Implement `list_llm_models` MCP tool
3. Implement `get_llm_model` MCP tool
4. Implement `list_system_settings` MCP tool
5. Write tests for all read tools

### Phase 4: LLM Write Tools (P1 User Stories 5-7, P2 Stories 8-10)
1. Implement `create_llm_model` MCP tool
2. Implement `update_llm_model` MCP tool
3. Implement `deprecate_llm_model` MCP tool
4. Implement `reactivate_llm_model` MCP tool
5. Implement `set_default_llm_model` MCP tool
6. Implement `update_llm_provider` MCP tool
7. Implement `set_infra_model` MCP tool
8. Write tests for all write tools

### Phase 5: Integration & Validation
1. Update tool registry (index.ts) with all new tools
2. Run full test suite
3. Verify 80% coverage
4. Manual testing with Claude Desktop

---

## Risk Mitigation

### Risk 1: Schema Migration on Production Data
**Mitigation**:
- Migration only adds nullable columns (no data modification)
- Migration is additive, not destructive
- Test on staging environment first

### Risk 2: Query Performance with Soft Delete
**Mitigation**:
- Add index on `deleted_at` column for efficient filtering
- Existing queries already use indexes on primary filters

### Risk 3: Tool Count Exceeds Token Budget
**Mitigation**:
- Follow existing response size patterns (< 5KB)
- Use pagination hints for large result sets
- Test response sizes in unit tests

---

## Dependencies

### Blocked By
- None (all prerequisites complete per spec)

### Blocks
- Future MCP features building on LLM metadata
- Data export features (Stage 15)

---

## Success Metrics

Per spec success criteria:
- All 13 new MCP tools callable from Claude Desktop
- All operations logged to audit trail
- 80% test coverage on new components
- All files under 400 lines
- Response latency < 2 seconds

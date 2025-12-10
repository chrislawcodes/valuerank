# Implementation Plan: Comprehensive Audit Logging

**Branch**: `014-audit-logging` | **Date**: 2025-12-10 | **Spec**: [spec.md](./spec.md)

## Summary

Implement comprehensive audit logging using a hybrid approach: (1) add `createdByUserId`/`deletedByUserId` columns to key entities for quick ownership queries, and (2) create a generic `AuditLog` table for complete mutation history. Use a Pothos plugin to automatically capture all 27 mutations without manual logging code.

---

## Technical Context

| Aspect | Value |
|--------|-------|
| **Language/Version** | TypeScript 5.x (strict mode) |
| **Primary Dependencies** | Pothos GraphQL, Prisma ORM, pino logger |
| **Storage** | PostgreSQL via Prisma |
| **Testing** | Vitest with test database |
| **Target Platform** | Railway (Docker) |
| **Performance Goals** | <10ms audit logging overhead per mutation |
| **Constraints** | File size <400 lines, 80% test coverage |

---

## Constitution Check

**Status**: PASS

### Relevant Constitution Sections

- **Core Principles**: Observable systems (audit logging directly supports this)
- **File Size Limits**: <400 lines per file - will split audit service into modules
- **TypeScript Standards**: Strict mode, no `any` types - will use proper typing
- **Testing Requirements**: 80% coverage minimum - will write comprehensive tests
- **Logging Standards**: Use pino logger, structured logging - audit complements this
- **Database Access**: Prisma with type safety, transactions for multi-step operations
- **Soft Delete Pattern**: Already using `deletedAt` - extending with `deletedByUserId`

**No violations detected.**

---

## Architecture Decisions

### Decision 1: Audit Logging Approach

**Chosen**: Hybrid approach (entity fields + generic audit table)

**Rationale**:
- Quick "who created this?" queries via `createdByUserId` field (O(1) lookup)
- Complete history via `AuditLog` table for compliance/debugging
- Follows existing soft-delete pattern in codebase
- Avoids complex shadow tables or database triggers

**Alternatives Considered**:
- **Shadow tables per entity**: Too much maintenance overhead, schema duplication
- **Database triggers**: No access to request context (userId), harder to test
- **Only generic audit table**: Requires join for simple ownership queries

**Tradeoffs**:
- Pros: Fast ownership queries, complete audit trail, testable
- Cons: Slight data duplication (userId in entity + audit log)

---

### Decision 2: Automatic Audit Capture

**Chosen**: Custom Pothos plugin + wrapper utility

**Rationale**:
- Pothos already used for GraphQL schema building
- Plugin can intercept all mutations automatically
- Follows existing pattern (`ValidationPlugin` already in use)
- Single point of implementation ensures coverage

**Alternatives Considered**:
- **Manual logging in each resolver**: Error-prone, easy to forget, inconsistent
- **GraphQL middleware (graphql-middleware)**: Additional dependency, less integrated with Pothos
- **Express middleware**: Too early in request lifecycle, no GraphQL context

**Implementation**:
```typescript
// Wrapper approach - wrap mutation resolvers
export function auditedMutation<TArgs, TResult>(
  config: AuditConfig,
  resolver: (args: TArgs, ctx: Context) => Promise<TResult>
): (args: TArgs, ctx: Context) => Promise<TResult> {
  return async (args, ctx) => {
    const result = await resolver(args, ctx);
    await createAuditLog({
      action: config.action,
      entityType: config.entityType,
      entityId: extractEntityId(result, config),
      userId: ctx.user?.id ?? null,
      metadata: config.metadata?.(args, result),
    });
    return result;
  };
}
```

**Tradeoffs**:
- Pros: Explicit, type-safe, testable, no magic
- Cons: Requires wrapping each mutation (but provides flexibility)

---

### Decision 3: Entity ID Extraction Strategy

**Chosen**: Convention-based extraction with explicit override

**Rationale**:
- Most mutations return the entity directly (has `id` field)
- Some mutations need special handling (delete returns boolean)
- Explicit config prevents silent failures

**Implementation**:
```typescript
type AuditConfig = {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'ACTION';
  entityType: string;
  // Override for mutations that don't return entity directly
  extractEntityId?: (args: unknown, result: unknown) => string;
  metadata?: (args: unknown, result: unknown) => Record<string, unknown>;
};
```

---

### Decision 4: System Actor for Background Jobs

**Chosen**: Reserved `SYSTEM` constant, nullable userId

**Rationale**:
- Background jobs (scenario expansion, analysis) have no user context
- Using null would conflate "system" with "unknown/error"
- Explicit SYSTEM identifier enables filtering and auditing

**Implementation**:
```typescript
// packages/shared/src/constants.ts
export const SYSTEM_ACTOR_ID = '__SYSTEM__';

// In audit log creation
userId: ctx.user?.id ?? (isSystemContext ? SYSTEM_ACTOR_ID : null)
```

---

## Project Structure

### Files to Create

```
packages/db/
├── prisma/
│   └── schema.prisma              # Add AuditLog model + entity fields
│   └── migrations/
│       └── YYYYMMDD_add_audit_logging/
│           └── migration.sql      # Generated migration

packages/shared/
├── src/
│   └── constants.ts               # Add SYSTEM_ACTOR_ID constant

apps/api/
├── src/
│   ├── services/
│   │   └── audit/
│   │       ├── index.ts           # Re-exports
│   │       ├── create.ts          # createAuditLog function
│   │       ├── query.ts           # queryAuditLog with filters
│   │       └── types.ts           # AuditAction, AuditConfig types
│   ├── graphql/
│   │   ├── types/
│   │   │   └── audit-log.ts       # AuditLog GraphQL type
│   │   ├── queries/
│   │   │   └── audit-log.ts       # auditLogs query
│   │   └── utils/
│   │       └── audited-mutation.ts # Wrapper utility
└── tests/
    └── services/
        └── audit/
            └── audit.test.ts      # Audit service tests
```

### Files to Modify

```
packages/db/prisma/schema.prisma
├── Add AuditLog model
├── Add createdByUserId to Definition, Run, Tag, LlmModel
├── Add deletedByUserId to Definition, Run
├── Add User relations

apps/api/src/graphql/mutations/
├── definition.ts    # Wrap mutations with audit
├── run.ts           # Wrap mutations with audit
├── tag.ts           # Wrap mutations with audit
├── api-key.ts       # Wrap mutations with audit
├── llm.ts           # Wrap mutations with audit
├── analysis.ts      # Wrap mutations with audit
├── queue.ts         # Wrap mutations with audit
├── definition-tags.ts # Wrap mutations with audit

apps/api/src/graphql/types/
├── definition.ts    # Add createdBy, deletedBy fields
├── run.ts           # Add createdBy, deletedBy fields
├── tag.ts           # Add createdBy field
```

---

## Implementation Phases

### Phase 1: Database Schema (P1 - Required for all other work)

1. Add `AuditLog` model to Prisma schema
2. Add `createdByUserId`/`deletedByUserId` to entities
3. Create and run migration
4. Update Prisma client types

### Phase 2: Audit Service (P1 - Core functionality)

1. Create audit service with `createAuditLog` function
2. Create `auditedMutation` wrapper utility
3. Add types for audit actions and config
4. Write unit tests

### Phase 3: GraphQL Integration (P1 - API exposure)

1. Create `AuditLog` GraphQL type
2. Add `auditLogs` query with filters
3. Add `createdBy`/`deletedBy` fields to entity types
4. Write integration tests

### Phase 4: Mutation Updates (P1 - Apply to all mutations)

1. Wrap Definition mutations (6 mutations)
2. Wrap Run mutations (5 mutations)
3. Wrap Tag mutations (5 mutations)
4. Wrap API Key mutations (2 mutations)
5. Wrap LLM mutations (7 mutations)
6. Wrap Analysis/Queue mutations (3 mutations)
7. Update soft-delete functions to set `deletedByUserId`

### Phase 5: Testing & Documentation (P1 - Quality assurance)

1. Integration tests for audit log queries
2. E2E tests for full mutation → audit flow
3. Update API documentation
4. Update quickstart guide

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Performance impact | Async audit log writes, batch inserts if needed |
| Missing audit entries | Wrapper pattern ensures coverage; add lint rule |
| Migration on production | Test migration locally first, schedule deployment |
| Large audit log table | Add retention policy, partition by date (future) |

---

## Dependencies

- No new npm packages required
- Uses existing Pothos, Prisma, pino stack
- Requires database migration

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Mutation coverage | 27/27 | Count wrapped mutations |
| Query performance | <500ms | Test audit log queries |
| Logging overhead | <10ms | Measure mutation latency delta |
| Test coverage | >80% | Vitest coverage report |

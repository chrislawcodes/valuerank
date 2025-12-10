# Implementation Plan: Stage 3 - GraphQL API Foundation

**Branch**: `cloud-planning` | **Date**: 2025-12-06 | **Spec**: [stage-3-graphql.md](./stage-3-graphql.md)

## Summary

Implement a GraphQL API layer using GraphQL Yoga and Pothos (code-first schema) on top of the existing Express server. The API will expose Definition, Run, Transcript, Scenario, and Experiment types with DataLoaders for N+1 prevention.

---

## Technical Context

| Aspect | Value |
|--------|-------|
| **Language/Version** | TypeScript 5.3+ |
| **Primary Dependencies** | graphql-yoga, @pothos/core, @pothos/plugin-prisma, dataloader |
| **Storage** | PostgreSQL via Prisma (schema from Stage 2) |
| **Testing** | Vitest with supertest for API testing |
| **Target Platform** | Docker (local), Railway (production) |
| **Performance Goals** | DataLoaders batch queries; nested queries ≤3 DB calls |
| **Constraints** | Must integrate with existing Express middleware (logging, error handling) |
| **Scale/Scope** | Single GraphQL endpoint at `/graphql`, ~5 types, ~6 operations |

---

## Constitution Check

**Status**: PASS

Validated against [CLAUDE.md](../CLAUDE.md):

| Requirement | How Addressed |
|-------------|---------------|
| **File Size < 400 lines** | Split into types/, queries/, mutations/, dataloaders/ folders |
| **No `any` Types** | Pothos provides full type inference; JSON scalars use `unknown` |
| **TypeScript Strict Mode** | Pothos integrates with strict tsconfig |
| **Test Coverage 80%** | Resolver tests, DataLoader tests, integration tests |
| **No console.log** | Context provides `ctx.log` from request middleware |
| **Structured Logging** | `ctx.log.info({ data }, 'message')` pattern in resolvers |
| **Custom Error Classes** | NotFoundError, ValidationError in mutations |
| **Prisma Transactions** | Multi-step mutations use `db.$transaction` |

---

## Architecture Decisions

### Decision 1: GraphQL Yoga over Apollo Server

**Chosen**: GraphQL Yoga

**Rationale**:
- Native Express integration via middleware
- Built-in GraphiQL playground
- Simpler configuration, fewer moving parts
- Active development by The Guild (Pothos authors)
- Better TypeScript inference with Pothos

**Alternatives Considered**:
- **Apollo Server**: More features, but heavier footprint and more complex setup
- **Mercurius (Fastify)**: Would require replacing Express

**Tradeoffs**:
- Pros: Lightweight, excellent TypeScript support, easy Express integration
- Cons: Smaller ecosystem than Apollo, fewer enterprise features

---

### Decision 2: Pothos (Code-First) over Schema-First

**Chosen**: Pothos with Prisma plugin

**Rationale**:
- Code-first eliminates schema/resolver drift
- Prisma plugin auto-generates types from database schema
- Full type safety between schema and resolvers
- Existing pattern in project (TypeScript-heavy)

**Alternatives Considered**:
- **Schema-first (SDL)**: Requires codegen step, types can drift
- **TypeGraphQL**: Decorator-heavy, less flexible

**Tradeoffs**:
- Pros: Single source of truth, type inference, Prisma integration
- Cons: Steeper learning curve, less portable schema

---

### Decision 3: Per-Request DataLoader Instances

**Chosen**: Create new DataLoader instances per request via context

**Rationale**:
- Prevents cache leakage between users/requests
- Standard pattern for GraphQL DataLoaders
- Context provides natural lifecycle boundary

**Alternatives Considered**:
- **Global DataLoaders with TTL**: Risk of stale data and cache invalidation complexity
- **No DataLoaders**: N+1 queries would hurt performance

**Tradeoffs**:
- Pros: Clean isolation, predictable behavior, request-scoped batching
- Cons: No cross-request caching (acceptable for this use case)

---

### Decision 4: JSON Scalar for JSONB Fields

**Chosen**: Custom JSON scalar with `unknown` type

**Rationale**:
- JSONB columns (content, config, progress) have variable structure
- Type safety maintained at business logic layer
- Explicit handling beats pretending we know the shape

**Alternatives Considered**:
- **Typed unions for each content type**: Over-engineering for MVP
- **String (serialized JSON)**: Loses GraphQL advantages

**Tradeoffs**:
- Pros: Flexibility, honest typing, matches database reality
- Cons: Consumers must validate JSON structure

---

## Project Structure

### New Files in `apps/api/src/`

```
apps/api/src/
├── graphql/
│   ├── index.ts              # GraphQL Yoga setup, schema export
│   ├── builder.ts            # Pothos SchemaBuilder configuration
│   ├── context.ts            # Request context with DataLoaders
│   │
│   ├── types/
│   │   ├── index.ts          # Re-exports all type registrations
│   │   ├── scalars.ts        # DateTime, JSON scalar definitions
│   │   ├── enums.ts          # RunStatus, AnalysisStatus enums
│   │   ├── definition.ts     # Definition object type
│   │   ├── run.ts            # Run object type
│   │   ├── transcript.ts     # Transcript object type
│   │   ├── scenario.ts       # Scenario object type
│   │   └── experiment.ts     # Experiment object type
│   │
│   ├── queries/
│   │   ├── index.ts          # Re-exports all query registrations
│   │   ├── definition.ts     # definition(), definitions() queries
│   │   └── run.ts            # run(), runs() queries
│   │
│   ├── mutations/
│   │   ├── index.ts          # Re-exports all mutation registrations
│   │   └── definition.ts     # createDefinition, forkDefinition
│   │
│   └── dataloaders/
│       ├── index.ts          # DataLoader factory function
│       ├── definition.ts     # Definition loader
│       ├── run.ts            # Run loader
│       ├── transcript.ts     # Transcript loader by run
│       └── scenario.ts       # Scenario loader
│
├── server.ts                 # Modified: mount GraphQL middleware
└── ...existing files
```

### Modified Files

| File | Change |
|------|--------|
| `apps/api/src/server.ts` | Add `app.use('/graphql', yoga)` route |
| `apps/api/package.json` | Add GraphQL dependencies |

---

## Implementation Phases

### Phase 1: Foundation (~30% of work)

1. **Install dependencies** - graphql, graphql-yoga, @pothos/*, dataloader
2. **Create builder.ts** - Configure Pothos with Prisma plugin
3. **Create scalars.ts** - DateTime and JSON scalar types
4. **Create enums.ts** - RunStatus enum from Prisma
5. **Create context.ts** - Request context type with loaders placeholder

### Phase 2: Types & DataLoaders (~30% of work)

1. **Create DataLoaders** - Definition, Run, Transcript, Scenario loaders
2. **Create Definition type** - All fields + parent/children/runs relations
3. **Create Run type** - All fields + definition/experiment/transcripts relations
4. **Create Transcript type** - All fields + run/scenario relations
5. **Create Scenario type** - All fields + definition relation
6. **Create Experiment type** - All fields + runs relation

### Phase 3: Queries (~15% of work)

1. **definition(id)** - Single definition by ID, nullable return
2. **definitions(rootOnly, limit, offset)** - Paginated list with filters
3. **run(id)** - Single run by ID, nullable return
4. **runs(definitionId, experimentId, status, limit, offset)** - Paginated list

### Phase 4: Mutations (~15% of work)

1. **createDefinition(input)** - Create with auto schema_version
2. **forkDefinition(input)** - Fork from parent with validation

### Phase 5: Integration & Testing (~10% of work)

1. **Mount in server.ts** - Add yoga middleware
2. **Update tests** - Add GraphQL integration tests
3. **Verify playground** - Test GraphiQL in development
4. **Verify introspection** - Test schema query for LLM consumption

---

## Data Flow

```
Request                                      Database
   │                                            │
   ▼                                            │
Express Middleware                              │
(logging, requestId)                            │
   │                                            │
   ▼                                            │
GraphQL Yoga                                    │
   │                                            │
   ├── Parse Query                              │
   │                                            │
   ├── Create Context                           │
   │   └── Instantiate DataLoaders              │
   │                                            │
   ├── Execute Resolvers ───────────────────────┤
   │   │                                        │
   │   ├── Query: definition(id) ──────────────▶│── SELECT * FROM definitions
   │   │                                        │
   │   ├── Field: definition.parent ───────────▶│── DataLoader batch
   │   │   (via DataLoader)                     │   SELECT * FROM definitions WHERE id IN (...)
   │   │                                        │
   │   └── Field: definition.runs ─────────────▶│── SELECT * FROM runs WHERE definition_id = ?
   │                                            │
   └── Format Response                          │
```

---

## Error Handling Strategy

| Error Type | When | GraphQL Response |
|------------|------|------------------|
| NotFoundError | forkDefinition with invalid parentId | `errors: [{ message: "Definition not found: xyz", extensions: { code: "NOT_FOUND" }}]` |
| ValidationError | createDefinition with invalid content | `errors: [{ message: "Invalid input", extensions: { code: "VALIDATION_ERROR", details: [...] }}]` |
| Database Error | Prisma connection failure | `errors: [{ message: "Something went wrong", extensions: { code: "INTERNAL_ERROR" }}]` |

---

## Testing Strategy

### Unit Tests

| File | Tests |
|------|-------|
| `tests/graphql/dataloaders/definition.test.ts` | Batching, caching, null handling |
| `tests/graphql/mutations/definition.test.ts` | create, fork, validation errors |

### Integration Tests

| File | Tests |
|------|-------|
| `tests/graphql/queries.test.ts` | End-to-end query execution with test DB |
| `tests/graphql/mutations.test.ts` | End-to-end mutation execution |

### Test Database Setup

```typescript
// Use existing Prisma test patterns from Stage 2
// Reset database before each test suite
// Seed with known test data
```

---

## Performance Considerations

### DataLoader Batching

- **Definition loader**: Batches `findUnique` calls into `findMany` with `WHERE id IN (...)`
- **Run loader**: Same pattern for run lookups
- **Transcript loader by run**: Batches transcript lookups by run_id

### Query Complexity

- **Default limit**: 20 items for list queries
- **Max limit**: Consider adding max limit (100) to prevent abuse
- **Depth limiting**: Consider graphql-depth-limit for production

### Expected Query Patterns

```graphql
# Common query: Run with nested data (3 DB queries max)
query GetRunDetails($id: ID!) {
  run(id: $id) {                    # 1 query
    definition { name }              # Batched
    transcripts(limit: 50) {         # 1 query (could batch across runs)
      modelId
      turnCount
    }
  }
}
```

---

## Dependencies to Add

```json
{
  "dependencies": {
    "graphql": "^16.8.1",
    "graphql-yoga": "^5.1.1",
    "@pothos/core": "^3.41.0",
    "@pothos/plugin-prisma": "^3.65.0",
    "@pothos/plugin-validation": "^3.10.1",
    "dataloader": "^2.2.2",
    "zod": "^3.22.4"
  }
}
```

---

## Open Questions

1. **Query depth limiting**: Should we add `graphql-depth-limit` for security?
   - Recommendation: Yes, max depth 10 for MVP

2. **Subscriptions**: Not in Stage 3 scope, but how will we add later?
   - Recommendation: GraphQL Yoga supports subscriptions natively; defer to Stage 9

3. **Authentication**: Stage 4 concern, but how will it integrate?
   - Recommendation: Context will gain `userId` from auth middleware

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Query latency (simple) | < 50ms | Test with `supertest` |
| Query latency (nested, 20 items) | < 200ms | Test with DataLoader batching |
| Test coverage | > 80% | Vitest coverage report |
| Type safety | 0 `any` types | ESLint enforcement |

---

## Next Steps

1. Review this plan for technical accuracy
2. When ready for task breakdown, invoke the **feature-tasks** skill
3. Or refine architecture decisions if needed

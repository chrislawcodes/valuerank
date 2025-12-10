# Implementation Plan: Stage 12 - MCP Read Tools

**Branch**: `stage-12-mcp-read-tools` | **Date**: 2025-12-08 | **Spec**: [spec.md](./spec.md)

## Summary

Implement MCP (Model Context Protocol) server embedded in the existing Express API, exposing read-only tools that enable AI agents (Claude Desktop, Cursor) to query ValueRank data. Uses the `@modelcontextprotocol/sdk` package with existing API key authentication and a new rate limiter for MCP endpoints.

---

## Technical Context

| Aspect | Value |
|--------|-------|
| **Language/Version** | TypeScript 5.x (ESM) |
| **Primary Dependencies** | `@modelcontextprotocol/sdk`, existing `express-rate-limit` |
| **Storage** | No schema changes - reads existing tables |
| **Testing** | Vitest (80% coverage required) |
| **Target Platform** | Node.js / Express (embedded in API) |
| **Performance Goals** | Response latency <2s, token budget compliance |
| **Constraints** | Read-only tools, no mutations, API key auth required |

---

## Constitution Check

**Status**: PASS

### File Size Limits
- [x] All new files under 400 lines
- [x] Split tool handlers into separate files

### Type Safety
- [x] No `any` types - use typed MCP SDK interfaces
- [x] Strict TypeScript mode

### Test Coverage
- [x] 80% minimum coverage on new components
- [x] Test each tool handler independently

### Logging
- [x] Structured logging via pino (createLogger)
- [x] Log all MCP requests with requestId

### Error Handling
- [x] Use existing AppError pattern
- [x] Never expose stack traces

---

## Architecture Decisions

### Decision 1: Embedded vs Sidecar MCP Server

**Chosen**: Embedded in API process

**Rationale**:
- Simpler deployment (single container)
- Shares database connection pool with main API
- Reduces operational complexity for internal tool
- Can extract to sidecar later if MCP traffic grows

**Alternatives Considered**:
- **Sidecar container**: Adds deployment complexity, unnecessary for internal tool
- **Separate service**: Over-engineered for current scale

**Tradeoffs**:
- Pros: Simple, fast to implement, shared resources
- Cons: MCP load affects API performance (acceptable for internal use)

---

### Decision 2: MCP Transport Protocol

**Chosen**: HTTP/Streamable HTTP transport via Express endpoint

**Rationale**:
- Aligns with existing Express infrastructure
- MCP SDK supports HTTP transport natively
- Easy to add rate limiting as Express middleware
- Consistent with existing `/graphql` endpoint pattern

**Alternatives Considered**:
- **stdio transport**: Requires subprocess, not suitable for HTTP API
- **SSE transport**: More complex, not needed for request/response tools

**Tradeoffs**:
- Pros: Familiar Express patterns, easy debugging
- Cons: No streaming for long operations (acceptable - all tools are fast)

---

### Decision 3: Tool Response Formatting

**Chosen**: Custom response builder with token budget enforcement

**Rationale**:
- MCP interface doc specifies strict size limits per tool
- Need to truncate gracefully with continuation hints
- Consistent format across all tools

**Implementation**:
```typescript
interface MCPResponse<T> {
  data: T;
  metadata: {
    bytes: number;
    truncated: boolean;
    executionMs: number;
    requestId: string;
  };
}
```

---

### Decision 4: Rate Limiting Strategy

**Chosen**: Per-API-key rate limiting using express-rate-limit

**Rationale**:
- Consistent with existing loginRateLimiter pattern
- 120 requests/minute per key (internal team, higher limit)
- Uses same library already in dependencies

**Configuration**:
```typescript
{
  windowMs: 60 * 1000,     // 1 minute window
  max: 120,                // 120 requests per window
  keyGenerator: (req) => req.headers['x-api-key'] as string,
  standardHeaders: true,   // X-RateLimit-* headers
}
```

---

### Decision 5: GraphQL Query Tool Implementation

**Chosen**: Direct execution against existing GraphQL schema

**Rationale**:
- Reuses all existing queries and types
- Schema introspection automatically available
- No duplicate code for data access

**Implementation**:
- Import `schema` from `./graphql/index.js`
- Use `graphql()` function for execution
- Apply user context from API key auth
- Block mutation operations at tool level

---

## Project Structure

### New Files

```
apps/api/src/
├── mcp/
│   ├── index.ts              # MCP router and setup
│   ├── server.ts             # MCP server initialization
│   ├── rate-limit.ts         # MCP-specific rate limiting
│   ├── response.ts           # Token-budget response builder
│   └── tools/
│       ├── index.ts          # Tool registry
│       ├── list-definitions.ts
│       ├── list-runs.ts
│       ├── get-run-summary.ts
│       ├── get-dimension-analysis.ts
│       ├── get-transcript-summary.ts
│       └── graphql-query.ts
└── services/
    └── mcp/
        ├── index.ts          # Re-exports
        └── formatters.ts     # Data formatting utilities
```

### Modified Files

```
apps/api/src/
├── server.ts                 # Add MCP endpoint route
└── package.json              # Add @modelcontextprotocol/sdk
```

### Test Files

```
apps/api/tests/
└── mcp/
    ├── server.test.ts        # MCP server tests
    ├── rate-limit.test.ts    # Rate limiting tests
    ├── tools/
    │   ├── list-definitions.test.ts
    │   ├── list-runs.test.ts
    │   ├── get-run-summary.test.ts
    │   ├── get-dimension-analysis.test.ts
    │   ├── get-transcript-summary.test.ts
    │   └── graphql-query.test.ts
    └── response.test.ts      # Response builder tests
```

---

## Integration Points

### Existing Code Reuse

| Component | Location | Usage in MCP |
|-----------|----------|--------------|
| Auth middleware | `src/auth/middleware.ts` | API key validation |
| DB client | `@valuerank/db` | Database queries |
| GraphQL schema | `src/graphql/index.ts` | graphql_query tool |
| Logger | `@valuerank/shared` | Request logging |
| AppError | `@valuerank/shared` | Error responses |

### Data Access Layer

Tools will use Prisma directly (via `@valuerank/db`) rather than going through GraphQL:
- **list_definitions**: `db.definition.findMany()` with filters
- **list_runs**: `db.run.findMany()` with filters
- **get_run_summary**: `db.analysisResult.findFirst()` + run data
- **get_transcript_summary**: `db.transcript.findUnique()` with summary fields

Exception: `graphql_query` tool uses the GraphQL execution layer directly.

---

## Token Budget Implementation

| Tool | Max Size | Truncation Strategy |
|------|----------|---------------------|
| `list_definitions` | 2KB | Limit to 50 items, paginate |
| `list_runs` | 2KB | Limit to 20 items (default), max 100 |
| `get_run_summary` | 5KB | Omit insights if over budget |
| `get_dimension_analysis` | 2KB | Top 10 dimensions only |
| `get_transcript_summary` | 1KB | Truncate key_reasoning array |
| `graphql_query` | 10KB | Return error if response too large |

### Enforcement Pattern

```typescript
function enforceTokenBudget<T>(
  data: T,
  maxBytes: number,
  truncator: (data: T) => T
): { data: T; truncated: boolean } {
  const size = JSON.stringify(data).length;
  if (size <= maxBytes) {
    return { data, truncated: false };
  }
  return { data: truncator(data), truncated: true };
}
```

---

## Security Considerations

### Authentication
- Reuse existing API key validation from `src/auth/middleware.ts`
- All MCP requests require valid X-API-Key header
- No anonymous access to MCP tools

### Authorization
- Single tenant model - all authenticated users see all data
- API key provides user context for logging/auditing

### Input Validation
- Validate all tool parameters with Zod schemas
- Sanitize GraphQL queries (reject mutations)
- Limit pagination to prevent resource exhaustion

### Error Handling
- Never expose internal errors to clients
- Return structured error format with code and message
- Log all errors with request context

---

## Dependencies

### New Package

```json
{
  "@modelcontextprotocol/sdk": "^0.6.0"
}
```

### Version Compatibility
- MCP SDK requires Node.js 18+
- Compatible with existing Express 4.x
- Uses ESM modules (matches project)

---

## Performance Considerations

### Response Time Targets
- All tools: <2 seconds
- Database queries: Use existing indexes
- No N+1 queries in tool implementations

### Caching
- Analysis results already cached in database
- No additional caching layer needed for MVP
- Could add response caching later if needed

### Resource Limits
- Rate limiting: 120 req/min per API key
- Pagination: Max 100 items per request
- Query complexity: Reject overly complex GraphQL

---

## Rollout Plan

### Phase 1: Core Implementation
1. Add MCP SDK dependency
2. Implement MCP server initialization
3. Add /mcp endpoint to Express
4. Implement API key auth for MCP

### Phase 2: Tool Implementation
1. list_definitions tool
2. list_runs tool
3. get_run_summary tool
4. graphql_query tool

### Phase 3: Additional Tools
1. get_dimension_analysis tool
2. get_transcript_summary tool

### Phase 4: Testing & Documentation
1. Unit tests for all tools (80% coverage)
2. Integration tests with test database
3. Manual testing with Claude Desktop
4. Update API documentation

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| MCP SDK breaking changes | High | Pin version, monitor releases |
| Performance degradation | Medium | Rate limiting, query limits |
| Auth bypass | High | Reuse proven auth middleware |
| Response size explosion | Medium | Strict token budget enforcement |

---

## Success Metrics

- [ ] All 7 tools implemented and tested
- [ ] 80%+ code coverage on new components
- [ ] All files under 400 lines
- [ ] No TypeScript `any` types
- [ ] Response times under 2 seconds
- [ ] Rate limiting working correctly
- [ ] Claude Desktop integration verified

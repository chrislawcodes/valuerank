# Tasks: Stage 12 - MCP Read Tools

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [contracts/mcp-tools.yaml](./contracts/mcp-tools.yaml)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1-US8) - story phases only
- Include exact file paths from plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and create feature branch

- [ ] T001 Create feature branch `stage-12-mcp-read-tools` from cloud-planning
- [ ] T002 Install `@modelcontextprotocol/sdk` package in apps/api/package.json
- [ ] T003 [P] Add MCP types to tsconfig include paths if needed

**Checkpoint**: Dependencies installed, branch ready

---

## Phase 2: Foundation (Blocking Prerequisites)

**Purpose**: Core MCP infrastructure that MUST be complete before ANY tool implementation

⚠️ **CRITICAL**: No tool implementation can begin until this phase is complete

### MCP Server Setup

- [ ] T004 Create MCP server module at apps/api/src/mcp/server.ts
  - Initialize MCP server with SDK
  - Configure HTTP transport
  - Export server instance
- [ ] T005 Create MCP router at apps/api/src/mcp/index.ts
  - Create Express router for /mcp endpoint
  - Wire up MCP server to Express
  - Handle MCP protocol requests
- [ ] T006 [P] Create MCP rate limiter at apps/api/src/mcp/rate-limit.ts
  - 120 requests/minute per API key
  - Key generator using X-API-Key header
  - Standard rate limit headers
- [ ] T007 [P] Create response builder at apps/api/src/services/mcp/response.ts
  - MCPResponse type with metadata
  - Token budget enforcement utility
  - Truncation helpers
- [ ] T008 [P] Create MCP formatters at apps/api/src/services/mcp/formatters.ts
  - Definition list item formatter
  - Run list item formatter
  - Summary formatters
- [ ] T009 Create MCP service index at apps/api/src/services/mcp/index.ts
  - Re-export response and formatters
- [ ] T010 Create tool registry at apps/api/src/mcp/tools/index.ts
  - Export all tool handlers
  - Tool name to handler mapping
- [ ] T011 Register MCP endpoint in apps/api/src/server.ts
  - Add /mcp route with auth middleware
  - Add MCP rate limiter
  - Wire up MCP router

### Foundation Tests

- [ ] T012 [P] Create MCP server tests at apps/api/tests/mcp/server.test.ts
  - Server initialization
  - Protocol handling
- [ ] T013 [P] Create rate limit tests at apps/api/tests/mcp/rate-limit.test.ts
  - Rate limiting enforcement
  - Header generation
- [ ] T014 [P] Create response builder tests at apps/api/tests/mcp/response.test.ts
  - Token budget enforcement
  - Truncation behavior

**Checkpoint**: MCP endpoint responding, auth working, rate limiting active

---

## Phase 3: User Story 1 - Query Runs (Priority: P1) 🎯 MVP

**Goal**: Enable AI agents to list and filter evaluation runs via MCP

**Independent Test**: Ask Claude Desktop "What are my recent runs?" and verify list is returned

### Implementation for User Story 1

- [ ] T015 [US1] Create list_runs tool at apps/api/src/mcp/tools/list-runs.ts
  - Accept definition_id, status, limit parameters
  - Query runs with filters via Prisma
  - Return formatted run list items
  - Enforce 2KB token budget
- [ ] T016 [US1] Create list-runs tests at apps/api/tests/mcp/tools/list-runs.test.ts
  - Parameter validation
  - Filter behavior
  - Pagination
  - Token budget compliance

**Checkpoint**: list_runs tool callable via MCP, returns filtered runs under 2KB

---

## Phase 4: User Story 2 - Run Summary (Priority: P1) 🎯 MVP

**Goal**: Enable AI agents to get aggregated analysis for completed runs

**Independent Test**: Ask Claude Desktop "Summarize run X" and verify stats, agreement, contested scenarios

### Implementation for User Story 2

- [ ] T017 [US2] Create get_run_summary tool at apps/api/src/mcp/tools/get-run-summary.ts
  - Accept run_id, include_insights parameters
  - Query run and analysis results
  - Format basic stats, model agreement, contested scenarios
  - Include insights and llm_summary if available
  - Enforce 5KB token budget
- [ ] T018 [US2] Create get-run-summary tests at apps/api/tests/mcp/tools/get-run-summary.test.ts
  - Valid run returns full summary
  - Invalid run returns error
  - Analysis pending status handled
  - Token budget compliance

**Checkpoint**: get_run_summary returns analysis under 5KB

---

## Phase 5: User Story 3 - Browse Definitions (Priority: P1) 🎯 MVP

**Goal**: Enable AI agents to list and explore scenario definitions

**Independent Test**: Ask Claude Desktop "What definitions are available?" and verify list

### Implementation for User Story 3

- [ ] T019 [US3] Create list_definitions tool at apps/api/src/mcp/tools/list-definitions.ts
  - Accept folder, include_children parameters
  - Query definitions with soft-delete filter
  - Return formatted definition list items
  - Enforce 2KB token budget
- [ ] T020 [US3] Create list-definitions tests at apps/api/tests/mcp/tools/list-definitions.test.ts
  - Folder filter
  - Include children option
  - Soft-delete exclusion
  - Token budget compliance

**Checkpoint**: list_definitions returns definitions under 2KB

---

## Phase 6: User Story 4 - GraphQL Query (Priority: P1) 🎯 MVP

**Goal**: Enable AI agents to run ad-hoc GraphQL queries for flexible exploration

**Independent Test**: Ask Claude Desktop to run a custom GraphQL query, verify response

### Implementation for User Story 4

- [ ] T021 [US4] Create graphql_query tool at apps/api/src/mcp/tools/graphql-query.ts
  - Accept query, variables parameters
  - Execute against existing GraphQL schema
  - Apply user context from API key auth
  - Reject mutation operations
  - Enforce 10KB token budget
- [ ] T022 [US4] Create graphql-query tests at apps/api/tests/mcp/tools/graphql-query.test.ts
  - Valid query execution
  - Variables support
  - Mutation rejection
  - Schema introspection allowed
  - Token budget compliance

**Checkpoint**: graphql_query executes read queries, blocks mutations

---

## Phase 7: User Story 5 - Dimension Analysis (Priority: P2)

**Goal**: Enable AI agents to see which dimensions drive model divergence

**Independent Test**: Ask Claude Desktop "Which dimensions matter most?" for a run

### Implementation for User Story 5

- [ ] T023 [US5] Create get_dimension_analysis tool at apps/api/src/mcp/tools/get-dimension-analysis.ts
  - Accept run_id parameter
  - Query analysis results for dimension data
  - Format ranked dimensions, correlations, most divisive
  - Enforce 2KB token budget
- [ ] T024 [US5] Create get-dimension-analysis tests at apps/api/tests/mcp/tools/get-dimension-analysis.test.ts
  - Valid analysis returned
  - Missing analysis handled
  - Token budget compliance

**Checkpoint**: get_dimension_analysis returns ranked dimensions under 2KB

---

## Phase 8: User Story 6 - Transcript Summary (Priority: P2)

**Goal**: Enable AI agents to get transcript details without raw text

**Independent Test**: Ask Claude Desktop for transcript summary, verify key reasoning returned

### Implementation for User Story 6

- [ ] T025 [US6] Create get_transcript_summary tool at apps/api/src/mcp/tools/get-transcript-summary.ts
  - Accept run_id, scenario_id, model parameters
  - Query transcript with summary fields
  - Format turn count, word count, decision, key reasoning
  - Enforce 1KB token budget
- [ ] T026 [US6] Create get-transcript-summary tests at apps/api/tests/mcp/tools/get-transcript-summary.test.ts
  - Valid transcript returns summary
  - Not found error handled
  - Token budget compliance

**Checkpoint**: get_transcript_summary returns summary under 1KB

---

## Phase 9: User Story 7 - Authentication (Priority: P1)

**Goal**: Ensure MCP requests are authenticated via API key

**Independent Test**: Test with/without API key, verify 401 on missing/invalid

### Implementation for User Story 7

- [ ] T027 [US7] Add MCP auth middleware at apps/api/src/mcp/auth.ts
  - Require X-API-Key header
  - Use existing validateApiKey from auth/middleware.ts
  - Return structured error for missing/invalid key
- [ ] T028 [US7] Wire auth to MCP endpoint in apps/api/src/mcp/index.ts
  - Apply auth middleware before MCP handler
  - Ensure user context available to tools
- [ ] T029 [US7] Create MCP auth tests at apps/api/tests/mcp/auth.test.ts
  - Missing key returns 401
  - Invalid key returns 401
  - Valid key allows access
  - User context propagated

**Checkpoint**: MCP endpoint requires valid API key

---

## Phase 10: User Story 8 - Rate Limiting (Priority: P2)

**Goal**: Prevent MCP abuse with per-key rate limiting

**Independent Test**: Send 125 requests, verify 429 after 120

### Implementation for User Story 8

- [ ] T030 [US8] Implement rate limit tracking in apps/api/src/mcp/rate-limit.ts
  - Per-API-key tracking (use key as rate limit key)
  - 1-minute sliding window
  - Include Retry-After header
- [ ] T031 [US8] Create rate limit integration tests at apps/api/tests/mcp/rate-limit.integration.test.ts
  - Under limit succeeds
  - At limit returns 429
  - Headers present

**Checkpoint**: Rate limiting working at 120 req/min

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, integration testing, final validation

### Documentation & Integration

- [ ] T032 [P] Update apps/api/README.md with MCP endpoint documentation
- [ ] T033 [P] Add MCP tools to API documentation/schema
- [ ] T034 Create MCP integration test suite at apps/api/tests/mcp/integration.test.ts
  - Full tool workflow tests
  - Auth + rate limit combined
  - Token budget validation across all tools

### Validation

- [ ] T035 Run full test suite and verify 80% coverage on new code
- [ ] T036 Manual test with Claude Desktop per quickstart.md
- [ ] T037 Verify all response sizes comply with token budgets
- [ ] T038 Security review - ensure no data leakage, auth bypass

**Checkpoint**: All tests passing, manual validation complete

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup
    └── Phase 2: Foundation (BLOCKS all tools)
        ├── Phase 3: US1 - Query Runs (P1 MVP)
        ├── Phase 4: US2 - Run Summary (P1 MVP)
        ├── Phase 5: US3 - Browse Definitions (P1 MVP)
        ├── Phase 6: US4 - GraphQL Query (P1 MVP)
        ├── Phase 7: US5 - Dimension Analysis (P2)
        ├── Phase 8: US6 - Transcript Summary (P2)
        ├── Phase 9: US7 - Authentication (P1)
        └── Phase 10: US8 - Rate Limiting (P2)
            └── Phase 11: Polish
```

### User Story Dependencies

| Story | Priority | Depends On | Can Parallel With |
|-------|----------|------------|-------------------|
| US1 (Runs) | P1 | Foundation | US2, US3, US4, US7 |
| US2 (Summary) | P1 | Foundation | US1, US3, US4, US7 |
| US3 (Definitions) | P1 | Foundation | US1, US2, US4, US7 |
| US4 (GraphQL) | P1 | Foundation | US1, US2, US3, US7 |
| US5 (Dimensions) | P2 | Foundation | All others |
| US6 (Transcript) | P2 | Foundation | All others |
| US7 (Auth) | P1 | Foundation | All others |
| US8 (Rate Limit) | P2 | Foundation | All others |

### Parallel Opportunities

**Within Foundation (Phase 2)**:
- T006, T007, T008 can run in parallel (different files)
- T012, T013, T014 can run in parallel (different test files)

**User Story Phases (3-10)**:
- All P1 stories (3-6, 9) can run in parallel after Foundation
- All P2 stories (7-8, 10) can run in parallel

### Recommended Execution Path (Solo Developer)

1. **Phase 1-2**: Setup & Foundation (must complete first)
2. **Phase 9**: Auth (US7) - security first
3. **Phases 3-6**: P1 tool implementations
4. **Phase 10**: Rate limiting (US8)
5. **Phases 7-8**: P2 tool implementations
6. **Phase 11**: Polish & validation

---

## Task Statistics

| Category | Count |
|----------|-------|
| **Total Tasks** | 38 |
| **Setup** | 3 |
| **Foundation** | 11 |
| **P1 User Stories** | 14 |
| **P2 User Stories** | 6 |
| **Polish** | 7 |
| **Parallel Opportunities** | 14 |

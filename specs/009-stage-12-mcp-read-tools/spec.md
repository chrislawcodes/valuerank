# Feature Specification: Stage 12 - MCP Read Tools

> **Feature #009** | Branch: `stage-12-mcp-read-tools`
> **Created**: 2025-12-08
> **Status**: Draft
> **Dependencies**: Stage 11 (Analysis System) - Complete

## Overview

Enable AI agents to query and reason over ValueRank data via Model Context Protocol (MCP). This stage implements read-only MCP tools that allow local AI chat clients (Claude Desktop, Cursor, etc.) to interactively explore runs, definitions, analysis results, and transcripts without overwhelming context windows.

**Input Description**: MCP server setup (embedded in API), read tools (`list_definitions`, `list_runs`, `get_run_summary`, `get_analysis`), `graphql_query` tool for ad-hoc queries, token-budget-aware response formatting (<5KB per tool), rate limiting for MCP endpoints, API key authentication for MCP access.

**Phase 3 Completion**: This stage completes Phase 3 - automated analysis and AI-accessible insights become available to the team.

---

## User Stories & Testing

### User Story 1 - Query Runs from Local AI Chat (Priority: P1)

As a researcher using Claude Desktop or Cursor, I need to ask my local AI about recent ValueRank runs so that I can explore results conversationally without switching to the web UI.

**Why this priority**: Core functionality - the primary value of MCP is enabling conversational data exploration. Without this, researchers must manually navigate the web UI for every query.

**Independent Test**: Configure Claude Desktop with ValueRank MCP server, ask "What are my recent runs?", verify the AI returns a list of runs with status and summary metrics.

**Acceptance Scenarios**:

1. **Given** I have Claude Desktop configured with ValueRank API key, **When** I ask about recent runs, **Then** the AI can list runs with their status, models, and scenario counts
2. **Given** I specify a definition filter, **When** I ask "Show runs for definition X", **Then** only runs for that definition are returned
3. **Given** I ask for run details, **When** the AI calls `list_runs`, **Then** response includes id, status, models array, scenario_count, created_at
4. **Given** there are many runs, **When** I query without a limit, **Then** results are paginated (default 20, max 100)
5. **Given** the response is returned, **When** I check the size, **Then** it's under 2KB as per token budget guidelines

---

### User Story 2 - View Run Summary and Analysis via MCP (Priority: P1)

As a researcher, I need to retrieve aggregated analysis for a run via my local AI so that I can get insights without viewing raw transcripts that would overwhelm my AI's context.

**Why this priority**: Core functionality - answers the fundamental question "What happened in this run?" which is essential for conversational exploration of results.

**Independent Test**: Ask local AI "Summarize run XYZ", verify it returns basic stats, model agreement, outlier models, and most contested scenarios.

**Acceptance Scenarios**:

1. **Given** I ask for a run summary, **When** the AI calls `get_run_summary`, **Then** I see per-model win rates and basic stats
2. **Given** summary is returned, **When** I examine it, **Then** I see inter-model agreement scores
3. **Given** outlier models exist, **When** I view the summary, **Then** they are flagged in the response
4. **Given** I request insights, **When** `include_insights` is true (default), **Then** auto-generated findings are included
5. **Given** the response is returned, **When** I check the size, **Then** it's under 5KB as per token budget guidelines
6. **Given** analysis hasn't completed yet, **When** I request summary, **Then** I get a clear message that analysis is pending

---

### User Story 3 - Browse Definitions via MCP (Priority: P1)

As a researcher, I need to list and explore scenario definitions from my local AI so that I can understand what's available and find specific scenarios to analyze.

**Why this priority**: Core functionality - researchers need to discover and reference definitions when asking questions about runs and results.

**Independent Test**: Ask local AI "List all definitions", verify it returns definition names, version labels, and parent relationships.

**Acceptance Scenarios**:

1. **Given** I ask about definitions, **When** the AI calls `list_definitions`, **Then** I see id, name, version_label, parent_id, created_at for each
2. **Given** I filter by folder, **When** I specify a folder parameter, **Then** only definitions in that folder are returned
3. **Given** I set `include_children: true`, **When** results are returned, **Then** I see the full version tree for each definition
4. **Given** the response is returned, **When** I check the size, **Then** it's under 2KB as per token budget guidelines

---

### User Story 4 - Execute Ad-hoc GraphQL Queries (Priority: P1)

As a power user, I need to run custom GraphQL queries from my local AI so that I can explore data in ways not covered by pre-defined tools.

**Why this priority**: Core functionality - pre-defined tools can't cover all queries. GraphQL flexibility is essential for ad-hoc exploration and complex analysis questions.

**Independent Test**: Ask local AI to run a custom GraphQL query to find scenarios with highest variance, verify raw GraphQL response is returned.

**Acceptance Scenarios**:

1. **Given** I provide a valid GraphQL query, **When** the AI calls `graphql_query`, **Then** the raw response is returned
2. **Given** I provide variables, **When** the query uses them, **Then** parameterized queries work correctly
3. **Given** I ask a complex question, **When** the AI constructs a GraphQL query, **Then** it can introspect the schema to discover available fields
4. **Given** the query is invalid, **When** it's executed, **Then** I receive a clear error message (not a stack trace)
5. **Given** any GraphQL query, **When** it's authenticated, **Then** my API key's user context is applied

---

### User Story 5 - Get Dimension Analysis via MCP (Priority: P2)

As a researcher, I need to see which scenario dimensions drive model divergence so that I can understand what variables influence AI decision-making.

**Why this priority**: Important for experiment design - understanding which dimensions matter helps researchers focus future scenarios on impactful variables.

**Independent Test**: Ask local AI "Which dimensions matter most in run XYZ?", verify ranked dimensions with effect sizes are returned.

**Acceptance Scenarios**:

1. **Given** I ask about dimension impact, **When** the AI calls `get_dimension_analysis`, **Then** I see dimensions ranked by variance impact
2. **Given** the response includes correlations, **When** I examine it, **Then** I see how each dimension correlates with model scores
3. **Given** divisive dimensions exist, **When** I view results, **Then** dimensions where models disagree most are highlighted
4. **Given** the response is returned, **When** I check the size, **Then** it's under 2KB as per token budget guidelines

---

### User Story 6 - Get Transcript Summary (Priority: P2)

As a researcher, I need to get a summary of specific transcripts without retrieving full text so that I can investigate specific scenarios without overwhelming context.

**Why this priority**: Important for drilling down - when a researcher identifies an interesting scenario, they need details without raw transcript text (1-20KB each).

**Independent Test**: Ask for transcript summary by run_id/scenario_id/model, verify key reasoning points are returned.

**Acceptance Scenarios**:

1. **Given** I specify run_id, scenario_id, and model, **When** `get_transcript_summary` is called, **Then** I see turn_count, decision, word_count
2. **Given** the transcript has been summarized, **When** I request it, **Then** I see key_reasoning (LLM-extracted points)
3. **Given** the response is returned, **When** I check the size, **Then** it's under 1KB as per token budget guidelines
4. **Given** the transcript doesn't exist, **When** I request it, **Then** I get a clear "not found" error

---

### User Story 7 - Authentication via API Key (Priority: P1)

As an MCP client, I need to authenticate using my ValueRank API key so that my queries are authorized and tracked.

**Why this priority**: Core functionality - security requirement. MCP must use existing API key auth system for access control.

**Independent Test**: Configure MCP with API key, verify requests are authenticated and associated with correct user.

**Acceptance Scenarios**:

1. **Given** I configure MCP with X-API-Key header, **When** I make requests, **Then** they are authenticated
2. **Given** my API key is invalid, **When** I make a request, **Then** I receive 401 Unauthorized
3. **Given** my API key is valid, **When** I make requests, **Then** `last_used_at` is updated on the key record
4. **Given** the user has API key access, **When** they query via MCP, **Then** they see same data as web UI (public visibility)

---

### User Story 8 - Rate Limiting for MCP (Priority: P2)

As a system administrator, I need MCP endpoints to be rate-limited so that a misbehaving client can't overwhelm the system.

**Why this priority**: Important for stability - prevents accidental or intentional DoS. Internal team needs higher limits than would be typical for public APIs.

**Independent Test**: Make 150 requests per minute, verify rate limit kicks in around 120 requests.

**Acceptance Scenarios**:

1. **Given** I make requests at normal pace, **When** under 120/minute, **Then** all requests succeed
2. **Given** I exceed rate limit, **When** I make request #121, **Then** I receive 429 Too Many Requests
3. **Given** rate limit is hit, **When** the response is returned, **Then** it includes Retry-After header
4. **Given** I'm rate-limited, **When** I wait the retry period, **Then** my requests succeed again

---

## Edge Cases

### Authentication Edge Cases
- **No API key provided**: Return 401 with clear message "API key required in X-API-Key header"
- **Malformed API key**: Return 401 "Invalid API key format"
- **Revoked API key**: Return 401 "API key has been revoked"
- **Expired user session**: API keys don't expire, but if user is deleted, return 401

### Rate Limiting Edge Cases
- **Concurrent requests**: Each counts toward limit, no race conditions
- **Multiple API keys same user**: Each key has independent limit
- **Rate limit reset**: Window resets after 1 minute, not rolling
- **Headers always present**: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset

### Query Edge Cases
- **Empty results**: Return empty array with metadata, not error
- **Run not found**: Return 404 with clear error (not GraphQL error shape)
- **Analysis not ready**: Return status "pending" with estimated completion
- **Very large result set**: Enforce max limit (100), return pagination info

### Token Budget Edge Cases
- **Response exceeds budget**: Truncate with "...truncated, use pagination" message
- **Nested large objects**: Only include summary fields, not full nested data
- **Binary data**: Never include raw transcripts, only metadata/summaries
- **Correlation matrices**: Return top N only, indicate total available

### GraphQL Query Edge Cases
- **Schema introspection**: Allow, so AI can discover available types
- **Mutation attempted**: Reject with "MCP read tools are read-only"
- **Syntax error in query**: Return clear GraphQL error message
- **Query too complex**: Reject with depth/complexity limits

### MCP Protocol Edge Cases
- **Unsupported tool name**: Return error listing available tools
- **Missing required parameter**: Return error specifying which parameter
- **Invalid parameter type**: Return error with expected type
- **Timeout**: Set 30s timeout, return error if exceeded

---

## Functional Requirements

### MCP Server Setup
- **FR-001**: System MUST implement MCP server using `@modelcontextprotocol/sdk`
- **FR-002**: System MUST embed MCP server in the existing API process (not separate service)
- **FR-003**: System MUST expose MCP endpoint at `/mcp` path
- **FR-004**: System MUST support MCP protocol version 2024-11-05 or later
- **FR-005**: System MUST share database connection with main API

### Authentication
- **FR-006**: System MUST authenticate MCP requests via X-API-Key header
- **FR-007**: System MUST validate API key against `api_keys` table (hashed)
- **FR-008**: System MUST update `last_used_at` on successful authentication
- **FR-009**: System MUST reject unauthenticated requests with 401 status

### Rate Limiting
- **FR-010**: System MUST rate limit MCP endpoints to 120 requests per minute per API key
- **FR-011**: System MUST return 429 status when rate limit exceeded
- **FR-012**: System MUST include rate limit headers (Limit, Remaining, Reset)
- **FR-013**: System MUST use 1-minute sliding window for rate limit

### list_definitions Tool
- **FR-014**: Tool MUST return id, name, version_label, parent_id, created_at for each definition
- **FR-015**: Tool MUST support `folder` parameter for filtering
- **FR-016**: Tool MUST support `include_children` parameter (default: false)
- **FR-017**: Tool MUST exclude soft-deleted definitions (deleted_at IS NULL)
- **FR-018**: Tool response MUST be under 2KB

### list_runs Tool
- **FR-019**: Tool MUST return id, status, models, scenario_count, sample_percentage, created_at
- **FR-020**: Tool MUST support `definition_id` filter parameter
- **FR-021**: Tool MUST support `status` filter parameter (pending, running, completed, failed)
- **FR-022**: Tool MUST support `limit` parameter (default: 20, max: 100)
- **FR-023**: Tool response MUST be under 2KB

### get_run_summary Tool
- **FR-024**: Tool MUST return basic_stats with per-model win rates
- **FR-025**: Tool MUST return model_agreement with pairwise correlations
- **FR-026**: Tool MUST return outlier_models array
- **FR-027**: Tool MUST return most_contested_scenarios (top 5)
- **FR-028**: Tool MUST support `include_insights` parameter (default: true)
- **FR-029**: Tool MUST return llm_summary if available
- **FR-030**: Tool response MUST be under 5KB

### get_dimension_analysis Tool
- **FR-031**: Tool MUST return ranked_dimensions sorted by variance impact
- **FR-032**: Tool MUST return correlations for each dimension
- **FR-033**: Tool MUST return most_divisive dimensions
- **FR-034**: Tool response MUST be under 2KB

### get_transcript_summary Tool
- **FR-035**: Tool MUST accept run_id, scenario_id, and model parameters
- **FR-036**: Tool MUST return turn_count, decision, word_count
- **FR-037**: Tool MUST return key_reasoning (extracted/summarized points)
- **FR-038**: Tool MUST NOT return full transcript content
- **FR-039**: Tool response MUST be under 1KB

### graphql_query Tool
- **FR-040**: Tool MUST accept `query` string parameter (required)
- **FR-041**: Tool MUST accept `variables` object parameter (optional)
- **FR-042**: Tool MUST execute query against existing GraphQL schema
- **FR-043**: Tool MUST apply user context from API key authentication
- **FR-044**: Tool MUST reject mutation operations with clear error
- **FR-045**: Tool MUST allow schema introspection queries

### Token Budget Compliance
- **FR-046**: All tool responses MUST include size metadata (bytes, truncated flag)
- **FR-047**: System MUST truncate responses exceeding tool-specific limits
- **FR-048**: System MUST indicate when data is truncated with continuation hint

### Error Handling
- **FR-049**: System MUST return structured errors with code, message, and details
- **FR-050**: System MUST never expose stack traces in production
- **FR-051**: System MUST log all MCP requests with request_id for debugging

---

## Success Criteria

- **SC-001**: MCP tools callable from Claude Desktop with configured API key
- **SC-002**: All tool responses comply with token budget limits (measured in tests)
- **SC-003**: Authentication working with existing API key system
- **SC-004**: Rate limiting prevents more than 120 requests/minute per key
- **SC-005**: 80% code coverage on new MCP components (per constitution)
- **SC-006**: All new files under 400 lines (per constitution)
- **SC-007**: No `any` types in TypeScript code (per constitution)
- **SC-008**: Response latency under 2 seconds for all tools (typical usage)
- **SC-009**: GraphQL query tool can execute schema introspection

---

## Key Entities

### MCPToolResponse (new)
```
MCPToolResponse {
  data: unknown              // Tool-specific response data
  metadata: {
    bytes: number            // Response size in bytes
    truncated: boolean       // Whether data was truncated
    executionMs: number      // Time to execute
    requestId: string        // For correlation/debugging
  }
}
```

### MCPRateLimitInfo
```
MCPRateLimitInfo {
  limit: number              // Max requests per window (120)
  remaining: number          // Requests left in window
  reset: number              // Unix timestamp when window resets
}
```

### DefinitionListItem (response shape)
```
DefinitionListItem {
  id: string
  name: string
  versionLabel: string | null
  parentId: string | null
  createdAt: string          // ISO 8601
  childCount?: number        // If include_children
}
```

### RunListItem (response shape)
```
RunListItem {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  models: string[]
  scenarioCount: number
  samplePercentage: number | null
  createdAt: string          // ISO 8601
}
```

### RunSummary (response shape)
```
RunSummary {
  runId: string
  status: string
  basicStats: {
    modelCount: number
    transcriptCount: number
    perModel: {
      [modelId: string]: {
        sampleSize: number
        meanScore: number
        stdDev: number
      }
    }
  }
  modelAgreement: {
    averageCorrelation: number
    outlierModels: string[]
  }
  mostContestedScenarios: {
    scenarioId: string
    variance: number
  }[]
  insights?: string[]        // Auto-generated findings
  llmSummary?: string        // Natural language summary
  analysisStatus: 'pending' | 'completed' | 'failed'
}
```

### TranscriptSummary (response shape)
```
TranscriptSummary {
  runId: string
  scenarioId: string
  model: string
  turnCount: number
  wordCount: number
  decision: string | null
  keyReasoning: string[]     // Extracted key points
}
```

---

## Assumptions

1. **Stage 11 complete** - Analysis results exist for completed runs
2. **API key auth working** - Stage 4 auth system fully functional
3. **MCP SDK available** - `@modelcontextprotocol/sdk` package installable
4. **Embedded approach** - MCP server runs in same process as API (not sidecar)
5. **Claude Desktop MCP support** - Users have MCP-capable AI client configured
6. **No mutations** - This stage is read-only; write tools are Stage 14
7. **Transcript summaries available** - Some transcripts have been summarized (Stage 9)

---

## Dependencies

### Requires from Previous Stages
- API key authentication (Stage 4) - Complete
- GraphQL API with all queries (Stage 3+) - Complete
- Analysis results stored (Stage 11) - Complete
- Transcript summaries (Stage 9) - Complete

### External Dependencies
- `@modelcontextprotocol/sdk` - MCP TypeScript SDK
- Rate limiting library (or custom implementation using existing patterns)

### New Backend Requirements
- MCP server initialization and endpoint
- MCP tool implementations (7 tools)
- Rate limiting middleware for MCP path
- Token budget enforcement utilities
- Response size monitoring

---

## Constitution Validation

### Compliance Check

| Requirement | Status | Notes |
|-------------|--------|-------|
| Files < 400 lines | PASS | Spec splits into focused tool handlers |
| No `any` types | PASS | SC-007 explicitly requires this |
| Test coverage 80% minimum | PASS | SC-005 explicitly requires this |
| Structured logging | PASS | FR-051 requires request logging |
| Type safety | PASS | TypeScript strict mode, typed tool params |
| Custom error classes | PASS | Will use existing AppError pattern |

### Folder Structure Compliance
Per constitution, should follow:
```
apps/api/src/
├── mcp/
│   ├── index.ts              # MCP server setup, endpoint registration
│   ├── server.ts             # Server initialization
│   ├── auth.ts               # API key auth for MCP
│   ├── rate-limit.ts         # Rate limiting for MCP
│   └── tools/
│       ├── index.ts          # Tool registry
│       ├── list-definitions.ts
│       ├── list-runs.ts
│       ├── get-run-summary.ts
│       ├── get-dimension-analysis.ts
│       ├── get-transcript-summary.ts
│       └── graphql-query.ts
├── services/
│   └── mcp/
│       ├── index.ts          # Re-exports
│       ├── response-builder.ts  # Token-budget-aware formatting
│       └── truncation.ts     # Response size utilities
```

**VALIDATION RESULT: PASS** - Spec addresses all constitutional requirements.

---

## Out of Scope

- MCP write tools (Stage 14)
- MCP resources (authoring guides, examples) - Stage 14
- Compare runs tool (`compare_runs`) - Stage 13
- Data science tools (`aggregate_custom`, `compare_cohorts`) - Future
- Latency stats tool (`get_latency_stats`) - Future
- Export tool (`export_for_analysis`) - Stage 15
- Model profile tool (`get_model_profile`) - Future
- Search scenarios tool (`search_scenarios`) - Future
- SSE/streaming for long-running operations - Future
- Separate MCP sidecar deployment - Future scaling consideration

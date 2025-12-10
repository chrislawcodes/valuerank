# Implementation Plan: Stage 14 - MCP Write Tools

**Branch**: `feature/stage-14-mcp-write-tools` | **Date**: 2025-12-08 | **Spec**: [spec.md](./spec.md)

## Summary

Enable AI agents to author scenario definitions and trigger runs via MCP. The implementation wraps existing GraphQL mutations (createDefinition, forkDefinition, startRun) with MCP tool handlers, adds validation tooling, and provides static authoring resources for AI guidance. Extends the Stage 12 MCP infrastructure with write capabilities.

---

## Technical Context

**Language/Version**: TypeScript 5.3+ (Node 20+)
**Primary Dependencies**:
- `@modelcontextprotocol/sdk` (already installed for Stage 12)
- `zod` for input validation
- Existing `@valuerank/db`, `@valuerank/shared`

**Storage**: PostgreSQL via Prisma (no schema changes required)
**Testing**: Vitest with 80% minimum coverage requirement
**Target Platform**: Docker + Railway (same as existing API)
**Performance Goals**: Write operations < 2 seconds (per spec SC-012)
**Constraints**: Rate limit 120 req/min per API key (existing)

---

## Constitution Check

**Status**: PASS

### File Size Limits (Constitution § File Size Limits)
- [x] All new tool handlers < 400 lines
- [x] Split resources into separate files
- [x] Validation utilities in dedicated module

### TypeScript Standards (Constitution § TypeScript Standards)
- [x] No `any` types - strict typing required
- [x] Typed inputs using Zod schemas
- [x] Explicit function signatures

### Testing Requirements (Constitution § Testing Requirements)
- [x] 80% minimum line coverage on new code
- [x] Unit tests for each tool handler
- [x] Integration tests for MCP write flow
- [x] Mock database and external services

### Logging Standards (Constitution § Logging Standards)
- [x] Structured logging via `createLogger`
- [x] Audit logging for all write operations
- [x] Request correlation via requestId

### Soft Delete Pattern (Constitution § Database Access)
- [x] Validate definition not soft-deleted before fork
- [x] Filter `deletedAt: null` in all queries

**Violations/Notes**: None - all constitutional requirements addressed.

---

## Architecture Decisions

### Decision 1: Wrap Existing GraphQL Mutations

**Chosen**: MCP tools delegate to existing mutation resolvers/services, not duplicate logic.

**Rationale**:
- DRY principle - mutation logic already exists and is tested
- Consistency - MCP and GraphQL behave identically
- Maintenance - single source of truth for business logic

**Alternatives Considered**:
- Direct database calls from MCP: Rejected - duplicates validation/audit logic
- New MCP-specific services: Rejected - unnecessary abstraction layer

**Tradeoffs**:
- Pros: Less code, guaranteed consistency, full test coverage reuse
- Cons: Slight coupling to GraphQL layer (acceptable for internal tool)

---

### Decision 2: Static Bundled Resources (Not Database)

**Chosen**: Authoring resources bundled as TypeScript modules, not stored in database.

**Rationale**:
- Resources are curated content, not user data
- Simplifies deployment - no migration needed
- Version controlled with code
- Existing pattern in codebase (values rubric, model list)

**Alternatives Considered**:
- Database storage: Rejected - adds complexity, resources rarely change
- External files (JSON/YAML): Rejected - TypeScript provides type safety

**Tradeoffs**:
- Pros: Simple, version controlled, type-safe
- Cons: Requires code deploy to update (acceptable for curated content)

---

### Decision 3: Validation-First Tool Pattern

**Chosen**: `validate_definition` tool that runs same logic as `create_definition` but doesn't persist.

**Rationale**:
- AI agents benefit from "dry run" capability
- Prevents wasted attempts with malformed content
- Returns estimated scenario count for planning

**Alternatives Considered**:
- Validate inline only: Rejected - AI can't preview before commit
- Separate validation library: Rejected - over-engineering for internal tool

**Tradeoffs**:
- Pros: Better AI UX, preview before commit
- Cons: Some code path duplication (mitigated by shared validation utilities)

---

### Decision 4: Reuse Existing Services

**Chosen**: Call `startRunService`, `queueScenarioExpansion`, and existing DB utilities.

**Rationale**:
- Services already handle job queuing, validation, error handling
- Test coverage already exists
- Consistent behavior across GraphQL and MCP

**Files to Reuse**:
- `apps/api/src/services/run/index.ts` - startRunService
- `apps/api/src/services/scenario/index.ts` - scenario expansion
- `apps/api/src/graphql/mutations/definition.ts` - validation patterns

---

## Project Structure

### Existing Structure (Stage 12)

```
apps/api/src/
├── mcp/
│   ├── index.ts              # MCP route registration
│   ├── server.ts             # McpServer singleton
│   ├── auth.ts               # API key authentication
│   ├── rate-limit.ts         # Rate limiting middleware
│   └── tools/
│       ├── index.ts          # Tool registration
│       ├── registry.ts       # ToolRegistrar pattern
│       ├── list-definitions.ts
│       ├── list-runs.ts
│       ├── get-run-summary.ts
│       ├── get-dimension-analysis.ts
│       ├── get-transcript-summary.ts
│       └── graphql-query.ts
├── services/
│   └── mcp/
│       ├── index.ts          # Re-exports
│       ├── response.ts       # Token budget utilities
│       └── formatters.ts     # Response formatters
```

### New Files for Stage 14

```
apps/api/src/
├── mcp/
│   ├── server.ts             # Update: Add resources capability
│   └── tools/
│       ├── create-definition.ts    # NEW: Create definition via MCP
│       ├── fork-definition.ts      # NEW: Fork definition via MCP
│       ├── validate-definition.ts  # NEW: Validation preview
│       ├── start-run.ts            # NEW: Start run via MCP
│       └── generate-scenarios-preview.ts  # NEW: Preview scenarios
├── resources/                      # NEW: MCP resources directory
│   ├── index.ts                    # Resource registry
│   ├── authoring-guide.ts          # valuerank://authoring/guide
│   ├── authoring-examples.ts       # valuerank://authoring/examples
│   ├── value-pairs.ts              # valuerank://authoring/value-pairs
│   └── preamble-templates.ts       # valuerank://authoring/preamble-templates
├── services/
│   └── mcp/
│       ├── validation.ts           # NEW: Shared validation utilities
│       └── audit.ts                # NEW: Audit logging service
```

### New Test Files

```
apps/api/tests/
├── mcp/
│   └── tools/
│       ├── create-definition.test.ts
│       ├── fork-definition.test.ts
│       ├── validate-definition.test.ts
│       ├── start-run.test.ts
│       └── generate-scenarios-preview.test.ts
│   └── resources/
│       └── index.test.ts           # Resource access tests
├── services/
│   └── mcp/
│       ├── validation.test.ts
│       └── audit.test.ts
```

---

## Implementation Details

### 1. MCP Server Update

Update `server.ts` to enable resources capability:

```typescript
// server.ts - Add resources capability
const server = new McpServer(
  { name: 'valuerank-mcp', version: '1.0.0' },
  {
    capabilities: {
      tools: {},
      resources: {},  // NEW: Enable resources
    },
    instructions: `...updated instructions mentioning write tools and resources...`,
  }
);
```

### 2. Tool Input Schemas (Zod)

Define input schemas matching spec FR-006 through FR-039:

```typescript
// create-definition.ts
const CreateDefinitionInputSchema = {
  name: z.string().min(1).max(255).describe('Definition name'),
  content: z.object({
    preamble: z.string().describe('Instructions for AI being evaluated'),
    template: z.string().max(10000).describe('Scenario body with [placeholders]'),
    dimensions: z.array(DimensionSchema).max(10).describe('Variable dimensions'),
    matching_rules: z.string().optional().describe('Scenario generation rules'),
  }),
  folder: z.string().optional().describe('Organization folder'),
  tags: z.array(z.string()).optional().describe('Tag names'),
};
```

### 3. Write Tool Pattern

Each write tool follows this pattern:

```typescript
async function handleCreateDefinition(args, extra) {
  const requestId = String(extra.requestId ?? crypto.randomUUID());
  const userId = await getUserFromContext(extra);  // From API key auth

  // 1. Validate input
  const validation = await validateDefinitionContent(args.content);
  if (!validation.valid) {
    return formatError('VALIDATION_ERROR', validation.errors);
  }

  // 2. Delegate to existing service/mutation logic
  const definition = await createDefinitionViaService({
    name: args.name,
    content: args.content,
    // ...
  });

  // 3. Audit log
  await auditLog({
    action: 'create_definition',
    userId,
    entityId: definition.id,
    entityType: 'definition',
    requestId,
  });

  // 4. Return MCP-formatted response
  return formatWriteResult({
    entityId: definition.id,
    entityType: 'definition',
    warnings: validation.warnings,
  });
}
```

### 4. Validation Utilities

Shared validation service for both `validate_definition` and `create_definition`:

```typescript
// services/mcp/validation.ts
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  estimatedScenarioCount?: number;
  dimensionCoverage?: DimensionCoverage;
}

export async function validateDefinitionContent(
  content: DefinitionContent
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // FR-040: max_dimensions: 10
  if (content.dimensions.length > 10) {
    errors.push({ field: 'dimensions', message: 'Maximum 10 dimensions allowed' });
  }

  // FR-041: max_levels_per_dimension: 10
  for (const dim of content.dimensions) {
    if (dim.levels.length > 10) {
      errors.push({ field: `dimensions.${dim.name}`, message: 'Maximum 10 levels per dimension' });
    }
  }

  // FR-042: max_template_length: 10000
  if (content.template.length > 10000) {
    errors.push({ field: 'template', message: 'Template must be 10000 characters or less' });
  }

  // Calculate scenario count
  const scenarioCount = calculateScenarioCombinations(content.dimensions);

  // FR-043: max_scenarios: 1000
  if (scenarioCount > 1000) {
    errors.push({ field: 'dimensions', message: `Would generate ${scenarioCount} scenarios (max 1000)` });
  }

  // Warnings
  if (!content.template.includes('[')) {
    warnings.push({ field: 'template', message: 'Template has no [placeholders]' });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    estimatedScenarioCount: scenarioCount,
    dimensionCoverage: calculateDimensionCoverage(content.dimensions),
  };
}
```

### 5. Audit Logging

Simple audit logging to structured logs (per FR-052 through FR-055):

```typescript
// services/mcp/audit.ts
import { createLogger } from '@valuerank/shared';

const auditLog = createLogger('mcp:audit');

export interface AuditEntry {
  action: 'create_definition' | 'fork_definition' | 'start_run';
  userId: string;
  entityId: string;
  entityType: string;
  requestId: string;
  metadata?: Record<string, unknown>;
}

export function logAuditEvent(entry: AuditEntry): void {
  auditLog.info(entry, `MCP write: ${entry.action}`);
}
```

Note: Audit events are logged to structured logs. A future enhancement could persist to database table for querying via GraphQL.

### 6. Resource Implementation

Resources are static content exposed via MCP resource protocol:

```typescript
// resources/authoring-guide.ts
export const AUTHORING_GUIDE_URI = 'valuerank://authoring/guide';

export const authoringGuideContent = `
# ValueRank Scenario Authoring Guide

## Structure

Every scenario definition has:
- **Preamble**: Instructions for the AI being evaluated
- **Template**: The scenario body with [placeholder] variables
- **Dimensions**: Variables that create scenario variants

## Best Practices

### Genuine Tradeoffs
Create scenarios where both options have valid justifications...

### Concrete Stakes
Use specific, measurable consequences...

### Neutral Language
Avoid value-laden framing that biases responses...

## Dimension Design

Good dimensions have:
- Clear, distinct levels
- Impact on the moral reasoning
- Non-overlapping values

## Common Pitfalls

1. Leading questions
2. Unrealistic scenarios
3. Single "right" answer
4. Ambiguous placeholders
`;

export function registerAuthoringGuideResource(server: McpServer): void {
  server.registerResource(
    AUTHORING_GUIDE_URI,
    {
      name: 'Scenario Authoring Guide',
      description: 'Best practices for writing effective moral dilemmas',
      mimeType: 'text/markdown',
    },
    () => ({
      contents: [
        {
          uri: AUTHORING_GUIDE_URI,
          mimeType: 'text/markdown',
          text: authoringGuideContent,
        },
      ],
    })
  );
}
```

---

## Integration Points

### Existing Services Used

| Service | Location | Usage in Stage 14 |
|---------|----------|-------------------|
| startRunService | `services/run/index.ts` | start_run tool delegates to this |
| queueScenarioExpansion | `services/scenario/index.ts` | Called after definition creation |
| getSupportedModels | `services/providers/index.ts` | Validate model names in start_run |
| createLogger | `@valuerank/shared` | All logging |
| db | `@valuerank/db` | Database access via Prisma |

### Existing Utilities Reused

| Utility | Location | Purpose |
|---------|----------|---------|
| buildMcpResponse | `services/mcp/response.ts` | Response formatting |
| truncateArray | `services/mcp/response.ts` | Token budget enforcement |
| addToolRegistrar | `mcp/tools/registry.ts` | Tool registration pattern |
| ensureSchemaVersion | `graphql/mutations/definition.ts` | Content schema versioning |

---

## Error Handling

### Error Response Format

```typescript
interface McpErrorResponse {
  error: string;      // Error code: VALIDATION_ERROR, NOT_FOUND, etc.
  message: string;    // Human-readable message
  details?: {         // Field-level errors for validation
    field: string;
    message: string;
  }[];
}
```

### Error Codes

| Code | HTTP-equivalent | Usage |
|------|-----------------|-------|
| VALIDATION_ERROR | 400 | Invalid input structure or content |
| NOT_FOUND | 404 | Definition/run not found |
| AUTHENTICATION_ERROR | 401 | Missing or invalid API key |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Unexpected errors (logged, not exposed) |

---

## Testing Strategy

### Unit Tests

Each tool handler tested in isolation:
- Valid inputs → success response
- Invalid inputs → validation errors
- Missing required fields → clear error messages
- Edge cases (max limits, empty arrays)

### Integration Tests

End-to-end MCP flow:
- Authenticate via API key
- Call write tool
- Verify database state
- Verify audit log entry

### Mocking Strategy

```typescript
// Mock database
vi.mock('@valuerank/db', () => ({
  db: {
    definition: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    run: {
      create: vi.fn(),
    },
  },
}));

// Mock PgBoss (job queue)
vi.mock('../../queue/boss.js', () => ({
  getBoss: vi.fn().mockReturnValue({
    send: vi.fn().mockResolvedValue('mock-job-id'),
  }),
}));
```

---

## Dependencies

### No New External Dependencies

All required packages already installed:
- `@modelcontextprotocol/sdk` (Stage 12)
- `zod` (existing validation)
- `pino` (logging via @valuerank/shared)

### Internal Dependencies

- Stage 12 MCP infrastructure (complete)
- Stage 9 run creation service (complete)
- Stage 8 definition mutations (complete)
- Stage 9 scenario generation (complete)

---

## Rollout Plan

### Phase 1: Write Tools (Core)
1. `create_definition` tool
2. `fork_definition` tool
3. `validate_definition` tool
4. `start_run` tool

### Phase 2: Preview & Resources
5. `generate_scenarios_preview` tool
6. Authoring resources (guide, examples, value-pairs, preamble-templates)

### Phase 3: Polish
7. Update MCP server instructions
8. Documentation updates
9. Manual testing with Claude Desktop

---

## Risk Assessment

### Low Risk
- **Reusing existing services**: Mutations already tested, MCP is thin wrapper
- **No schema changes**: Uses existing tables and relationships
- **Static resources**: No deployment complexity

### Medium Risk
- **Resource content quality**: Authoring guide effectiveness depends on content
  - Mitigation: Iterate based on AI agent feedback

### Monitoring
- Audit logs track all write operations
- Existing error logging captures failures
- Rate limiting prevents abuse

---

## Out of Scope

- `compare_runs` tool (Stage 13 is DEFERRED)
- `create_experiment` tool (Stage 10 is DEFERRED)
- Persisted audit table (future enhancement - logs sufficient for MVP)
- Real-time progress for long operations (future)
- Batch operations (future)

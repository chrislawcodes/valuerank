# Feature Specification: Stage 14 - MCP Write Tools

> **Feature #010** | Branch: `feature/stage-14-mcp-write-tools`
> **Created**: 2025-12-08
> **Status**: Draft
> **Dependencies**: Stage 12 (MCP Read Tools) - Complete

## Overview

Enable AI agents to author scenario definitions and trigger evaluation runs via MCP write tools. This stage transforms the MCP interface from read-only data exploration to full interactive experimentation, allowing local AI chat clients (Claude Desktop, Cursor, etc.) to create definitions, fork existing scenarios, validate content, and start runs.

**Input Description**: Write tools (`create_definition`, `fork_definition`, `validate_definition`, `start_run`, `generate_scenarios_preview`), authoring resources (scenario guide, examples, value tension pairs, preamble templates), validation for AI-generated content, audit logging for all write operations.

**Phase 5 Completion**: This stage completes Phase 5 - AI-assisted scenario authoring becomes available to the team.

---

## User Stories & Testing

### User Story 1 - Create Definition via MCP (Priority: P1)

As a researcher using Claude Desktop, I need to create new scenario definitions through conversation with my local AI so that I can rapidly prototype moral dilemmas without manually using the web UI.

**Why this priority**: Core functionality - the primary value of MCP write tools is enabling conversational scenario authoring. This is the foundational capability all other write operations build upon.

**Independent Test**: Ask local AI "Create a new scenario definition about autonomous vehicles and the trolley problem", verify the definition is created in the database with valid structure.

**Acceptance Scenarios**:

1. **Given** I describe a scenario concept, **When** the AI calls `create_definition`, **Then** a new definition is created with id, name, and content
2. **Given** I provide preamble, template, and dimensions, **When** the definition is created, **Then** all fields are stored correctly
3. **Given** I omit optional fields, **When** the definition is created, **Then** sensible defaults are applied
4. **Given** the content has validation errors, **When** creation is attempted, **Then** a clear error explains what's wrong
5. **Given** creation succeeds, **When** I receive the response, **Then** it includes definition_id and any validation_warnings

---

### User Story 2 - Fork Definition via MCP (Priority: P1)

As a researcher, I need to fork existing definitions through conversation so that I can iterate on scenarios by making controlled changes to proven templates.

**Why this priority**: Core functionality - forking is the primary way researchers iterate on scenarios. The version tree is central to the experiment workflow.

**Independent Test**: Ask local AI "Fork definition X and change the severity dimension to have more extreme values", verify child definition is created with parent_id linking to original.

**Acceptance Scenarios**:

1. **Given** I specify a parent definition, **When** the AI calls `fork_definition`, **Then** a child definition is created with parent_id set
2. **Given** I provide partial changes, **When** the fork is created, **Then** only specified fields are changed, others inherited
3. **Given** the fork is created, **When** I query the version tree, **Then** the new definition appears as a child
4. **Given** I provide a version_label, **When** the fork is created, **Then** it has a human-readable label
5. **Given** the parent doesn't exist, **When** fork is attempted, **Then** a clear "not found" error is returned

---

### User Story 3 - Validate Definition Before Saving (Priority: P1)

As a researcher, I need to validate definition content before saving so that I can catch errors early and understand the generated scenario count.

**Why this priority**: Core functionality - validation prevents bad data and helps researchers understand what they're creating. Essential for AI-assisted authoring where the AI might make structural mistakes.

**Independent Test**: Ask local AI to validate a definition with invalid dimension structure, verify clear error messages are returned.

**Acceptance Scenarios**:

1. **Given** I provide valid content, **When** `validate_definition` is called, **Then** response shows valid: true
2. **Given** content has structural errors, **When** validation runs, **Then** specific errors are returned (e.g., "dimension 'stakes' missing 'levels' array")
3. **Given** content has warnings (not errors), **When** validation runs, **Then** warnings are returned but valid: true
4. **Given** validation succeeds, **When** response is returned, **Then** estimated_scenario_count shows how many scenarios will be generated
5. **Given** validation succeeds, **When** response is returned, **Then** dimension_coverage shows dimension combination analysis

---

### User Story 4 - Start Run via MCP (Priority: P1)

As a researcher, I need to start evaluation runs through conversation so that I can test scenarios against AI models without leaving my local AI chat.

**Why this priority**: Core functionality - the end-to-end workflow requires starting runs. Without this, researchers create definitions but can't execute them via MCP.

**Independent Test**: Ask local AI "Start a run for definition X using GPT-4 and Claude", verify run is queued and run_id is returned.

**Acceptance Scenarios**:

1. **Given** I specify definition_id and models, **When** `start_run` is called, **Then** a run is created and jobs are queued
2. **Given** the run is created, **When** response is returned, **Then** it includes run_id, queued_task_count, and estimated_cost
3. **Given** I specify sample_percentage, **When** run is created, **Then** only that percentage of scenarios are included
4. **Given** the definition doesn't exist, **When** run is attempted, **Then** a clear "definition not found" error is returned
5. **Given** an invalid model is specified, **When** run is attempted, **Then** an error lists valid model options
6. **Given** the run is queued, **When** I check progress via read tools, **Then** I can monitor the run status

---

### User Story 5 - Preview Generated Scenarios (Priority: P2)

As a researcher, I need to preview what scenarios will be generated from a definition before starting a run so that I can verify the combinations make sense.

**Why this priority**: Important for quality - researchers need to see exactly what scenarios will be created from dimensions. Prevents wasted runs on malformed definitions.

**Independent Test**: Ask local AI to preview scenarios for a definition, verify sample scenarios are returned with dimension values.

**Acceptance Scenarios**:

1. **Given** I provide a definition_id, **When** `generate_scenarios_preview` is called, **Then** I see scenario_count and sample scenarios
2. **Given** preview is returned, **When** I examine it, **Then** each sample shows id, subject, and dimension_values
3. **Given** the definition has many scenarios, **When** preview is returned, **Then** only a representative sample is shown (e.g., 5)
4. **Given** preview includes sample_body, **When** I examine it, **Then** the first scenario's full text is visible for verification

---

### User Story 6 - Access Authoring Resources (Priority: P2)

As an AI agent authoring scenarios, I need access to authoring guides and examples so that I can create well-formed, effective moral dilemmas.

**Why this priority**: Important for quality - AI agents need context on what makes a good scenario. Without resources, AI-generated scenarios may be structurally valid but poorly designed.

**Independent Test**: Request the authoring guide resource, verify it contains best practices and examples.

**Acceptance Scenarios**:

1. **Given** I request `valuerank://authoring/guide`, **When** resource is returned, **Then** I see structure, best practices, and common pitfalls
2. **Given** I request `valuerank://authoring/examples`, **When** resource is returned, **Then** I see 3-5 annotated example definitions
3. **Given** I request `valuerank://authoring/value-pairs`, **When** resource is returned, **Then** I see common value tension pairs with explanations
4. **Given** I request `valuerank://authoring/preamble-templates`, **When** resource is returned, **Then** I see tested preamble patterns

---

### User Story 7 - Audit Trail for Write Operations (Priority: P2)

As a system administrator, I need all write operations logged with user context so that I can track who created what and when.

**Why this priority**: Important for governance - write operations modify system state. Team needs visibility into who is creating definitions and starting runs.

**Independent Test**: Create a definition via MCP, verify audit log includes user_id, action, timestamp, and entity_id.

**Acceptance Scenarios**:

1. **Given** any write operation, **When** it succeeds, **Then** an audit log entry is created
2. **Given** the audit log entry, **When** I examine it, **Then** I see user_id (from API key), action, entity_id, timestamp
3. **Given** write operations, **When** I query audit logs, **Then** I can filter by user, action type, or date range
4. **Given** a write operation fails, **When** logging occurs, **Then** the failure is logged with error details

---

### User Story 8 - Input Validation and Sanitization (Priority: P1)

As a security-conscious developer, I need AI-generated content to be validated and sanitized so that malformed or malicious content cannot corrupt the database or cause errors.

**Why this priority**: Core functionality - AI-generated content cannot be trusted implicitly. All inputs must be validated for structure, size limits, and content safety.

**Independent Test**: Attempt to create a definition with oversized content or invalid structure, verify it's rejected with clear errors.

**Acceptance Scenarios**:

1. **Given** content exceeds max_template_length (10000 chars), **When** validation runs, **Then** an error explains the limit
2. **Given** dimensions exceed max_dimensions (10), **When** validation runs, **Then** an error explains the limit
3. **Given** levels exceed max_levels_per_dimension (10), **When** validation runs, **Then** an error explains the limit
4. **Given** scenarios exceed max_scenarios_per_definition (1000), **When** validation runs, **Then** an error explains the limit
5. **Given** content has malformed JSON structure, **When** validation runs, **Then** specific parsing errors are returned
6. **Given** template has unmatched placeholders, **When** validation runs, **Then** a warning lists undefined placeholders

---

## Edge Cases

### Authentication Edge Cases
- **Write without API key**: Return 401 "API key required"
- **Read-only API key**: Return 403 "API key does not have write permissions" (future enhancement)
- **Rate limit exceeded**: Return 429 with Retry-After header

### Create Definition Edge Cases
- **Empty name**: Return error "name is required"
- **Duplicate name**: Allow (names are not unique, but warn if similar exists)
- **Empty dimensions array**: Return error "at least one dimension required"
- **Template without placeholders**: Warn "template has no [placeholders]"
- **Dimension with no levels**: Return error "dimension X must have at least 2 levels"

### Fork Definition Edge Cases
- **Fork from non-existent parent**: Return 404 "parent definition not found"
- **Fork from soft-deleted definition**: Return 404 "parent definition not found"
- **Circular fork attempt**: N/A - parent_id is immutable, can't create cycles
- **Fork with empty changes**: Warn "no changes specified, creating exact copy"
- **Deep fork chain**: Allow (no depth limit), track full lineage

### Start Run Edge Cases
- **Definition has no scenarios generated**: Generate scenarios on-demand, then queue
- **Zero models specified**: Return error "at least one model required"
- **All models invalid**: Return error listing valid model options
- **Some models invalid**: Return error, don't start partial run
- **Sample percentage 0 or >100**: Return validation error with valid range
- **Run already in progress for definition**: Allow (multiple concurrent runs permitted)

### Validation Edge Cases
- **Content exceeds all limits**: Return all errors, not just first one
- **Nested dimension references**: Validate placeholder resolution works
- **Unicode in template**: Allow, validate encoding is valid UTF-8
- **Very large dimension combinations**: Warn if >1000 scenarios would be generated

### Resource Edge Cases
- **Unknown resource URI**: Return 404 with list of available resources
- **Resource content updated**: Return latest version (resources are read-only)

---

## Functional Requirements

### MCP Write Tool Infrastructure
- **FR-001**: System MUST extend existing MCP server with write tool capabilities
- **FR-002**: System MUST use same authentication as read tools (X-API-Key header)
- **FR-003**: System MUST apply same rate limiting to write tools (120 req/min per key)
- **FR-004**: System MUST log all write operations with user context and timestamps
- **FR-005**: System MUST validate all inputs before database operations

### create_definition Tool
- **FR-006**: Tool MUST accept `name` (string, required)
- **FR-007**: Tool MUST accept `content` object with preamble, template, dimensions
- **FR-008**: Tool MUST accept optional `folder` for organization
- **FR-009**: Tool MUST accept optional `tags` array for categorization
- **FR-010**: Tool MUST validate content structure before creating
- **FR-011**: Tool MUST return definition_id and validation_warnings on success
- **FR-012**: Tool MUST reject content exceeding validation limits (see FR-035-038)

### fork_definition Tool
- **FR-013**: Tool MUST accept `parent_id` (string, required)
- **FR-014**: Tool MUST accept `name` (string, required)
- **FR-015**: Tool MUST accept `changes` object (partial content update)
- **FR-016**: Tool MUST accept optional `version_label` for human readability
- **FR-017**: Tool MUST set parent_id on new definition
- **FR-018**: Tool MUST merge changes with parent content (changes override parent)
- **FR-019**: Tool MUST return definition_id and diff_summary on success

### validate_definition Tool
- **FR-020**: Tool MUST accept `content` object (same structure as create)
- **FR-021**: Tool MUST return `valid` boolean
- **FR-022**: Tool MUST return `errors` array (blocking issues)
- **FR-023**: Tool MUST return `warnings` array (non-blocking suggestions)
- **FR-024**: Tool MUST return `estimated_scenario_count` on success
- **FR-025**: Tool MUST return `dimension_coverage` analysis on success
- **FR-026**: Tool MUST NOT save anything to database

### start_run Tool
- **FR-027**: Tool MUST accept `definition_id` (string, required)
- **FR-028**: Tool MUST accept `models` (string array, required)
- **FR-029**: Tool MUST accept optional `sample_percentage` (1-100, default 100)
- **FR-030**: Tool MUST accept optional `sample_seed` for reproducibility
- **FR-031**: Tool MUST validate definition exists and is not soft-deleted
- **FR-032**: Tool MUST validate all specified models are supported
- **FR-033**: Tool MUST return run_id, queued_task_count, estimated_cost on success
- **FR-034**: Tool MUST queue probe_scenario jobs for all model-scenario pairs

### generate_scenarios_preview Tool
- **FR-035**: Tool MUST accept `definition_id` (string, required)
- **FR-036**: Tool MUST return `scenario_count` (total scenarios that would be generated)
- **FR-037**: Tool MUST return `scenarios` array (sample of 5 scenarios with dimension values)
- **FR-038**: Tool MUST return `sample_body` (full text of first scenario)
- **FR-039**: Tool MUST NOT save scenarios to database

### Validation Limits
- **FR-040**: System MUST enforce max_dimensions: 10
- **FR-041**: System MUST enforce max_levels_per_dimension: 10
- **FR-042**: System MUST enforce max_template_length: 10000 characters
- **FR-043**: System MUST enforce max_scenarios_per_definition: 1000

### Authoring Resources
- **FR-044**: System MUST expose MCP resource `valuerank://authoring/guide`
- **FR-045**: System MUST expose MCP resource `valuerank://authoring/examples`
- **FR-046**: System MUST expose MCP resource `valuerank://authoring/value-pairs`
- **FR-047**: System MUST expose MCP resource `valuerank://authoring/preamble-templates`
- **FR-048**: Resources MUST be read-only (no modification via MCP)
- **FR-049**: Guide resource MUST include structure, best practices, dimension design, common pitfalls
- **FR-050**: Examples resource MUST include 3-5 annotated real definitions
- **FR-051**: Value-pairs resource MUST list common value tensions with scenario suggestions

### Audit Logging
- **FR-052**: System MUST log create_definition operations with user_id, definition_id, timestamp
- **FR-053**: System MUST log fork_definition operations with user_id, parent_id, new_id, timestamp
- **FR-054**: System MUST log start_run operations with user_id, definition_id, run_id, models, timestamp
- **FR-055**: Audit logs MUST be queryable via GraphQL (admin use)

### Error Handling
- **FR-056**: System MUST return structured errors with code, message, and field-level details
- **FR-057**: System MUST validate all inputs before any database writes
- **FR-058**: System MUST rollback partial operations on failure (transactional)
- **FR-059**: System MUST never expose internal stack traces

---

## Success Criteria

- **SC-001**: AI agents can create definitions via MCP `create_definition` tool
- **SC-002**: AI agents can fork definitions via MCP `fork_definition` tool
- **SC-003**: AI agents can validate content before saving via `validate_definition`
- **SC-004**: AI agents can start runs via MCP `start_run` tool
- **SC-005**: AI agents can preview generated scenarios before running
- **SC-006**: Authoring resources accessible via MCP resource protocol
- **SC-007**: All write operations logged with user context
- **SC-008**: Input validation prevents malformed content from being saved
- **SC-009**: 80% code coverage on new MCP write components (per constitution)
- **SC-010**: All new files under 400 lines (per constitution)
- **SC-011**: No `any` types in TypeScript code (per constitution)
- **SC-012**: Response latency under 2 seconds for write operations (typical)

---

## Key Entities

### CreateDefinitionInput
```
CreateDefinitionInput {
  name: string              // Required, human-readable name
  folder?: string           // Optional organization folder
  content: {                // Required
    preamble: string        // Instructions for AI being evaluated
    template: string        // Scenario body with [placeholders]
    dimensions: Dimension[] // Variable dimensions
    matchingRules?: string  // Optional scenario generation rules
  }
  tags?: string[]           // Optional tag names
}
```

### ForkDefinitionInput
```
ForkDefinitionInput {
  parentId: string          // Required, ID of definition to fork
  name: string              // Required, name for new definition
  versionLabel?: string     // Optional human-readable label
  changes: {                // Partial content - only fields to change
    preamble?: string
    template?: string
    dimensions?: Dimension[]
    matchingRules?: string
  }
}
```

### StartRunInput
```
StartRunInput {
  definitionId: string      // Required
  models: string[]          // Required, at least one
  samplePercentage?: number // 1-100, default 100
  sampleSeed?: number       // For reproducibility
}
```

### ValidationResult
```
ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  estimatedScenarioCount?: number  // Only if valid
  dimensionCoverage?: {            // Only if valid
    dimensions: number
    totalCombinations: number
    uniqueScenarios: number
  }
}
```

### WriteOperationResult
```
WriteOperationResult {
  success: boolean
  entityId: string          // ID of created/modified entity
  entityType: string        // 'definition', 'run', etc.
  warnings?: string[]       // Non-blocking issues
}
```

### ScenarioPreview
```
ScenarioPreview {
  scenarioCount: number
  scenarios: {
    id: string
    subject: string
    dimensionValues: Record<string, string>
  }[]
  sampleBody: string        // Full text of first scenario
}
```

---

## Assumptions

1. **Stage 12 complete** - MCP read tools infrastructure exists and works
2. **API key auth working** - Stage 4 auth system fully functional
3. **Scenario generation working** - Stage 9 scenario expansion logic exists
4. **Run execution working** - Stage 9 run creation and job queuing works
5. **Definition CRUD working** - Stage 8 definition mutations exist in GraphQL
6. **Single tenant** - No multi-user permission complexity needed
7. **Resources are static** - Authoring resources are bundled, not database-stored

---

## Dependencies

### Requires from Previous Stages
- MCP server infrastructure (Stage 12) - Complete
- API key authentication (Stage 4) - Complete
- Definition mutations (Stage 8) - Complete
- Run creation and job queuing (Stage 9) - Complete
- Scenario generation logic (Stage 9) - Complete

### External Dependencies
- `@modelcontextprotocol/sdk` - Already installed for Stage 12
- Existing validation utilities from GraphQL mutations

### New Backend Requirements
- 5 new MCP write tools
- 4 MCP authoring resources
- Audit logging system
- Enhanced validation utilities
- Resource content files

---

## Constitution Validation

### Compliance Check

| Requirement | Status | Notes |
|-------------|--------|-------|
| Files < 400 lines | PASS | Spec splits into focused tool handlers |
| No `any` types | PASS | SC-011 explicitly requires this |
| Test coverage 80% minimum | PASS | SC-009 explicitly requires this |
| Structured logging | PASS | FR-052-054 require audit logging |
| Type safety | PASS | TypeScript strict mode, typed inputs |
| Custom error classes | PASS | Will use existing AppError pattern |
| Soft delete patterns | PASS | FR-031 validates definition not soft-deleted |

### Folder Structure Compliance
Per constitution, extends existing MCP structure:
```
apps/api/src/
├── mcp/
│   ├── tools/
│   │   ├── create-definition.ts     # New
│   │   ├── fork-definition.ts       # New
│   │   ├── validate-definition.ts   # New
│   │   ├── start-run.ts             # New
│   │   ├── generate-scenarios-preview.ts  # New
│   │   └── ... (existing read tools)
│   └── resources/
│       ├── index.ts                 # Resource registry
│       ├── authoring-guide.ts       # Guide content
│       ├── authoring-examples.ts    # Example definitions
│       ├── value-pairs.ts           # Value tension pairs
│       └── preamble-templates.ts    # Preamble patterns
├── services/
│   └── mcp/
│       ├── validation.ts            # Input validation utilities
│       └── audit.ts                 # Audit logging
```

**VALIDATION RESULT: PASS** - Spec addresses all constitutional requirements.

---

## Out of Scope

- `compare_runs` tool (Stage 13 is DEFERRED)
- `create_experiment` tool (Stage 10 is DEFERRED)
- Write permission tiers for API keys (future enhancement)
- Real-time collaboration via MCP (future)
- Streaming responses for long operations (future)
- Batch definition creation (future)
- Definition import/export via MCP (Stage 15)
- Cost tracking integration (Stage 10 experiment features)

---

## Notes

### Stage 13 Dependency Removed
The high-level plan mentioned `compare_runs` tool for Stage 14 that "leverages Stage 13". Since Stage 13 (Run Comparison & Delta Analysis) is **DEFERRED**, the `compare_runs` tool is also deferred. Stage 14 focuses on the core write capabilities.

### Authoring Resources Strategy
Resources are bundled as static content in the codebase rather than stored in the database. This simplifies deployment and ensures all users see the same guidance. Resources can be updated via code deployment.

### Security Considerations
- All write operations require valid API key (same as reads)
- Input validation prevents oversized or malformed content
- Audit logging provides accountability
- No elevation of privilege possible (single-tenant, all users equal)

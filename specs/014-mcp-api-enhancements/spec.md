# Feature Specification: MCP API Enhancements

> **Feature #014** | Branch: `feat/014-mcp-api-enhancements`
> **Created**: 2025-12-09
> **Status**: Draft
> **Dependencies**: Stage 14 (MCP Write Tools) - Complete, Feature 013 (Provider Metadata) - Complete

## Overview

Extend the MCP API to achieve feature parity with the web UI for data management. This includes adding delete capabilities to the write API, exposing complete LLM metadata via the read API, and enabling full LLM configuration management (add models, update costs, set defaults, manage providers) through MCP tools.

**Input Description**: Delete tools for definitions and runs, LLM metadata read tools (providers, models, system settings), LLM management write tools (create/update/deprecate models, update providers, set defaults), infrastructure model configuration via MCP.

**Goal**: Enable AI agents using Claude Desktop, Cursor, or other MCP clients to fully manage ValueRank without needing the web UI.

---

## User Stories & Testing

### User Story 1 - Delete Definitions via MCP (Priority: P1)

As a researcher using Claude Desktop, I need to delete scenario definitions through conversation so that I can clean up failed experiments without switching to the web UI.

**Why this priority**: Core functionality - deletion is a fundamental CRUD operation missing from the current MCP write tools. Users cannot fully manage their workspace via MCP without this.

**Independent Test**: Ask local AI "Delete definition X", verify the definition is soft-deleted (deletedAt set).

**Acceptance Scenarios**:

1. **Given** I specify a valid definition_id, **When** the AI calls `delete_definition`, **Then** the definition is soft-deleted
2. **Given** the definition has associated scenarios, **When** deletion occurs, **Then** scenarios are also soft-deleted (cascade)
3. **Given** the definition has child definitions (forks), **When** deletion is attempted, **Then** operation succeeds (children remain orphaned but valid)
4. **Given** the definition is already deleted, **When** deletion is attempted, **Then** a clear "already deleted" error is returned
5. **Given** the definition doesn't exist, **When** deletion is attempted, **Then** a 404 "not found" error is returned
6. **Given** deletion succeeds, **When** I query definitions via MCP, **Then** the deleted definition no longer appears

---

### User Story 2 - Delete Runs via MCP (Priority: P1)

As a researcher, I need to delete evaluation runs through conversation so that I can remove failed or test runs from my workspace.

**Why this priority**: Core functionality - runs accumulate and users need to clean them up. Without MCP delete, they must use the web UI.

**Independent Test**: Ask local AI "Delete run X", verify the run is soft-deleted (deletedAt set).

**Acceptance Scenarios**:

1. **Given** I specify a valid run_id, **When** the AI calls `delete_run`, **Then** the run is soft-deleted
2. **Given** the run has transcripts and analysis data, **When** deletion occurs, **Then** all associated transcripts are soft-deleted (cascade)
3. **Given** the run is currently in progress, **When** deletion is attempted, **Then** running jobs are cancelled first, then run is soft-deleted
4. **Given** the run doesn't exist, **When** deletion is attempted, **Then** a 404 "not found" error is returned
5. **Given** the run is already deleted, **When** deletion is attempted, **Then** a clear "already deleted" error is returned
6. **Given** deletion succeeds, **When** I query runs via MCP, **Then** the deleted run no longer appears

---

### User Story 3 - List LLM Providers via MCP (Priority: P1)

As a researcher, I need to see available LLM providers through conversation so that I can understand which models are available for runs.

**Why this priority**: Core functionality - users need to discover available providers before selecting models. This enables informed model selection via MCP.

**Independent Test**: Ask local AI "What LLM providers are available?", verify it returns all providers with their settings.

**Acceptance Scenarios**:

1. **Given** I call `list_llm_providers`, **When** the response is returned, **Then** I see all providers with id, name, displayName
2. **Given** providers have rate limits configured, **When** I view the list, **Then** I see requestsPerMinute and maxParallelRequests
3. **Given** some providers are disabled, **When** I view the list, **Then** I see isEnabled status for each
4. **Given** providers have models, **When** I request include_models: true, **Then** each provider includes its models array
5. **Given** the response is returned, **When** I check size, **Then** it's under 3KB per token budget guidelines

---

### User Story 4 - List LLM Models via MCP (Priority: P1)

As a researcher, I need to see available LLM models through conversation so that I can select appropriate models for evaluation runs.

**Why this priority**: Core functionality - model selection is required for starting runs. Users need to see model details (costs, status) to make informed choices.

**Independent Test**: Ask local AI "What models are available?", verify it returns all models with costs and status.

**Acceptance Scenarios**:

1. **Given** I call `list_llm_models`, **When** the response is returned, **Then** I see all models with id, modelId, displayName, status
2. **Given** models have cost data, **When** I view the list, **Then** I see costInputPerMillion and costOutputPerMillion
3. **Given** I filter by provider, **When** I specify provider_id parameter, **Then** only that provider's models are returned
4. **Given** I filter by status, **When** I specify status: "ACTIVE", **Then** only active models are returned
5. **Given** models have default flags, **When** I view the list, **Then** I see isDefault for each model
6. **Given** models have availability status, **When** I view the list, **Then** I see isAvailable (API key configured)

---

### User Story 5 - Add New LLM Model via MCP (Priority: P1)

As a platform operator using Claude Desktop, I need to add new LLM models through conversation so that I can quickly configure new model releases without using the web UI.

**Why this priority**: Core functionality - new models are released frequently and operators need to add them quickly. This is a key admin task.

**Independent Test**: Ask local AI "Add model gpt-5 to OpenAI with costs $0.50/$2.00", verify model is created in database.

**Acceptance Scenarios**:

1. **Given** I specify provider_id, model_id, display_name, and costs, **When** `create_llm_model` is called, **Then** the model is created
2. **Given** I set setAsDefault: true, **When** model is created, **Then** it becomes the default for that provider
3. **Given** a model with the same model_id already exists for the provider, **When** creation is attempted, **Then** a clear "duplicate model" error is returned
4. **Given** the provider doesn't exist, **When** creation is attempted, **Then** a "provider not found" error is returned
5. **Given** costs are missing, **When** creation is attempted, **Then** a validation error lists required fields

---

### User Story 6 - Update LLM Model via MCP (Priority: P1)

As a platform operator, I need to update model costs and settings through conversation so that I can adjust pricing as providers change their rates.

**Why this priority**: Core functionality - model pricing changes regularly and operators need to update it quickly.

**Independent Test**: Ask local AI "Update gpt-4o-mini costs to $0.20/$0.80", verify costs are updated.

**Acceptance Scenarios**:

1. **Given** I specify model_id and new costs, **When** `update_llm_model` is called, **Then** costs are updated
2. **Given** I update displayName, **When** update is called, **Then** display name is changed
3. **Given** I try to change model_id, **When** update is attempted, **Then** it's rejected (immutable field)
4. **Given** the model doesn't exist, **When** update is attempted, **Then** a 404 error is returned
5. **Given** partial updates, **When** only some fields are provided, **Then** only provided fields are changed

---

### User Story 7 - Deprecate/Reactivate LLM Model via MCP (Priority: P1)

As a platform operator, I need to deprecate old models through conversation so that users don't select discontinued models for new runs.

**Why this priority**: Core functionality - models are deprecated regularly and operators need to manage lifecycle.

**Independent Test**: Ask local AI "Deprecate gpt-3.5-turbo", verify model status is set to DEPRECATED.

**Acceptance Scenarios**:

1. **Given** I specify an active model, **When** `deprecate_llm_model` is called, **Then** status changes to DEPRECATED
2. **Given** the model is the provider's default, **When** deprecation occurs, **Then** next active model becomes default (if exists)
3. **Given** a deprecated model, **When** `reactivate_llm_model` is called, **Then** status changes back to ACTIVE
4. **Given** an already deprecated model, **When** deprecation is attempted again, **Then** operation is idempotent (no error)
5. **Given** deprecation succeeds, **When** I try to start a run with the model, **Then** it's rejected with validation error

---

### User Story 8 - Set Default Model via MCP (Priority: P2)

As a platform operator, I need to set default models through conversation so that users get sensible defaults when creating runs.

**Why this priority**: Important for UX - defaults reduce friction when creating runs, but runs can be created without defaults.

**Independent Test**: Ask local AI "Set claude-sonnet-4-5 as default for Anthropic", verify isDefault is updated.

**Acceptance Scenarios**:

1. **Given** I specify a model, **When** `set_default_llm_model` is called, **Then** it becomes the default for its provider
2. **Given** another model was previously default, **When** new default is set, **Then** previous model's isDefault is cleared
3. **Given** the model is deprecated, **When** setting default is attempted, **Then** operation is rejected with error
4. **Given** success, **When** response is returned, **Then** it includes both new default and previous default info

---

### User Story 9 - Update Provider Settings via MCP (Priority: P2)

As a platform operator, I need to update provider rate limits through conversation so that I can tune system behavior for different provider capacities.

**Why this priority**: Important for performance - rate limits affect system behavior, but defaults work for most cases.

**Independent Test**: Ask local AI "Set OpenAI max parallel to 10", verify provider settings are updated.

**Acceptance Scenarios**:

1. **Given** I specify provider_id and new rate limits, **When** `update_llm_provider` is called, **Then** settings are updated
2. **Given** I set maxParallelRequests: 0, **When** update is called, **Then** validation error (minimum 1)
3. **Given** I set isEnabled: false, **When** update is called, **Then** provider is disabled for new runs
4. **Given** the provider doesn't exist, **When** update is attempted, **Then** a 404 error is returned

---

### User Story 10 - Configure Infrastructure Models via MCP (Priority: P2)

As a platform operator, I need to configure which models are used for infrastructure tasks through conversation so that I can optimize cost and performance.

**Why this priority**: Important for cost control - infrastructure models can be cheaper than frontier models, but defaults work initially.

**Independent Test**: Ask local AI "Set scenario expansion model to gpt-4o-mini", verify system setting is updated.

**Acceptance Scenarios**:

1. **Given** I specify purpose and model, **When** `set_infra_model` is called, **Then** system setting is created/updated
2. **Given** valid purposes are "scenario_expansion", "summarization", **When** I specify an invalid purpose, **Then** validation error lists valid options
3. **Given** the model doesn't exist, **When** setting is attempted, **Then** error explains model not found
4. **Given** success, **When** scenario expansion runs, **Then** it uses the configured model

---

### User Story 11 - Get System Settings via MCP (Priority: P2)

As a platform operator, I need to view system settings through conversation so that I can understand current infrastructure configuration.

**Why this priority**: Important for visibility - operators need to verify configuration, but settings are also visible in web UI.

**Independent Test**: Ask local AI "What are the current system settings?", verify settings are returned.

**Acceptance Scenarios**:

1. **Given** I call `list_system_settings`, **When** response is returned, **Then** I see all settings with key and value
2. **Given** I want a specific setting, **When** I call with key parameter, **Then** only that setting is returned
3. **Given** no settings exist, **When** I call list, **Then** empty array is returned (not error)

---

## Edge Cases

### Delete Definition Edge Cases
- **Definition with active runs**: Block deletion with error "has active runs in progress"
- **Definition that doesn't exist**: Return 404 "definition not found"
- **Definition already deleted**: Return error "definition already deleted" (idempotency consideration: could also return success)
- **Cascading delete of scenarios**: Soft-delete all associated scenarios
- **Definition is parent of other definitions**: Allow deletion, child's parent_id becomes orphaned (nullable)
- **Empty definition_id**: Return 400 validation error

### Delete Run Edge Cases
- **Run in progress**: Cancel jobs first, then soft-delete
- **Run with partial results**: Soft-delete run and cascade to transcripts
- **Run doesn't exist**: Return 404 "run not found"
- **Run already deleted**: Return success (idempotent) or error "already deleted"
- **Concurrent deletion**: Handle race condition gracefully (idempotent)
- **Run with very large transcript count**: Soft-delete in batches within transaction
- **Querying deleted runs**: All queries must filter `deletedAt: null` by default

### LLM Provider/Model Edge Cases
- **No providers in database**: Return empty array, not error
- **Provider has no active models**: Return provider with empty models array
- **Model costs are null**: Return model with null costs (allow partial data)
- **Very long model list (50+ models)**: Response stays under 5KB with pagination hint
- **Create model with exact duplicate**: Return 409 conflict error
- **Update non-existent model**: Return 404 error
- **Deprecate last active model for provider**: Warn but allow (provider has no default)
- **Set default to deprecated model**: Reject with clear error

### System Settings Edge Cases
- **Setting doesn't exist**: Return null for single query, exclude from list
- **Setting value is complex JSON**: Return as-is (JSONb)
- **Setting key with special characters**: URL-encode in MCP, decode on server
- **Very large setting value**: Truncate if exceeds 10KB, indicate truncation

---

## Functional Requirements

### Database Schema Changes
- **FR-001**: System MUST add `deletedAt` column to `transcripts` table (nullable DateTime)
- **FR-002**: System MUST add `deletedAt` column to `analysis_results` table (nullable DateTime)
- **FR-003**: System MUST create Prisma migration for the schema changes
- **FR-003a**: System MUST update all Transcript queries to filter `deletedAt: null` by default
- **FR-003b**: System MUST update all AnalysisResult queries to filter `deletedAt: null` by default

### Delete Tools Infrastructure
- **FR-004**: System MUST implement `delete_definition` MCP tool
- **FR-005**: System MUST implement `delete_run` MCP tool
- **FR-006**: Delete operations MUST use soft delete for definitions, runs, and transcripts (set deletedAt)
- **FR-007**: Delete operations MUST cascade soft-delete to related entities
- **FR-008**: Delete operations MUST be logged in audit trail

### delete_definition Tool
- **FR-009**: Tool MUST accept `definition_id` (string, required)
- **FR-010**: Tool MUST validate definition exists and is not already deleted
- **FR-011**: Tool MUST soft-delete the definition (set deletedAt = now)
- **FR-012**: Tool MUST cascade soft-delete to associated scenarios
- **FR-013**: Tool MUST return success with deleted entity count
- **FR-014**: Tool MUST reject deletion if run with status 'running' references definition

### delete_run Tool
- **FR-015**: Tool MUST accept `run_id` (string, required)
- **FR-016**: Tool MUST validate run exists and is not already deleted
- **FR-017**: Tool MUST cancel any in-progress jobs before soft-deletion
- **FR-018**: Tool MUST soft-delete run (set deletedAt = now)
- **FR-019**: Tool MUST cascade soft-delete to associated transcripts
- **FR-020**: Tool MUST cascade soft-delete to associated analysis results
- **FR-021**: Tool MUST return success with deleted entity count

### LLM Metadata Read Tools
- **FR-022**: System MUST implement `list_llm_providers` MCP tool
- **FR-023**: System MUST implement `list_llm_models` MCP tool
- **FR-024**: System MUST implement `get_llm_model` MCP tool (by ID or provider+modelId)
- **FR-025**: System MUST implement `list_system_settings` MCP tool

### list_llm_providers Tool
- **FR-026**: Tool MUST return all providers with id, name, displayName, isEnabled
- **FR-027**: Tool MUST return rate limit settings (requestsPerMinute, maxParallelRequests)
- **FR-028**: Tool MUST support `include_models` parameter (default: false) to include nested models
- **FR-029**: Tool MUST sort providers by displayName
- **FR-030**: Tool response MUST be under 3KB without models, 8KB with models

### list_llm_models Tool
- **FR-031**: Tool MUST return all models with id, modelId, displayName, status, isDefault
- **FR-032**: Tool MUST return cost data (costInputPerMillion, costOutputPerMillion)
- **FR-033**: Tool MUST return availability status (isAvailable - API key configured)
- **FR-034**: Tool MUST support `provider_id` filter parameter
- **FR-035**: Tool MUST support `status` filter parameter (ACTIVE, DEPRECATED)
- **FR-036**: Tool MUST support `available_only` filter parameter
- **FR-037**: Tool response MUST be under 5KB

### get_llm_model Tool
- **FR-038**: Tool MUST accept `id` (UUID) OR `provider_name` + `model_id` combination
- **FR-039**: Tool MUST return full model details including provider info
- **FR-040**: Tool MUST return 404 if model not found

### list_system_settings Tool
- **FR-041**: Tool MUST return all system settings with key and value
- **FR-042**: Tool MUST support `key` parameter to filter to single setting
- **FR-043**: Tool response MUST be under 2KB

### LLM Management Write Tools
- **FR-044**: System MUST implement `create_llm_model` MCP tool
- **FR-045**: System MUST implement `update_llm_model` MCP tool
- **FR-046**: System MUST implement `deprecate_llm_model` MCP tool
- **FR-047**: System MUST implement `reactivate_llm_model` MCP tool
- **FR-048**: System MUST implement `set_default_llm_model` MCP tool
- **FR-049**: System MUST implement `update_llm_provider` MCP tool
- **FR-050**: System MUST implement `set_infra_model` MCP tool

### create_llm_model Tool
- **FR-051**: Tool MUST accept provider_id, model_id, display_name, costInputPerMillion, costOutputPerMillion
- **FR-052**: Tool MUST accept optional setAsDefault (boolean, default: false)
- **FR-053**: Tool MUST validate provider exists
- **FR-054**: Tool MUST reject duplicate provider_id + model_id combination
- **FR-055**: Tool MUST return created model with all fields

### update_llm_model Tool
- **FR-056**: Tool MUST accept model id and partial update fields
- **FR-057**: Tool MUST allow updating: displayName, costInputPerMillion, costOutputPerMillion
- **FR-058**: Tool MUST NOT allow updating: modelId, providerId (immutable)
- **FR-059**: Tool MUST return updated model

### deprecate_llm_model Tool
- **FR-060**: Tool MUST accept model id
- **FR-061**: Tool MUST set status to DEPRECATED
- **FR-062**: Tool MUST auto-promote next active model to default if deprecated model was default
- **FR-063**: Tool MUST return deprecated model and new default (if applicable)

### reactivate_llm_model Tool
- **FR-064**: Tool MUST accept model id
- **FR-065**: Tool MUST set status to ACTIVE
- **FR-066**: Tool MUST return reactivated model

### set_default_llm_model Tool
- **FR-067**: Tool MUST accept model id
- **FR-068**: Tool MUST validate model is ACTIVE (not deprecated)
- **FR-069**: Tool MUST clear isDefault on previous default for same provider
- **FR-070**: Tool MUST set isDefault on target model
- **FR-071**: Tool MUST return new default and previous default

### update_llm_provider Tool
- **FR-072**: Tool MUST accept provider id and partial update fields
- **FR-073**: Tool MUST allow updating: maxParallelRequests, requestsPerMinute, isEnabled
- **FR-074**: Tool MUST validate maxParallelRequests >= 1
- **FR-075**: Tool MUST return updated provider

### set_infra_model Tool
- **FR-076**: Tool MUST accept purpose (string) and model reference
- **FR-077**: Tool MUST validate purpose is one of: "scenario_expansion", "summarization"
- **FR-078**: Tool MUST validate model exists
- **FR-079**: Tool MUST create/update system setting `infra_model_{purpose}`
- **FR-080**: Tool MUST return updated setting

### Audit Logging
- **FR-081**: System MUST log all delete operations with user_id, entity_type, entity_id, timestamp
- **FR-082**: System MUST log all LLM management operations with user_id, action, details, timestamp

### Error Handling
- **FR-083**: All tools MUST return structured errors with code, message, and details
- **FR-084**: Delete tools MUST be idempotent (deleting already-deleted returns success)
- **FR-085**: All tools MUST validate inputs before database operations

---

## Success Criteria

- **SC-001**: AI agents can delete definitions via MCP `delete_definition` tool
- **SC-002**: AI agents can delete runs via MCP `delete_run` tool
- **SC-003**: AI agents can list LLM providers via MCP `list_llm_providers` tool
- **SC-004**: AI agents can list LLM models via MCP `list_llm_models` tool
- **SC-005**: AI agents can add models via MCP `create_llm_model` tool
- **SC-006**: AI agents can update model costs via MCP `update_llm_model` tool
- **SC-007**: AI agents can deprecate/reactivate models via MCP tools
- **SC-008**: AI agents can set default models via MCP `set_default_llm_model` tool
- **SC-009**: AI agents can update provider settings via MCP `update_llm_provider` tool
- **SC-010**: AI agents can configure infrastructure models via MCP `set_infra_model` tool
- **SC-011**: All operations audited with user context
- **SC-012**: 80% code coverage on new MCP components (per constitution)
- **SC-013**: All new files under 400 lines (per constitution)
- **SC-014**: No `any` types in TypeScript code (per constitution)
- **SC-015**: Response latency under 2 seconds for all tools

---

## Key Entities

### Schema Changes

**Transcript table - add deletedAt column:**
```sql
ALTER TABLE transcripts ADD COLUMN deleted_at TIMESTAMP;
CREATE INDEX idx_transcripts_deleted_at ON transcripts(deleted_at);
```

**AnalysisResult table - add deletedAt column:**
```sql
ALTER TABLE analysis_results ADD COLUMN deleted_at TIMESTAMP;
CREATE INDEX idx_analysis_results_deleted_at ON analysis_results(deleted_at);
```

**Existing soft delete columns (already present):**
- `definitions.deleted_at` - exists
- `runs.deleted_at` - exists
- `scenarios.deleted_at` - exists

### DeleteDefinitionInput
```
DeleteDefinitionInput {
  definitionId: string       // Required, UUID of definition to delete
}
```

### DeleteRunInput
```
DeleteRunInput {
  runId: string              // Required, UUID of run to delete
}
```

### DeleteResult
```
DeleteResult {
  success: boolean
  entityType: string         // 'definition' or 'run'
  entityId: string
  deletedAt: string          // ISO 8601 timestamp of soft-delete
  deletedCount: {            // Cascade deletion counts
    primary: number          // The target entity (1)
    scenarios?: number       // For definitions
    transcripts?: number     // For runs
    analysisResults?: number // For runs
  }
}
```

### LlmProviderSummary (MCP response shape)
```
LlmProviderSummary {
  id: string
  name: string               // e.g., "openai"
  displayName: string        // e.g., "OpenAI"
  isEnabled: boolean
  requestsPerMinute: number
  maxParallelRequests: number
  modelCount: number         // Summary count
  activeModelCount: number   // Only ACTIVE models
  models?: LlmModelSummary[] // If include_models: true
}
```

### LlmModelSummary (MCP response shape)
```
LlmModelSummary {
  id: string
  modelId: string            // API model ID e.g., "gpt-4o-mini"
  displayName: string
  status: 'ACTIVE' | 'DEPRECATED'
  isDefault: boolean
  isAvailable: boolean       // API key configured
  costInputPerMillion: number | null
  costOutputPerMillion: number | null
  providerName: string       // Denormalized for convenience
}
```

### CreateLlmModelInput (MCP)
```
CreateLlmModelInput {
  providerId: string         // Required, UUID
  modelId: string            // Required, API model ID
  displayName: string        // Required
  costInputPerMillion: number // Required
  costOutputPerMillion: number // Required
  setAsDefault?: boolean     // Optional, default false
}
```

### UpdateLlmModelInput (MCP)
```
UpdateLlmModelInput {
  id: string                 // Required, UUID
  displayName?: string
  costInputPerMillion?: number
  costOutputPerMillion?: number
}
```

### UpdateLlmProviderInput (MCP)
```
UpdateLlmProviderInput {
  id: string                 // Required, UUID
  maxParallelRequests?: number
  requestsPerMinute?: number
  isEnabled?: boolean
}
```

### SetInfraModelInput
```
SetInfraModelInput {
  purpose: 'scenario_expansion' | 'summarization'
  providerName: string       // e.g., "openai"
  modelId: string            // e.g., "gpt-4o-mini"
}
```

### SystemSettingSummary
```
SystemSettingSummary {
  key: string
  value: unknown             // JSON value
  updatedAt: string          // ISO 8601
}
```

---

## Assumptions

1. **Stage 14 complete** - MCP write tools infrastructure exists and works
2. **Feature 013 complete** - LLM provider/model tables exist with GraphQL mutations
3. **Soft delete pattern** - Definitions, runs, and scenarios already have deletedAt columns; transcripts and analysis_results need it added
4. **Single tenant** - No per-user permission complexity for LLM management
5. **API key auth working** - Same auth as existing MCP tools
6. **GraphQL layer reusable** - MCP tools will leverage existing GraphQL resolvers
7. **Existing queries need updating** - All Run and Transcript queries will need `deletedAt: null` filter after migration

---

## Dependencies

### Requires from Previous Stages
- MCP server infrastructure (Stage 12) - Complete
- MCP write tools infrastructure (Stage 14) - Complete
- LLM provider/model schema and mutations (Feature 013) - Complete
- API key authentication (Stage 4) - Complete

### External Dependencies
- `@modelcontextprotocol/sdk` - Already installed

### New Backend Requirements
- 2 MCP delete tools (delete_definition, delete_run)
- 4 MCP LLM read tools (list_llm_providers, list_llm_models, get_llm_model, list_system_settings)
- 7 MCP LLM write tools (create/update/deprecate/reactivate model, set_default, update_provider, set_infra_model)
- Extended audit logging for new operations

---

## Constitution Validation

### Compliance Check

| Requirement | Status | Notes |
|-------------|--------|-------|
| Files < 400 lines | PASS | Spec splits into focused tool handlers |
| No `any` types | PASS | SC-014 explicitly requires this |
| Test coverage 80% minimum | PASS | SC-012 explicitly requires this |
| Structured logging | PASS | FR-076-077 require audit logging |
| Type safety | PASS | TypeScript strict mode, typed inputs |
| Custom error classes | PASS | Will use existing AppError pattern |
| Soft delete patterns | PASS | FR-003 uses soft delete for definitions |

### Folder Structure Compliance
Per constitution, extends existing MCP structure:
```
apps/api/src/
├── mcp/
│   └── tools/
│       ├── delete-definition.ts       # New
│       ├── delete-run.ts              # New
│       ├── list-llm-providers.ts      # New
│       ├── list-llm-models.ts         # New
│       ├── get-llm-model.ts           # New
│       ├── list-system-settings.ts    # New
│       ├── create-llm-model.ts        # New
│       ├── update-llm-model.ts        # New
│       ├── deprecate-llm-model.ts     # New
│       ├── reactivate-llm-model.ts    # New
│       ├── set-default-llm-model.ts   # New
│       ├── update-llm-provider.ts     # New
│       ├── set-infra-model.ts         # New
│       └── ... (existing tools)
├── services/
│   └── mcp/
│       └── audit.ts                   # Extend for new operations
```

**VALIDATION RESULT: PASS** - Spec addresses all constitutional requirements.

---

## Out of Scope

- Delete provider (providers are seed data, not user-deletable)
- Bulk delete operations (delete multiple entities at once)
- Undo/restore deleted entities via MCP
- Export LLM configuration via MCP
- Import LLM configuration via MCP
- Real-time notifications for LLM changes
- Multi-tenant permission model for LLM management
- Archiving runs instead of deleting

---

## Notes

### Tool Naming Convention
Tools follow existing MCP naming: `verb_noun` in snake_case (e.g., `delete_definition`, `list_llm_models`).

### Reusing GraphQL Logic
MCP tools should delegate to existing GraphQL resolvers/services where possible to avoid duplicating business logic. The MCP layer handles:
- Input validation specific to MCP format
- Response formatting within token budgets
- Rate limiting via existing MCP middleware

### API Key Permissions
All new tools use the same API key authentication as existing MCP tools. No new permission scopes are introduced in this feature (future enhancement).

### Infrastructure Model Selection
The `set_infra_model` tool stores settings in the `system_settings` table with the key format `infra_model_{purpose}`. The value is a JSON object containing `providerId` and `modelId`.

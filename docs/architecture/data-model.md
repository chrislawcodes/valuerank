# Data Model

> PostgreSQL schema for Cloud ValueRank

This document describes the database schema, entity relationships, and data patterns used in Cloud ValueRank.

**Schema location:** `packages/db/prisma/schema.prisma`

---

## Entity Relationship Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AUTHENTICATION                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐           ┌──────────┐                                    │
│  │   User   │──────────▶│  ApiKey  │                                    │
│  └──────────┘   1:N     └──────────┘                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                            CORE DOMAIN                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────┐        ┌────────────┐        ┌────────────┐             │
│  │ Definition │───────▶│  Scenario  │        │    Tag     │             │
│  │            │  1:N   │            │        │            │             │
│  └─────┬──────┘        └─────┬──────┘        └─────┬──────┘             │
│        │                     │                     │                     │
│        │ parent_id           │                     │                     │
│        ▼ (self-ref)          │                     │                     │
│  ┌────────────┐              │               ┌─────┴──────┐             │
│  │ Definition │              │               │DefinitionTag│             │
│  └────────────┘              │               │  (join)    │             │
│        │                     │               └────────────┘             │
│        │ 1:N                 │                                          │
│        ▼                     │                                          │
│  ┌────────────┐              │                                          │
│  │    Run     │◀─────────────┘                                          │
│  │            │◀───────────────────────────────┐                        │
│  └─────┬──────┘               1:N              │                        │
│        │                                       │                        │
│        │ 1:N                             ┌─────┴──────┐                 │
│        ▼                                 │RunScenario │                 │
│  ┌────────────┐                          │ Selection  │                 │
│  │ Transcript │                          └────────────┘                 │
│  └────────────┘                                                         │
│        │                                                                 │
│        ▼ N:1                                                            │
│  ┌────────────┐                                                         │
│  │  Scenario  │                                                         │
│  └────────────┘                                                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         ANALYSIS & EXPERIMENTS                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────┐        ┌────────────┐                                   │
│  │ Experiment │───────▶│    Run     │ (N:1)                             │
│  │            │───────▶│RunComparison│ (1:N)                            │
│  └────────────┘        └────────────┘                                   │
│                                                                          │
│  ┌────────────┐        ┌────────────┐                                   │
│  │    Run     │───────▶│ Analysis   │ (1:N)                             │
│  │            │        │  Result    │                                   │
│  └────────────┘        └────────────┘                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           LLM CONFIGURATION                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────┐        ┌────────────┐                                   │
│  │LlmProvider │───────▶│  LlmModel  │ (1:N)                             │
│  │            │        │            │                                   │
│  └────────────┘        └────────────┘                                   │
│                                                                          │
│  ┌────────────┐        ┌────────────┐                                   │
│  │   Rubric   │        │SystemSetting│                                   │
│  └────────────┘        └────────────┘                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Tables

### Authentication

#### `users`

User accounts for the internal team.

| Column | Type | Description |
|--------|------|-------------|
| `id` | cuid | Primary key |
| `email` | string | Unique email address |
| `password_hash` | string | bcrypt hashed password |
| `name` | string? | Display name |
| `last_login_at` | datetime? | Last login timestamp |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last update timestamp |

#### `api_keys`

API keys for MCP and programmatic access.

| Column | Type | Description |
|--------|------|-------------|
| `id` | cuid | Primary key |
| `user_id` | fk → users | Owner |
| `name` | string | Key name/description |
| `key_hash` | string | SHA-256 hash of key |
| `key_prefix` | varchar(12) | First 12 chars for identification |
| `last_used` | datetime? | Last usage timestamp |
| `expires_at` | datetime? | Expiration (null = never) |
| `created_at` | datetime | Creation timestamp |

---

### Core Domain

#### `definitions`

Moral dilemma templates with versioning through parent references.

| Column | Type | Description |
|--------|------|-------------|
| `id` | cuid | Primary key |
| `parent_id` | fk → definitions? | Fork parent (for version tree) |
| `name` | string | Human-readable name |
| `content` | jsonb | Definition content (see JSONB Schema below) |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last update timestamp |
| `last_accessed_at` | datetime? | For usage tracking |
| `deleted_at` | datetime? | **Soft delete** timestamp |

**Relationships:**
- Self-referential parent/children for version tree
- 1:N to runs, scenarios, definition_tags

#### `tags`

Organizational tags for definitions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | cuid | Primary key |
| `name` | string | Unique tag name |
| `created_at` | datetime | Creation timestamp |

#### `definition_tags`

Join table linking definitions to tags.

| Column | Type | Description |
|--------|------|-------------|
| `id` | cuid | Primary key |
| `definition_id` | fk → definitions | Definition |
| `tag_id` | fk → tags | Tag |
| `created_at` | datetime | Creation timestamp |
| `deleted_at` | datetime? | **Soft delete** timestamp |

**Unique constraint:** (definition_id, tag_id)

#### `runs`

Pipeline executions against a definition.

| Column | Type | Description |
|--------|------|-------------|
| `id` | cuid | Primary key |
| `definition_id` | fk → definitions | Source definition |
| `experiment_id` | fk → experiments? | Parent experiment (optional) |
| `status` | enum | PENDING, RUNNING, PAUSED, SUMMARIZING, COMPLETED, FAILED, CANCELLED |
| `config` | jsonb | Runtime configuration snapshot |
| `progress` | jsonb? | Progress tracking data |
| `started_at` | datetime? | When processing began |
| `completed_at` | datetime? | When processing finished |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last update timestamp |
| `last_accessed_at` | datetime? | For usage tracking |
| `deleted_at` | datetime? | **Soft delete** timestamp |
| `retention_days` | int? | Days until archival (null = permanent) |
| `archive_permanently` | boolean | Never delete (default: true) |

**Run Status Lifecycle:**
```
PENDING → RUNNING → SUMMARIZING → COMPLETED
                 ↘ PAUSED → RUNNING
                 ↘ FAILED
                 ↘ CANCELLED
```

#### `transcripts`

Individual model responses to scenarios.

| Column | Type | Description |
|--------|------|-------------|
| `id` | cuid | Primary key |
| `run_id` | fk → runs | Parent run |
| `scenario_id` | fk → scenarios? | Source scenario |
| `model_id` | string | Provider model identifier |
| `model_version` | string? | Specific model version |
| `definition_snapshot` | jsonb? | Definition at execution time |
| `content` | jsonb | Transcript data (messages, choices) |
| `turn_count` | int | Number of conversation turns |
| `token_count` | int | Total tokens used |
| `duration_ms` | int | Execution duration |
| `created_at` | datetime | Creation timestamp |
| `last_accessed_at` | datetime? | For usage tracking |
| `content_expires_at` | datetime? | Content pruning date |
| `decision_code` | string? | Extracted decision (1-5 or "other") |
| `decision_text` | string? | LLM-generated summary |
| `summarized_at` | datetime? | When summary was generated |

#### `scenarios`

Generated scenario variants from definitions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | cuid | Primary key |
| `definition_id` | fk → definitions | Source definition |
| `name` | string | Scenario identifier |
| `content` | jsonb | Scenario content |
| `created_at` | datetime | Creation timestamp |
| `deleted_at` | datetime? | **Soft delete** timestamp |

#### `run_scenario_selections`

Tracks which scenarios were included in a run (for sampling).

| Column | Type | Description |
|--------|------|-------------|
| `id` | cuid | Primary key |
| `run_id` | fk → runs | Run |
| `scenario_id` | fk → scenarios | Included scenario |
| `created_at` | datetime | Creation timestamp |

**Unique constraint:** (run_id, scenario_id)

---

### Analysis & Experiments

#### `experiments`

Group related runs for systematic comparison. **Note: Currently scaffolded but not fully implemented.**

| Column | Type | Description |
|--------|------|-------------|
| `id` | cuid | Primary key |
| `name` | string | Experiment name |
| `hypothesis` | string? | Research hypothesis |
| `analysis_plan` | jsonb? | Statistical plan |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last update timestamp |

#### `run_comparisons`

Delta analysis between two runs. **Note: Currently scaffolded but not fully implemented.**

| Column | Type | Description |
|--------|------|-------------|
| `id` | cuid | Primary key |
| `experiment_id` | fk → experiments? | Parent experiment |
| `baseline_run_id` | fk → runs | Baseline run |
| `comparison_run_id` | fk → runs | Comparison run |
| `delta_data` | jsonb? | Computed differences |
| `created_at` | datetime | Creation timestamp |

#### `analysis_results`

Cached analysis computations with versioning.

| Column | Type | Description |
|--------|------|-------------|
| `id` | cuid | Primary key |
| `run_id` | fk → runs | Analyzed run |
| `analysis_type` | string | Type identifier (e.g., "basic") |
| `input_hash` | string | Hash of input data (for cache invalidation) |
| `code_version` | string | Analysis code version |
| `output` | jsonb | Analysis results |
| `status` | enum | CURRENT, SUPERSEDED |
| `created_at` | datetime | Creation timestamp |

**Analysis caching pattern:**
1. Compute hash of transcript data
2. Check if analysis exists with same input_hash and code_version
3. If exists and CURRENT, return cached result
4. Otherwise, compute new analysis and mark old as SUPERSEDED

#### `cohorts`

Groups for segment analysis. **Note: Currently scaffolded but not actively used.**

| Column | Type | Description |
|--------|------|-------------|
| `id` | cuid | Primary key |
| `name` | string | Cohort name |
| `criteria` | jsonb | Membership criteria |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last update timestamp |

---

### LLM Configuration

#### `llm_providers`

Supported LLM providers and their rate limits.

| Column | Type | Description |
|--------|------|-------------|
| `id` | cuid | Primary key |
| `name` | string | Unique identifier (e.g., "openai") |
| `display_name` | string | Human-readable name (e.g., "OpenAI") |
| `max_parallel_requests` | int | Concurrent request limit |
| `requests_per_minute` | int | Rate limit |
| `is_enabled` | boolean | Whether provider is active |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last update timestamp |

#### `llm_models`

Individual models within providers.

| Column | Type | Description |
|--------|------|-------------|
| `id` | cuid | Primary key |
| `provider_id` | fk → llm_providers | Parent provider |
| `model_id` | string | API model identifier |
| `display_name` | string | Human-readable name |
| `cost_input_per_million` | decimal | Input token cost |
| `cost_output_per_million` | decimal | Output token cost |
| `status` | enum | ACTIVE, DEPRECATED |
| `is_default` | boolean | Default selection |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last update timestamp |

**Unique constraint:** (provider_id, model_id)

#### `rubrics`

Values rubric versions for analysis.

| Column | Type | Description |
|--------|------|-------------|
| `id` | cuid | Primary key |
| `version` | int | Unique version number |
| `content` | jsonb | Rubric definition |
| `created_at` | datetime | Creation timestamp |

#### `system_settings`

Key-value store for system configuration.

| Column | Type | Description |
|--------|------|-------------|
| `id` | cuid | Primary key |
| `key` | string | Unique setting key |
| `value` | jsonb | Setting value |
| `updated_at` | datetime | Last update timestamp |

---

## JSONB Schema Patterns

### Definition Content

```json
{
  "preamble": "You are being asked to reason about a moral dilemma...",
  "template": "A café owner faces [situation] where [severity]...",
  "dimensions": [
    {
      "name": "situation",
      "levels": [
        {"score": 1, "label": "minor", "options": ["small spill", "loose tile"]},
        {"score": 5, "label": "severe", "options": ["gas leak", "structural damage"]}
      ]
    }
  ],
  "matchingRules": {
    "type": "cartesian"
  },
  "valueConflict": {
    "value1": "Physical_Safety",
    "value2": "Economics"
  }
}
```

### Run Config

```json
{
  "models": ["gpt-4o", "claude-3-5-sonnet-latest"],
  "samplePercentage": 100,
  "temperature": 0.7
}
```

### Run Progress

```json
{
  "total": 20,
  "completed": 15,
  "failed": 1,
  "byModel": {
    "gpt-4o": {"completed": 8, "total": 10},
    "claude-3-5-sonnet-latest": {"completed": 7, "total": 10}
  }
}
```

### Transcript Content

```json
{
  "messages": [
    {"role": "user", "content": "A café owner discovers..."},
    {"role": "assistant", "content": "I would prioritize..."}
  ],
  "model": "gpt-4o",
  "finishReason": "stop"
}
```

### Analysis Output

```json
{
  "decisionCounts": {"1": 5, "2": 8, "3": 12, "4": 3, "5": 2},
  "agreementScore": 0.73,
  "methodsDocumentation": "Analysis computed using...",
  "visualizationData": {
    "decisionDistribution": [...],
    "modelScenarioMatrix": [...]
  }
}
```

---

## Soft Delete Pattern

Three tables use soft delete via `deleted_at` timestamp:

- `definitions` - Preserves version history
- `scenarios` - Preserves transcript references
- `definition_tags` - Preserves tag associations

**Rules:**
1. Records are never physically deleted
2. **All queries must filter** `WHERE deleted_at IS NULL`
3. GraphQL resolvers apply this filter automatically
4. `deleted_at` is NOT exposed in the GraphQL API
5. Cascading: when parent is deleted, related records are also soft-deleted

```typescript
// Querying (always filter deleted)
const definitions = await prisma.definition.findMany({
  where: { deletedAt: null }
});

// Deleting (set timestamp, don't delete)
await prisma.definition.update({
  where: { id },
  data: { deletedAt: new Date() }
});
```

---

## Access Tracking

Major entities include `last_accessed_at` timestamp:
- Updated on read operations (view, export, analysis)
- Enables identification of unused data
- Useful for future pruning decisions

---

## Indexes

Key indexes for performance:

| Table | Index | Purpose |
|-------|-------|---------|
| definitions | `parent_id` | Version tree queries |
| runs | `definition_id`, `experiment_id`, `status` | Filtering |
| transcripts | `run_id`, `scenario_id`, `model_id` | Lookups |
| scenarios | `definition_id` | Definition scenarios |
| analysis_results | `run_id`, `analysis_type`, `status` | Cache lookup |
| api_keys | `key_prefix`, `user_id` | Authentication |

---

## Differences from Original Design

The schema evolved from the [original database design](../preplanning/database-design.md):

| Addition | Reason |
|----------|--------|
| `LlmProvider`, `LlmModel` tables | Database-driven provider/model configuration |
| `RunScenarioSelection` table | Track sampled scenarios per run |
| `SystemSetting` table | Runtime configuration |
| Summary fields on Transcript | Store decision codes and summaries |

| Simplification | Reason |
|----------------|--------|
| No `ltree` extension | Recursive CTEs sufficient for our queries |
| No `created_by` on most tables | Single-tenant, less audit trail needed |
| Simpler experiment schema | Feature deferred |

---

## Related Documentation

- [Architecture Overview](./overview.md) - System components
- [Tech Stack](./tech-stack.md) - Technology choices
- [Original Database Design](../preplanning/database-design.md) - Design rationale

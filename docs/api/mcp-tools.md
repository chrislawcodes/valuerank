# MCP Tools Reference

> Part of [Cloud ValueRank API Documentation](./graphql-schema.md)

The MCP (Model Context Protocol) server exposes tools for AI agents like Claude Code to interact with ValueRank. This document provides a complete reference for all available tools.

---

## Authentication

All MCP tools require authentication via API key:

```
X-API-Key: vr_xxxxxxxxxxxxxxxxxxxxxxxx
```

API keys can be created in Settings → API Keys or via the `createApiKey` GraphQL mutation.

---

## Tool Categories

| Category | Purpose | Tools |
|----------|---------|-------|
| **Query Tools** | Read definitions, runs, and analysis | 8 tools |
| **Definition Tools** | Create and manage definitions | 5 tools |
| **Run Tools** | Execute and manage evaluation runs | 2 tools |
| **LLM Management** | Configure providers and models | 11 tools |
| **Operations Tools** | Diagnostics and recovery | 7 tools |

---

## Query Tools (Read-Only)

### list_definitions

List scenario definitions with version info.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `folder` | string | No | Filter by folder path |
| `include_children` | boolean | No | Include child count for each definition |

**Returns:** Basic metadata including id, name, versionLabel, parentId, createdAt.

---

### list_runs

List evaluation runs with status and summary metrics.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `definition_id` | string | No | Filter by definition UUID |
| `status` | string | No | Filter by status: pending, running, completed, failed |
| `limit` | integer | No | Max results (default 20, max 100) |

**Returns:** Run id, status, models, scenarioCount, samplePercentage, createdAt.

---

### get_run_summary

Get aggregated analysis for a completed run.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | **Yes** | Run UUID |
| `include_insights` | boolean | No | Include auto-generated insights (default true) |

**Returns:** Per-model win rates, model agreement scores, outlier models, contested scenarios.

---

### get_dimension_analysis

Get dimension-level analysis showing which dimensions drive model divergence.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | **Yes** | Run UUID |

**Returns:** Ranked dimensions by effect size (Kruskal-Wallis test), p-values, variance explained.

---

### get_transcript_summary

Get transcript metadata without full text content.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | **Yes** | Run UUID |
| `scenario_id` | string | **Yes** | Scenario UUID |
| `model` | string | **Yes** | Model ID |

**Returns:** Turn count, word count, decision made, key reasoning points.

---

### get_transcript

Get full transcript data including all conversation turns.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | **Yes** | Run UUID |
| `scenario_id` | string | **Yes** | Scenario UUID |
| `model` | string | **Yes** | Model ID |

**Returns:** Complete transcript with all turns, provider metadata, cost snapshot, timing.

---

### graphql_query

Execute arbitrary GraphQL queries for flexible data access.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | **Yes** | GraphQL query string |
| `variables` | object | No | Query variables |

**Note:** Mutations are not allowed - read-only queries only.

---

### list_system_settings

List system configuration settings.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `key` | string | No | Get specific setting by exact key |
| `prefix` | string | No | Get settings starting with prefix |

**Returns:** Setting key, value, timestamps.

---

## Definition Tools (Create/Modify)

### create_definition

Create a new scenario definition for measuring AI value priorities.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | **Yes** | Definition name (1-255 chars) |
| `content` | object | **Yes** | Definition content with preamble, template, dimensions |
| `folder` | string | No | Organization folder |
| `tags` | string[] | No | Tag names for categorization |

**Content Structure:**

Dimensions must be **value-based** using the 19 canonical Schwartz values:

| Higher-Order Category | Values |
|-----------------------|--------|
| **Openness to Change** | Self_Direction_Thought, Self_Direction_Action, Stimulation, Hedonism |
| **Self-Enhancement** | Achievement, Power_Dominance, Power_Resources, Face |
| **Conservation** | Security_Personal, Security_Societal, Tradition, Conformity_Rules, Conformity_Interpersonal, Humility |
| **Self-Transcendence** | Benevolence_Dependability, Benevolence_Caring, Universalism_Concern, Universalism_Nature, Universalism_Tolerance |

Each dimension has 3-5 intensity levels with scores 1-5.

---

### fork_definition

Fork an existing definition with optional modifications.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `parent_id` | string | **Yes** | ID of definition to fork |
| `name` | string | **Yes** | Name for the fork |
| `version_label` | string | No | Human-readable version label |
| `changes` | object | No | Partial content changes |

**Returns:** Definition ID and diff summary.

---

### validate_definition

Validate definition content without saving (dry run).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `content` | object | **Yes** | Definition content to validate |

**Returns:** Validation results including errors, warnings, estimated scenario count.

---

### generate_scenarios_preview

Preview scenarios that would be generated from a definition (dry run).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `definition_id` | string | **Yes** | Definition UUID |
| `max_scenarios` | integer | No | Max scenarios to return (1-10, default 5) |

**Returns:** Total count, sample scenarios, first scenario's full body.

---

### delete_definition

Soft-delete a definition and all descendants.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `definition_id` | string | **Yes** | Definition UUID |

**Behavior:** Cascades to scenarios and child definitions. Blocks if run is in RUNNING status.

---

## Run Tools (Execute)

### start_run

Start an evaluation run for a definition.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `definition_id` | string | **Yes** | Definition UUID |
| `models` | string[] | **Yes** | Model IDs to evaluate (at least one) |
| `sample_percentage` | integer | No | Percentage of scenarios (1-100, default 100) |
| `sample_seed` | integer | No | Random seed for reproducible sampling |
| `priority` | string | No | Job priority: LOW, NORMAL, HIGH |

**Returns:** Run ID, queued task count, estimated cost.

---

### delete_run

Soft-delete a run and associated data.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | **Yes** | Run UUID |

**Behavior:** Cancels pending jobs, cascades to transcripts and analysis.

---

## LLM Management Tools

### list_llm_providers

List all available LLM providers with settings.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `include_models` | boolean | No | Include model details (default false) |

**Returns:** Provider name, display name, rate limits, enabled status.

---

### list_llm_models

List all available LLM models with costs.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `provider_id` | string | No | Filter by provider UUID |
| `provider_name` | string | No | Filter by provider name |
| `status` | string | No | Filter: active, deprecated, all |
| `available_only` | boolean | No | Only show models with API keys |

**Returns:** Model ID, display name, provider, costs, availability.

---

### get_llm_model

Get detailed information about a specific model.

**Parameters (one of):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | No | Model UUID |
| `provider_name` + `model_id` | strings | No | Lookup by identifier |

---

### create_llm_model

Create a new LLM model for a provider.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `provider_id` | string | **Yes** | Provider UUID |
| `model_id` | string | **Yes** | API model identifier |
| `display_name` | string | **Yes** | Human-readable name |
| `cost_input_per_million` | number | **Yes** | Input token cost |
| `cost_output_per_million` | number | **Yes** | Output token cost |
| `set_as_default` | boolean | No | Make this the provider default |

---

### update_llm_model

Update an existing model's properties.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | **Yes** | Model UUID |
| `display_name` | string | No | New display name |
| `cost_input_per_million` | number | No | New input cost |
| `cost_output_per_million` | number | No | New output cost |
| `api_config` | object | No | Provider-specific API config |

---

### deprecate_llm_model

Mark a model as deprecated.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | **Yes** | Model UUID |

**Behavior:** Sets status to DEPRECATED, promotes another default if needed.

---

### reactivate_llm_model

Restore a deprecated model to ACTIVE status.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | **Yes** | Model UUID |

---

### set_default_llm_model

Set a model as the default for its provider.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | **Yes** | Model UUID |

---

### update_llm_provider

Update provider settings (rate limits, enabled status).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | **Yes** | Provider UUID |
| `max_parallel_requests` | integer | No | Concurrent request limit (1-100) |
| `requests_per_minute` | integer | No | Rate limit (1-10000) |
| `is_enabled` | boolean | No | Enable/disable provider |

---

### set_infra_model

Configure which model handles infrastructure tasks.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `purpose` | string | **Yes** | scenario_generator, judge, or summarizer |
| `provider_name` | string | **Yes** | Provider name |
| `model_id` | string | **Yes** | Model identifier |

---

## Operations Tools (Diagnostics & Recovery)

### set_summarization_parallelism

Configure max parallel summarization jobs.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `max_parallel` | integer | **Yes** | Max parallel jobs (1-100) |

**Behavior:** Hot-reloads handler with new batchSize immediately.

---

### cancel_summarization

Cancel pending summarization jobs for a run.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | **Yes** | Run UUID |

**Validation:** Run must be in SUMMARIZING state.

---

### restart_summarization

Restart summarization for a completed/failed run.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | **Yes** | Run UUID |
| `force` | boolean | No | Re-summarize ALL transcripts (default: only missing) |

**Validation:** Run must be in terminal state (COMPLETED, FAILED, CANCELLED).

---

### recover_run

Re-queue missing or orphaned jobs for a stuck run.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | **Yes** | Run UUID |

**Returns:** Action taken, requeued count, run progress.

**Use when:** Run is stuck in RUNNING/SUMMARIZING with no active jobs.

---

### trigger_recovery

System-wide recovery scan for all orphaned runs.

**Parameters:** None

**Returns:** Detected count, recovered count, errors.

**Use when:** After API restart, for health checks, incident response.

---

### get_job_queue_status

Query job queue status for a run to diagnose issues.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | **Yes** | Run UUID |
| `include_recent_failures` | boolean | No | Include failure details (default false) |

**Returns:** Counts by job type and state, recent failure details.

**Interpreting results:**
- `pending=0` and `running=0` but run is RUNNING → jobs lost, needs recovery
- `failed > 0` → check recent_failures for errors

---

### get_unsummarized_transcripts

Query transcripts that haven't been summarized.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | **Yes** | Run UUID |
| `include_failed` | boolean | No | Include error transcripts (default false) |
| `limit` | integer | No | Max transcripts (default 50, max 100) |

**Returns:** Transcript IDs with model/scenario info, total count.

---

## MCP Resources

In addition to tools, the MCP server provides authoring resources:

| URI | Description |
|-----|-------------|
| `valuerank://authoring/guide` | Best practices for scenario authoring |
| `valuerank://authoring/examples` | Annotated example definitions |
| `valuerank://authoring/value-pairs` | Common value tensions for dilemmas |
| `valuerank://authoring/preamble-templates` | Tested preamble patterns |

---

## The 19 Canonical Values Reference

Based on Schwartz et al. (2012). See [docs/values-summary.md](../values-summary.md) for full definitions.

| Value | Higher-Order Category |
|-------|----------------------|
| Self_Direction_Thought | Openness to Change |
| Self_Direction_Action | Openness to Change |
| Stimulation | Openness to Change |
| Hedonism | Openness to Change |
| Achievement | Self-Enhancement |
| Power_Dominance | Self-Enhancement |
| Power_Resources | Self-Enhancement |
| Face | Self-Enhancement |
| Security_Personal | Conservation |
| Security_Societal | Conservation |
| Tradition | Conservation |
| Conformity_Rules | Conservation |
| Conformity_Interpersonal | Conservation |
| Humility | Conservation |
| Benevolence_Dependability | Self-Transcendence |
| Benevolence_Caring | Self-Transcendence |
| Universalism_Concern | Self-Transcendence |
| Universalism_Nature | Self-Transcendence |
| Universalism_Tolerance | Self-Transcendence |

---

## Source Files

| Directory | Contents |
|-----------|----------|
| `apps/api/src/mcp/tools/` | Individual tool implementations |
| `apps/api/src/mcp/tools/index.ts` | Tool registry and imports |
| `apps/api/src/mcp/resources/` | MCP resource content |
| `apps/api/src/mcp/server.ts` | MCP server setup |

---

## Related Documentation

- [GraphQL Schema Reference](./graphql-schema.md) - Full GraphQL API
- [REST Endpoints](./rest-endpoints.md) - REST authentication endpoints
- [Values Summary](../values-summary.md) - The 19 Schwartz values
- [Queue System](../backend/queue-system.md) - Job processing architecture

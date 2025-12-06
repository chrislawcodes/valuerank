# MCP Interface (AI Agent Access)

> Part of [Cloud ValueRank Architecture](./architecture-overview.md)
>
> See also: [Product Specification](./product-spec.md) for context on these decisions

## Primary Use Case: Local Chat Integration

The MCP interface enables **interactive analysis via local AI chat** (Claude Desktop, Cursor, etc.):

```
User: "Which scenarios show the biggest disagreement between GPT-4 and Claude?"

Local LLM → MCP → Cloud ValueRank API → Response

Local LLM: "Based on run_xyz, the top 3 most contested scenarios are..."
```

**Why this matters:**
- Researchers can explore data conversationally
- AI can help interpret patterns and suggest hypotheses
- Enables rapid iteration on scenario design

## Design Philosophy

Expose processed/aggregated data via MCP so local AI agents can:
- Query runs, experiments, and analysis results
- Perform their own reasoning on top of our computed metrics
- Avoid being swamped with raw transcript tokens

**Key Principle**: Return summaries and statistics, not raw data. The cloud has already done the heavy processing—give agents the distilled insights.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 User's Local Machine                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │   Claude Desktop / Cursor / Local LLM Client          │  │
│  │   (uses user's own LLM API key)                       │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                         │ MCP Protocol                      │
│  ┌──────────────────────▼───────────────────────────────┐  │
│  │   MCP Client (configured with ValueRank API key)      │  │
│  └──────────────────────┬───────────────────────────────┘  │
└─────────────────────────┼───────────────────────────────────┘
                          │ HTTPS + API Key
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Cloud ValueRank                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Tools     │  │  Resources  │  │   Prompts           │ │
│  │ (actions)   │  │ (data)      │  │ (templates)         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              PostgreSQL (runs, definitions, results)  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

Key: User's local LLM uses their own API key for inference.
     MCP uses ValueRank API key for data access.
```

---

## GraphQL Integration

The MCP interface is a thin wrapper around the GraphQL API. This gives LLMs two options:

### Option 1: Use MCP Tools (Structured)

Pre-defined tools that map to common queries:

```
MCP Tool: get_run_summary(run_id: "xyz")
  → Executes GraphQL query internally
  → Returns structured JSON response
```

### Option 2: Direct GraphQL Queries (Flexible)

LLMs can construct custom GraphQL queries for complex analysis:

```
MCP Tool: graphql_query(query: "...", variables: {...})
  → Executes arbitrary GraphQL query
  → Returns raw response
```

**Why both?**
- MCP tools provide guardrails and token-budget-aware responses
- Direct GraphQL enables ad-hoc exploration when needed
- LLMs can introspect the schema to discover available data

### Schema Introspection

LLMs can query the schema to understand available data:

```graphql
query IntrospectSchema {
  __schema {
    types { name fields { name type { name } } }
  }
}
```

---

## MCP Tools (Structured Access)

**Phase Implementation:**
- **Phase 3**: Read tools (`list_definitions`, `list_runs`, `get_run_summary`, etc.) + `graphql_query`
- **Phase 4**: `compare_runs` tool (leverages run comparison infrastructure)
- **Phase 5**: Write tools (`create_definition`, `fork_definition`, `start_run`, etc.)

### graphql_query (Power User Tool)

Execute arbitrary GraphQL queries for flexible data access.

**Parameters:**
- `query` (string, required): GraphQL query string
- `variables` (object, optional): Query variables

**Returns:** Raw GraphQL response

**Example:**
```graphql
# Find scenarios where GPT-4 and Claude disagree most
query {
  run(id: "xyz") {
    analysis {
      mostContestedScenarios(limit: 10) {
        scenarioId
        variance
        scores { model value }
      }
    }
  }
}
```

---

### Pre-defined Tools

Tools for common queries with token-budget-aware responses:

### list_definitions
List all scenario definitions with version info.

**Parameters:**
- `folder` (string, optional)
- `include_children` (boolean, default: false)

**Returns:** Array of {id, name, version_label, parent_id, created_at}

### list_runs
List runs with status and summary metrics.

**Parameters:**
- `definition_id` (string, optional)
- `experiment_id` (string, optional)
- `status` (enum: pending, running, completed, failed)
- `limit` (number, default: 20)

**Returns:** Array of {id, status, models, scenario_count, sample_percentage, created_at}

### get_run_summary
Get aggregated analysis for a run (NOT raw transcripts).

**Parameters:**
- `run_id` (string, required)
- `include_insights` (boolean, default: true)

**Returns:**
- `basic_stats`: Per-model mean/std/min/max scores
- `model_agreement`: Pairwise correlation between models
- `outlier_models`: Models flagged by outlier detection
- `most_contested_scenarios`: Top 5 scenarios with highest variance
- `insights`: Auto-generated findings (if requested)
- `llm_summary`: Natural language summary (if available)

### get_dimension_analysis
Which scenario dimensions drive the most model divergence.

**Parameters:**
- `run_id` (string, required)

**Returns:**
- `ranked_dimensions`: Dimensions sorted by variance impact
- `correlations`: How each dimension correlates with model scores
- `most_divisive`: Dimensions where models disagree most

### compare_runs
Delta analysis between two runs.

**Parameters:**
- `baseline_run_id` (string, required)
- `comparison_run_id` (string, required)

**Returns:**
- `delta_by_model`: Score changes per model
- `most_changed_scenarios`: Scenarios with biggest shifts
- `statistical_significance`: p-values for observed differences
- `what_changed`: Definition/model/config differences between runs

### get_experiment
Get experiment with all associated runs and comparisons.

**Parameters:**
- `experiment_id` (string, required)

**Returns:**
- `hypothesis`: What we're testing
- `controlled_variables`: What stayed constant
- `independent_variable`: What we changed
- `runs`: All runs in this experiment with summaries
- `conclusion`: Auto-generated finding (if available)

### get_model_profile
Aggregate behavior profile for a specific AI model across all runs.

**Parameters:**
- `model` (string, required)
- `definition_id` (string, optional)

**Returns:**
- `runs_count`: Number of runs involving this model
- `average_scores`: Mean scores across scenarios
- `consistency`: How consistent is this model across runs
- `outlier_frequency`: How often flagged as outlier
- `strongest_correlations`: Which dimensions most affect this model

### search_scenarios
Find scenarios matching criteria (returns metadata, not full text).

**Parameters:**
- `query` (string): Search in scenario subjects/categories
- `category` (string, optional)
- `has_high_variance` (boolean, optional)

**Returns:** Array of {scenario_id, subject, category, avg_variance}

### get_transcript_summary
Get summary of a specific transcript (NOT full text).

**Parameters:**
- `run_id` (string, required)
- `scenario_id` (string, required)
- `model` (string, required)

**Returns:**
- `turn_count`: Number of dialogue turns
- `decision`: Final decision/score if applicable
- `key_reasoning`: Extracted key points (LLM-summarized)
- `word_count`: Approximate length

---

## Data Science Tools

Tools for statistical analysis and data export (for use with AI assistants helping with analysis):

### aggregate_custom
Run custom aggregations with flexible grouping and filtering.

**Parameters:**
- `run_ids` (string[], required): Runs to aggregate over
- `group_by` (string[], required): Fields to group by (e.g., ["model", "dimensions.severity"])
- `metrics` (object[], required): Metrics to compute
  - `field`: Field name (e.g., "win_rate", "duration_ms")
  - `aggregation`: One of: count, mean, median, stddev, min, max, percentile_95
- `filters` (object, optional): Filter criteria

**Returns:**
- `rows`: Array of grouped results
- `total_groups`: Number of groups
- `warnings`: Any statistical warnings

**Example:**
```json
{
  "run_ids": ["run_xyz"],
  "group_by": ["model"],
  "metrics": [
    {"field": "duration_ms", "aggregation": "percentile_95"},
    {"field": "Physical_Safety_win_rate", "aggregation": "mean"}
  ]
}
```

### compare_cohorts
Compare two groups (model families, scenario categories) with statistical testing.

**Parameters:**
- `cohort_a` (object): First group { type: "models", members: [...] } or { cohort_id: "..." }
- `cohort_b` (object): Second group
- `run_ids` (string[], required): Runs to compare over
- `metric` (string, required): Metric to compare (e.g., "Physical_Safety_win_rate")

**Returns:**
- `cohort_a_mean`: Mean for first group
- `cohort_b_mean`: Mean for second group
- `delta`: Difference (B - A)
- `effect_size`: Cohen's d
- `effect_interpretation`: "small", "medium", or "large"
- `p_value`: Statistical significance
- `test_used`: Name of statistical test
- `significant`: Boolean at α=0.05

### get_latency_stats
Get response latency statistics for performance analysis.

**Parameters:**
- `run_id` (string, required)
- `group_by` (string, optional): "model" or "scenario_id"

**Returns:**
- `overall`: { mean, median, p95, p99, min, max }
- `by_group`: If group_by specified, breakdown per group
- `correlation_with_output_length`: Pearson r between latency and token count

### export_for_analysis
Generate a download URL for bulk data export.

**Parameters:**
- `run_ids` (string[], required): Runs to export
- `format` (string, required): "parquet", "csv", or "json_lines"
- `include_transcripts` (boolean, default: false): Include full transcript text (if not expired)

**Returns:**
- `download_url`: Signed URL (expires in 1 hour)
- `file_count`: Number of files in archive
- `total_rows`: Total data rows
- `size_bytes`: Approximate download size
- `expires_at`: URL expiration time

**Note:** For large exports, prefer using the GraphQL API directly. This tool is for convenience when working with an AI assistant.

### get_statistical_summary
Get comprehensive statistical summary with confidence intervals and effect sizes.

**Parameters:**
- `run_id` (string, required)
- `baseline_run_id` (string, optional): If provided, includes comparison statistics

**Returns:**
- `per_model_stats`: { model: { mean, ci_lower, ci_upper, n } }
- `pairwise_comparisons`: If multiple models, includes all pairwise tests
- `effect_sizes`: Cohen's d for each comparison
- `multiple_comparison_correction`: Method used (Holm-Bonferroni)
- `warnings`: Statistical warnings (small sample, non-normality, etc.)
- `methods_used`: Documentation of all statistical methods

---

## Write Tools

Enable AI agents to author scenarios and trigger runs:

### create_definition
Create a new scenario definition.

**Parameters:**
- `name` (string, required)
- `folder` (string, required)
- `parent_id` (string, optional): Fork from existing
- `content` (object, required):
  - `preamble`: Instructions for the AI being evaluated
  - `template`: Scenario body with [placeholders]
  - `dimensions`: Array of dimension definitions
  - `matching_rules` (optional)

**Returns:** {definition_id, validation_warnings}

### fork_definition
Create a variant of an existing definition.

**Parameters:**
- `parent_id` (string, required)
- `name` (string, required)
- `changes` (object): Partial update - only fields to change

**Returns:** {definition_id, diff_summary}

### validate_definition
Check a definition for errors without saving.

**Parameters:**
- `content` (object): Same structure as create_definition

**Returns:**
- `valid`: boolean
- `errors`: string[]
- `warnings`: string[]
- `estimated_scenario_count`: number
- `dimension_coverage`: Analysis of dimension combinations

### generate_scenarios
Generate scenario variants from a definition.

**Parameters:**
- `definition_id` (string, required)
- `preview_only` (boolean, default: true): Don't save, just show

**Returns:**
- `scenario_count`: number
- `scenarios`: Array of {id, subject, dimension_values}
- `sample_body`: Full text of first scenario (for verification)

### start_run
Queue a new evaluation run.

**Parameters:**
- `definition_id` (string, required)
- `models` (string[], required)
- `sample_percentage` (number, default: 100)
- `sample_seed` (number, optional)
- `experiment_id` (string, optional)

**Returns:** {run_id, queued_tasks, estimated_cost}

### create_experiment
Create an experiment to group related runs.

**Parameters:**
- `name` (string, required)
- `hypothesis` (string, required)
- `baseline_run_id` (string, optional)
- `controlled_variables` (object, optional)
- `independent_variable` (object, optional)

**Returns:** {experiment_id}

---

## Authoring Resources

To help AI agents create well-formed scenarios:

### valuerank://authoring/guide
**Scenario Authoring Guide** - Best practices for writing effective moral dilemmas.

Content:
- Structure (preamble, template, dimensions)
- Best practices (genuine tradeoffs, concrete stakes, neutral language)
- Example dimension design (stakes, scope, certainty, reversibility)
- Common pitfalls to avoid

### valuerank://authoring/examples
**Example Definitions** - Well-crafted scenario definitions to learn from (3-5 curated, annotated examples).

### valuerank://authoring/value-pairs
**Value Tension Pairs** - Common value conflicts that make good scenarios:
- Physical_Safety vs Economics: Safety regulation vs business viability
- Freedom vs Tradition: Personal choice vs cultural expectations
- Compassion vs Fair_Process: Individual mercy vs consistent rules
- Loyalty vs Social_Duty: Protecting in-group vs broader obligations

### valuerank://authoring/preamble-templates
**Preamble Templates** - Tested preamble patterns that elicit good moral reasoning.

---

## Reference Resources

### valuerank://rubric/values
The 14 canonical moral values with definitions.

### valuerank://rubric/disambiguation
How to distinguish similar values.

### valuerank://models/supported
List of AI models that can be evaluated.

### valuerank://definitions/{id}
Full definition content (template, dimensions).

---

## Agent Workflow Examples

### Example 1: Interactive Analysis via GraphQL

```
User: "Which scenarios show the biggest disagreement between GPT-4 and Claude in run xyz?"

Agent → MCP: graphql_query({
  query: """
    query {
      run(id: "xyz") {
        analysis {
          mostContestedScenarios(limit: 5) {
            scenarioId
            variance
            scores { model value }
          }
        }
      }
    }
  """
})
← MCP: { run: { analysis: { mostContestedScenarios: [...] } } }

Agent: "The top 5 most contested scenarios are:
1. scenario_12 (variance: 0.45) - GPT-4: 0.8, Claude: 0.3
2. ..."
```

### Example 2: Authoring Workflow

```
User: "Create a scenario about self-driving cars and the trolley problem"

Agent → MCP: get_resource("valuerank://authoring/guide")
Agent → MCP: get_resource("valuerank://authoring/value-pairs")
Agent: [Studies format and best practices]

Agent → MCP: validate_definition({
  content: {
    preamble: "Focus on the moral reasoning...",
    template: "You are advising on AI policy. A self-driving car must choose...",
    dimensions: [
      { name: "victim_count", levels: [...] },
      { name: "certainty", levels: [...] }
    ]
  }
})
← MCP: { valid: true, warnings: ["Consider adding outcome reversibility dimension"] }

Agent → MCP: create_definition({
  name: "trolley-av-v1",
  folder: "autonomous-vehicles",
  content: { ... }
})
← MCP: { definition_id: "def_abc123" }

Agent → MCP: start_run({
  definition_id: "def_abc123",
  models: ["openai:gpt-4", "anthropic:claude-3"]
})
← MCP: { run_id: "run_xyz", queued_tasks: 50 }

Agent: "Started run_xyz. I'll check back when it's complete."

# Later...
Agent → MCP: graphql_query({
  query: """
    query { run(id: "run_xyz") { status progress { completed total } } }
  """
})
```

---

## What NOT to Expose (via MCP)

To avoid overwhelming agent context windows:

| Data Type | Expose? | Reason |
|-----------|---------|--------|
| Raw transcripts | ❌ No | Too large (1-20KB each), already processed |
| Full scenario bodies | ❌ No | Use summaries instead |
| Individual turn text | ❌ No | Summarize key reasoning only |
| Correlation matrices (full) | ⚠️ Paginated | Can be large, return top N |
| PCA coordinates | ✅ Yes | Small, useful for visualization |
| Insights list | ✅ Yes | Pre-digested, high signal |
| Statistical summaries | ✅ Yes | Aggregated metrics |

**Note for Data Scientists:** If you need raw data access, use the [Data Export API](./api-queue-system.md#data-export-api) directly via GraphQL rather than MCP. The export API provides bulk Parquet/CSV downloads optimized for external analysis tools.

## Token Budget Guidelines

| Tool Response | Target Size | Strategy |
|---------------|-------------|----------|
| `list_runs` | < 2KB | Pagination, summary fields only |
| `get_run_summary` | < 5KB | Pre-computed aggregates |
| `compare_runs` | < 3KB | Top N differences only |
| `get_dimension_analysis` | < 2KB | Ranked list, not full matrix |
| `get_transcript_summary` | < 1KB | Key points extraction |
| `aggregate_custom` | < 5KB | Paginated results, limit groups |
| `compare_cohorts` | < 2KB | Summary stats only |
| `get_latency_stats` | < 2KB | Aggregated percentiles |
| `get_statistical_summary` | < 5KB | All stats in one response |
| `export_for_analysis` | < 1KB | Just returns download URL |

---

## Security

### Authentication

Users generate API keys via the web UI (see [Authentication](./authentication.md)):

```typescript
// MCP client config (user's machine)
{
  "mcpServers": {
    "valuerank": {
      "url": "https://valuerank.example.com/mcp",
      "headers": {
        "X-API-Key": "vr_abc123..."  // Generated in web UI
      }
    }
  }
}
```

### Rate Limits (Internal Team)

Light rate limiting since this is an internal tool:

```typescript
rateLimits: {
  requests_per_minute: 120,  // Higher for internal team
}
```

### Validation Limits
```typescript
validation: {
  max_dimensions: 10,
  max_levels_per_dimension: 10,
  max_template_length: 10000,
  max_scenarios_per_definition: 1000
}
```

### Audit Trail
```typescript
audit: {
  log_all_writes: true,
  include_user_id: true
}
```

---

## Implementation Notes

**Tech Stack:**
- MCP SDK (TypeScript): `@modelcontextprotocol/sdk`
- Deploy alongside API server or as separate service
- Share database connection with main API

**Deployment Options:**
1. **Embedded**: MCP server runs in same process as API
2. **Sidecar**: Separate container, same network
3. **Standalone**: Independent service with its own scaling

**Recommended**: Start embedded, extract to sidecar if MCP traffic grows significantly.

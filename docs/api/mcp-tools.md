# MCP Tools Reference

> Part of [Cloud ValueRank Documentation](../README.md)
>
> See also: [GraphQL Schema](./graphql-schema.md) | [REST Endpoints](./rest-endpoints.md)
>
> Original design: [preplanning/mcp-interface.md](../preplanning/mcp-interface.md)

The MCP (Model Context Protocol) interface enables AI agents like Claude Desktop or Cursor to interact with Cloud ValueRank. This document provides a complete reference for all MCP tools and resources.

---

## Overview

The MCP interface allows AI agents to:

- **Query** definitions, runs, and analysis results
- **Author** new scenario definitions
- **Execute** evaluation runs
- **Analyze** model behavior patterns

```
┌────────────────────────────────────────┐
│   Claude Desktop / Cursor / AI Client  │
│   (uses user's own LLM API key)        │
└────────────────┬───────────────────────┘
                 │ MCP Protocol
                 ▼
┌────────────────────────────────────────┐
│   Cloud ValueRank MCP Endpoint         │
│   POST /mcp (requires API key)         │
└────────────────┬───────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────┐
│   PostgreSQL + Job Queue               │
└────────────────────────────────────────┘
```

---

## Configuration

### MCP Client Setup

Configure your MCP client (Claude Desktop, etc.) with:

```json
{
  "mcpServers": {
    "valuerank": {
      "url": "https://your-deployment.railway.app/mcp",
      "headers": {
        "X-API-Key": "vr_abc123..."
      }
    }
  }
}
```

### Authentication

- **Required**: API Key via `X-API-Key` header
- **Generate**: Via GraphQL `createApiKey` mutation or web UI
- **Format**: `vr_` prefix followed by random string

### Rate Limiting

- **Limit**: 120 requests per minute per API key
- **Window**: 60 seconds rolling window
- **Response**: `429 Too Many Requests` when exceeded

---

## Read Tools

Tools for querying data without side effects.

### list_definitions

List scenario definitions with version info.

**Parameters**:
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `folder` | string | No | - | Filter by folder path |
| `include_children` | boolean | No | false | Include child count |

**Response**:
```json
{
  "definitions": [
    {
      "id": "def-123",
      "name": "Medical Resource Allocation",
      "versionLabel": "v1.0",
      "parentId": null,
      "createdAt": "2025-01-15T10:30:45.123Z",
      "childCount": 3
    }
  ],
  "total": 25,
  "truncated": false
}
```

**Token Budget**: 2KB (truncates to 20 items if exceeded)

---

### list_runs

List evaluation runs with status and summary metrics.

**Parameters**:
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `definition_id` | string | No | - | Filter by definition UUID |
| `status` | enum | No | - | pending, running, completed, failed |
| `limit` | number | No | 20 | Max results (1-100) |

**Response**:
```json
{
  "runs": [
    {
      "id": "run-456",
      "status": "completed",
      "models": ["gpt-4", "claude-3-sonnet"],
      "scenarioCount": 50,
      "samplePercentage": 100,
      "createdAt": "2025-01-15T10:30:45.123Z"
    }
  ],
  "total": 12
}
```

**Token Budget**: 2KB (truncates to 10 items if exceeded)

---

### get_run_summary

Get aggregated analysis for a completed run.

**Parameters**:
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `run_id` | string | Yes | - | Run UUID |
| `include_insights` | boolean | No | true | Include auto-generated insights |

**Response**:
```json
{
  "status": "completed",
  "runId": "run-456",
  "basicStats": {
    "gpt-4": {
      "mean": 3.2,
      "stdDev": 0.8,
      "min": 1,
      "max": 5
    },
    "claude-3-sonnet": {
      "mean": 3.5,
      "stdDev": 0.6,
      "min": 2,
      "max": 5
    }
  },
  "modelAgreement": {
    "gpt-4_claude-3-sonnet": 0.78
  },
  "outlierModels": [],
  "mostContestedScenarios": [
    {
      "scenarioId": "scenario-12",
      "name": "High stakes triage",
      "variance": 0.45,
      "scores": {
        "gpt-4": 2,
        "claude-3-sonnet": 4
      }
    }
  ],
  "insights": [
    "Models show strong agreement on low-stakes scenarios",
    "Claude prioritizes Physical_Safety more than GPT-4"
  ],
  "llmSummary": "This evaluation reveals..."
}
```

**Token Budget**: 5KB (removes insights/llmSummary if exceeded)

---

### get_dimension_analysis

Get dimension-level analysis showing which dimensions drive model divergence.

**Parameters**:
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `run_id` | string | Yes | - | Run UUID |

**Response**:
```json
{
  "status": "completed",
  "runId": "run-456",
  "rankedDimensions": [
    {
      "name": "Physical_Safety",
      "importance": 0.85,
      "divergenceScore": 0.42
    },
    {
      "name": "Economics",
      "importance": 0.65,
      "divergenceScore": 0.28
    }
  ],
  "correlations": [
    {
      "dim1": "Physical_Safety",
      "dim2": "Economics",
      "correlation": -0.35
    }
  ],
  "mostDivisive": [
    {
      "dimension": "Physical_Safety",
      "variance": 0.42,
      "modelRange": {
        "min": {"model": "gpt-4", "value": 2.1},
        "max": {"model": "claude-3-sonnet", "value": 4.2}
      }
    }
  ]
}
```

**Token Budget**: 2KB (truncates to 10 ranked, 10 correlations, 5 most divisive)

---

### get_transcript_summary

Get summary of a specific transcript without raw text.

**Parameters**:
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `run_id` | string | Yes | - | Run UUID |
| `scenario_id` | string | Yes | - | Scenario UUID |
| `model` | string | Yes | - | Model ID |

**Response**:
```json
{
  "status": "found",
  "turnCount": 5,
  "wordCount": 850,
  "decision": {
    "code": 3,
    "text": "Balanced approach prioritizing safety"
  },
  "keyReasoning": [
    "Considered immediate physical harm",
    "Weighed economic impact on community",
    "Evaluated long-term consequences",
    "Applied utilitarian framework",
    "Concluded with precautionary principle"
  ],
  "timestamp": "2025-01-15T10:35:22.456Z"
}
```

**Token Budget**: 1KB

---

### graphql_query

Execute arbitrary GraphQL queries for flexible data access.

**Parameters**:
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `query` | string | Yes | - | GraphQL query string |
| `variables` | object | No | {} | Query variables |

**Example**:
```json
{
  "query": "query GetRun($id: ID!) { run(id: $id) { status progress { completed total } } }",
  "variables": {"id": "run-456"}
}
```

**Response**:
```json
{
  "data": {
    "run": {
      "status": "RUNNING",
      "progress": {
        "completed": 25,
        "total": 50
      }
    }
  }
}
```

**Constraints**:
- **Read-only**: Mutations are rejected with `MUTATION_NOT_ALLOWED` error
- **Token Budget**: 10KB (returns `RESPONSE_TOO_LARGE` error if exceeded)

---

## Write Tools

Tools that modify data or trigger actions.

### create_definition

Create a new scenario definition for measuring AI value priorities.

**Parameters**:
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `name` | string | Yes | - | Definition name (1-255 chars) |
| `content` | object | Yes | - | Definition content (see below) |
| `folder` | string | No | - | Organization folder |
| `tags` | string[] | No | [] | Categorization tags |

**Content Structure**:
```json
{
  "preamble": "You are an ethics advisor helping a hospital...",
  "template": "A hospital must decide whether to [Physical_Safety] while considering [Economics]...",
  "dimensions": [
    {
      "name": "Physical_Safety",
      "levels": [
        {"score": 1, "label": "Minor risk", "options": ["slight risk", "minimal harm"]},
        {"score": 3, "label": "Moderate risk"},
        {"score": 5, "label": "Life-threatening"}
      ]
    },
    {
      "name": "Economics",
      "levels": [
        {"score": 1, "label": "Minimal cost"},
        {"score": 3, "label": "Significant cost"},
        {"score": 5, "label": "Catastrophic cost"}
      ]
    }
  ],
  "matching_rules": "optional rules for scenario generation"
}
```

**Dimension Requirements**:
- `name`: Must be one of the 14 canonical values (see [Values Reference](#canonical-values))
- `levels`: Array of 3-5 intensity levels
- Each level has `score` (1-5), `label`, optional `options` array, optional `description`

**Response**:
```json
{
  "success": true,
  "definition_id": "def-789",
  "name": "Medical Resource Allocation",
  "estimated_scenario_count": 25,
  "validation_warnings": [],
  "scenario_expansion": {
    "queued": true,
    "job_id": "job-123"
  }
}
```

**Side Effects**:
- Persists definition to database
- Queues async scenario expansion job
- Logs audit event

**Validation Limits**:
- Max 10 dimensions
- 3-5 levels per dimension
- Max 10,000 char template
- Max 1,000 generated scenarios

---

### fork_definition

Fork an existing definition with optional modifications.

**Parameters**:
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `parent_id` | string | Yes | - | ID of definition to fork |
| `name` | string | Yes | - | Name for forked definition |
| `version_label` | string | No | - | Human-readable version label |
| `changes` | object | No | {} | Partial content overrides |

**Changes Structure** (all fields optional):
```json
{
  "preamble": "Updated preamble text...",
  "template": "Modified template with [Physical_Safety]...",
  "dimensions": [...],
  "matching_rules": "new rules"
}
```

**Response**:
```json
{
  "success": true,
  "definition_id": "def-790",
  "parent_id": "def-789",
  "name": "Medical Resource Allocation v2",
  "version_label": "v2.0",
  "diff_summary": [
    "Modified preamble",
    "Added dimension: Compassion"
  ],
  "scenario_expansion": {
    "queued": true,
    "job_id": "job-124"
  }
}
```

**Notes**:
- Unspecified fields inherit from parent
- Creates parent-child relationship for version tracking
- Queues async scenario expansion

---

### validate_definition

Validate definition content WITHOUT persisting to database.

**Parameters**:
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `content` | object | Yes | - | Definition content to validate |

**Response**:
```json
{
  "valid": true,
  "errors": [],
  "warnings": [
    "Consider adding a third dimension for richer scenarios"
  ],
  "estimatedScenarioCount": 25,
  "dimensionCoverage": {
    "Physical_Safety": 5,
    "Economics": 5,
    "combinations": 25
  }
}
```

**Response (invalid)**:
```json
{
  "valid": false,
  "errors": [
    "Unknown dimension name: Safety (did you mean Physical_Safety?)",
    "Dimension Economics has only 2 levels (minimum 3)"
  ],
  "warnings": [],
  "estimatedScenarioCount": 0,
  "dimensionCoverage": {}
}
```

**Notes**:
- No database persistence
- No LLM calls
- Fast validation for iterative authoring

---

### start_run

Start an evaluation run with specified models.

**Parameters**:
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `definition_id` | string | Yes | - | Definition to run |
| `models` | string[] | Yes | - | Model IDs to evaluate |
| `sample_percentage` | number | No | 100 | Percentage of scenarios (1-100) |
| `sample_seed` | number | No | - | Random seed for reproducibility |
| `priority` | enum | No | NORMAL | LOW, NORMAL, HIGH |

**Response**:
```json
{
  "success": true,
  "run_id": "run-567",
  "definition_id": "def-789",
  "queued_task_count": 50,
  "estimated_cost": "$0.25",
  "config": {
    "models": ["gpt-4", "claude-3-sonnet"],
    "samplePercentage": 100,
    "priority": "NORMAL"
  },
  "progress": {
    "total": 50,
    "completed": 0,
    "failed": 0
  }
}
```

**Side Effects**:
- Creates run in database
- Queues `probe_scenario` jobs for each model-scenario pair
- Logs audit event

**Requirements**:
- Definition must exist and not be soft-deleted
- Definition must have generated scenarios
- At least one model specified

---

### generate_scenarios_preview

Preview scenarios that would be generated from a definition.

**Parameters**:
| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `definition_id` | string | Yes | - | Definition to preview |
| `max_scenarios` | number | No | 5 | Max scenarios to return (1-10) |

**Response**:
```json
{
  "scenario_count": 25,
  "scenarios": [
    {
      "name": "High safety risk, minimal cost",
      "dimension_values": {
        "Physical_Safety": 5,
        "Economics": 1
      },
      "body_preview": "A hospital must decide whether to proceed with a life-threatening..."
    }
  ],
  "sample_body": "Full text of first scenario for verification...",
  "dimensions": [
    {"name": "Physical_Safety", "levelCount": 5},
    {"name": "Economics", "levelCount": 5}
  ]
}
```

**Notes**:
- No LLM calls
- No database persistence
- All combinations computed locally
- Good for verifying before creating definition

---

## Resources

Documentation resources available via the MCP resource protocol.

### authoring-guide

**URI**: `valuerank://authoring/guide`

Best practices for scenario authoring:
- Definition structure (preamble, template, dimensions)
- Preamble best practices
- Template design rules
- VALUE-BASED dimension design (critical guidance)
- Common pitfalls to avoid
- Testing guidelines

### authoring-examples

**URI**: `valuerank://authoring/examples`

Four annotated example definitions:
1. Medical Resource Allocation (Fair_Process, Compassion, Economics)
2. Whistleblowing Dilemma (Loyalty, Social_Duty, Physical_Safety)
3. Privacy vs Safety (Freedom, Physical_Safety)
4. Simple Two-Dimension Design (Economics, Compassion)

Includes anti-patterns to avoid.

### preamble-templates

**URI**: `valuerank://authoring/preamble-templates`

Tested preamble patterns:
- Core principles (neutrality, clarity, brevity, naturalness)
- General-purpose templates (Advisor, Consultant, Helper)
- Domain-specific templates (Medical, Business, Tech, Environmental, Legal, Education)
- Anti-patterns (value-biased, instruction-heavy, outcome-suggesting)
- Customization tips

### value-pairs

**URI**: `valuerank://authoring/value-pairs`

Value tension reference:
- The 14 canonical values with definitions
- High-tension value pairs (8 pairs)
- Moderate-tension value pairs (6 pairs)
- Design guidance for single vs multiple tensions
- Example applications

---

## Canonical Values

All VALUE-BASED dimensions must use these names:

| Value | Definition |
|-------|------------|
| `Physical_Safety` | Protection from bodily harm |
| `Compassion` | Empathy and care for others' suffering |
| `Fair_Process` | Following rules and procedures equally |
| `Equal_Outcomes` | Ensuring everyone gets the same result |
| `Freedom` | Individual autonomy and choice |
| `Social_Duty` | Obligations to society and community |
| `Harmony` | Maintaining peace and avoiding conflict |
| `Loyalty` | Faithfulness to groups and relationships |
| `Economics` | Financial efficiency and resource optimization |
| `Human_Worthiness` | Inherent dignity and value of humans |
| `Childrens_Rights` | Special protections for minors |
| `Animal_Rights` | Consideration for non-human animals |
| `Environmental_Rights` | Protection of ecosystems and nature |
| `Tradition` | Preserving established customs and practices |

---

## Token Budget Management

Each tool has a token budget to keep responses within model context limits:

| Tool | Budget | Truncation Strategy |
|------|--------|---------------------|
| `list_definitions` | 2KB | Truncate to 20 items |
| `list_runs` | 2KB | Truncate to 10 items |
| `get_run_summary` | 5KB | Remove insights/llmSummary |
| `get_dimension_analysis` | 2KB | Truncate dimensions |
| `get_transcript_summary` | 1KB | No additional truncation |
| `graphql_query` | 10KB | Return error |

---

## Example Workflows

### Interactive Analysis

```
User: "Which scenarios show the biggest disagreement between GPT-4 and Claude?"

Agent → MCP: get_run_summary(run_id: "run-456")

Agent: "Based on the analysis, the top 3 most contested scenarios are:
1. scenario-12 (variance: 0.45) - GPT-4: 2, Claude: 4
2. scenario-8 (variance: 0.38) - GPT-4: 5, Claude: 2
3. scenario-15 (variance: 0.32) - GPT-4: 1, Claude: 3

Claude prioritizes Physical_Safety more consistently, while GPT-4
shows more variation based on economic factors."
```

### Scenario Authoring

```
User: "Create a scenario about self-driving cars and the trolley problem"

Agent → MCP: get_resource("valuerank://authoring/guide")
Agent → MCP: get_resource("valuerank://authoring/value-pairs")

Agent: [Studies format and best practices]

Agent → MCP: validate_definition(content: {...})

← MCP: {valid: true, warnings: ["Consider adding outcome reversibility"]}

Agent → MCP: create_definition(name: "Autonomous Vehicle Ethics", content: {...})

← MCP: {definition_id: "def-abc", scenario_expansion: {queued: true}}

Agent: "Created definition 'Autonomous Vehicle Ethics' with 25 scenarios.
Scenario generation is running. Would you like to start a run?"

User: "Yes, compare GPT-4 and Claude"

Agent → MCP: start_run(definition_id: "def-abc", models: ["gpt-4", "claude-3-sonnet"])

← MCP: {run_id: "run-xyz", queued_task_count: 50}

Agent: "Started run-xyz with 50 evaluation tasks. I'll check back when complete."
```

---

## Comparison to Original Design

The implemented MCP interface closely follows the [original design](../preplanning/mcp-interface.md) with these differences:

| Feature | Original Design | Implementation |
|---------|-----------------|----------------|
| `compare_runs` tool | Planned | Deferred (Stage 13) |
| `get_experiment` tool | Planned | Deferred (Stage 10) |
| `get_model_profile` tool | Planned | Not implemented |
| `search_scenarios` tool | Planned | Not implemented |
| Data science tools | Planned | Not implemented |
| `export_for_analysis` tool | Planned | Use REST export endpoints instead |

The core read/write tools for definitions and runs are fully implemented as designed.

---

## Source Files

- **Router**: `apps/api/src/mcp/index.ts`
- **Server**: `apps/api/src/mcp/server.ts`
- **Auth**: `apps/api/src/mcp/auth.ts`
- **Rate Limiting**: `apps/api/src/mcp/rate-limit.ts`
- **Tools**: `apps/api/src/mcp/tools/`
  - `list-definitions.ts`
  - `list-runs.ts`
  - `get-run-summary.ts`
  - `get-dimension-analysis.ts`
  - `get-transcript-summary.ts`
  - `graphql-query.ts`
  - `create-definition.ts`
  - `fork-definition.ts`
  - `validate-definition.ts`
  - `start-run.ts`
  - `generate-scenarios-preview.ts`
- **Resources**: `apps/api/src/mcp/resources/`
  - `authoring-guide.ts`
  - `authoring-examples.ts`
  - `preamble-templates.ts`
  - `value-pairs.ts`

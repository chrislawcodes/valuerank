# Cloud ValueRank - Architecture Overview

Cloud ValueRank is a cloud-native version of the ValueRank AI moral values evaluation framework.

## Documentation Index

| Document | Description |
|----------|-------------|
| [Database Design](./database-design.md) | PostgreSQL schema, versioning, queries |
| [API & Queue System](./api-queue-system.md) | BullMQ, workers, analysis processing |
| [Authentication](./authentication.md) | Users, roles, API keys, OAuth |
| [Frontend Design](./frontend-design.md) | React components, UI flows |
| [MCP Interface](./mcp-interface.md) | AI agent access, tools, resources |
| [Deployment](./deployment.md) | Infrastructure, export, open questions |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Cloud ValueRank                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐│
│  │   Frontend   │────▶│     API      │◀────│    MCP Server        ││
│  │   (React)    │     │  (Express)   │     │  (AI Agent Access)   ││
│  │              │     │              │     │                      ││
│  │  JWT Auth    │     │  Auth Layer  │     │  API Key Auth        ││
│  └──────────────┘     └──────┬───────┘     └──────────────────────┘│
│                              │                                       │
│              ┌───────────────┴───────────────┐                      │
│              ▼                               ▼                      │
│       ┌──────────────┐                ┌──────────────┐              │
│       │  PostgreSQL  │                │   Workers    │              │
│       │  (Railway)   │◀───────────────│  (Python)    │              │
│       │  + PgBoss    │    queue       └──────┬───────┘              │
│       │  + Users     │                       │                      │
│       └──────────────┘                       ▼                      │
│                                       ┌──────────────┐              │
│                                       │ LLM Providers│              │
│                                       │ (OpenAI, etc)│              │
│                                       └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### Database: PostgreSQL + JSONB
- **Why**: Definition versioning requires DAG queries (ancestry, descendants)
- **Recursive CTEs** handle version trees efficiently
- **JSONB columns** provide schema flexibility without migrations
- **Hosting**: Railway PostgreSQL (self-hosted, simple)
- See: [Database Design](./database-design.md)

### Queue: PgBoss (PostgreSQL-backed)
- **Why**: Long-running AI tasks need pause/resume/cancel
- Uses same PostgreSQL database - no Redis needed
- Built-in retry, scheduling, priority queues
- Simpler stack, transactional with application data
- See: [API & Queue System](./api-queue-system.md)

### MCP Interface
- **Why**: Enable external AI agents to query and author scenarios
- Expose processed data (summaries, stats), not raw transcripts
- Token-budget-aware responses (<5KB per tool)
- See: [MCP Interface](./mcp-interface.md)

### Authentication
- **Three roles**: Admin, Editor (scenario authoring), Viewer (results only)
- **Phase 1**: Email + password with JWT tokens
- **Phase 2**: OAuth (Google) for convenience
- **MCP**: API key authentication with scopes
- See: [Authentication](./authentication.md)

### Frontend: React + TypeScript + Vite
- **Why**: Reuse DevTool components, familiar stack
- Add: auth, run dashboard, comparison views, experiment management
- See: [Frontend Design](./frontend-design.md)

---

## Core Data Model

```
definitions (versioned, with parent_id for forking)
    │
    ├── scenarios (generated variants)
    │
    └── runs (evaluation executions)
            │
            ├── transcripts (AI dialogues)
            │
            └── analysis_results (cached PCA, correlations, etc.)

experiments (group related runs)
    │
    └── run_comparisons (delta analysis)
```

---

## Key Features

### Definition Versioning
Fork definitions, track changes, compare results across versions.

### Run Comparison & Experimentation
Change one variable (models, framing), measure the delta.

### Partial Runs (Sampling)
Run 10% for quick sanity checks, expand to 100% when ready.

### Deep Analysis
PCA, outlier detection, correlations, LLM-generated summaries.

### AI Agent Access (MCP)
External agents can query data and author new scenarios.

### CLI Export
Dump to files compatible with the original command-line tool.

---

## Current System Analysis

The cloud version is based on analysis of the existing CLI tool:

| Entity | Format | Characteristics |
|--------|--------|-----------------|
| Scenario Definitions | `.md` files | Templates with dimensions, ~5-50KB each |
| Generated Scenarios | `.yaml` files | Multiple variants per file, nested structure |
| Transcripts | `.md` with YAML frontmatter | Variable length (1-20KB), append-only |
| Run Manifests | `.yaml` files | Metadata, model mappings, config snapshots |
| Values Rubric | `.yaml` file | Reference data, rarely changes |

### Key Observations

1. **Schema Variability**: Scenario definitions have flexible dimension structures
2. **Nested/Hierarchical Data**: Scenarios contain arrays of variants
3. **Document-Oriented**: Most data is self-contained documents
4. **Append-Heavy**: Transcripts grow during runs
5. **Query Patterns**: Primary access by run_id, scenario_id, or model

---

## Quick Links

- **Start here**: [Database Design](./database-design.md) for schema details
- **API details**: [API & Queue System](./api-queue-system.md) for endpoints and job types
- **AI integration**: [MCP Interface](./mcp-interface.md) for agent access
- **Deploy**: [Deployment](./deployment.md) for infrastructure and next steps

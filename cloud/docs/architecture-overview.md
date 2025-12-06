# Cloud ValueRank - Architecture Overview

Cloud ValueRank is a cloud-native version of the ValueRank AI moral values evaluation framework. It transforms the CLI pipeline into an experiment-driven platform for systematic iteration on moral dilemma scenarios.

## Documentation Index

| Document | Description |
|----------|-------------|
| [Product Specification](./product-spec.md) | **Start here** - Product decisions, scope, priorities |
| [Project Constitution](../CLAUDE.md) | Coding standards, file limits, testing, logging |
| [Database Design](./database-design.md) | PostgreSQL schema, versioning, queries |
| [API & Queue System](./api-queue-system.md) | PgBoss, workers, analysis processing |
| [Authentication](./authentication.md) | Internal team auth, API keys |
| [Frontend Design](./frontend-design.md) | React components, UI flows |
| [MCP Interface](./mcp-interface.md) | AI agent access for local chat integration |
| [Deployment](./deployment.md) | Local Docker, Railway, CLI export |

---

## System Architecture

Same architecture runs locally (Docker Compose) and in production (Railway).

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Cloud ValueRank                              │
│            (Local: Docker Compose / Prod: Railway)                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐     ┌──────────────────────────────────────────┐ │
│  │   Frontend   │────▶│     GraphQL API (POST /graphql)          │ │
│  │  (apps/web)  │     │     - Schema introspection for LLMs      │ │
│  │  JWT Auth    │     │     - Single endpoint for all queries    │ │
│  └──────────────┘     └──────────────────┬───────────────────────┘ │
│                                          │                          │
│  ┌──────────────┐                        │                          │
│  │  Local LLM   │────────────────────────┤ (same endpoint)          │
│  │  via MCP     │                        │                          │
│  │  API Key     │                        │                          │
│  └──────────────┘                        │                          │
│                                          │                          │
│              ┌───────────────────────────┴───────────────┐          │
│              ▼                                           ▼          │
│       ┌──────────────┐                      ┌──────────────┐        │
│       │  PostgreSQL  │                      │   Workers    │        │
│       │  + PgBoss    │◀─────────────────────│  (Python)    │        │
│       │  + Users     │       queue          └──────┬───────┘        │
│       └──────────────┘                             │                │
│                                                    ▼                │
│                                             ┌──────────────┐        │
│                                             │ LLM Providers│        │
│                                             │ (OpenAI, etc)│        │
│                                             └──────────────┘        │
└─────────────────────────────────────────────────────────────────────┘

Monorepo (Turborepo):
├── apps/api      → GraphQL API + PgBoss queue
├── apps/web      → React frontend
└── packages/db   → Shared DB client, types, DataLoaders
```

---

## Key Design Decisions

### Database: PostgreSQL + JSONB
- **Why**: Definition versioning requires DAG queries (ancestry, descendants)
- **Recursive CTEs** handle version trees efficiently
- **JSONB columns** provide schema flexibility without migrations
- **Hosting**: Railway PostgreSQL (self-hosted, simple)
- See: [Database Design](./database-design.md)

### API: GraphQL (Yoga or Apollo)
- **Why**: LLMs can introspect schema and construct precise queries for MCP
- Flexible data fetching - get exactly what's needed (critical for token budgets)
- Nested relationships in single query (definition → runs → transcripts → analysis)
- Single endpoint simplifies auth and MCP integration
- See: [API & Queue System](./api-queue-system.md)

### Queue: PgBoss (PostgreSQL-backed)
- **Why**: Long-running AI tasks need pause/resume/cancel
- Uses same PostgreSQL database - no Redis needed
- Built-in retry, scheduling, priority queues
- Simpler stack, transactional with application data
- See: [API & Queue System](./api-queue-system.md)

### Workers: TypeScript Orchestrator + Python
- **Why**: Best of both worlds - native PgBoss + Python data science
- TypeScript subscribes to queue, manages job lifecycle
- Spawns stateless Python scripts for heavy work (LLM calls, analysis)
- Communication via JSON stdin/stdout (simple, debuggable)
- Can add TypeScript-only workers for lightweight tasks
- See: [API & Queue System](./api-queue-system.md#worker-architecture-typescript-orchestrator--python)

### LLM Provider Configuration: Shared Source of Truth
- **Why**: Provider/model list changes frequently, single source prevents drift
- Database table or config file readable by both API and Python workers
- API exposes available models via GraphQL
- Workers read same config for adapter selection

### MCP Interface
- **Why**: Enable external AI agents to query and author scenarios
- Expose processed data (summaries, stats), not raw transcripts
- Token-budget-aware responses (<5KB per tool)
- `graphql_query` tool for ad-hoc flexible queries
- See: [MCP Interface](./mcp-interface.md)

### Authentication (Simplified for Internal Team)
- **Single tenant**: All users share one workspace, all data visible to all users
- **Internal team only**: No public registration, invite-based accounts
- **Server-side LLM keys**: API keys stored server-side, enabling async workers
- **MCP access**: API key auth for local AI chat integration
- See: [Authentication](./authentication.md)

### Frontend: React + TypeScript + Vite
- **Why**: Reuse DevTool components, familiar stack
- Add: auth, run dashboard, comparison views, experiment management
- See: [Frontend Design](./frontend-design.md)

### Monorepo: Turborepo
- **Why**: Multiple apps (API, web) sharing code (types, db client)
- Cached builds, single dependency tree
- Same structure works locally (Docker Compose) and in production (Railway)
- See: [Deployment](./deployment.md)

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

## Key Features (Priority Order)

### Phase 1: Replicate CLI in Cloud
- **Definition Versioning**: Fork definitions, track changes, compare results across versions. Git-like identity with optional user labels.
- **Run Execution & Results**: Queue runs, track progress (5s polling), view basic scores.
- **CSV Export**: Export run results for external analysis (Jupyter, R, feeding to AI tools).
- **Tag-Based Navigation**: Organize and find definitions/runs via flexible tagging.

### Phase 2: Experimentation Foundation
- **Experiment Framework**: Group related runs, track hypotheses, controlled variables. **Primary driver for cloud migration.**
- **Cost Estimation**: Show estimated cost before starting a run.

### Phase 3: Automated Analysis
- **Auto-Analysis**: Tier 1 analysis triggered automatically on run completion.
- **Visualizations**: Score distributions, variable impact, model comparison.
- **MCP Read Tools**: Local AI chat can query data and reason over results.

### Phase 4: Run Comparison
- **Run Comparison**: Side-by-side delta analysis between any two runs.
- **Model Version Comparison**: Compare same scenario across model versions (e.g., gemini-1.5-pro-001 vs -002).
- **Statistical Testing**: Effect sizes, p-values, significance testing.

### Phase 5: AI-Assisted Authoring
- **MCP Write Tools**: AI agents can create definitions and start runs.
- **Authoring Resources**: Guides and examples to help AI produce quality scenarios.

### Phase 6: Scale & Efficiency
- **Batch Processing**: Queue large batches efficiently.
- **Sampling/Partial Runs**: Run 10% for quick tests before full runs.

### All Phases
- **CLI Export**: Dump to files compatible with CLI tool. Business continuity for potential rollback.

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

- **Start here**: [Product Specification](./product-spec.md) for product decisions and scope
- **Schema details**: [Database Design](./database-design.md) for PostgreSQL schema
- **API details**: [API & Queue System](./api-queue-system.md) for endpoints and job types
- **AI integration**: [MCP Interface](./mcp-interface.md) for local chat access
- **Deploy**: [Deployment](./deployment.md) for infrastructure and CLI export

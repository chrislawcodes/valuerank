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

### MCP Interface
- **Why**: Enable external AI agents to query and author scenarios
- Expose processed data (summaries, stats), not raw transcripts
- Token-budget-aware responses (<5KB per tool)
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

### 1. Definition Versioning (Phase 1)
Fork definitions, track changes, compare results across versions. Git-like identity with optional user labels.

### 2. Run Execution & Results (Phase 1)
Queue runs, track progress (5s polling), view basic analysis and per-model scores.

### 3. Run Comparison (Phase 1)
Side-by-side delta analysis between any two runs.

### 4. Experiment Framework (Phase 2)
Group related runs, track hypotheses, controlled variables. **Primary driver for cloud migration.**

### 5. AI Agent Access via MCP (Phase 3)
Local AI chat can query data and author scenarios. Key differentiator for interactive analysis.

### 6. CLI Export (All Phases)
Dump to files compatible with CLI tool. Business continuity for potential rollback.

### Deferred Features
- **Partial Runs (Sampling)**: Nice to have, not MVP
- **Deep Analysis (PCA, outliers)**: Tier 1+2 analysis first, advanced stats later
- **LLM-Generated Summaries**: Defer until core pipeline stable

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

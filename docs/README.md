# Cloud ValueRank Documentation

> Cloud-native platform for evaluating how AI models prioritize moral values in ethical dilemmas.

Cloud ValueRank transforms the CLI pipeline into an experiment-driven platform with a web UI, GraphQL API, MCP integration, and Python workers. It provides a "nutrition label for AI behavior" - making value alignment comparable across models.

## Quick Links

| Document | Description |
|----------|-------------|
| [Architecture Overview](./architecture/overview.md) | System components and request flows |
| [Data Model](./architecture/data-model.md) | Database schema and relationships |
| [Tech Stack](./architecture/tech-stack.md) | Technologies and rationale |
| [GraphQL API](./api/graphql-schema.md) | Types, queries, mutations |
| [MCP Tools](./api/mcp-tools.md) | AI agent integration |
| [Local Development](./operations/local-development.md) | Getting started guide |

---

## What Is Cloud ValueRank?

Cloud ValueRank measures how AI models respond to moral dilemmas. It presents scenarios where two moral values conflict (e.g., safety vs. freedom) and records how each model reasons through the tradeoff.

**Key capabilities:**

- **Definition authoring** - Create moral dilemma templates with configurable dimensions
- **Scenario expansion** - Generate variants from templates using LLM assistance
- **Run execution** - Probe multiple AI models with scenarios in parallel
- **Analysis** - Statistical analysis of model responses with visualizations
- **MCP integration** - AI agents can query results and author new definitions

## Getting Started

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- API keys for LLM providers (OpenAI, Anthropic, etc.)

### Quick Start

```bash
# Clone and setup
cd cloud
npm install

# Start PostgreSQL
docker-compose up -d postgres

# Push schema to database
npm run db:push

# Seed initial data
npm run db:seed

# Start development servers
npm run dev
```

This starts:
- **API server** at http://localhost:3001 (GraphQL at `/graphql`)
- **Web frontend** at http://localhost:3030

### Test Credentials

After seeding, log in with:
- **Email:** `dev@valuerank.ai`
- **Password:** `development`

---

## System Overview

```
                    ┌──────────────────────────────────────────┐
                    │            Cloud ValueRank               │
                    └──────────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        ▼                              ▼                              ▼
┌───────────────┐            ┌─────────────────┐            ┌───────────────┐
│  Web Frontend │            │   GraphQL API   │            │  MCP Server   │
│  (React/Vite) │───────────▶│   (Express)     │◀───────────│  (Stdio)      │
│  :3030        │            │   :3001         │            │               │
└───────────────┘            └────────┬────────┘            └───────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
            │  PostgreSQL  │  │   PgBoss     │  │   Python     │
            │  Database    │  │   Queue      │  │   Workers    │
            └──────────────┘  └──────────────┘  └──────────────┘
                                      │
                                      ▼
                             ┌──────────────────┐
                             │   LLM Providers  │
                             │ OpenAI, Anthropic│
                             │ Google, xAI, etc │
                             └──────────────────┘
```

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Web Frontend** | `apps/web/` | React SPA for definitions, runs, analysis |
| **GraphQL API** | `apps/api/` | Backend server with GraphQL, auth, queue |
| **Database Package** | `packages/db/` | Prisma schema and shared queries |
| **Shared Package** | `packages/shared/` | Logger, errors, environment utilities |
| **Python Workers** | `workers/` | Probe scenarios, analyze results, summarize |

---

## Documentation Structure

```
cloud/docs/
├── README.md                    # This file
├── architecture/
│   ├── overview.md              # System architecture
│   ├── data-model.md            # Database schema
│   └── tech-stack.md            # Technologies
├── api/
│   ├── graphql-schema.md        # GraphQL reference
│   ├── rest-endpoints.md        # Auth, export, import
│   └── mcp-tools.md             # MCP tool reference
├── frontend/
│   ├── pages-and-routes.md      # App structure
│   ├── components.md            # UI components
│   └── state-management.md      # urql, auth
├── backend/
│   ├── queue-system.md          # PgBoss, job types
│   ├── python-workers.md        # Worker scripts
│   └── llm-providers.md         # Provider configuration
├── features/
│   ├── definitions.md           # Definition CRUD, versioning
│   ├── runs.md                  # Run execution
│   ├── analysis.md              # Analysis pipeline
│   ├── export-import.md         # CLI compatibility
│   └── authentication.md        # JWT, API keys
├── operations/
│   ├── local-development.md     # Docker, npm scripts
│   ├── deployment.md            # Railway configuration
│   └── testing.md               # Test suites
├── deferred/
│   └── future-features.md       # Planned but not implemented
└── preplanning/
    └── [original design docs]   # Reference for design rationale
```

---

## Core Concepts

### Definitions

A **definition** is a moral dilemma template that specifies:

- **Preamble** - Instructions to the AI model
- **Template** - The scenario text with placeholders
- **Dimensions** - Variables that create scenario variants

Definitions support versioning through forking - create new versions while preserving the parent chain.

### Scenarios

**Scenarios** are concrete instances generated from a definition by expanding dimensions. For example, a template with 2 dimensions, each with 3 levels, produces 9 scenario variants.

### Runs

A **run** executes scenarios against one or more AI models. Each run:

1. Probes models with scenarios (parallel processing via PgBoss)
2. Records transcripts with model responses
3. Generates summaries (decision codes, key reasoning)
4. Triggers analysis (statistics, visualizations)

### Analysis

The **analysis pipeline** computes:

- Decision distributions across models
- Agreement/disagreement metrics
- Scenario-by-scenario breakdowns
- Visualization data for charts

---

## Implementation Status

Per `specs/high-level.md`, the following stages are complete:

| Stage | Feature | Status |
|-------|---------|--------|
| 1-4 | Scaffolding, Database, GraphQL, Auth | ✅ |
| 5-6 | Queue System, Python Workers | ✅ |
| 7-8 | Frontend Foundation, Definition UI | ✅ |
| 9 | Run Execution & Basic Export | ✅ |
| 11 | Analysis System & Visualizations | ✅ |
| 12, 14 | MCP Read & Write Tools | ✅ |
| 15 | Data Export & CLI Compatibility | ✅ |
| 17 | Production Deployment (Railway) | ✅ |
| 13 | Provider Metadata | ✅ |

**Deferred:**
- Stage 10: Experiment Framework
- Stage 13 (partial): Run Comparison & Delta Analysis
- Stage 16: Scale & Efficiency

See [Future Features](./deferred/future-features.md) for details on deferred work.

---

## Reference: Preplanning Documents

The original design documents are preserved in `preplanning/`:

| Document | Current Relevance |
|----------|-------------------|
| [architecture-overview.md](./preplanning/architecture-overview.md) | Still accurate, minor changes noted |
| [database-design.md](./preplanning/database-design.md) | Schema evolved (added LlmProvider, LlmModel) |
| [api-queue-system.md](./preplanning/api-queue-system.md) | Implemented as designed |
| [authentication.md](./preplanning/authentication.md) | Implemented as designed |
| [frontend-design.md](./preplanning/frontend-design.md) | Most components implemented |
| [mcp-interface.md](./preplanning/mcp-interface.md) | Both read and write tools implemented |
| [deployment.md](./preplanning/deployment.md) | Railway used instead of Docker Compose for production |
| [product-spec.md](./preplanning/product-spec.md) | Experiment framework deferred |

---

## Contributing

See [CLAUDE.md](../CLAUDE.md) (the project constitution) for:

- File size limits
- TypeScript standards
- Testing requirements
- Logging standards
- Database access patterns

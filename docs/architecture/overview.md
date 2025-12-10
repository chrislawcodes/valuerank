# Architecture Overview

> Cloud ValueRank is a cloud-native platform for evaluating how AI models prioritize moral values in ethical dilemmas.

This document describes the system architecture, component responsibilities, and how data flows through the system.

---

## System Architecture

The same architecture runs locally (Docker Compose) and in production (Railway):

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Cloud ValueRank                                │
│              (Local: Docker Compose / Production: Railway)               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐         ┌──────────────────────────────────────────┐  │
│  │   Frontend   │────────▶│     GraphQL API (POST /graphql)          │  │
│  │  (apps/web)  │         │     - Schema introspection for LLMs      │  │
│  │  JWT Auth    │         │     - Single endpoint for all queries    │  │
│  │  :3030       │         │     :3001                                │  │
│  └──────────────┘         └──────────────────┬───────────────────────┘  │
│                                              │                           │
│  ┌──────────────┐                            │                           │
│  │  Local LLM   │────────────────────────────┤ (same GraphQL endpoint)  │
│  │  via MCP     │                            │                           │
│  │  API Key     │                            │                           │
│  └──────────────┘                            │                           │
│                                              │                           │
│              ┌───────────────────────────────┴───────────────┐           │
│              ▼                                               ▼           │
│       ┌──────────────┐                          ┌──────────────┐        │
│       │  PostgreSQL  │                          │   Workers    │        │
│       │  + PgBoss    │◀─────────────────────────│  (Python)    │        │
│       │  + Users     │       queue polling      └──────┬───────┘        │
│       │  :5433       │                                 │                │
│       └──────────────┘                                 ▼                │
│                                               ┌──────────────┐          │
│                                               │ LLM Providers│          │
│                                               │ (OpenAI, etc)│          │
│                                               └──────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘

Monorepo Structure (Turborepo):
├── apps/api      → Express + GraphQL API + PgBoss queue handlers
├── apps/web      → React + Vite frontend
├── packages/db   → Prisma schema + shared database queries
├── packages/shared → Logger, errors, environment utilities
└── workers/      → Python scripts for LLM interactions
```

---

## Component Details

### Web Frontend (`apps/web/`)

**Technology:** React 18 + TypeScript + Vite + Tailwind CSS

**Purpose:** Single-page application for:
- Viewing and editing definitions
- Starting and monitoring runs
- Viewing analysis results and visualizations
- Managing settings and API keys

**Key features:**
- JWT authentication via auth context
- GraphQL data fetching with urql
- Monaco editor for definition content
- Recharts for analysis visualizations

**Pages:**
| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/` | Overview and recent activity |
| Definitions | `/definitions` | List and search definitions |
| Definition Detail | `/definitions/:id` | View/edit definition, start runs |
| Runs | `/runs` | List all runs |
| Run Detail | `/runs/:id` | View progress, transcripts, analysis |
| Settings | `/settings` | API keys, preferences |
| Login | `/login` | Authentication |

---

### GraphQL API (`apps/api/`)

**Technology:** Express + GraphQL Yoga + Pothos Schema Builder

**Purpose:** Central API server handling:
- GraphQL queries and mutations
- JWT and API key authentication
- Job queue management (PgBoss)
- Worker orchestration
- MCP server (stdio-based)

**Key directories:**
```
apps/api/src/
├── graphql/           # Schema, types, resolvers
│   ├── types/         # GraphQL type definitions
│   ├── queries/       # Query resolvers
│   ├── mutations/     # Mutation resolvers
│   └── dataloaders/   # N+1 prevention
├── queue/             # PgBoss handlers
│   ├── handlers/      # Job type handlers
│   ├── orchestrator.ts # Worker spawning logic
│   └── spawn.ts       # Python process management
├── mcp/               # MCP server implementation
│   ├── tools/         # Read and write tools
│   └── resources/     # Authoring guides, examples
├── routes/            # REST endpoints (auth, export, import)
├── services/          # Business logic
│   ├── analysis/      # Analysis triggering and caching
│   ├── export/        # MD, YAML, CSV export
│   ├── import/        # Definition import
│   └── health/        # System health checks
└── auth/              # Authentication middleware
```

**Endpoints:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/graphql` | POST | GraphQL operations |
| `/api/auth/login` | POST | JWT login |
| `/api/auth/register` | POST | User registration |
| `/api/export/definition/:id` | GET | Export as Markdown |
| `/api/export/scenarios/:id` | GET | Export as YAML |
| `/api/import/definition` | POST | Import from Markdown |
| `/health` | GET | System health check |

---

### Database Package (`packages/db/`)

**Technology:** Prisma ORM + PostgreSQL

**Purpose:** Shared database access layer:
- Prisma schema definition
- Generated Prisma client
- Common query patterns
- Seed data

**Schema location:** `packages/db/prisma/schema.prisma`

See [Data Model](./data-model.md) for detailed schema documentation.

---

### Shared Package (`packages/shared/`)

**Purpose:** Cross-cutting utilities:

```typescript
// Logger (pino-based)
import { createLogger } from '@valuerank/shared';
const log = createLogger('my-service');

// Error classes
import { AppError, NotFoundError, ValidationError } from '@valuerank/shared';

// Environment utilities
import { getEnv, getEnvOrThrow } from '@valuerank/shared';
```

---

### Python Workers (`workers/`)

**Technology:** Python 3 + standard library + requests

**Purpose:** Execute long-running LLM operations:

| Worker | File | Purpose |
|--------|------|---------|
| Probe | `probe.py` | Send scenarios to models, record responses |
| Analyze | `analyze_basic.py` | Compute statistics from transcripts |
| Summarize | `summarize.py` | Generate decision codes from transcripts |
| Health Check | `health_check.py` | Verify environment setup |

**Communication pattern:**
1. TypeScript orchestrator receives job from PgBoss
2. Spawns Python process with JSON input on stdin
3. Python worker executes, writes JSON to stdout
4. Orchestrator parses output, updates database

This approach gives us:
- Native PgBoss integration (TypeScript)
- Python ecosystem for LLM adapters (compatible with CLI pipeline)
- Simple debugging (JSON stdin/stdout)

---

## Data Flow Examples

### Starting a Run

```
┌────────┐     ┌─────────┐     ┌──────────┐     ┌─────────┐
│ Web UI │────▶│ GraphQL │────▶│ Database │────▶│ PgBoss  │
└────────┘     │ Mutation│     │ Create   │     │ Enqueue │
               └─────────┘     │ Run      │     │ Jobs    │
                               └──────────┘     └────┬────┘
                                                     │
                                                     ▼
                               ┌──────────┐     ┌─────────┐
                               │ Update   │◀────│ Worker  │
                               │ Progress │     │ Process │
                               └──────────┘     └─────────┘
```

1. User clicks "Start Run" in web UI
2. `startRun` mutation creates Run record with PENDING status
3. Mutation enqueues `probe_scenario` jobs for each model×scenario pair
4. PgBoss workers pick up jobs, spawn Python probe.py
5. Python worker calls LLM provider, returns transcript
6. Orchestrator updates Transcript and Run.progress
7. When all probes complete, status changes to SUMMARIZING
8. Summarize jobs run, then status becomes COMPLETED
9. Analysis is auto-triggered

### Querying Data via MCP

```
┌────────────┐     ┌────────────┐     ┌─────────┐
│ Local LLM  │────▶│ MCP Server │────▶│ GraphQL │
│ (Claude)   │     │ (stdio)    │     │ Query   │
└────────────┘     └────────────┘     └────┬────┘
                                           │
                                           ▼
                   ┌────────────┐     ┌─────────┐
                   │ Format for │◀────│ Database│
                   │ Token Size │     │ Query   │
                   └────────────┘     └─────────┘
```

1. User asks Claude about ValueRank data
2. Claude calls MCP tool (e.g., `list_runs`)
3. MCP server authenticates via API key
4. Server executes GraphQL query
5. Results are formatted for token efficiency (<5KB)
6. Claude receives structured response

---

## Key Design Decisions

### GraphQL over REST

**Why:** LLMs can introspect the schema and construct precise queries. Single endpoint simplifies auth and MCP integration. Flexible data fetching critical for token budgets.

### PgBoss over Redis

**Why:** Uses same PostgreSQL database - no additional infrastructure. Built-in retry, priority queues, scheduling. Transactional with application data.

### TypeScript Orchestrator + Python Workers

**Why:** Best of both worlds. TypeScript handles PgBoss natively. Python workers reuse LLM adapters from CLI tool. JSON stdin/stdout is simple and debuggable.

### Single Tenant Architecture

**Why:** Internal team tool. All users share one workspace, all data visible to all users. No tenant_id columns, no ACLs needed.

### JSONB for Flexible Schema

**Why:** Definition content structure varies by scenario type. JSONB provides schema flexibility without migrations. `schema_version` field enables future migrations at read time.

---

## Deviations from Original Design

The system was built following the [preplanning documents](../preplanning/), with these notable changes:

| Original Design | Current Implementation | Reason |
|-----------------|----------------------|--------|
| Docker Compose for production | Railway | Simpler deployment, better DX |
| Separate worker container | Spawned Python processes | Simpler architecture, same outcome |
| Experiment framework | Deferred | Focused on core features first |
| Run comparison | Deferred | Focused on core features first |

---

## Related Documentation

- [Data Model](./data-model.md) - Database schema details
- [Tech Stack](./tech-stack.md) - Technology choices
- [Queue System](../backend/queue-system.md) - PgBoss configuration
- [Python Workers](../backend/python-workers.md) - Worker implementation

See also: [Original Architecture Overview](../preplanning/architecture-overview.md) for design rationale

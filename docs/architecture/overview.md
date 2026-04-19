# Architecture Overview

> ValueRank is a platform for evaluating how AI models prioritize moral values in ethical dilemmas.

This document describes the system architecture, component responsibilities, and how data flows through the system.

---

## System Architecture

The same architecture runs locally (Docker Compose) and in production (Railway):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              ValueRank                                        │
│              (Local: Docker Compose / Production: Railway)                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌──────────────┐         ┌──────────────────────────────────────────────┐   │
│  │   Web App    │────────▶│   Express API  (apps/api)   :3031            │   │
│  │  (apps/web)  │         │   ├─ /graphql   (GraphQL Yoga + Pothos)      │   │
│  │  React/Vite  │         │   ├─ /api/*     (auth, export, csv, import,  │   │
│  │  JWT Auth    │         │   │              odata)                      │   │
│  │  :3030       │         │   ├─ /mcp       (MCP Streamable HTTP)        │   │
│  └──────────────┘         │   ├─ /oauth/*   (OAuth 2.1 for MCP)          │   │
│                           │   ├─ /admin     (admin tools)                │   │
│  ┌──────────────┐         │   └─ /health                                 │   │
│  │  AI Agent    │────────▶│                                              │   │
│  │  (Claude.ai, │ OAuth   │   Auth: JWT cookies, API keys,               │   │
│  │   Claude     │ 2.1 or  │         OAuth 2.1 bearer tokens              │   │
│  │   Code, etc) │ API key │                                              │   │
│  └──────────────┘         └──────────────────┬───────────────────────────┘   │
│                                              │                                │
│              ┌───────────────────────────────┴───────────────┐                │
│              ▼                                               ▼                │
│       ┌──────────────┐                            ┌──────────────┐            │
│       │  PostgreSQL  │                            │   Queue      │            │
│       │  (via        │                            │ Orchestrator │            │
│       │  PgBouncer)  │◀───────────────────────────│ + PgBoss     │            │
│       │              │      queue polling         │ (in-process) │            │
│       │  :5433       │                            └──────┬───────┘            │
│       └──────────────┘                                   │                    │
│                                                          ▼                    │
│                                                 ┌──────────────┐              │
│                                                 │   Python     │              │
│                                                 │   Workers    │              │
│                                                 │   (spawned)  │              │
│                                                 └──────┬───────┘              │
│                                                        │                      │
│                                                        ▼                      │
│                                                 ┌──────────────┐              │
│                                                 │ LLM Providers│              │
│                                                 │ OpenAI /     │              │
│                                                 │ Anthropic /  │              │
│                                                 │ Google / xAI │              │
│                                                 │ DeepSeek /   │              │
│                                                 │ Mistral      │              │
│                                                 └──────────────┘              │
└──────────────────────────────────────────────────────────────────────────────┘

Monorepo Structure (Turborepo):
cloud/
├── apps/api           → Express + GraphQL + MCP + queue orchestrator
├── apps/web           → React + Vite SPA (with GraphQL codegen)
├── packages/db        → Prisma schema + generated client + seed data
├── packages/shared    → Logger, errors, env utilities (TypeScript)
└── workers/           → Python scripts for LLM probe / summarize / analyze
```

---

## Component Details

### Web Frontend (`apps/web/`)

**Technology:** React 18 + TypeScript + Vite + Tailwind CSS + urql + GraphQL codegen

**Purpose:** Single-page application for authoring content, running evaluations, and reviewing analysis.

**Key features:**
- JWT authentication via auth context
- GraphQL data fetching with urql; typed documents generated from the live schema (`src/generated/`)
- Monaco editor for definition content
- Recharts + virtualized tables for analysis views
- Radix popovers, `class-variance-authority`, `tailwind-merge`, `date-fns`, `html-to-image` for rich UI

**Pages (routes in `src/App.tsx`):**

| Area | Routes |
|------|--------|
| Auth | `/login` |
| Dashboard | `/` |
| Definitions (a.k.a. "Vignettes") | `/definitions`, `/definitions/:id`, `/definitions/:id/start-paired-batch`, `/paired-vignette/new` |
| Domains | `/domains`, `/domains/manage`, `/domains/:id/start`, `/domains/:id/status`, `/domains/:id/analysis`, `/domains/:id/coverage`, `/domains/:id/analysis/:value` |
| Reusable content | `/preambles`, `/level-presets`, `/domain-contexts`, `/value-statements` |
| Runs & Analysis | `/runs`, `/runs/:id`, `/analysis`, `/analysis/:id`, `/analysis/:id/conditions/:conditionId`, `/analysis/:id/transcripts` |
| Archive | `/archive` |
| Surveys | `/survey`, `/survey/results` |
| Settings | `/settings/account`, `/settings/system-health`, `/settings/models`, `/settings/infrastructure`, `/settings/api-keys` |
| Misc | `/status`, `/start`, `/models`, `*` (NotFound) |

Note: the UI uses "Vignette" for user-friendliness, but database, GraphQL, and internal code still say "Definition" (see `docs/canonical-glossary.md`).

---

### API Server (`apps/api/`)

**Technology:** Express 4 + GraphQL Yoga 5 + Pothos 3 (code-first schema) + PgBoss 12

**Purpose:** Central API server handling:

- GraphQL queries and mutations (single endpoint used by web and MCP)
- JWT, API key, and OAuth 2.1 authentication
- Queue orchestration (PgBoss, in-process)
- Python worker spawning
- MCP server (HTTP transport with OAuth or API keys)
- REST endpoints for auth, export, import, OData, and admin

**Source layout (`apps/api/src/`):**

```
apps/api/src/
├── auth/              # JWT and API key middleware
├── cli/               # Admin scripts: create-user, normalize-aggregate-analysis-output,
│                      # decision-model-shadow-validation
├── config/            # Typed config loading
├── graphql/           # Pothos schema builder
│   ├── builder.ts
│   ├── context.ts
│   ├── types/         # GraphQL object types
│   ├── queries/       # Query resolvers (definition, domain, run, analysis, …)
│   ├── mutations/     # Mutation resolvers (definition, run, domain, paired-vignette, …)
│   ├── dataloaders/   # N+1 prevention
│   └── utils/
├── mcp/               # MCP server (HTTP + stdio)
│   ├── server.ts
│   ├── tools/         # 40+ read & write tools
│   ├── resources/     # Authoring guides, examples, value-pair / preamble templates
│   ├── oauth/         # OAuth 2.1 (PKCE, Dynamic Client Registration, refresh tokens)
│   ├── rate-limit.ts
│   └── auth.ts
├── middleware/        # Shared Express middleware
├── queue/             # PgBoss orchestrator + handlers + Python spawner
│   ├── boss.ts
│   ├── orchestrator.ts
│   ├── spawn.ts
│   ├── types.ts
│   └── handlers/      # See Queue Handlers below
├── routes/            # REST endpoints (auth, export, csv, import, odata, admin)
└── services/          # Business logic (analysis, domain, run, scenario, decision-model,
                        # probe-result, rate-limiter, preamble, export, import, audit, …)
```

**Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/graphql` | GET/POST | GraphQL operations (auth required except introspection) |
| `/mcp` | POST | MCP Streamable HTTP (OAuth 2.1 or API key) |
| `/oauth/authorize` · `/oauth/token` · `/oauth/register` | POST/GET | OAuth 2.1 (PKCE + Dynamic Client Registration) for Claude.ai |
| `/.well-known/oauth-authorization-server` | GET | RFC 8414 metadata |
| `/.well-known/oauth-protected-resource` | GET | RFC 9728 metadata |
| `/api/auth/login` · `/api/auth/register` · etc. | POST | JWT auth |
| `/api/export/*` | GET | Markdown / YAML / CSV / ZIP export |
| `/api/csv/*` | GET | CSV feeds |
| `/api/import/*` | POST | Definition import |
| `/api/odata/*` | GET | OData feeds (BI tools) |
| `/admin/*` | various | Admin-only tooling |
| `/health` | GET | System health check |

---

### Database Package (`packages/db/`)

**Technology:** Prisma 5 ORM + PostgreSQL 15

**Purpose:** Shared database access layer — Prisma schema, generated client, seed data.

**Schema location:** `packages/db/prisma/schema.prisma`

See [Data Model](./data-model.md) for entity details.

Connections:
- App traffic goes through **PgBouncer** via `DATABASE_URL` (prepared statements disabled).
- Migrations use the direct connection via `DIRECT_URL`.

---

### Shared Package (`packages/shared/`)

Cross-cutting TypeScript utilities:

```typescript
import { createLogger, AppError, NotFoundError, ValidationError, getEnv } from '@valuerank/shared';
```

- Structured logger (pino)
- Typed error classes with HTTP status codes
- Environment parsing helpers

---

### Python Workers (`workers/`)

**Technology:** Python 3.10+, with provider SDKs and shared adapters in `workers/common/`.

**Purpose:** Execute LLM-bound work that's awkward in Node (provider SDKs, large prompts, CPU-bound analysis).

| Worker | File | Purpose |
|--------|------|---------|
| Probe | `probe.py` | Send a scenario to a model, record the transcript |
| Summarize | `summarize.py`, `summarize_batch.py`, `summarize_extract.py`, `summarize_llm.py`, `summarize_text.py` | Generate decision code + summary per transcript (deterministic extraction + LLM fallback) |
| Analyze (basic) | `analyze_basic.py`, `analyze_basic_aggregation.py`, `analyze_basic_metadata.py` | Compute statistics, aggregations, and metadata from transcripts |
| Expand scenarios | `generate_scenarios.py` | Generate scenario variants from a definition template |
| Token stats | `compute_token_stats.py` | Refresh `ModelTokenStatistics` from transcripts |
| Canary | `canary_runner.py` | Provider health canaries |
| Health | `health_check.py` | Verify environment / provider connectivity |

**Communication pattern:**

1. API receives a GraphQL mutation or queue event.
2. A PgBoss handler runs in-process inside the API; it spawns a Python process with JSON on stdin.
3. Python worker runs, writes JSON to stdout.
4. Handler parses output, persists results via Prisma, updates progress.

---

## Queue Handlers

All queue handling is in-process (no separate worker container). PgBoss polls the same PostgreSQL database. Job types (`apps/api/src/queue/types.ts`):

| Job type | Handler | Triggered by |
|----------|---------|--------------|
| `probe_scenario` | `probe-scenario/` → `probe.py` | Run start / retry |
| `summarize_transcript` | `summarize-transcript.ts` → `summarize.py` | Transcript saved or forced rerun |
| `analyze_basic` | `analyze-basic.ts`, `analyze-basic-data.ts` | Summarization complete, or manual rerun |
| `expand_scenarios` | `expand-scenarios.ts` → `generate_scenarios.py` | Definition create / update / fork |
| `compute_token_stats` | `compute-token-stats.ts` → `compute_token_stats.py` | Run completion (cost visibility) |
| `probe_dead_letter` | `probe-dead-letter.ts` | Probe retries exhausted |
| `aggregate_analysis` | `aggregate-analysis.ts` | Cross-run aggregation per (definition × preamble × temp) |
| `refresh_domain_analysis_snapshot` | `refresh-domain-analysis-snapshot.ts` | Domain-evaluation analysis refresh |

---

## Data Flow Examples

### Starting a Run

```
┌────────┐     ┌─────────┐     ┌──────────┐     ┌─────────────┐
│ Web UI │────▶│ GraphQL │────▶│ Database │────▶│ PgBoss      │
└────────┘     │ startRun│     │ create   │     │ enqueue     │
               └─────────┘     │ Run +    │     │ probe jobs  │
                               │ snapshot │     └──────┬──────┘
                               │ scenarios│            │
                               └──────────┘            ▼
                                              ┌──────────────┐
                                     ┌────────│ probe job    │
                                     │        │ spawns Python│
                                     ▼        └──────────────┘
                              ┌──────────────┐
                              │ Transcript + │
                              │ ProbeResult  │
                              │ written      │
                              └──────┬───────┘
                                     ▼
                              enqueue summarize_transcript, then
                              analyze_basic → aggregate_analysis
                              → refresh_domain_analysis_snapshot
                              (for domain-scoped runs)
```

1. Mutation creates `Run` with `PENDING` status, snapshots the domain config into `DomainConfigSnapshot`, records sampled scenarios in `RunScenarioSelection`.
2. `probe_scenario` jobs are enqueued per (scenario × model × sampleIndex).
3. Probe handler spawns `probe.py`, persists a `Transcript` and a `ProbeResult` row.
4. Summarization jobs compute `decisionCode`, `decisionText`, and `decisionMetadata` via deterministic extraction first, then LLM fallback when needed.
5. Once summarization completes, `analyze_basic` computes per-run statistics, then `aggregate_analysis` updates cross-run snapshots.
6. Domain-scope runs also enqueue `refresh_domain_analysis_snapshot`.

### Querying Data via MCP

```
┌────────────┐   OAuth 2.1    ┌────────────┐     ┌─────────┐
│ Claude.ai  │─── bearer ────▶│ MCP HTTP   │────▶│ GraphQL │
│ / Claude   │   or API key   │ /mcp       │     │ resolver│
│ Code / …   │                │ (Streamable│     └────┬────┘
└────────────┘                │  HTTP)     │          │
                              └────────────┘          ▼
                                     ▲          ┌─────────┐
                                     │          │ Postgres│
                                     └──────────│ Prisma  │
                                      formatted └─────────┘
                                      for tokens
```

1. The agent discovers the server via `/.well-known/oauth-protected-resource`, registers a client (RFC 7591), and completes a PKCE code exchange to get a bearer token. API-key auth is still supported for backwards compatibility.
2. Tool calls hit `/mcp`. A tool registry in `mcp/tools/` maps each tool (e.g. `list_runs`, `start_run`) to a GraphQL query or mutation.
3. Responses are shaped for token-efficient agent consumption (target <5 KB per response).

---

## Key Design Decisions

### GraphQL over REST

LLMs can introspect the schema and construct precise queries. A single endpoint simplifies auth and MCP integration. Flexible data fetching is critical for token budgets.

### PgBoss over Redis/BullMQ

Reuses the app Postgres — no extra infrastructure. Built-in retry, priority, scheduling, and transactional semantics with app data. Orchestrator runs inside the API process.

### TypeScript orchestrator + Python workers

TypeScript owns request handling, schema, and queue bookkeeping. Python owns provider SDKs and statistical analysis. JSON stdin/stdout keeps the boundary simple and debuggable.

### HTTP MCP with OAuth 2.1

We moved off stdio-only to a Streamable-HTTP MCP server so remote agents (Claude.ai, Claude Code, Codex) can connect. We implement OAuth 2.1 with PKCE and Dynamic Client Registration; API-key auth is retained for local and programmatic use.

### Domain config snapshots

A `Run` captures the exact combination of `Preamble` / `LevelPreset` / `DomainContext` / `ValueStatement` versions it used into a `DomainConfigSnapshot`. This makes cross-run comparisons reproducible even as the underlying configuration changes.

### Single-tenant architecture

Internal research tool. All users share one workspace; there are no `tenant_id` columns or per-row ACLs. `AuditLog` and `createdByUserId` fields record who did what.

### JSONB for flexible schema

Definition, transcript, scenario, and analysis payloads all use JSONB. A `version` / `schema_version` field is stored alongside each payload for future read-time migrations.

---

## Related Documentation

- [Data Model](./data-model.md) — entity schema and relationships
- [Tech Stack](./tech-stack.md) — technology choices
- [Queue System](../backend/queue-system.md) — PgBoss configuration and handlers
- [Python Workers](../backend/python-workers.md) — worker implementation
- [MCP Tools](../api/mcp-tools.md) — tool and resource reference
- [Canonical Glossary](../canonical-glossary.md) — terminology (Definition↔Vignette, Dimension↔Attribute, …)
- Original design: [Preplanning Docs](../preplanning/) — useful for rationale, but superseded where they conflict

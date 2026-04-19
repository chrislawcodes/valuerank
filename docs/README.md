# ValueRank Documentation

> Platform for evaluating how AI models prioritize moral values in ethical dilemmas.

ValueRank presents each model with scenarios where two moral values conflict (e.g., safety vs. freedom) and records how the model reasons through the tradeoff. It exposes a web UI for humans, a GraphQL API, and an MCP server for AI agents — all backed by Postgres, PgBoss queues, and Python workers.

## Quick Links

| Document | Description |
|----------|-------------|
| [Architecture Overview](./architecture/overview.md) | System components and request flows |
| [Data Model](./architecture/data-model.md) | Database schema and relationships |
| [Tech Stack](./architecture/tech-stack.md) | Technologies and rationale |
| [Canonical Glossary](./canonical-glossary.md) | Terminology (Definition↔Vignette, Dimension↔Attribute, …) |
| [GraphQL API](./api/graphql-schema.md) | Types, queries, mutations |
| [MCP Tools](./api/mcp-tools.md) | AI-agent tool reference |
| [REST Endpoints](./api/rest-endpoints.md) | Auth, export, import, OData |
| [Queue System](./backend/queue-system.md) | PgBoss handlers and job types |
| [Python Workers](./backend/python-workers.md) | Worker scripts |
| [LLM Providers](./backend/llm-providers.md) | Provider configuration |
| [Workflow Docs](./workflow/README.md) | Feature Factory, plans, handoffs |

---

## What is ValueRank?

ValueRank measures how AI models respond to moral dilemmas and makes value alignment comparable across models.

**Key capabilities:**

- **Definitions (a.k.a. "Vignettes")** — moral-dilemma templates with configurable dimensions, preambles, and severity presets.
- **Domains** — collections of related definitions sharing a context, value statements, preamble, and level preset. Each run snapshots the exact config it used.
- **Scenario expansion** — LLM-assisted generation of concrete variants from a template.
- **Runs** — probe multiple AI models in parallel via PgBoss + Python workers.
- **Summarization & analysis** — deterministic decision-code extraction (with LLM fallback), per-run statistics, cross-run aggregates, paired-vignette comparisons.
- **MCP integration** — AI agents can list, start, and author runs via OAuth 2.1 or API keys.

## Getting Started

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- API keys for LLM providers (OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral as needed)

### Quick Start

```bash
cd cloud
npm install

# Start Postgres (+ PgBouncer)
docker compose up -d

# Apply migrations and seed
npm run db:migrate
npm run db:seed

# Start all dev servers
npm run dev
```

This starts:

- **API** at http://localhost:3031 (GraphQL at `/graphql`, MCP at `/mcp`)
- **Web** at http://localhost:3030

### Test Credentials

See `MEMORY.md` → "Dev Account" for local login credentials.

---

## System Overview

```
                    ┌──────────────────────────────────────────┐
                    │              ValueRank                    │
                    └──────────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        ▼                              ▼                              ▼
┌───────────────┐            ┌─────────────────┐            ┌───────────────┐
│  Web (React)  │            │ Express API     │            │ MCP over HTTP │
│  :3030        │───────────▶│ /graphql /api/* │◀───────────│ /mcp (OAuth   │
│               │            │ /mcp  :3031     │            │  2.1 or key)  │
└───────────────┘            └────────┬────────┘            └───────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
            ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
            │  PostgreSQL  │  │   PgBoss     │  │   Python     │
            │  (PgBouncer) │  │   (in-proc)  │  │   Workers    │
            └──────────────┘  └──────┬───────┘  └──────┬───────┘
                                     │                 │
                                     └────────┬────────┘
                                              ▼
                                     ┌──────────────────┐
                                     │   LLM Providers  │
                                     │ OpenAI, Anthropic│
                                     │ Google, xAI,     │
                                     │ DeepSeek, Mistral│
                                     └──────────────────┘
```

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Web** | `cloud/apps/web/` | React SPA (urql + GraphQL codegen) |
| **API** | `cloud/apps/api/` | Express + GraphQL + MCP + queue orchestrator + Python spawner |
| **Database package** | `cloud/packages/db/` | Prisma schema and generated client |
| **Shared package** | `cloud/packages/shared/` | Logger, errors, env helpers |
| **Python workers** | `cloud/workers/` | Probe, summarize, analyze, expand scenarios, token stats |

---

## Documentation Structure

```
docs/
├── README.md                    # This file
├── canonical-glossary.md        # Terminology source of truth
├── architecture/
│   ├── overview.md              # System architecture
│   ├── data-model.md            # Database schema
│   └── tech-stack.md            # Technologies
├── api/
│   ├── graphql-schema.md        # GraphQL reference
│   ├── rest-endpoints.md        # Auth, export, import, OData
│   └── mcp-tools.md             # MCP tool reference
├── frontend/
│   ├── pages-and-routes.md      # App structure
│   ├── components.md            # UI components
│   └── state-management.md      # urql, auth
├── backend/
│   ├── queue-system.md          # PgBoss handlers, job types
│   ├── python-workers.md        # Worker scripts
│   └── llm-providers.md         # Provider configuration
├── features/
│   ├── definitions.md           # Definition CRUD, versioning
│   ├── runs.md                  # Run execution
│   ├── analysis.md              # Analysis pipeline
│   ├── export-import.md         # CLI compatibility
│   └── authentication.md        # JWT, API keys, OAuth
├── workflow/                    # Agent process, Feature Factory, rules
├── preplanning/                 # Original design docs (historical)
├── values-summary.md            # Value definitions and tensions
└── valuerank_prd.yaml           # Product requirements
```

---

## Core Concepts

### Definitions (Vignettes)

A **definition** is a moral-dilemma template with:

- **Preamble** — shared instructions to the model (reusable across definitions via `PreambleVersion`).
- **Template** — the scenario text with placeholders.
- **Dimensions** — variables that produce scenario variants.
- **Level preset** — canonical L1–L5 severity labels (reusable via `LevelPresetVersion`).

Definitions support forking, so new versions preserve the parent chain.

### Scenarios

Concrete instances generated from a definition by expanding its dimensions. Paired/flipped scenarios support order-effect analysis.

### Domains

A **domain** groups related definitions under a shared **context**, **value statements**, default **preamble**, default **level preset**, and default model list. When a run starts, the exact combination of these is frozen into a `DomainConfigSnapshot` so results stay reproducible.

### Runs

A **run** probes one or more models against a set of scenarios:

1. **Probe** — parallel jobs via PgBoss, executed by `probe.py`, producing a `Transcript` and a `ProbeResult` per (scenario × model × sample).
2. **Summarize** — deterministic decision-code extraction with LLM fallback (`decision_code`, `decision_text`, `decision_metadata`).
3. **Analyze** — cached per-run stats, cross-run aggregates, and domain-level snapshots.

Runs are categorized (`PILOT`, `PRODUCTION`, `REPLICATION`, `VALIDATION`) and can be grouped into a `DomainEvaluation`.

### Analysis

The analysis pipeline computes decision distributions, agreement metrics, scenario-level breakdowns, net-weighted condition scores, paired-vignette stability, and visualization payloads. Results are cached by input hash and code version in `AnalysisResult` and `AssumptionAnalysisSnapshot`.

---

## Contributing

- Project constitution: [cloud/CLAUDE.md](../cloud/CLAUDE.md) (file-size limits, TypeScript standards, testing, logging, DB patterns, preflight gate).
- Agent working contract: [AGENTS.md](../AGENTS.md) (communication, delivery paths, memory policy).
- Terminology: [canonical-glossary.md](./canonical-glossary.md).

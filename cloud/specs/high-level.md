# Cloud ValueRank - High-Level Implementation Plan

> MVP Implementation Roadmap
>
> Each stage represents a major milestone (roughly 1 day to 1 week of focused work).
> Stages are designed to be specced and implemented sequentially, with each building on the previous.

---

## Stage 1: Project Scaffolding & Infrastructure [x]

> **Spec:** [stage-1-scaffolding.md](./stage-1-scaffolding.md) | **Plan:** [stage-1-plan.md](./stage-1-plan.md) | **Tasks:** [stage-1-tasks.md](./stage-1-tasks.md)

**Goal:** Establish the foundational project structure, build system, and local development environment.

**Deliverables:**
- Turborepo monorepo structure (`apps/api`, `apps/web`, `packages/db`, `packages/shared`)
- Docker Compose for local PostgreSQL
- Basic TypeScript configuration with strict mode
- ESLint/Prettier setup
- Logger abstraction (pino-based)
- Environment configuration pattern
- npm scripts for dev, build, test

**Exit Criteria:**
- `npm run dev` starts both API and web in development mode
- `docker-compose up -d` runs PostgreSQL locally
- TypeScript compiles with strict mode, no errors
- Logger works and outputs structured JSON

---

## Stage 2: Database Schema & Migrations [ ]

> **Spec:** [stage-2-database.md](./stage-2-database.md) | **Plan:** [stage-2-plan.md](./stage-2-plan.md) | **Tasks:** [stage-2-tasks.md](./stage-2-tasks.md)

**Goal:** Implement the core PostgreSQL schema with Prisma, including all tables needed for MVP.

**Deliverables:**
- Prisma schema with all core tables:
  - `users`, `api_keys` (auth)
  - `definitions` (with parent_id for versioning)
  - `runs`, `transcripts`, `scenarios`
  - `experiments`, `run_comparisons`
  - `analysis_results`
  - `rubrics`
- JSONB schema versioning pattern implemented
- Seed script for development data
- Database query helpers in `packages/db`

**Exit Criteria:**
- `npm run db:migrate` creates all tables
- `npm run db:seed` populates test data
- Recursive CTE queries work for definition ancestry
- TypeScript types generated from Prisma

---

## Stage 3: GraphQL API Foundation [ ]

**Goal:** Set up the GraphQL server with Pothos (code-first), core types, and basic CRUD operations.

**Deliverables:**
- GraphQL Yoga server in `apps/api`
- Pothos schema builder configuration
- Core GraphQL types: Definition, Run, Transcript, Experiment
- DataLoaders for N+1 prevention
- Basic queries: `definition`, `definitions`, `run`, `runs`
- Basic mutations: `createDefinition`, `forkDefinition`
- GraphQL playground in development

**Exit Criteria:**
- Can query definitions and runs via GraphQL
- Can create and fork definitions via mutations
- DataLoaders prevent N+1 queries
- Schema introspection works for LLM consumption

---

## Stage 4: Authentication System [ ]

**Goal:** Implement simple JWT-based auth for web and API key auth for MCP.

**Deliverables:**
- User registration CLI command (no public signup)
- Login endpoint returning JWT
- JWT middleware for protected routes
- API key generation and validation
- Combined auth middleware (JWT or API key)
- Password hashing with bcrypt
- Token refresh (optional, 24h expiry may suffice)

**Exit Criteria:**
- Can create users via CLI
- Can login and receive JWT
- Protected GraphQL endpoints require auth
- API keys work for programmatic access

---

## Stage 5: Queue System & Job Infrastructure [ ]

**Goal:** Set up PgBoss queue with TypeScript orchestrator and job lifecycle management.

**Deliverables:**
- PgBoss initialization and configuration
- Job type definitions: `probe:scenario`, `analyze:basic`, `analyze:deep`
- TypeScript orchestrator with `spawnPython` utility
- Job progress tracking in database
- Basic job handlers (stubs)
- Queue status GraphQL queries
- Pause/resume/cancel mutations

**Exit Criteria:**
- Can queue jobs via GraphQL
- Jobs appear in PgBoss queue
- Progress updates visible via polling
- Can pause/resume/cancel runs

---

## Stage 6: Python Worker Integration [ ]

**Goal:** Connect existing Python pipeline code to the TypeScript orchestrator.

**Deliverables:**
- Python worker container setup
- `workers/probe.py` - scenario probing via stdin/stdout JSON
- `workers/analyze_basic.py` - Tier 1 analysis
- Shared LLM adapter configuration (env-based)
- Error handling and retry logic
- Worker health monitoring

**Exit Criteria:**
- `probe:scenario` jobs execute Python and return results
- Transcripts are saved to database
- LLM calls work with configured API keys
- Errors are logged and jobs marked as failed appropriately

---

## Stage 7: Frontend Foundation [ ]

**Goal:** Set up React frontend with auth, navigation shell, and core layout.

**Deliverables:**
- Vite + React + TypeScript setup in `apps/web`
- urql GraphQL client with auth headers
- Login page and auth context
- Global navigation shell (header, tabs)
- Protected route wrapper
- API key management page
- Basic empty/loading/error states

**Exit Criteria:**
- Can login via web UI
- Navigation between Definitions/Runs/Experiments/Settings
- Can generate and revoke API keys
- Auth persists across page refreshes

---

## Stage 8: Definition Management UI [ ]

**Goal:** Build the definition library, editor, and version tree visualization.

**Deliverables:**
- Definition library page (folder tree + card grid)
- Definition editor with preamble, template, dimensions
- Fork definition flow with label
- Version tree visualization (basic lineage diagram)
- Search and filter functionality
- Syntax highlighting for template placeholders

**Exit Criteria:**
- Can browse, create, and edit definitions
- Can fork definitions and see lineage
- Version tree shows parent/child relationships
- Can preview generated scenarios

---

## Stage 9: Run Execution Pipeline [ ]

**Goal:** Complete end-to-end run execution from UI to results.

**Deliverables:**
- Run creation form (select definition, models, options)
- Run dashboard with status table
- Polling-based progress updates (5s interval)
- Run detail page showing per-model progress
- Run controls (pause/resume/cancel)
- Cost estimation display (optional)
- Transcript storage with retention settings

**Exit Criteria:**
- Can start a run from the UI
- Can watch progress update in real-time (polling)
- Can pause and resume runs
- Completed runs show in dashboard
- Transcripts are stored and accessible

---

## Stage 10: Analysis System (Tier 1 & Tier 2) [ ]

**Goal:** Implement analysis pipeline with auto-triggered basic stats and on-demand correlations.

**Deliverables:**
- Tier 1 auto-analysis on run completion
- Basic stats computation (win rates, per-model scores)
- Confidence intervals with Wilson score
- Tier 2 on-demand analysis (correlations, dimension impact)
- Statistical method documentation in results
- Analysis versioning and caching (input_hash)
- Results viewer UI (charts, tables)

**Exit Criteria:**
- Completed runs automatically have Tier 1 analysis
- Can trigger Tier 2 analysis from UI
- Results display with confidence intervals
- Analysis methods documented in output

---

## Stage 11: Run Comparison & Experiments [ ]

**Goal:** Enable side-by-side comparison and experiment framework for hypothesis testing.

**Deliverables:**
- Run comparison page (side-by-side delta view)
- Delta visualization (diverging bar chart)
- "What Changed" diff display
- Experiment creation with hypothesis tracking
- Experiment workspace (Kanban-style layout)
- Statistical testing for comparisons (effect sizes, p-values)
- Experiment timeline visualization

**Exit Criteria:**
- Can compare any two runs side-by-side
- Can create experiments with hypothesis
- Experiments group related runs
- Statistical significance shown for deltas

---

## Stage 12: MCP Interface [ ]

**Goal:** Expose data and authoring tools for AI agents via MCP protocol.

**Deliverables:**
- MCP server setup (embedded in API or sidecar)
- Read tools: `list_definitions`, `list_runs`, `get_run_summary`, `compare_runs`
- Write tools: `create_definition`, `fork_definition`, `start_run`
- `graphql_query` tool for ad-hoc queries
- Authoring resources (guide, examples, value pairs)
- Token-budget-aware response formatting
- Rate limiting for MCP endpoints

**Exit Criteria:**
- Can query data from Claude Desktop via MCP
- Can create definitions and start runs via MCP
- Responses stay within token budget guidelines
- API key authentication works for MCP

---

## Stage 13: Data Export & CLI Compatibility [ ]

**Goal:** Enable bulk data export and maintain CLI tool compatibility.

**Deliverables:**
- Export API endpoints (Parquet, CSV, JSON Lines)
- CLI-compatible export format (transcripts/*.md, manifest.yaml)
- Definition markdown serializer
- Flexible aggregation API
- Cohort analysis support
- Download URL generation with expiry

**Exit Criteria:**
- Can export runs in multiple formats
- Exported data can be used with CLI tool
- Custom aggregation queries work
- Cohort comparisons functional

---

## Stage 14: Production Deployment [ ]

**Goal:** Deploy to Railway with proper configuration, monitoring, and CI/CD.

**Deliverables:**
- Railway project setup (API, Web, PostgreSQL, Worker)
- Environment variable configuration
- GitHub Actions CI/CD pipeline
- Health check endpoints
- Error tracking setup (optional: Sentry)
- Database backups configured
- Domain and SSL configuration

**Exit Criteria:**
- Application deployed and accessible
- CI/CD automatically deploys on merge to main
- Database backups running
- Team can access production instance

---

## Dependency Graph

```
Stage 1 (Scaffolding)
    └── Stage 2 (Database)
        └── Stage 3 (GraphQL API)
            ├── Stage 4 (Auth)
            │   └── Stage 7 (Frontend Foundation)
            │       └── Stage 8 (Definition UI)
            │           └── Stage 9 (Run Execution)
            │               └── Stage 10 (Analysis)
            │                   └── Stage 11 (Experiments)
            │
            └── Stage 5 (Queue System)
                └── Stage 6 (Python Workers)
                    └── Stage 9 (Run Execution)

Stage 12 (MCP) depends on: Stages 3, 4, 10
Stage 13 (Export) depends on: Stages 10, 11
Stage 14 (Deployment) can start after Stage 9
```

---

## Phase Summary

| Phase | Stages | Focus |
|-------|--------|-------|
| **Foundation** | 1-4 | Infrastructure, database, API, auth |
| **Core Pipeline** | 5-9 | Queue, workers, UI, run execution |
| **Analysis** | 10-11 | Statistics, comparison, experiments |
| **Integration** | 12-13 | MCP, export, CLI compatibility |
| **Ship** | 14 | Production deployment |

---

## Next Steps

To begin implementation:
1. Create detailed spec for Stage 1
2. Review and approve spec
3. Implement Stage 1
4. Repeat for subsequent stages

Each stage spec should include:
- Detailed file/folder structure
- API contracts (types, schemas)
- Test requirements
- Acceptance criteria checklist

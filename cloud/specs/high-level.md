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

## Stage 2: Database Schema & Migrations [x]

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
  - `tags`, `definition_tags`, `run_tags`, `experiment_tags` (tagging system)
- **Transcript versioning fields:**
  - `model_id` and `model_version` (e.g., `gemini-1.5-pro`, `gemini-1.5-pro-002`)
  - `definition_snapshot` (JSONB copy of definition at run time)
  - Immutable records - never modified after creation
- **Access tracking fields:**
  - `last_accessed_at` on transcripts, runs, definitions
  - Updated on read operations for future pruning analysis
- **Retention fields (for future use):**
  - `retention_days`, `archive_permanently` on runs
  - Default: permanent retention
- JSONB schema versioning pattern implemented
- Seed script for development data
- Database query helpers in `packages/db`

**Exit Criteria:**
- `npm run db:migrate` creates all tables
- `npm run db:seed` populates test data
- Recursive CTE queries work for definition ancestry
- TypeScript types generated from Prisma
- Transcripts capture model version information

---

## Stage 2b: Transcript Versioning & Access Tracking [x]

**Goal:** Extend database schema to support model version tracking, definition snapshots, and access tracking for future pruning.

**Context:** These requirements were identified after Stage 2 completion. They are needed for the model version comparison use case (re-run scenarios against new model versions).

**Deliverables:**
- **Schema migration** adding new fields:
  - `transcripts.model_id` - Provider model name (e.g., "gemini-1.5-pro")
  - `transcripts.model_version` - Specific version (e.g., "gemini-1.5-pro-002")
  - `transcripts.definition_snapshot` - JSONB copy of definition at run time
  - `definitions.last_accessed_at` - Access tracking timestamp
  - `runs.last_accessed_at` - Access tracking timestamp
  - `transcripts.last_accessed_at` - Access tracking timestamp
- **Update retention defaults:**
  - `runs.archive_permanently` default to TRUE (was FALSE)
  - `transcripts.content_expires_at` default to NULL (permanent)
- **Query helpers** for updating `last_accessed_at` on read operations
- **Rename** `transcripts.target_model` → `transcripts.model_id` (migration)

**Exit Criteria:**
- Migration runs successfully on existing data
- Transcripts capture model version on creation
- `last_accessed_at` updated on read operations
- Existing data preserved with NULL for new optional fields

**Dependencies:** Stage 2 (complete)

---

## Stage 3: GraphQL API Foundation [x]

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

## Stage 4: Authentication System [x]

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

## Stage 5: Queue System & Job Infrastructure [x]

> **Spec:** [003-stage-5-queue/spec.md](./003-stage-5-queue/spec.md) | **Plan:** [003-stage-5-queue/plan.md](./003-stage-5-queue/plan.md) | **Tasks:** [003-stage-5-queue/tasks.md](./003-stage-5-queue/tasks.md)

**Goal:** Set up PgBoss queue with TypeScript orchestrator and job lifecycle management.

**Deliverables:**
- PgBoss initialization and configuration
- Job type definitions: `probe_scenario`, `analyze_basic`, `analyze_deep`
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

## Stage 6: Python Worker Integration [x]

> **Spec:** [004-stage-6-python-workers/spec.md](./004-stage-6-python-workers/spec.md) | **Plan:** [004-stage-6-python-workers/plan.md](./004-stage-6-python-workers/plan.md) | **Tasks:** [004-stage-6-python-workers/tasks.md](./004-stage-6-python-workers/tasks.md)

**Goal:** Connect existing Python pipeline code to the TypeScript orchestrator.

**Deliverables:**
- Python worker package at `cloud/workers/`
- `workers/probe.py` - scenario probing via stdin/stdout JSON
- `workers/analyze_basic.py` - Tier 1 analysis stub
- `workers/health_check.py` - environment verification
- 6 LLM provider adapters (OpenAI, Anthropic, Gemini, xAI, DeepSeek, Mistral)
- Error handling with retry classification
- Lazy health check on first job with caching
- Structured JSON logging to stderr

**Test Coverage:**
- Python: 86% (72 tests)
- TypeScript: 93.2% (370 tests)

**Exit Criteria:**
- ✅ `probe_scenario` jobs execute Python and return results
- ✅ Transcripts are saved to database
- ✅ LLM calls work with configured API keys
- ✅ Errors are logged and jobs marked as failed appropriately
- ⏳ Manual validation with real API keys (requires credentials)

---

## Stage 7: Frontend Foundation [x]

**Goal:** Set up React frontend with auth, navigation shell, and core layout.

**Deliverables:**
- ✅ Vite + React + TypeScript setup in `apps/web`
- ✅ urql GraphQL client with auth headers
- ✅ Login page and auth context
- ✅ Global navigation shell (header, tabs)
- ✅ Protected route wrapper
- ✅ API key management page
- ✅ Basic empty/loading/error states
- ✅ Tailwind CSS styling

**Test Coverage:**
- API: 93.2% lines, 87.6% branches (370 tests)
- DB: 96.5% lines, 93.3% branches (160 tests)
- Shared: 80% lines, 100% branches (15 tests)
- Python Workers: 86% lines (72 tests)

**Exit Criteria:**
- ✅ Can login via web UI
- ✅ Navigation between Definitions/Runs/Experiments/Settings
- ✅ Can generate and revoke API keys
- ✅ Auth persists across page refreshes

---

## Stage 8: Definition Management UI [ ]

**Goal:** Build the definition library, editor, and version tree visualization with tag-based navigation.

**Deliverables:**
- Definition library page with tag-based filtering
- Tag management (create, assign, filter by tags)
- Definition editor with preamble, template, dimensions
- Fork definition flow with label
- Version tree visualization (basic lineage diagram)
- Search and filter functionality
- Syntax highlighting for template placeholders

**Exit Criteria:**
- Can browse, create, and edit definitions
- Can assign and filter by tags
- Can fork definitions and see lineage
- Version tree shows parent/child relationships
- Can preview generated scenarios

---

## Stage 9: Run Execution & Basic Export [ ]

**Goal:** Complete end-to-end run execution from UI to results, with CSV export for external analysis.

**Deliverables:**
- Run creation form (select definition, models, options)
- **Model version selection** (specific versions like `gemini-1.5-pro-002`)
- Run dashboard with status table
- Polling-based progress updates (5s interval)
- Run detail page showing per-model progress
- Run controls (pause/resume/cancel)
- **CSV export endpoint** for run results
- **Basic results viewer** (scores table, per-model breakdown)
- Transcript storage with model version capture
- **Access tracking middleware** (updates `last_accessed_at` on reads)
- **Re-run capability** (re-run same scenario against different model version)

**Exit Criteria:**
- Can start a run from the UI
- Can watch progress update in real-time (polling)
- Can pause and resume runs
- Completed runs show in dashboard
- **Can download run results as CSV**
- Transcripts capture model version and definition snapshot
- Can re-run a scenario against a new model version

**Phase 1 Complete:** Team can create definitions, run evaluations, and export results for external analysis.

---

## Stage 10: Experiment Framework [ ]

**Goal:** Build the organizational foundation for tracking related experiments with cost visibility.

**Deliverables:**
- Experiment creation with hypothesis tracking
- Experiment workspace (group related definitions and runs)
- Link runs to experiments
- **Cost estimation** before starting a run (based on model pricing × scenario count)
- Tag inheritance (experiments can have tags, propagate to children)
- Experiment timeline/history view

**Exit Criteria:**
- Can create experiments with hypothesis
- Can link definitions and runs to experiments
- Can see estimated cost before starting a run
- Experiments group related runs
- Can track related scenarios (e.g., "flipped perspective" variants)

**Phase 2 Complete:** Team can organize experiments and track related work systematically.

---

## Stage 11: Analysis System & Visualizations [ ]

**Goal:** Implement automated analysis pipeline with visualizations to answer key questions about AI behavior.

**Deliverables:**
- Tier 1 auto-analysis on run completion
- Basic stats computation (win rates, per-model scores)
- Confidence intervals with Wilson score
- **Score distribution visualization** (how do AIs tend to answer?)
- **Variable impact analysis** (which dimensions drive variance?)
- **Model comparison** (which AIs behave differently?)
- Analysis versioning and caching (input_hash)
- Results viewer UI (charts, tables)

**Exit Criteria:**
- Completed runs automatically have Tier 1 analysis
- Can see score distributions visualized
- Can see which variables have most impact
- Can identify outlier models
- Analysis methods documented in output

---

## Stage 12: MCP Read Tools [ ]

**Goal:** Enable AI agents to query and reason over ValueRank data.

**Deliverables:**
- MCP server setup (embedded in API or sidecar)
- Read tools: `list_definitions`, `list_runs`, `get_run_summary`, `get_analysis`
- `graphql_query` tool for ad-hoc queries
- Token-budget-aware response formatting
- Rate limiting for MCP endpoints

**Exit Criteria:**
- Can query data from Claude Desktop via MCP
- Can retrieve run summaries and analysis results
- Responses stay within token budget guidelines
- API key authentication works for MCP

**Phase 3 Complete:** Team has automated analysis and can use AI to reason over results.

---

## Stage 13: Run Comparison & Delta Analysis [ ]

**Goal:** Enable side-by-side comparison with statistical rigor, including cross-model-version comparisons.

**Deliverables:**
- Run comparison page (side-by-side delta view)
- Delta visualization (diverging bar chart)
- "What Changed" diff display
- **Model version comparison** (same scenario, different model versions)
- **Effect sizes** (Cohen's d for pairwise comparisons)
- **Significance testing** (p-values with Holm-Bonferroni correction)
- Tier 2 on-demand analysis (correlations, dimension impact)
- Statistical method documentation in results

**Use Case:** Compare `gemini-1.5-pro-001` results against `gemini-1.5-pro-002` on the same scenario to see how model updates affect value priorities.

**Exit Criteria:**
- Can compare any two runs side-by-side
- Can compare same scenario across model versions
- Statistical significance shown for deltas
- Effect sizes reported alongside p-values
- Can trigger deeper analysis on demand

**Phase 4 Complete:** Team can rigorously compare and analyze differences between runs.

---

## Stage 14: MCP Write Tools [ ]

**Goal:** Enable AI-assisted scenario authoring via MCP.

**Deliverables:**
- Write tools: `create_definition`, `fork_definition`, `start_run`
- Authoring resources (guide, examples, value pairs)
- `compare_runs` tool (leverages Stage 13)
- Validation for AI-generated content

**Exit Criteria:**
- Can create definitions and start runs via MCP
- AI can generate valid scenario definitions
- Authoring guide helps AI produce quality scenarios

**Phase 5 Complete:** AI can assist with scenario creation and experimentation.

---

## Stage 15: Data Export & CLI Compatibility [ ]

**Goal:** Enable bulk data export and maintain CLI tool compatibility.

**Deliverables:**
- Export API endpoints (Parquet, JSON Lines)
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

## Stage 16: Scale & Efficiency [ ]

**Goal:** Make it cheaper to run the system at scale.

**Deliverables:**
- Batch processing for large run queues
- Sampling/partial runs (run N% for quick tests)
- Queue optimization for high throughput
- Cost tracking and reporting

**Exit Criteria:**
- Can run sampled evaluations for quick iteration
- Batch processing reduces per-run overhead
- Can track actual vs estimated costs

**Phase 6 Complete:** System can scale efficiently for larger experiments.

---

## Stage 17: Production Deployment [ ]

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
        ├── Stage 2b (Transcript Versioning) ─── can run in parallel with Stage 3+
        └── Stage 3 (GraphQL API)
            ├── Stage 4 (Auth)
            │   └── Stage 7 (Frontend Foundation)
            │       └── Stage 8 (Definition UI + Tags)
            │           └── Stage 9 (Run Execution + CSV Export) ─── PHASE 1 COMPLETE
            │               └── Stage 10 (Experiment Framework) ─── PHASE 2 COMPLETE
            │                   └── Stage 11 (Analysis + Visualizations)
            │                       └── Stage 12 (MCP Read) ─── PHASE 3 COMPLETE
            │                           └── Stage 13 (Run Comparison) ─── PHASE 4 COMPLETE
            │                               └── Stage 14 (MCP Write) ─── PHASE 5 COMPLETE
            │
            └── Stage 5 (Queue System)
                └── Stage 6 (Python Workers)
                    └── Stage 9 (Run Execution + CSV Export)

Stage 2b (Transcript Versioning) must complete before Stage 9
Stage 15 (Export) depends on: Stages 9, 11
Stage 16 (Scale) depends on: Stage 9, can be done in parallel with later stages
Stage 17 (Deployment) can start after Stage 9
```

---

## Phase Summary

| Phase | Stages | Focus | Milestone |
|-------|--------|-------|-----------|
| **Foundation** | 1-4, 2b | Infrastructure, database, API, auth, transcript versioning | - |
| **Core Pipeline** | 5-9 | Queue, workers, UI, run execution, CSV export | **Phase 1: CLI Replication** |
| **Experimentation** | 10 | Experiment framework, cost estimation | **Phase 2: Experiment Tracking** |
| **Analysis** | 11-12 | Auto-analysis, visualizations, MCP read | **Phase 3: Automated Analysis** |
| **Comparison** | 13 | Run comparison, delta analysis | **Phase 4: Comparison** |
| **AI Authoring** | 14 | MCP write tools | **Phase 5: AI-Assisted Authoring** |
| **Scale** | 15-16 | Export, batch processing, sampling | **Phase 6: Scale & Efficiency** |
| **Ship** | 17 | Production deployment | - |

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

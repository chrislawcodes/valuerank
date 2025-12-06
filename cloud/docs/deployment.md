# Deployment & Operations

> Part of [Cloud ValueRank Architecture](./architecture-overview.md)
>
> See also: [Product Specification](./product-spec.md) for context on these decisions

## Local Development

Local development uses Docker Compose for services and Turborepo for the monorepo.

### Monorepo Structure (Turborepo)

```
cloud/
├── apps/
│   ├── api/              # Express + TypeScript API server
│   └── web/              # React frontend (Vite)
├── packages/
│   └── db/               # Database client, types, migrations
├── docker/
│   └── Dockerfile.api    # Production build (used later)
├── docker-compose.yml    # Local services (PostgreSQL)
├── package.json          # Workspace root
├── turbo.json            # Turborepo config
└── docs/                 # Architecture documentation
```

**Why Turborepo?**
- Shared TypeScript types between API and web
- Cached builds across packages
- Single `npm install` at root
- Easy to add packages (workers, shared utils)

### Docker Compose (Local Services)

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: valuerank
      POSTGRES_PASSWORD: valuerank
      POSTGRES_DB: valuerank
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  # Python workers run in separate container
  worker:
    build:
      context: .
      dockerfile: docker/Dockerfile.worker
    environment:
      DATABASE_URL: postgresql://valuerank:valuerank@postgres:5432/valuerank
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    depends_on:
      - postgres

volumes:
  pgdata:
```

**Worker architecture:**
- Python workers run in separate container
- Poll PgBoss queue for jobs via direct PostgreSQL connection
- Write results (transcripts, analysis) directly to database
- Enables reuse of existing Python pipeline code

### Quick Start

```bash
cd cloud

# Start PostgreSQL
docker-compose up -d

# Install dependencies (all workspaces)
npm install

# Run migrations
npm run db:migrate

# Start dev servers (API + Web in parallel)
npm run dev
```

### Development Scripts

```bash
npm run dev          # Start all apps in dev mode
npm run dev:api      # Start only API
npm run dev:web      # Start only web frontend
npm run build        # Build all packages
npm run db:migrate   # Run database migrations
npm run db:studio    # Open Prisma Studio (DB browser)
npm run test         # Run all tests
```

---

## Production: Railway

### Recommended Stack for MVP

| Component | Service | Cost Model |
|-----------|---------|------------|
| Database + Queue | Railway PostgreSQL + PgBoss | Free tier → $5/mo |
| API | Railway | Free tier available |
| Workers | Railway | ~$7/mo per worker |
| Frontend | Railway or Vercel | Free tier |

**Key simplification:** PgBoss uses PostgreSQL for job queues, eliminating the need for Redis. One database handles both application data and job queue.

## Scaling Path

1. **MVP**: Single worker, free PostgreSQL tier
2. **Growth**: Multiple workers, larger PostgreSQL instance
3. **Scale**: Read replicas, connection pooling, dedicated compute

---

## Export Strategy (CLI Compatibility)

A key requirement is the ability to dump the database back to files compatible with the CLI tool.

### Export Mapping

| Cloud Schema | CLI Format | Export Strategy |
|--------------|-----------|-----------------|
| `transcripts.content` | `transcript.*.md` | Store raw markdown verbatim; export as-is |
| `runs` table | `run_manifest.yaml` | Serialize JSONB columns to YAML |
| `scenarios` table | `exp-*.yaml` | Serialize JSONB to YAML |
| `definitions.content` | `exp-*.md` | **Requires markdown serializer** |

### Definition Markdown Serializer

```python
def serialize_definition_to_md(definition: dict) -> str:
    """Convert JSONB definition to CLI-compatible markdown."""
    lines = []

    # YAML frontmatter
    lines.append("---")
    lines.append(f"name: {definition['name']}")
    lines.append(f"base_id: {definition['base_id']}")
    if definition.get('category'):
        lines.append(f"category: {definition['category']}")
    lines.append("---\n")

    # Preamble section
    lines.append("# Preamble")
    lines.append(definition['preamble'])
    lines.append("")

    # Template section
    lines.append("# Template")
    lines.append(definition['template'])
    lines.append("")

    # Dimensions as markdown tables
    lines.append("# Dimensions")
    for dim in definition.get('dimensions', []):
        lines.append(f"## {dim['name']}")
        lines.append("| Score | Label | Options |")
        lines.append("|-------|-------|---------|")
        for level in dim['levels']:
            opts = ", ".join(level['options'])
            lines.append(f"| {level['score']} | {level['label']} | {opts} |")
        lines.append("")

    # Matching rules (if any)
    if definition.get('matching_rules'):
        lines.append("# Matching Rules")
        lines.append(definition['matching_rules'])

    return "\n".join(lines)
```

### Export API Endpoints

```
POST /api/export/run/:id
  → Downloads ZIP containing:
     ├── run_manifest.yaml
     ├── scenarios/
     │   └── exp-*.yaml
     └── transcripts/
         └── transcript.*.md

POST /api/export/definition/:id
  → Downloads definition as .md file (with all version ancestry if requested)

POST /api/export/workspace
  → Full workspace export (all definitions + runs)
```

### Round-Trip Guarantee

To ensure CLI compatibility:
1. **Store transcripts verbatim** - don't parse/restructure the markdown
2. **Store scenarios as generated** - keep the exact YAML structure
3. **Test export/import cycle** - import exported data back, verify identical behavior

---

## Data Volume Estimates

Based on current ValueRank usage:

| Data Type | Size per Run | Retention |
|-----------|--------------|-----------|
| Run metadata | ~10 KB | Permanent |
| Transcripts | ~500 KB - 5 MB | Permanent (default) |
| Access tracking | Minimal | Enables future pruning |

For 100 runs/month with ~50 scenarios × 6 models each:
- Storage: ~50 GB/year (mostly transcripts)
- Documents: ~30,000/month
- Access tracking enables data-driven pruning decisions if storage becomes an issue

---

## Resolved Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Multi-tenancy | **No** - Single tenant | Internal team tool, no need for isolation |
| LLM API Keys | **Server-side** | Enables async workers, simpler UX |
| Cost Tracking | **Phase 2** | Show estimated cost before starting run |
| Transcript Retention | **Permanent (default)** | Scientific reproducibility; access tracking enables future pruning |
| Export/Import | **Yes** - CLI compatibility | Business continuity, potential rollback |
| Version Labeling | **Hybrid** | Git-like UUID + optional user labels |
| Fork Visibility | **Public** | All data visible to all users |
| Diff Display | **Defer to implementation** | Basic side-by-side diff initially |
| Transcript Versioning | **Yes** | Capture model_id, model_version, definition_snapshot for reproducibility |

See [Product Specification](./product-spec.md) for full context.

---

## Next Steps

See [High-Level Implementation Plan](../specs/high-level.md) for detailed stage breakdown.

### Implementation Phase 1: Foundation (Stages 1-4)
1. **Turborepo Scaffold**: Monorepo structure (`apps/api`, `apps/web`, `packages/db`)
2. **Docker Compose**: PostgreSQL container for local dev
3. **Database Schema**: Initial tables with Prisma migrations + transcript versioning
4. **GraphQL API**: Pothos setup with core types
5. **Auth Implementation**: Email/password + API keys

### Implementation Phase 2: Core Pipeline (Stages 5-9)
6. **PgBoss Queue**: Job types and TypeScript orchestrator
7. **Python Workers**: Probe and analysis scripts
8. **Frontend Foundation**: React UI with auth
9. **Definition UI**: Editor, tag management, version tree
10. **Run Execution**: Dashboard, CSV export, basic results

### Implementation Phase 3: Analysis & Comparison (Stages 10-14)
11. **Experiment Framework**: Grouping, cost estimation
12. **Analysis System**: Auto-analysis, visualizations
13. **MCP Read Tools**: Query data via local AI
14. **Run Comparison**: Delta analysis, statistical testing
15. **MCP Write Tools**: AI-assisted authoring

### Implementation Phase 4: Production (Stages 15-17)
16. **Data Export**: CLI compatibility, bulk export
17. **Scale Features**: Batch processing, sampling
18. **Railway Deployment**: CI/CD, monitoring

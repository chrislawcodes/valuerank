# Cloud ValueRank - Architecture Overview

## Executive Summary

Cloud ValueRank is a cloud-native version of the ValueRank AI moral values evaluation framework. This document outlines the initial architecture decisions for the three primary tiers: Database, API/Queue, and Front-end.

---

## Current System Analysis

Before designing the cloud architecture, we analyzed the existing ValueRank system:

### Data Structures in Current System

| Entity | Format | Characteristics |
|--------|--------|-----------------|
| Scenario Definitions | `.md` files | Templates with dimensions, ~5-50KB each |
| Generated Scenarios | `.yaml` files | Multiple variants per file, nested structure |
| Transcripts | `.md` with YAML frontmatter | Variable length (1-20KB), append-only |
| Run Manifests | `.yaml` files | Metadata, model mappings, config snapshots |
| Values Rubric | `.yaml` file | Reference data, rarely changes |

### Key Observations

1. **Schema Variability**: Scenario definitions have flexible dimension structures that vary significantly between experiments
2. **Nested/Hierarchical Data**: Scenarios contain arrays of variants, each with their own properties
3. **Document-Oriented**: Most data is self-contained documents rather than relational rows
4. **Append-Heavy**: Transcripts grow during runs
5. **Query Patterns**: Primary access is by run_id, scenario_id, or model - not complex joins

---

## Tier 1: Database

### Critical Requirement: Definition Versioning & Forking

Scenario definitions need full version control with forking capability:

```
definition_v1 (original "café safety dilemma")
    ├── definition_v1.1 (tweaked: "changed 'danger' to 'risk'")
    │   ├── definition_v1.1.1 (added new dimension)
    │   └── run_xyz → results show 5% shift in Physical_Safety
    └── definition_v1.2 (alternate framing: "owner perspective")
        └── run_abc → results show 12% shift
```

**Required Operations:**
- Fork from any version (create child with parent pointer)
- View full ancestry chain (who forked from whom)
- Diff two versions (what changed between them)
- Query: "show all runs using this definition or any descendant"
- Query: "compare results across a lineage tree"
- Track which exact definition version produced which results

This is fundamentally a **DAG (directed acyclic graph) problem** - the same structure Git uses.

### Revised Recommendation: **PostgreSQL + JSONB** (Hybrid Approach)

The versioning/forking requirement shifts the recommendation away from pure document stores. Here's why:

| Requirement | Document Store | PostgreSQL |
|-------------|---------------|------------|
| Flexible schema for definitions | ✅ Native | ✅ JSONB columns |
| Parent-child relationships | ⚠️ Manual, awkward | ✅ Foreign keys |
| Ancestry queries ("all ancestors of X") | ❌ Multiple round-trips | ✅ Recursive CTEs |
| Descendant queries ("all children of X") | ❌ Requires denormalization | ✅ Recursive CTEs |
| Lineage comparison | ❌ App-level joins | ✅ Native JOINs |
| Content diffing | ➖ Same either way | ➖ Same either way |

### Why PostgreSQL Wins for Versioning

**Recursive CTEs** make ancestry/descendant queries trivial:

```sql
-- Get full ancestry chain for a definition
WITH RECURSIVE ancestors AS (
  SELECT * FROM definitions WHERE id = 'def_v1.1.1'
  UNION ALL
  SELECT d.* FROM definitions d
  JOIN ancestors a ON d.id = a.parent_id
)
SELECT * FROM ancestors;

-- Get all descendants of a definition
WITH RECURSIVE descendants AS (
  SELECT * FROM definitions WHERE id = 'def_v1'
  UNION ALL
  SELECT d.* FROM definitions d
  JOIN descendants desc ON d.parent_id = desc.id
)
SELECT * FROM descendants;

-- Find all runs using this definition or any descendant
WITH RECURSIVE tree AS (...)
SELECT r.* FROM runs r
JOIN tree t ON r.definition_id = t.id;
```

**ltree extension** (optional) provides even more powerful hierarchical queries:

```sql
-- Store path as ltree: 'root.v1.v1_1.v1_1_1'
CREATE INDEX ON definitions USING GIST (path);

-- All descendants of v1
SELECT * FROM definitions WHERE path <@ 'root.v1';

-- All ancestors of v1.1.1
SELECT * FROM definitions WHERE 'root.v1.v1_1.v1_1_1' <@ path;
```

### Schema Design

**Core Tables (Relational):**

```sql
-- Definitions with version lineage
CREATE TABLE definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES definitions(id),  -- Fork parent
  name TEXT NOT NULL,                          -- Human-readable name
  version_label TEXT,                          -- "v1.1", "experiment-A"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  -- Flexible content stored as JSONB
  content JSONB NOT NULL,  -- { preamble, template, dimensions, matching_rules }

  -- Optional: ltree for fast hierarchical queries
  path ltree,

  -- Computed diff from parent (for quick comparison)
  diff_from_parent JSONB
);

-- Runs linked to specific definition versions
CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID REFERENCES definitions(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'pending',
  config JSONB,      -- Runtime config snapshot
  progress JSONB     -- { total, completed, failed }
);

-- Transcripts (high volume, could archive old ones)
CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES runs(id) NOT NULL,
  scenario_id TEXT NOT NULL,
  target_model TEXT NOT NULL,
  content TEXT,      -- Full markdown transcript
  turns JSONB,       -- Structured turn data
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**JSONB for Flexible Parts:**

The `definitions.content` column holds the variable schema parts:

```json
{
  "preamble": "You are being asked to reason about...",
  "template": "A café owner faces [situation] where [severity]...",
  "dimensions": [
    {
      "name": "situation",
      "levels": [
        {"score": 1, "label": "minor", "options": ["small spill", "loose tile"]},
        {"score": 5, "label": "severe", "options": ["gas leak", "structural damage"]}
      ]
    }
  ],
  "matching_rules": "situation.score >= severity.score"
}
```

This gives us:
- **Relational structure** for versioning, runs, relationships
- **Schema flexibility** for definition content and config
- **No migrations** when definition structure evolves

### Alternative Considered: Git-Based Storage

We could literally use Git (or libgit2) for definitions:
- Content-addressable storage (automatic deduplication)
- Built-in branching, merging, diffing
- Proven model for exactly this problem

**Pros:**
- Battle-tested versioning semantics
- Diff/merge tools exist
- Could export/import as actual Git repos

**Cons:**
- Adds operational complexity (Git server or embedded libgit2)
- Queries require loading into memory or separate index
- Overkill if we don't need merge (just fork)

**Verdict:** PostgreSQL is simpler for our needs. We're not merging definitions, just forking. The DAG structure is straightforward with recursive CTEs.

### Proposed Collections/Tables

```
PostgreSQL Tables:
├── definitions          # Versioned scenario definitions (with parent_id for forking)
├── runs                 # Pipeline runs linked to definition versions
├── transcripts          # Raw dialogue (high volume)
├── analysis_results     # Cached deep analysis (PCA, correlations, outliers)
├── experiments          # Group related runs for comparison
├── run_comparisons      # Delta analysis between two runs
├── run_scenario_selection  # Track which scenarios included in sampled runs
├── users                # User accounts
└── rubrics              # Values rubric versions (reference data)
```

### Key Queries Enabled

```sql
-- 1. Get definition with full ancestry
SELECT d.*, array_agg(a.id) as ancestors
FROM definitions d
LEFT JOIN LATERAL (
  WITH RECURSIVE anc AS (
    SELECT parent_id FROM definitions WHERE id = d.id
    UNION ALL
    SELECT d2.parent_id FROM definitions d2 JOIN anc ON d2.id = anc.parent_id
  )
  SELECT id FROM anc WHERE id IS NOT NULL
) a ON true
WHERE d.id = $1
GROUP BY d.id;

-- 2. Get all runs across a definition's descendants
WITH RECURSIVE tree AS (
  SELECT id FROM definitions WHERE id = $root_id
  UNION ALL
  SELECT d.id FROM definitions d JOIN tree t ON d.parent_id = t.id
)
SELECT
  d.name,
  d.version_label,
  r.id as run_id,
  r.status,
  r.created_at
FROM tree t
JOIN definitions d ON d.id = t.id
JOIN runs r ON r.definition_id = d.id
ORDER BY d.created_at;

-- 3. Find all runs affected by a definition change
WITH RECURSIVE descendants AS (...)
SELECT * FROM runs WHERE definition_id IN (SELECT id FROM descendants);
```

### Deployment Options

| Service | Pros | Cons |
|---------|------|------|
| **Supabase** | PostgreSQL + Auth + Realtime built-in, generous free tier | Some vendor conventions |
| **Neon** | Serverless Postgres, branching for dev/prod | Newer, less ecosystem |
| **Railway** | Simple deployment, good DX | Less Postgres-specific features |
| **RDS/Cloud SQL** | Full control, enterprise features | More operational overhead |

**Recommendation for MVP:** Supabase - gives us PostgreSQL + auth + real-time subscriptions out of the box.

---

## Tier 2: API + Queue System

### Architecture: Serverless Functions + Managed Queue

Since the primary workload is **long-running AI tasks** (minutes to hours), we need:

1. **Task Queue**: Durable, persistent queue for AI operations
2. **Workers**: Processes that execute tasks (call LLMs, process responses)
3. **Progress Tracking**: Real-time updates to clients
4. **Queue Management**: Pause, resume, cancel, retry capabilities

### Recommended Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Queue** | BullMQ (Redis) or AWS SQS | Mature, pausable, priority support |
| **Workers** | Node.js or Python workers | Match existing LLM adapter code |
| **API** | Express or Fastify | Lightweight, WebSocket support |
| **Real-time** | WebSockets or SSE | Progress updates to UI |

### Queue Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   API       │────▶│   Queue     │
│   (React)   │◀────│   Server    │◀────│   (Redis)   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    │
                           │              ┌─────┴─────┐
                           │              ▼           ▼
                           │        ┌─────────┐ ┌─────────┐
                           │        │ Worker  │ │ Worker  │
                           │        │   1     │ │   2     │
                           └───────▶└─────────┘ └─────────┘
                         (status)         │           │
                                          ▼           ▼
                                    ┌─────────────────────┐
                                    │   LLM Providers     │
                                    │ (OpenAI, Anthropic) │
                                    └─────────────────────┘
```

### Queue Operations

**Job Types:**
```
- probe:scenario      # Send single scenario to single model
- summarize:run       # Generate natural language summary
- analyze:basic       # Fast aggregation (~500ms)
- analyze:deep        # Heavy statistical analysis (10-30s)
- analyze:compare     # Cross-run comparison
```

**Queue Management API:**
```
POST /api/queue/runs              # Start a new run (enqueue all tasks)
GET  /api/queue/runs/:id          # Get run status and progress
POST /api/queue/runs/:id/pause    # Pause all tasks for run
POST /api/queue/runs/:id/resume   # Resume paused run
POST /api/queue/runs/:id/cancel   # Cancel and remove pending tasks
DELETE /api/queue/runs/:id        # Delete run and all associated data

GET  /api/queue/status            # Global queue stats
POST /api/queue/pause             # Pause entire queue (all runs)
POST /api/queue/resume            # Resume entire queue
```

**WebSocket Events:**
```
ws://api/runs/:id/progress
  → { type: "task_complete", scenario_id, model, progress: "45/120" }
  → { type: "task_failed", scenario_id, model, error: "..." }
  → { type: "run_complete" }
```

### BullMQ Specifics (Recommended)

BullMQ provides:
- **Pause/Resume**: Built-in queue pause without losing jobs
- **Priority**: Run urgent jobs first
- **Retry**: Configurable retry with backoff
- **Rate Limiting**: Respect LLM provider limits
- **Progress**: Job-level progress tracking
- **Events**: Real-time job lifecycle events

```javascript
// Example: Creating a run
const queue = new Queue('valuerank');

async function startRun(runConfig) {
  const run = await db.runs.insert(runConfig);

  for (const scenario of scenarios) {
    for (const model of runConfig.target_models) {
      await queue.add('probe:scenario', {
        run_id: run.id,
        scenario_id: scenario.id,
        model: model
      }, {
        priority: 1,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
      });
    }
  }

  return run;
}
```

### Analysis Processing

The DevTool's deep analysis is computationally heavy (10-30s) and includes:
- PCA for model positioning
- Outlier detection (Mahalanobis, Isolation Forest, Jackknife)
- Pearson correlations across dimensions
- Inter-model agreement matrices
- LLM-generated narrative summaries

**Architecture for Heavy Analysis:**

```
┌─────────────────────────────────────────────────────────────┐
│                      Analysis Pipeline                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌──────────┐    ┌──────────┐    ┌──────────────────────┐ │
│   │ Basic    │───▶│ Cache    │───▶│ Return cached result │ │
│   │ Analysis │    │ Check    │    └──────────────────────┘ │
│   │ Request  │    └────┬─────┘                              │
│   └──────────┘         │ miss                               │
│                        ▼                                     │
│   ┌──────────┐    ┌──────────┐    ┌──────────────────────┐ │
│   │ Deep     │───▶│ Queue    │───▶│ Python Worker        │ │
│   │ Analysis │    │ Job      │    │ (dedicated compute)  │ │
│   │ Request  │    └──────────┘    └──────────┬───────────┘ │
│   └──────────┘                               │              │
│                                              ▼              │
│                                    ┌──────────────────────┐ │
│                                    │ Store in analysis    │ │
│                                    │ results table        │ │
│                                    └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Analysis Results Table:**

```sql
CREATE TABLE analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES runs(id) NOT NULL,
  analysis_type TEXT NOT NULL,  -- 'basic', 'deep', 'comparison'

  -- Cache invalidation
  input_hash TEXT NOT NULL,     -- Hash of transcripts used
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Results (JSONB for flexibility)
  basic_stats JSONB,            -- Per-model mean/std/min/max
  dimension_analysis JSONB,     -- Variance by dimension
  correlations JSONB,           -- Dimension × model correlations
  inter_model_agreement JSONB,  -- Pairwise model correlations
  outlier_detection JSONB,      -- Multi-method outlier flags
  pca_coordinates JSONB,        -- 2D model positioning
  insights JSONB,               -- Auto-generated findings
  llm_summary TEXT,             -- Natural language narrative

  UNIQUE(run_id, analysis_type, input_hash)
);
```

**Caching Strategy:**
- Hash transcript content to detect changes
- Return cached results if hash matches
- Auto-invalidate when new transcripts added to run
- Allow manual re-analysis trigger

---

### Run Comparison & Experimentation

A key workflow is running experiments where you change one variable and compare results:

```
Experiment: "How does model selection affect safety scores?"

  run_A (baseline)           run_B (experiment)
  ├── definition: v1.2       ├── definition: v1.2      ← same
  ├── models: [gpt-4, claude]├── models: [gpt-4, gemini] ← changed
  ├── scenarios: 100%        ├── scenarios: 100%       ← same
  └── results: {...}         └── results: {...}
                    ↓
            comparison_result:
            - gemini vs claude delta
            - which scenarios diverged most
            - statistical significance
```

**Run Relationships Schema:**

```sql
-- Track what changed between runs
ALTER TABLE runs ADD COLUMN experiment_id UUID REFERENCES experiments(id);
ALTER TABLE runs ADD COLUMN parent_run_id UUID REFERENCES runs(id);
ALTER TABLE runs ADD COLUMN run_type TEXT DEFAULT 'full';  -- 'full', 'sample', 'rerun'
ALTER TABLE runs ADD COLUMN sample_percentage INTEGER;     -- NULL for full runs
ALTER TABLE runs ADD COLUMN sample_seed INTEGER;           -- For reproducibility

CREATE TABLE experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  hypothesis TEXT,                    -- "Gemini will score higher on safety"
  controlled_variables JSONB,         -- What stays the same
  independent_variable JSONB,         -- What we're changing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE run_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID REFERENCES experiments(id),
  baseline_run_id UUID REFERENCES runs(id) NOT NULL,
  comparison_run_id UUID REFERENCES runs(id) NOT NULL,

  -- Comparison results
  delta_by_model JSONB,               -- Per-model score differences
  delta_by_scenario JSONB,            -- Per-scenario differences
  most_divergent_scenarios JSONB,     -- Ranked by variance
  statistical_tests JSONB,            -- t-test, Mann-Whitney, etc.

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(baseline_run_id, comparison_run_id)
);
```

**Comparison API:**

```
POST /api/runs/compare
  body: { baseline_run_id, comparison_run_id }
  → Queues analyze:compare job
  → Returns comparison_id

GET /api/runs/:id/comparisons
  → List all comparisons involving this run

GET /api/comparisons/:id
  → Get comparison results (delta analysis)

POST /api/experiments
  body: { name, hypothesis, baseline_run_id }
  → Create experiment container

POST /api/experiments/:id/runs
  body: { changes: { models: [...] } }
  → Create variant run within experiment
```

### Partial / Sampled Runs

For cost control and rapid iteration, support running only a percentage of scenarios:

**Use Cases:**
- **10% test run**: Quick sanity check before full run (~$5 vs ~$50)
- **Progressive rollout**: Start with 10%, expand to 50%, then 100%
- **A/B sampling**: Same scenarios, different models

**Implementation:**

```sql
-- Already added to runs table above:
-- sample_percentage INTEGER
-- sample_seed INTEGER

-- Track which scenarios were included
CREATE TABLE run_scenario_selection (
  run_id UUID REFERENCES runs(id),
  scenario_id TEXT NOT NULL,
  included BOOLEAN NOT NULL,
  PRIMARY KEY (run_id, scenario_id)
);
```

**Sampling Logic:**

```python
def select_scenarios(all_scenarios: list, percentage: int, seed: int) -> list:
    """Deterministic sampling for reproducibility."""
    import random
    random.seed(seed)

    n = max(1, len(all_scenarios) * percentage // 100)
    return random.sample(all_scenarios, n)

# Same seed + same percentage = same scenarios selected
# Allows apples-to-apples comparison across sampled runs
```

**Run Creation with Sampling:**

```
POST /api/queue/runs
  body: {
    definition_id: "...",
    models: ["gpt-4", "claude-3"],
    sample_percentage: 10,        # Optional: default 100
    sample_seed: 42               # Optional: random if not provided
  }
```

**Extrapolation Warning:**

When viewing results from sampled runs, UI should clearly indicate:
- "Based on 10% sample (12 of 120 scenarios)"
- Statistical confidence intervals for extrapolated metrics
- Option to "Expand to full run" (queues remaining 90%)

---

## Tier 3: Front-end

### Recommendation: React + TypeScript + Vite (Same as DevTool)

The existing DevTool provides a solid foundation. Key additions for Cloud:

### New Features Needed

1. **Authentication**: User accounts, API keys management
2. **Run Dashboard**: List runs with status, progress bars
3. **Queue Controls**: Pause/resume/cancel buttons
4. **Real-time Progress**: WebSocket-driven updates
5. **Transcript Viewer**: Browse and search transcripts
6. **Deep Analysis**: PCA visualization, outlier detection, correlation matrices
7. **Run Comparison**: Side-by-side delta analysis, divergence highlighting
8. **Experiment Management**: Create experiments, track hypothesis, group related runs
9. **Sampled Runs**: Configure sample %, view confidence intervals, expand to full
10. **Multi-tenancy**: Workspace/organization support (future)

### Component Architecture

```
src/
├── components/
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   └── ApiKeyManager.tsx
│   ├── scenarios/
│   │   ├── ScenarioEditor.tsx      # (from DevTool)
│   │   ├── ScenarioGenerator.tsx   # (from DevTool)
│   │   └── ScenarioList.tsx
│   ├── runs/
│   │   ├── RunDashboard.tsx        # NEW: List all runs
│   │   ├── RunProgress.tsx         # NEW: Real-time progress
│   │   ├── RunControls.tsx         # NEW: Pause/resume/cancel
│   │   ├── RunConfig.tsx           # NEW: Sample %, model selection
│   │   └── TranscriptViewer.tsx    # NEW: Browse transcripts
│   ├── analysis/
│   │   ├── DeepAnalysis.tsx        # Port from DevTool + enhancements
│   │   ├── PCAVisualization.tsx    # Model positioning chart
│   │   ├── CorrelationMatrix.tsx   # Dimension × model heatmap
│   │   ├── OutlierDetection.tsx    # Multi-method outlier display
│   │   └── InsightsList.tsx        # Auto-generated findings
│   ├── comparison/
│   │   ├── RunComparison.tsx       # Side-by-side delta view
│   │   ├── DeltaChart.tsx          # Visualize differences
│   │   └── DivergenceTable.tsx     # Most divergent scenarios
│   ├── experiments/
│   │   ├── ExperimentList.tsx      # All experiments
│   │   ├── ExperimentDetail.tsx    # Runs within experiment
│   │   └── HypothesisTracker.tsx   # Track experiment outcomes
│   ├── queue/
│   │   ├── QueueStatus.tsx         # NEW: Global queue stats
│   │   └── QueueControls.tsx       # NEW: Global pause/resume
│   └── settings/
│       └── RuntimeConfig.tsx       # (from DevTool)
├── hooks/
│   ├── useWebSocket.ts             # NEW: Real-time updates
│   └── useQueue.ts                 # NEW: Queue operations
└── api/
    └── client.ts                   # API client with auth
```

### State Management

For real-time updates and complex state, consider:
- **Zustand** (lightweight) or **TanStack Query** (server state)
- WebSocket integration for live updates
- Optimistic updates for queue operations

---

## Deployment Considerations

### Recommended Stack for MVP

| Component | Service | Cost Model |
|-----------|---------|------------|
| Database | Supabase (PostgreSQL + Auth + Realtime) | Free tier → $25/mo |
| Queue | Upstash Redis (serverless) | Pay-per-request |
| API | Vercel or Railway | Free tier available |
| Workers | Railway or Render | ~$7/mo per worker |
| Frontend | Vercel | Free tier |

### Scaling Path

1. **MVP**: Single worker, shared Redis, free database tier
2. **Growth**: Multiple workers, dedicated Redis, larger DB
3. **Scale**: Kubernetes workers, Redis cluster, sharded DB

---

## Open Questions

1. **Multi-tenancy**: Do we need separate workspaces/organizations from day one?
2. **API Keys**: Where do users store their LLM API keys? (Server-side vs client-side)
3. **Cost Tracking**: Do we track and display LLM costs per run?
4. **Persistence of Transcripts**: How long do we retain full transcript data?
5. **Export/Import**: Do users need to export runs to local files?
6. **Version Labeling**: Auto-increment (v1, v1.1, v1.1.1) or user-defined labels?
7. **Fork Visibility**: Can users fork from others' definitions, or only their own?
8. **Diff Display**: How do we visualize changes between definition versions in the UI?

---

## Next Steps

1. **Supabase Setup**: Create project, define initial schema with versioning tables
2. **Queue Prototype**: Build BullMQ proof-of-concept with single worker
3. **Version Tree UI**: Design component for visualizing definition lineage
4. **API Schema**: Define OpenAPI spec for all endpoints (including fork/version operations)
5. **Auth Strategy**: Leverage Supabase Auth or add Clerk/Auth0
6. **DevTool Migration**: Identify components to reuse vs rewrite

---

## Export Strategy (CLI Compatibility)

A key requirement is the ability to dump the database back to files compatible with the CLI tool. Here's how each artifact type maps:

### Export Mapping

| Cloud Schema | CLI Format | Export Strategy |
|--------------|-----------|-----------------|
| `transcripts.content` | `transcript.*.md` | Store raw markdown verbatim; export as-is |
| `runs` table | `run_manifest.yaml` | Serialize JSONB columns to YAML |
| `scenarios` table | `exp-*.yaml` | Serialize JSONB to YAML |
| `definitions.content` | `exp-*.md` | **Requires markdown serializer** |

### Schema Addition: Generated Scenarios

Add a `scenarios` table to store generated scenario variants:

```sql
CREATE TABLE scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID REFERENCES definitions(id) NOT NULL,
  run_id UUID REFERENCES runs(id),  -- NULL if pre-generated
  content JSONB NOT NULL,  -- { preamble, scenarios: { id: {...}, ... } }
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

This allows direct YAML serialization on export.

### Definition Markdown Serializer

The `definitions.content` JSONB must be serialized back to structured markdown:

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

### Export API Endpoint

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

## Appendix: Data Volume Estimates

Based on current ValueRank usage:

| Data Type | Size per Run | Retention |
|-----------|--------------|-----------|
| Run metadata | ~10 KB | Forever |
| Transcripts | ~500 KB - 5 MB | 90 days |

For 100 runs/month with ~50 scenarios × 6 models each:
- Storage: ~50 GB/year (mostly transcripts)
- Documents: ~30,000/month

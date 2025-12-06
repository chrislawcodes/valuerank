# Database Design

> Part of [Cloud ValueRank Architecture](./architecture-overview.md)
>
> See also: [Product Specification](./product-spec.md) for context on these decisions

## Recommendation: PostgreSQL + JSONB

The versioning/forking requirement drives us toward PostgreSQL over pure document stores.

**Key Decisions (from Product Spec):**
- **Single tenant**: No tenant_id columns needed
- **14-day transcript retention**: Content deleted after 14 days, metadata retained
- **Hybrid versioning**: Git-like identity (UUIDs) with optional user labels
- **Public visibility**: No ACLs needed, all data visible to all users

## Critical Requirement: Definition Versioning & Forking

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

## Why PostgreSQL Wins

| Requirement | Document Store | PostgreSQL |
|-------------|---------------|------------|
| Flexible schema for definitions | ✅ Native | ✅ JSONB columns |
| Parent-child relationships | ⚠️ Manual, awkward | ✅ Foreign keys |
| Ancestry queries ("all ancestors of X") | ❌ Multiple round-trips | ✅ Recursive CTEs |
| Descendant queries ("all children of X") | ❌ Requires denormalization | ✅ Recursive CTEs |
| Lineage comparison | ❌ App-level joins | ✅ Native JOINs |
| Content diffing | ➖ Same either way | ➖ Same either way |

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

## Schema Design

### Core Tables

```sql
-- Definitions with version lineage (hybrid versioning)
-- Each definition has a unique UUID (git-like identity)
-- Users can optionally assign labels for readability
CREATE TABLE definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES definitions(id),  -- Fork parent
  name TEXT NOT NULL,                          -- Human-readable name
  version_label TEXT,                          -- Optional: "baseline", "softer-framing"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  -- Flexible content stored as JSONB
  content JSONB NOT NULL,  -- { preamble, template, dimensions, matching_rules }

  -- Optional: ltree for fast hierarchical queries
  path ltree,

  -- Computed diff from parent (for quick comparison)
  diff_from_parent JSONB
);

-- Display logic: show version_label if set, otherwise truncated UUID
-- Example: "baseline" or "def_a1b2c3..."

-- Runs linked to specific definition versions
CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID REFERENCES definitions(id) NOT NULL,
  experiment_id UUID REFERENCES experiments(id),
  parent_run_id UUID REFERENCES runs(id),
  run_type TEXT DEFAULT 'full',  -- 'full', 'sample', 'rerun'
  sample_percentage INTEGER,     -- NULL for full runs
  sample_seed INTEGER,           -- For reproducibility
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'pending',
  config JSONB,      -- Runtime config snapshot
  progress JSONB     -- { total, completed, failed }
);

-- Transcripts with 14-day content retention
-- Content is deleted after 14 days, metadata retained
CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES runs(id) NOT NULL,
  scenario_id TEXT NOT NULL,
  target_model TEXT NOT NULL,
  content TEXT,           -- Full markdown transcript (NULL after 14 days)
  turns JSONB,            -- Structured turn data (NULL after 14 days)
  turn_count INTEGER,     -- Retained permanently
  word_count INTEGER,     -- Retained permanently
  created_at TIMESTAMPTZ DEFAULT NOW(),
  content_expires_at TIMESTAMPTZ  -- Set to created_at + 14 days
);

-- Cleanup job runs daily, sets content=NULL, turns=NULL where expired
-- Analysis results computed from transcripts are retained indefinitely

-- Generated scenarios
CREATE TABLE scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID REFERENCES definitions(id) NOT NULL,
  run_id UUID REFERENCES runs(id),  -- NULL if pre-generated
  content JSONB NOT NULL,  -- { preamble, scenarios: { id: {...}, ... } }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Experiments for grouping related runs
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

-- Run comparisons
CREATE TABLE run_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID REFERENCES experiments(id),
  baseline_run_id UUID REFERENCES runs(id) NOT NULL,
  comparison_run_id UUID REFERENCES runs(id) NOT NULL,
  delta_by_model JSONB,
  delta_by_scenario JSONB,
  most_divergent_scenarios JSONB,
  statistical_tests JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(baseline_run_id, comparison_run_id)
);

-- Analysis results (cached)
CREATE TABLE analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES runs(id) NOT NULL,
  analysis_type TEXT NOT NULL,  -- 'basic', 'deep', 'comparison'
  input_hash TEXT NOT NULL,     -- Hash of transcripts used
  created_at TIMESTAMPTZ DEFAULT NOW(),
  basic_stats JSONB,
  dimension_analysis JSONB,
  correlations JSONB,
  inter_model_agreement JSONB,
  outlier_detection JSONB,
  pca_coordinates JSONB,
  insights JSONB,
  llm_summary TEXT,
  UNIQUE(run_id, analysis_type, input_hash)
);

-- Track which scenarios included in sampled runs
CREATE TABLE run_scenario_selection (
  run_id UUID REFERENCES runs(id),
  scenario_id TEXT NOT NULL,
  included BOOLEAN NOT NULL,
  PRIMARY KEY (run_id, scenario_id)
);

-- User accounts (simplified - internal team only)
-- No roles (all users equal), no multi-tenancy
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- API keys for MCP access (local chat integration)
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(10) NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Values rubric versions
CREATE TABLE rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table Summary

```
PostgreSQL Tables:
├── definitions          # Versioned scenario definitions (hybrid: UUID + optional label)
├── runs                 # Pipeline runs linked to definition versions
├── transcripts          # Raw dialogue (14-day content retention)
├── scenarios            # Generated scenario variants
├── analysis_results     # Cached analysis (correlations, agreement matrices)
├── experiments          # Group related runs for comparison
├── run_comparisons      # Delta analysis between two runs
├── run_scenario_selection  # Track which scenarios included in sampled runs
├── users                # User accounts (internal team, no roles)
├── api_keys             # MCP access keys for local chat integration
└── rubrics              # Values rubric versions (reference data)
```

### JSONB for Flexible Parts

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

## Key Queries

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

## Alternative Considered: Git-Based Storage

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

## Deployment

**Recommendation:** Railway PostgreSQL

- Simple deployment, good developer experience
- Free tier available for MVP
- No vendor lock-in or special conventions
- Handle auth separately (API keys or simple JWT)

Since we're using PgBoss for job queues (see [API & Queue System](./api-queue-system.md)), everything runs on a single PostgreSQL instance - no Redis needed.

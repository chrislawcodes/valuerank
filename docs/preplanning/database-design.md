# Database Design

> Part of [Cloud ValueRank Architecture](./architecture-overview.md)
>
> See also: [Product Specification](./product-spec.md) for context on these decisions

## Recommendation: PostgreSQL + JSONB

The versioning/forking requirement drives us toward PostgreSQL over pure document stores.

**Key Decisions (from Product Spec):**
- **Single tenant**: No tenant_id columns needed
- **Permanent transcript retention**: All content retained by default; retention fields preserved for future pruning
- **Transcript versioning**: Each transcript captures model_id, model_version, and definition snapshot for reproducibility
- **Access tracking**: `last_accessed_at` on key entities to identify unused data for future pruning
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
-- Get full ancestry chain for a definition (excluding soft-deleted)
WITH RECURSIVE ancestors AS (
  SELECT * FROM definitions WHERE id = 'def_v1.1.1' AND deleted_at IS NULL
  UNION ALL
  SELECT d.* FROM definitions d
  JOIN ancestors a ON d.id = a.parent_id
  WHERE d.deleted_at IS NULL
)
SELECT * FROM ancestors;

-- Get all descendants of a definition (excluding soft-deleted)
WITH RECURSIVE descendants AS (
  SELECT * FROM definitions WHERE id = 'def_v1' AND deleted_at IS NULL
  UNION ALL
  SELECT d.* FROM definitions d
  JOIN descendants desc ON d.parent_id = desc.id
  WHERE d.deleted_at IS NULL
)
SELECT * FROM descendants;

-- Find all runs using this definition or any descendant (excluding soft-deleted)
WITH RECURSIVE tree AS (...)
SELECT r.* FROM runs r
JOIN tree t ON r.definition_id = t.id
WHERE t.deleted_at IS NULL;
```

**ltree extension** (optional) provides even more powerful hierarchical queries:

```sql
-- Store path as ltree: 'root.v1.v1_1.v1_1_1'
CREATE INDEX ON definitions USING GIST (path);

-- All descendants of v1 (excluding soft-deleted)
SELECT * FROM definitions WHERE path <@ 'root.v1' AND deleted_at IS NULL;

-- All ancestors of v1.1.1 (excluding soft-deleted)
SELECT * FROM definitions WHERE 'root.v1.v1_1.v1_1_1' <@ path AND deleted_at IS NULL;
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
  diff_from_parent JSONB,

  -- Access tracking for future pruning decisions
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),  -- Updated on read operations

  -- Soft delete (NULL = not deleted)
  deleted_at TIMESTAMPTZ DEFAULT NULL
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

  -- Timestamps for duration analysis
  created_at TIMESTAMPTZ DEFAULT NOW(),
  queued_at TIMESTAMPTZ,         -- When jobs were queued
  started_at TIMESTAMPTZ,        -- First job started processing
  completed_at TIMESTAMPTZ,      -- All jobs finished

  status TEXT DEFAULT 'pending',
  config JSONB,      -- Runtime config snapshot
  progress JSONB,    -- { total, completed, failed }

  -- Data retention settings (preserved for future pruning)
  retention_days INTEGER,        -- NULL = permanent (default)
  archive_permanently BOOLEAN DEFAULT TRUE,  -- TRUE = never delete (default)

  -- Access tracking for future pruning decisions
  last_accessed_at TIMESTAMPTZ DEFAULT NOW()  -- Updated on read operations
);

-- Transcripts: immutable versioned records capturing full evaluation context
-- Each transcript captures model version and definition snapshot for reproducibility
-- Enables re-running scenarios against new model versions and comparing results
CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES runs(id) NOT NULL,
  scenario_id TEXT NOT NULL,

  -- Model versioning (critical for cross-version comparisons)
  model_id TEXT NOT NULL,             -- Provider model name (e.g., "gemini-1.5-pro")
  model_version TEXT,                 -- Specific version (e.g., "gemini-1.5-pro-002")

  -- Definition snapshot (captures exact definition at run time)
  definition_snapshot JSONB,          -- Copy of definition content when run executed

  -- Transcript content
  content TEXT,           -- Full markdown transcript
  turns JSONB,            -- Structured turn data

  -- Permanently retained metrics (for analysis)
  turn_count INTEGER,
  word_count INTEGER,
  token_count INTEGER,                -- Input + output tokens
  input_tokens INTEGER,               -- Prompt tokens
  output_tokens INTEGER,              -- Completion tokens

  -- Timing metrics (critical for latency analysis)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,             -- When LLM request sent
  completed_at TIMESTAMPTZ,           -- When LLM response received
  duration_ms INTEGER,                -- Total response time
  time_to_first_token_ms INTEGER,     -- TTFT for streaming responses

  -- Retention (preserved for future pruning, default: permanent)
  content_expires_at TIMESTAMPTZ,     -- NULL = permanent retention (default)

  -- Access tracking for future pruning decisions
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),  -- Updated on read operations

  -- Extracted features (retained permanently for reproducibility)
  extracted_features JSONB            -- { decision, key_values_mentioned, sentiment, etc. }
);

-- Transcripts are immutable - never modified after creation
-- Model version enables comparisons like: gemini-1.5-pro-001 vs gemini-1.5-pro-002
-- Definition snapshot ensures we know exactly what definition produced these results
-- Use case: Google releases new Gemini → re-run scenario → compare against historical data

-- Generated scenarios
CREATE TABLE scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID REFERENCES definitions(id) NOT NULL,
  run_id UUID REFERENCES runs(id),  -- NULL if pre-generated
  content JSONB NOT NULL,  -- { preamble, scenarios: { id: {...}, ... } }
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Soft delete (NULL = not deleted)
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Experiments for grouping related runs (with scientific rigor)
CREATE TABLE experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,

  -- Experiment design (pre-registration style)
  hypothesis TEXT,                    -- "Gemini will score higher on safety"
  null_hypothesis TEXT,               -- "No significant difference between models"
  dependent_variable TEXT,            -- What we're measuring (e.g., "Physical_Safety win rate")
  independent_variable JSONB,         -- What we're changing
  controlled_variables JSONB,         -- What stays the same

  -- Statistical plan (pre-registered)
  analysis_plan JSONB,                -- { test: "mann_whitney", alpha: 0.05, correction: "bonferroni" }
  sample_size_justification TEXT,     -- Power analysis or practical reasoning
  minimum_detectable_effect DECIMAL,  -- Smallest effect size we care about

  -- Lifecycle
  status TEXT DEFAULT 'planned',      -- 'planned', 'running', 'analyzing', 'concluded'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  concluded_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),

  -- Results (filled after analysis)
  conclusion TEXT,                    -- 'supported', 'rejected', 'inconclusive'
  conclusion_summary TEXT,            -- Human-readable summary
  effect_size DECIMAL,                -- Cohen's d or similar
  p_value DECIMAL,
  confidence_interval JSONB,          -- { lower: 0.12, upper: 0.34 }
  result_details JSONB                -- Full statistical output
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

-- Analysis results (versioned for reproducibility)
CREATE TABLE analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES runs(id) NOT NULL,
  analysis_type TEXT NOT NULL,  -- 'basic', 'deep', 'comparison'

  -- Versioning for reproducibility
  input_hash TEXT NOT NULL,           -- Hash of transcripts used
  code_version TEXT NOT NULL,         -- Git SHA or semver of analysis code
  analysis_version INTEGER DEFAULT 1, -- Incrementing version per (run_id, analysis_type)

  -- Audit trail
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  superseded_by UUID REFERENCES analysis_results(id),  -- Points to newer version
  is_current BOOLEAN DEFAULT TRUE,    -- Quick filter for latest

  -- Results
  basic_stats JSONB,
  dimension_analysis JSONB,
  correlations JSONB,
  inter_model_agreement JSONB,
  outlier_detection JSONB,
  pca_coordinates JSONB,
  insights JSONB,
  llm_summary TEXT,

  -- Statistical method documentation
  methods_used JSONB                  -- { tests: ["mann_whitney"], corrections: ["bonferroni"], ... }
);

-- Index for finding current analysis
CREATE INDEX idx_analysis_current ON analysis_results(run_id, analysis_type) WHERE is_current = TRUE;

-- Keep last 3 versions per (run_id, analysis_type) - cleanup job marks older as superseded

-- Track which scenarios included in sampled runs
CREATE TABLE run_scenario_selection (
  run_id UUID REFERENCES runs(id),
  scenario_id TEXT NOT NULL,
  included BOOLEAN NOT NULL,
  PRIMARY KEY (run_id, scenario_id)
);

-- Cohorts for segment/group analysis
CREATE TABLE cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  cohort_type TEXT NOT NULL,          -- 'models', 'scenarios', 'definitions', 'runs'
  members JSONB NOT NULL,             -- Array of IDs or filter criteria
  filter_criteria JSONB,              -- Dynamic membership: { model_family: "gpt-4*" }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Example cohorts:
-- { name: "GPT-4 Family", cohort_type: "models", members: ["gpt-4", "gpt-4-turbo", "gpt-4o"] }
-- { name: "Safety Scenarios", cohort_type: "scenarios", filter_criteria: { category: "safety" } }
-- { name: "Q4 2024 Runs", cohort_type: "runs", filter_criteria: { created_after: "2024-10-01" } }

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
├── definitions          # Versioned scenario definitions (hybrid: UUID + optional label) + soft delete
├── runs                 # Pipeline runs with timing + retention settings + last_accessed_at
├── transcripts          # Immutable records: model_id, model_version, definition_snapshot + last_accessed_at
├── scenarios            # Generated scenario variants + soft delete
├── definition_tags      # Tag associations (join table) + soft delete
├── analysis_results     # Versioned analysis (keeps last 3 versions for reproducibility)
├── experiments          # Scientific experiment tracking (hypothesis, stats plan, results)
├── run_comparisons      # Delta analysis between two runs
├── run_scenario_selection  # Track which scenarios included in sampled runs
├── cohorts              # Groupings for segment analysis (model families, scenario categories)
├── users                # User accounts (internal team, no roles)
├── api_keys             # MCP access keys for local chat integration
└── rubrics              # Values rubric versions (reference data)
```

### Access Tracking

All major entities include `last_accessed_at` timestamp:
- Updated on read operations (view, export, analysis, MCP query)
- Enables identification of unused data for future pruning decisions
- Helps understand usage patterns across the system

### Soft Delete

Certain entities use **soft delete** via a `deleted_at` timestamp column instead of physical deletion:

**Tables with soft delete:**
- `definitions` - Preserves version history and lineage
- `scenarios` - Preserves transcript references
- `definition_tags` - Preserves tag associations

**Pattern:**
- `deleted_at = NULL` means active/visible
- `deleted_at = <timestamp>` means logically deleted
- Records are never physically deleted from the database

**Query requirements:**
- **All queries** must filter `WHERE deleted_at IS NULL` to exclude soft-deleted records
- GraphQL resolvers automatically apply this filter
- The `deleted_at` field is **not exposed** in the GraphQL API
- Cascading soft delete: when a parent is deleted, related records should also be soft-deleted

**Example:**
```sql
-- Always filter out soft-deleted records
SELECT * FROM definitions WHERE deleted_at IS NULL;

-- Soft delete a definition (not physical DELETE)
UPDATE definitions SET deleted_at = NOW() WHERE id = $1;

-- Cascade to related records
UPDATE definition_tags SET deleted_at = NOW() WHERE definition_id = $1;
```

### JSONB for Flexible Parts

The `definitions.content` column holds the variable schema parts.

**All JSONB payloads include `schema_version` for future migrations:**

```json
{
  "schema_version": 1,
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

### Schema Versioning Strategy

```typescript
// At read time, transform old schemas to current format
function loadDefinitionContent(raw: unknown): DefinitionContent {
  const data = raw as { schema_version?: number; [key: string]: unknown };

  switch (data.schema_version ?? 0) {
    case 0:
      // Legacy data without version - migrate inline
      return migrateV0toV1(data);
    case 1:
      // Current version
      return data as DefinitionContent;
    default:
      throw new Error(`Unknown schema version: ${data.schema_version}`);
  }
}
```

**Why schema versioning?**
- JavaScript/TypeScript is flexible for schema evolution
- Most changes are additive (new optional fields)
- But we reserve the ability to transform old data if needed
- Migrations happen at read time, not as batch jobs

This gives us:
- **Relational structure** for versioning, runs, relationships
- **Schema flexibility** for definition content and config
- **No migrations** when definition structure evolves (usually)
- **Escape hatch** for breaking changes via `schema_version`

## Key Queries

**Important:** All queries must filter `deleted_at IS NULL` to exclude soft-deleted records.

```sql
-- 1. Get definition with full ancestry (excluding soft-deleted)
SELECT d.*, array_agg(a.id) as ancestors
FROM definitions d
LEFT JOIN LATERAL (
  WITH RECURSIVE anc AS (
    SELECT parent_id FROM definitions WHERE id = d.id AND deleted_at IS NULL
    UNION ALL
    SELECT d2.parent_id FROM definitions d2 JOIN anc ON d2.id = anc.parent_id
    WHERE d2.deleted_at IS NULL
  )
  SELECT id FROM anc WHERE id IS NOT NULL
) a ON true
WHERE d.id = $1 AND d.deleted_at IS NULL
GROUP BY d.id;

-- 2. Get all runs across a definition's descendants (excluding soft-deleted)
WITH RECURSIVE tree AS (
  SELECT id FROM definitions WHERE id = $root_id AND deleted_at IS NULL
  UNION ALL
  SELECT d.id FROM definitions d JOIN tree t ON d.parent_id = t.id
  WHERE d.deleted_at IS NULL
)
SELECT
  d.name,
  d.version_label,
  r.id as run_id,
  r.status,
  r.created_at
FROM tree t
JOIN definitions d ON d.id = t.id AND d.deleted_at IS NULL
JOIN runs r ON r.definition_id = d.id
ORDER BY d.created_at;

-- 3. Find all runs affected by a definition change (excluding soft-deleted)
WITH RECURSIVE descendants AS (
  SELECT id FROM definitions WHERE id = $1 AND deleted_at IS NULL
  UNION ALL
  SELECT d.id FROM definitions d JOIN descendants ON d.parent_id = descendants.id
  WHERE d.deleted_at IS NULL
)
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

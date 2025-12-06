# Cloud ValueRank - Product Specification

> Version 1.0 | December 2024

This document defines the product requirements for Cloud ValueRank's initial release. It captures key product decisions and serves as the source of truth for what we're building.

---

## Product Vision

Cloud ValueRank is an internal tool for evaluating how AI models prioritize moral values in ethical dilemmas. It transforms the existing command-line pipeline into a collaborative, experiment-driven platform.

**Core Value Proposition:** Enable systematic experimentation with scenario framing to understand how small changes affect AI moral reasoning.

---

## Target Users

### Initial Release: Internal Team Only

- Researchers designing moral dilemma scenarios
- Analysts interpreting model behavior
- Engineers iterating on the evaluation pipeline

**Implications:**
- No public registration or onboarding flows
- Simplified authentication (shared credentials or invite-only)
- No billing, usage limits, or abuse protection needed
- All data is visible to all users (public within team)

---

## Key Product Decisions

### 1. Single Tenant Architecture

We will **not** build multi-tenancy. All users share a single workspace.

**Rationale:** Multi-tenancy adds complexity to every query, every UI, and every feature. For internal use, it's unnecessary overhead.

**Migration Note:** If we ever need multi-tenancy, it will require schema changes and data migration. We accept this tradeoff for faster initial development.

### 2. Server-Side LLM API Keys

LLM provider API keys are stored and managed server-side.

**How it works:**
- Admin configures API keys for each provider (OpenAI, Anthropic, etc.) via environment variables or secure config
- All runs use these shared keys
- Users don't need to provide their own keys

**Exception:** Users connecting their local LLM via MCP would use their own local setup.

**Rationale:** Enables async background processing without requiring users to keep browsers open. Simpler UX for internal team.

### 3. Public Visibility (Within Team)

All definitions, runs, experiments, and results are visible to all authenticated users.

**No private data.** Every user can:
- View any definition or run
- Fork any definition
- Compare any runs

**Future consideration:** May add explicit sharing controls if needed, but starting with full transparency.

### 4. Hybrid Version Naming

Definitions use a git-like identity model with optional user-defined labels.

**Implementation:**
- Each definition has a unique system ID (e.g., `def_a1b2c3`)
- Automatic lineage tracking via `parent_id`
- Users can optionally assign display names/labels (e.g., "safety-v2", "experiment-A")
- If no label provided, show truncated ID or auto-generated label

**Example:**
```
def_a1b2c3 (label: "baseline")
├── def_d4e5f6 (label: "softer-framing")
└── def_g7h8i9 (no label, shows as "def_g7h8...")
```

### 5. Transcript Storage & Versioning

Transcripts are **versioned records** that capture the complete context of each evaluation, enabling re-runs against new model versions and historical comparison.

**Core Requirements:**
- Each transcript is immutable and captures: model ID, model version, scenario definition snapshot, timestamp
- Transcripts are linked to specific model versions (e.g., `gemini-1.5-pro-001` vs `gemini-1.5-pro-002`)
- Re-running a scenario against a new model version creates new transcripts, preserving old ones for comparison
- Full lineage tracking: which definition version, which model version, when it ran

**Use Case:** Google releases new Gemini version → re-run exact scenario against new model → compare new results against historical data from previous model version.

**Default Retention: Permanent**

All transcript content is retained by default. Storage costs will be monitored; if they become prohibitive, we'll implement pruning based on access patterns.

**Retention Configuration (for future use):**
- `retention_days` field preserved for future pruning implementation
- `archive_permanently` flag to protect specific runs from any future pruning
- Default: permanent retention (effectively `archive_permanently: true`)

**Access Tracking:**
- Track `last_accessed_at` timestamp on transcripts, runs, and definitions
- Updated on read operations (view, export, analysis, MCP query)
- Enables identification of unused data for future pruning decisions
- Access logs retained for cost analysis and usage patterns

**Implementation:**
- Run creation accepts `retention_days` and `archive_permanently` flags (defaults to permanent)
- UI shows retention status
- `last_accessed_at` updated on every read
- Future: dashboard showing storage usage and access patterns

---

## Feature Priorities

### Phase 1: Replicate CLI in Cloud (Must Have)

**Goal:** Enable all team members to experiment without being bottlenecked. Anyone should be able to create and run a scenario to get results they can analyze.

| Feature | Description | Why Critical |
|---------|-------------|--------------|
| Definition Authoring | Create/edit scenario definitions with versioning | Foundation for all experiments |
| Run Execution | Queue and execute evaluation runs | Core functionality |
| Results Viewing | View basic analysis and scores | See what happened |
| CSV/Data Export | Export run results as CSV for external analysis | Enable analysis in Jupyter, R, or feeding to AI tools |
| Tag-Based Navigation | Organize and find definitions/runs via flexible tagging | More flexible than folders for versioned content |

### Phase 2: Experimentation Foundation (Must Have)

**Goal:** Build the organizational foundation for tracking related experiments. We can compare by hand initially, but need the structure to find and track related work.

| Feature | Description | Why Critical |
|---------|-------------|--------------|
| Experiment Framework | Group runs, track hypotheses, controlled variables | **Primary driver for cloud migration** |
| Forking/Branching | Create variants of definitions | Enable systematic iteration |
| Cost Estimation | Show estimated cost before starting a run | Avoid expensive surprises |

**User Scenarios:**
- Explore relationship between gay marriage and religion - create scenarios varying Freedom, Tradition, Harmony
- Swap variables (replace Tradition with Social Duty) while tracking that scenarios are related
- Flip scenario perspective (Catholic at gay wedding vs. gay person at Catholic wedding) and track the relationship

### Phase 3: Automated Analysis (High Priority)

**Goal:** Automate the basic analysis users need so answers come faster. Answer key questions about AI behavior within a scenario.

| Feature | Description | Why Important |
|---------|-------------|---------------|
| Auto-Analysis | Automatic Tier 1 analysis on run completion | Get answers immediately |
| Score Distribution | How do AIs tend to answer? (distribution visualization) | Understand model behavior |
| Variable Impact | What causes scores to change? (beta coefficients) | Identify influential dimensions |
| Model Variance | How explanatory are our chosen variables? | Validate experimental design |
| Outlier Detection | Which AIs behave differently from others? | Find interesting divergence |
| MCP Read Tools | Query runs, summaries, experiments | Let AI reason over results |

### Phase 4: Run Comparison & Delta Analysis (High Priority)

**Goal:** Enable easy finding and comparing of scenario results.

| Feature | Description | Why Important |
|---------|-------------|---------------|
| Run Comparison | Compare two runs side-by-side | Understand deltas |
| Delta Analysis | Statistical comparison of run differences | Quantify changes |
| Effect Sizes | Cohen's d for pairwise comparisons | Statistical rigor |
| Significance Testing | p-values with multiple comparison correction | Avoid false positives |

### Phase 5: AI-Assisted Authoring (Nice to Have)

**Goal:** Make it quick and easy for AI to help write scenarios.

| Feature | Description | Why Important |
|---------|-------------|---------------|
| MCP Interface | AI agent access to data and authoring | Interactive analysis via local chat |
| MCP Write Tools | Create definitions, start runs | AI-assisted scenario authoring |
| Authoring Resources | Guide, examples, value pairs for AI | Quality AI-generated scenarios |

### Phase 6: Scale & Efficiency (Nice to Have)

**Goal:** Make it cheaper to run the system at scale.

| Feature | Description | Why Important |
|---------|-------------|---------------|
| Batch Processing | Queue large batches efficiently | Reduce per-run overhead |
| Sampling/Partial Runs | Run 10% for quick tests | Fast iteration before full runs |
| Deep Analysis (PCA, outliers) | Advanced statistical methods | Defer until needed |
| LLM-Generated Summaries | Natural language insights | Defer until needed |

---

## Analysis Requirements

### Tier 1: Basic Statistics (Required)

- Per-model win rates for each value
- Mean/std/min/max scores by model
- Scenario-level results
- Simple aggregation across runs
- **95% confidence intervals** on all point estimates

### Tier 2: Correlations (Required)

- Inter-model agreement (pairwise correlation using Spearman's rho)
- Dimension impact analysis (which dimensions drive variance)
- Most contested scenarios (highest cross-model disagreement)
- **Effect sizes** (Cohen's d) for all pairwise comparisons
- **Multiple comparison correction** (Holm-Bonferroni by default)

### Tier 3: Advanced (Deferred)

- PCA positioning
- Statistical outlier detection (Mahalanobis, Isolation Forest)
- Jackknife consistency analysis
- LLM-generated narrative summaries

### Data Science Workflow Support (Required)

To enable analysis in external tools (Jupyter, R, pandas):

| Capability | Description | Priority |
|------------|-------------|----------|
| **Bulk Export** | Export runs as Parquet/CSV for external analysis | Required |
| **Flexible Aggregation** | Custom GROUP BY queries with filtering | Required |
| **Timing Metrics** | Response latency per transcript for performance analysis | Required |
| **Cohort Analysis** | Compare model families, scenario categories | Required |
| **Analysis Versioning** | Track which code version produced each result | Required |
| **Reproducibility** | Deterministic seeds, method documentation | Required |

### Statistical Method Standards

All analysis uses standardized, documented methods:

- **Normality testing:** Shapiro-Wilk before parametric tests
- **Default test:** Mann-Whitney U (non-parametric, robust)
- **Multiple comparisons:** Holm-Bonferroni correction
- **Effect sizes:** Always reported alongside p-values
- **Warnings:** Auto-generated when assumptions violated

See [API & Queue System - Statistical Methods](./api-queue-system.md#statistical-methods) for full specification.

---

## Technical Constraints

### API: GraphQL

Use GraphQL instead of REST for the API layer.

**Rationale:**
- LLMs can introspect schema and construct custom queries for MCP integration
- Flexible data fetching - get exactly what's needed (critical for token budgets)
- Nested relationships in single query (definition → runs → transcripts → analysis)
- Single endpoint simplifies auth and MCP integration
- Avoids pain of REST-to-GraphQL migration later

### Real-Time Updates: Polling

Use polling (5-second intervals) instead of GraphQL subscriptions for progress updates.

**Rationale:** Simpler implementation, sufficient for our use case. Can add subscriptions later if UX demands it.

### Worker Architecture: TypeScript Orchestrator + Python

Use a hybrid worker model: TypeScript manages the queue, Python does the heavy lifting.

```
TypeScript Orchestrator          Python Scripts
├── Subscribes to PgBoss    →    ├── probe.py (LLM calls)
├── Manages job lifecycle        ├── analyze.py (statistics)
├── Spawns Python processes      └── (stateless, JSON in/out)
└── Handles retries/errors
```

**Rationale:**
- Native PgBoss support (TypeScript side)
- Keep Python data science ecosystem (numpy, pandas, scipy)
- Can add TypeScript-only workers later for lightweight tasks
- Single queue implementation, best of both worlds

**Communication:** JSON via stdin/stdout (simple, debuggable)

### LLM Provider Configuration: Shared Source of Truth

LLM provider/model configuration lives in one place, accessible to both TypeScript API and Python workers.

**Rationale:** Provider list and model availability changes frequently. Single source prevents drift.

**Implementation:** Database table or shared config file that both API and workers read.

### GraphQL: Code-First (Pothos)

Use code-first GraphQL schema generation (Pothos or similar).

**Rationale:** TypeScript-native, types flow from resolvers to schema, better IDE support than schema-first.

### JSONB Schema Versioning

All JSONB payloads include a `schema_version` field for future migrations.

```json
{
  "schema_version": 1,
  "preamble": "...",
  "template": "...",
  "dimensions": [...]
}
```

**Rationale:** JavaScript is flexible for schema evolution, but we reserve the ability to transform old data if needed.

### Analysis: Hybrid Trigger (Auto + On-Demand)

| Analysis Type | Trigger | Latency |
|---------------|---------|---------|
| Basic stats (Tier 1) | Auto on run complete | Fast (~1s) |
| Correlations (Tier 2) | On-demand when viewed | Medium (~5s) |
| Deep analysis (future) | On-demand, queued job | Slow (~30s) |

**Rationale:** Sets user expectation that some results are instant, some require waiting. Prepares for heavier analysis later.

### CLI Compatibility

Maintain ability to export data in CLI-compatible format.

**Purpose:** Business continuity. If cloud costs become unwieldy, we can fall back to the simpler CLI model.

**Requirements:**
- Export runs as file bundles (transcripts, manifests, scenarios)
- Import existing CLI data into cloud
- Round-trip fidelity for core data

---

## Non-Goals (Explicitly Out of Scope)

| Feature | Reason |
|---------|--------|
| Multi-tenancy | Internal tool, single team |
| Public registration | Internal tool |
| Billing/payments | Internal tool |
| Fine-grained permissions | All data is public within team |
| Mobile support | Desktop-first, researcher workflow |
| Offline mode | Always-connected assumption |
| Real-time collaboration | Not a collaborative editing tool |

---

## Success Criteria

### Phase 1 Complete (MVP)

1. **Can create and version definitions** - With forking and lineage tracking
2. **Can run evaluations** - Queue, execute, see progress
3. **Can export results** - CSV download for external analysis
4. **Can find work via tags** - Navigate definitions and runs flexibly

### Phase 2 Complete

5. **Can create experiments** - Group related runs, track hypotheses
6. **Can see cost estimates** - Know what a run will cost before starting

### Phase 3 Complete

7. **Can see automated analysis** - Score distributions, variable impact
8. **Can query via MCP** - AI agents can read data

### Quality Bar

- All internal team members can use without hand-holding
- Faster iteration cycle than CLI tool
- No data loss (CLI export works as backup)

---

## Open Items for Partner Review

1. **Initial user list** - Who gets accounts at launch?
2. **LLM provider priority** - Which providers to support first?
3. **Definition migration** - Import existing CLI definitions automatically?
4. **Naming conventions** - Standard labels for definition versions?

---

## Appendix: Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Dec 2025 | Single tenant | Faster development, internal tool |
| Dec 2025 | Server-side API keys | Enable async workers |
| Dec 2025 | Configurable retention (default 14 days) | Balance cost control with reproducibility |
| Dec 2025 | Polling over WebSocket | Simpler, sufficient for UX |
| Dec 2025 | Public visibility | Team transparency, simpler ACLs |
| Dec 2025 | Hybrid versioning | Git-like + optional labels |
| Dec 2025 | Python workers | Reuse existing code, AI tooling |
| Dec 2025 | CLI compatibility | Business continuity |
| Dec 2025 | GraphQL over REST | LLM schema introspection, flexible MCP queries, avoid migration pain |
| Dec 2025 | TypeScript orchestrator + Python workers | Native PgBoss, keep Python ecosystem, flexibility for future |
| Dec 2025 | Shared LLM provider config | Single source of truth, prevents drift between API and workers |
| Dec 2025 | Code-first GraphQL (Pothos) | TypeScript-native, better IDE support |
| Dec 2025 | JSONB schema versioning | Reserve ability to transform old data |
| Dec 2025 | Hybrid analysis trigger | Auto for basic, on-demand for heavy - sets user expectations |
| Dec 2025 | Bulk data export (Parquet/CSV) | Enable external DS tooling (Jupyter, pandas, R) |
| Dec 2025 | Flexible aggregation API | Custom queries beyond pre-computed tiers |
| Dec 2025 | Standardized statistical methods | Reproducible, comparable results across analyses |
| Dec 2025 | Analysis versioning | Track code version, preserve last 3 versions |
| Dec 2025 | Transcript timing metrics | Enable latency analysis, performance correlation |
| Dec 2025 | Cohort/segment support | Compare model families, scenario categories |
| Dec 2025 | Extracted features retention | Preserve key features even after content expires |
| Dec 2025 | Phase restructure (6 phases) | More incremental delivery: CLI replication → experiments → analysis → comparison → AI authoring → scale |
| Dec 2025 | CSV export in Phase 1 | Critical for unblocking team - can analyze externally immediately |
| Dec 2025 | Tag-based navigation over folders | More flexible for versioned content with complex lineage relationships |
| Dec 2025 | Run comparison moved to Phase 4 | Can compare manually at first; prioritize getting data out |
| Dec 2025 | MCP split (Read P3, Write P5) | Analysis needs come before authoring automation |
| Dec 2025 | Cost estimation in Phase 2 | Avoid expensive surprises when experimenting |
| Dec 2025 | Transcript versioning with model version | Enable re-runs against new model versions while preserving historical comparisons |
| Dec 2025 | Default retention: permanent | Scientific reproducibility trumps storage costs; will prune later if needed |
| Dec 2025 | Access tracking (last_accessed_at) | Enable future pruning decisions based on actual usage patterns |

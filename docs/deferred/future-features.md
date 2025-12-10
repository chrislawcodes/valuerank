# Deferred Features

This document describes features that were planned during the original design phase but have been deferred for future implementation. Each section includes the original design intent, why it was deferred, and implementation guidance for when the time comes.

---

## Overview of Deferred Stages

| Stage | Feature | Original Phase | Reason for Deferral |
|-------|---------|----------------|---------------------|
| Stage 10 | Experiment Framework | Phase 2 | Foundational pipeline prioritized first |
| Stage 13 | Run Comparison & Delta Analysis | Phase 4 | Manual comparison suffices initially |
| Stage 16 | Scale & Efficiency | Phase 6 | Premature optimization; wait for real scale needs |

---

## Stage 10: Experiment Framework

> **Original Phase:** Phase 2 - Experimentation Foundation
>
> **Status:** Deferred
>
> **Dependencies:** Stage 9 (Run Execution) - Complete

### What It Was Designed to Do

The Experiment Framework was conceived as the organizational foundation for tracking related experiments with cost visibility. It was described as the "primary driver for cloud migration" in the original product spec.

**Key Capabilities:**

1. **Experiment Creation with Hypothesis Tracking**
   - Create experiments with a stated hypothesis (e.g., "Religious framing increases Tradition scores")
   - Track controlled variables and expected outcomes
   - Document the experimental design

2. **Experiment Workspace**
   - Group related definitions and runs under a single experiment
   - Link runs to experiments for organized tracking
   - View all related work in one place

3. **Cost Estimation**
   - Show estimated cost before starting a run (model pricing × scenario count)
   - Prevent expensive surprises during experimentation
   - Track actual vs. estimated costs

4. **Tag Inheritance**
   - Experiments can have tags that propagate to child definitions and runs
   - Simplify organization of related work

5. **Timeline/History View**
   - See the evolution of an experiment over time
   - Track related scenarios (e.g., "flipped perspective" variants)

### Original User Scenarios

From the product spec, the intended workflows were:

- Explore relationship between gay marriage and religion - create scenarios varying Freedom, Tradition, Harmony
- Swap variables (replace Tradition with Social Duty) while tracking that scenarios are related
- Flip scenario perspective (Catholic at gay wedding vs. gay person at Catholic wedding) and track the relationship

### Why It Was Deferred

1. **Foundational work came first** - The core pipeline (definitions, runs, analysis) needed to be solid before adding organizational abstractions on top.

2. **Manual workarounds exist** - Users can use tags and naming conventions to group related work. Less elegant, but functional.

3. **Scope reduction** - Focusing on Phase 1 (CLI replication) and Phase 3 (automated analysis) delivered more immediate value.

### Database Schema (Already Exists)

The `experiments` table was created in Stage 2 and is ready for use:

```prisma
model Experiment {
  id             String          @id @default(uuid())
  name           String
  hypothesis     String?         // The experimental hypothesis
  runs           Run[]           // Related runs
  tags           ExperimentTag[] // Tag relationships
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
}
```

### Implementation Guidance

When this feature is prioritized:

1. **GraphQL Layer**
   - Add `Experiment` type to GraphQL schema
   - Mutations: `createExperiment`, `updateExperiment`, `linkRunToExperiment`
   - Queries: `experiment`, `experiments`, `experimentRuns`

2. **Frontend Components**
   - Experiment creation modal with hypothesis field
   - Experiment workspace page showing all linked runs
   - "Link to Experiment" option in run creation flow
   - Experiment timeline visualization

3. **Cost Estimation**
   - Calculate based on: `(model count) × (scenario count) × (avg tokens per scenario) × (model pricing)`
   - Show estimate in run creation form
   - Store `model_costs.yaml` equivalent in database (LlmModel already has cost fields)

4. **Reference Specs**
   - Original design in `docs/preplanning/product-spec.md` (Phase 2 section)
   - Stage 10 was never fully specified; would need a spec document first

---

## Stage 13: Run Comparison & Delta Analysis

> **Original Phase:** Phase 4 - Run Comparison
>
> **Status:** Deferred
>
> **Dependencies:** Stage 11 (Analysis System) - Complete

### What It Was Designed to Do

Enable rigorous side-by-side comparison of runs with statistical analysis to quantify differences.

**Key Capabilities:**

1. **Run Comparison Page**
   - Side-by-side view of two runs
   - Delta visualization (diverging bar chart showing differences)
   - "What Changed" diff display

2. **Model Version Comparison**
   - Compare same scenario across different model versions
   - Example: `gemini-1.5-pro-001` vs `gemini-1.5-pro-002` on identical scenarios
   - Track how model updates affect value priorities

3. **Statistical Rigor**
   - Effect sizes (Cohen's d) for pairwise comparisons
   - Significance testing with p-values
   - Multiple comparison correction (Holm-Bonferroni)

4. **Tier 2 On-Demand Analysis**
   - Correlations between dimensions and outcomes
   - Dimension impact analysis (which dimensions drive variance)
   - Triggered when user views comparison page

### Why It Was Deferred

1. **Manual comparison works** - Users can export CSVs and compare in external tools (Jupyter, R, Excel). Less convenient, but functional.

2. **Phase 3 prioritized** - Getting automated Tier 1 analysis working delivered more immediate value than comparison features.

3. **MCP tools filled the gap** - AI agents can query run data and help users reason about differences conversationally.

### Infrastructure Already in Place

Several building blocks are already implemented:

- **Model versioning** - `transcripts.model_id` and `transcripts.model_version` capture version info
- **Analysis caching** - `input_hash` pattern enables efficient re-computation
- **Wilson confidence intervals** - Already used in Tier 1 analysis
- **Statistical utilities** - Python workers have scipy for statistical tests

### Implementation Guidance

When this feature is prioritized:

1. **Backend Services**
   ```typescript
   // apps/api/src/services/comparison/
   ├── compare.ts         // Core comparison logic
   ├── statistics.ts      // Effect sizes, significance tests
   └── types.ts           // Comparison result types
   ```

2. **GraphQL Extensions**
   ```graphql
   type RunComparison {
     runA: Run!
     runB: Run!
     deltas: [ValueDelta!]!
     statistics: ComparisonStatistics!
   }

   type ValueDelta {
     value: String!
     runAScore: Float!
     runBScore: Float!
     delta: Float!
     effectSize: Float
     pValue: Float
     significant: Boolean!
   }
   ```

3. **Python Worker Enhancement**
   ```python
   # workers/compare.py
   def compare_runs(run_a_data: dict, run_b_data: dict) -> ComparisonResult:
       # Calculate effect sizes (Cohen's d)
       # Perform significance tests
       # Apply Holm-Bonferroni correction
       pass
   ```

4. **Frontend Components**
   - `RunComparisonPage` - Side-by-side view
   - `DeltaChart` - Diverging bar chart showing differences
   - `ComparisonSelector` - Pick two runs to compare

5. **MCP Tool** (deferred in Stage 14)
   - `compare_runs` tool was noted as deferred, pending Stage 13

6. **Reference Specs**
   - Original design in `docs/preplanning/product-spec.md` (Phase 4 section)
   - Statistical methods specified in `docs/preplanning/methodology-critique.md`

---

## Stage 16: Scale & Efficiency

> **Original Phase:** Phase 6 - Scale & Efficiency
>
> **Status:** Deferred
>
> **Dependencies:** Stage 9 (Run Execution) - Complete

### What It Was Designed to Do

Optimize the system for cost and efficiency at scale.

**Key Capabilities:**

1. **Batch Processing**
   - Queue large batches efficiently
   - Reduce per-run overhead for high-volume evaluations
   - Optimize job scheduling for throughput

2. **Sampling/Partial Runs**
   - Run a percentage (e.g., 10%) for quick iteration
   - Fast validation before committing to full runs
   - Statistical sampling with confidence bounds

3. **Queue Optimization**
   - Priority-based job scheduling
   - Concurrency tuning per provider
   - Rate limit management across providers

4. **Cost Tracking and Reporting**
   - Actual cost per run (tokens × pricing)
   - Cost trends over time
   - Budget alerts

### Why It Was Deferred

1. **Premature optimization** - Current scale doesn't justify the engineering investment. The system handles current workloads fine.

2. **Cost visibility exists** - LlmModel table already has cost fields. Basic tracking is possible without new features.

3. **Manual sampling works** - Users can select a subset of scenarios or models for quick tests.

### Infrastructure Already in Place

- **LlmModel.inputCostPer1k / outputCostPer1k** - Cost data in database
- **PgBoss queue** - Supports priorities and rate limiting
- **ThreadPoolExecutor** - Python workers already parallelize within limits
- **Provider rate limits** - LlmProvider.rateLimitPerMinute field exists

### Implementation Guidance

When scale demands justify this work:

1. **Batch Processing**
   ```typescript
   // Batch job creation instead of individual jobs
   async function queueBatchRun(config: BatchRunConfig): Promise<string[]> {
     // Group scenarios into batches
     // Create optimized job graph
     // Return batch job IDs
   }
   ```

2. **Sampling**
   ```typescript
   type RunConfig = {
     definitionId: string;
     models: string[];
     samplePercentage?: number;  // 0-100, default 100
     sampleSeed?: number;        // For reproducibility
   };
   ```

3. **Cost Tracking Dashboard**
   - Daily/weekly/monthly cost charts
   - Per-user cost breakdown
   - Per-model cost comparison
   - Budget thresholds with alerts

4. **Queue Optimization**
   - Dynamic concurrency based on provider rate limits
   - Priority lanes for different run types
   - Graceful degradation under load

5. **Reference Specs**
   - Original design in `docs/preplanning/product-spec.md` (Phase 6 section)
   - PgBoss docs for advanced queue patterns

---

## Other Deferred Items

### Tier 2/3 Analysis Features

From the original product spec, some analysis features were marked for future implementation:

**Tier 2 (Originally "Required", partially deferred):**
- Inter-model agreement (pairwise correlation using Spearman's rho)
- Effect sizes for all pairwise comparisons
- Multiple comparison correction

**Tier 3 (Always "Deferred"):**
- PCA positioning
- Statistical outlier detection (Mahalanobis, Isolation Forest)
- Jackknife consistency analysis
- LLM-generated narrative summaries

### Parent/Child Run Linking

Noted in Stage 9 as deferred: tracking which runs were re-runs of other runs. Would require:
- Schema migration to add `parent_run_id` to runs table
- UI to show run lineage
- Filtering by parent run

### Bulk Export Features (P2/P3 from Stage 15)

- Bulk export (multiple definitions at once)
- Bundle export (definition + scenarios in zip)
- Download URLs with expiry
- YAML import (scenarios → definition)
- Aggregation/results export

---

## Prioritization Guidance

When deciding which deferred feature to build next, consider:

| Feature | User Pain | Engineering Effort | Dependencies |
|---------|-----------|-------------------|--------------|
| Experiment Framework | Medium - workarounds exist | Medium | Clean implementation |
| Run Comparison | Medium - external tools work | Medium | Stage 11 complete |
| Scale & Efficiency | Low - current scale fine | High | Premature without load |

**Recommended order:**
1. **Run Comparison** - Moderate effort, builds on existing analysis work
2. **Experiment Framework** - Improves organization, uses existing tables
3. **Scale & Efficiency** - Only when actual scale demands it

---

## Related Documentation

- [Product Specification](./preplanning/product-spec.md) - Original feature priorities
- [High-Level Implementation Plan](../specs/high-level.md) - Stage definitions
- [Analysis System](./features/analysis.md) - What's currently implemented
- [Runs Feature](./features/runs.md) - Current run execution capabilities

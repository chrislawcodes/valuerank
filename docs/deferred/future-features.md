# Deferred Features

This document describes features that were planned during the original design phase but have been deferred for future implementation. Each section includes the original design intent, why it was deferred, and implementation guidance for when the time comes.

---

## Recently Implemented (Previously Deferred)

The following features were originally deferred but have since been implemented:

| Feature | Original Stage | Implemented In | Notes |
|---------|---------------|----------------|-------|
| **Run Comparison** | Stage 13 | `/compare` page | Side-by-side run analysis with visualizations |
| **Cost Estimation** | Stage 10/16 | `startRun` mutation | Pre-run cost estimates based on model pricing |
| **Actual Cost Tracking** | Stage 16 | Transcript `costSnapshot` | Per-transcript token and cost tracking |
| **Sampling/Partial Runs** | Stage 16 | `samplePercentage` param | Run a percentage of scenarios |
| **Parallel Summarization** | N/A | Spec 017 | Configurable parallelism with cancel/restart |

---

## Overview of Remaining Deferred Stages

| Stage | Feature | Original Phase | Reason for Deferral |
|-------|---------|----------------|---------------------|
| Stage 10 | Experiment Framework | Phase 2 | Foundational pipeline prioritized first |
| Stage 16 | Scale & Efficiency (remaining) | Phase 6 | Some implemented; batch processing deferred |

---

## Stage 10: Experiment Framework

> **Original Phase:** Phase 2 - Experimentation Foundation
>
> **Status:** Deferred
>
> **Dependencies:** Stage 9 (Run Execution) - Complete

### What It Was Designed to Do

The Experiment Framework was conceived as the organizational foundation for tracking related experiments. It was described as the "primary driver for cloud migration" in the original product spec.

**Key Capabilities:**

1. **Experiment Creation with Hypothesis Tracking**
   - Create experiments with a stated hypothesis (e.g., "Religious framing increases Tradition scores")
   - Track controlled variables and expected outcomes
   - Document the experimental design

2. **Experiment Workspace**
   - Group related definitions and runs under a single experiment
   - Link runs to experiments for organized tracking
   - View all related work in one place

3. **Tag Inheritance**
   - Experiments can have tags that propagate to child definitions and runs
   - Simplify organization of related work

4. **Timeline/History View**
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

3. **Run Comparison fills some gaps** - The implemented `/compare` page allows comparing runs without formal experiment grouping.

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

3. **Reference Specs**
   - Original design in `docs/preplanning/product-spec.md` (Phase 2 section)
   - Stage 10 was never fully specified; would need a spec document first

---

## Stage 16: Scale & Efficiency (Remaining Items)

> **Original Phase:** Phase 6 - Scale & Efficiency
>
> **Status:** Partially Implemented
>
> **Dependencies:** Stage 9 (Run Execution) - Complete

### What's Been Implemented

Several capabilities from the original Stage 16 design are now complete:

| Capability | Status | Implementation |
|------------|--------|----------------|
| Sampling/Partial Runs | ✅ Implemented | `samplePercentage` in startRun |
| Cost Estimation | ✅ Implemented | `estimateCost` query |
| Actual Cost Tracking | ✅ Implemented | `costSnapshot` in transcripts |
| Concurrency per Provider | ✅ Implemented | `LlmProvider.maxParallelRequests` |
| Priority-based Jobs | ✅ Implemented | PgBoss priority queues |

### What Remains Deferred

**Batch Processing Optimization**
- Queue large batches more efficiently
- Reduce per-run overhead for high-volume evaluations
- Optimize job scheduling for throughput

**Cost Dashboard**
- Daily/weekly/monthly cost charts
- Per-user cost breakdown
- Budget thresholds with alerts

**Rate Limit Management**
- Dynamic concurrency based on real-time rate limit feedback
- Graceful degradation under load
- Cross-run rate limit coordination

### Why Remaining Items Are Deferred

1. **Current scale is sufficient** - The system handles current workloads fine with existing optimizations.

2. **Core cost visibility exists** - Users can see estimated and actual costs; dashboards can wait.

3. **Provider limits work** - Database-driven `maxParallelRequests` provides adequate control.

### Implementation Guidance

When scale demands justify this work:

1. **Cost Tracking Dashboard**
   - Daily/weekly/monthly cost charts
   - Per-user cost breakdown
   - Per-model cost comparison
   - Budget thresholds with alerts

2. **Queue Optimization**
   - Dynamic concurrency based on provider rate limits
   - Priority lanes for different run types
   - Graceful degradation under load

---

## Other Deferred Items

### Tier 2/3 Analysis Features

From the original product spec, some analysis features were marked for future implementation:

**Tier 2 (Partially Implemented):**
- ✅ Inter-model agreement (pairwise correlation using Spearman's rho)
- ✅ Effect sizes for comparisons
- ✅ Multiple comparison correction (Holm-Bonferroni)
- ⏳ Dimension impact analysis (Kruskal-Wallis) - basic version implemented

**Tier 3 (Still Deferred):**
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
| Cost Dashboard | Low - basic tracking exists | Low | Cost data already captured |
| Tier 3 Analysis | Low - Tier 1/2 cover most needs | High | Statistical expertise needed |

**Recommended order:**
1. **Experiment Framework** - Improves organization, uses existing tables
2. **Cost Dashboard** - Low effort, data already exists
3. **Tier 3 Analysis** - Only when advanced analysis is needed

---

## Related Documentation

- [Product Specification](../preplanning/product-spec.md) - Original feature priorities
- [High-Level Implementation Plan](../../specs/high-level.md) - Stage definitions
- [Analysis System](../features/analysis.md) - What's currently implemented
- [Runs Feature](../features/runs.md) - Current run execution capabilities
- [Run Comparison](../features/runs.md#run-comparison) - Implemented comparison features

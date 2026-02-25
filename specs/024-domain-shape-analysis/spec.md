# Feature Specification: Domain Analysis — Ranking Shape Analysis

> **Feature #024**
> **Created**: 2026-02-25
> **Status**: Draft
> **Dependencies**: Domain Analysis (existing) — Complete

## Overview

The current domain analysis page shows each model's BT scores and ranks them. But two models with the same #1 value can have very different profiles: one might have a dominant leader with a steep drop-off to #2, another might have ten values all bunched together with no clear winner. This feature characterizes the *shape* of each model's value ranking — flagging what's notable about the distribution, not just the order.

**Core question answered**: "Is this model's top value genuinely dominant, or is it just barely ahead of the pack?"

---

## User Stories

### User Story 1 — See whether a model has a dominant top value (Priority: P1)

As a researcher, I need to see at a glance whether a model's #1 ranked value is genuinely dominant or just marginally ahead, so that I can distinguish strong preferences from weak ones.

**Why this priority**: The ranked list already exists. Without shape context, a researcher might over-interpret a model that has Benevolence at #1 by a tiny margin as having a strong Benevolence preference — when it's really just noise above the pack.

**Independent Test**: View the domain analysis page for a domain with multiple models. Verify that each model has a visible shape annotation. Verify that a model with a large gap between #1 and #2 shows a "dominant" flag, and a model with closely-spaced scores shows a "spread" flag.

**Acceptance Scenarios**:

1. **Given** a model's BT scores are computed, **When** I view the value priorities section, **Then** I see a shape label for the model (e.g., "Dominant leader", "Gradual slope", "No clear leader")
2. **Given** a model has a large gap between its #1 and #2 scores, **When** I view its shape annotation, **Then** the annotation flags it as having an unusually dominant top value
3. **Given** a model has closely-spaced scores across all 10 values, **When** I view its shape annotation, **Then** the annotation flags it as having no clear leader
4. **Given** I hover over the shape label, **When** the tooltip appears, **Then** I see the actual BT score gap between #1 and #2 and how it compares to the average gap across all models
5. **Given** multiple models are displayed, **When** I scan the shape column, **Then** I can quickly identify which models have strong preferences vs. weak ones

---

### User Story 2 — Compare shape profiles across models (Priority: P2)

As a researcher, I need to see shape profiles side by side across all models in a domain, so that I can identify which models stand out as having unusual distributions.

**Why this priority**: Per-model shape is useful, but the real insight comes from comparison — "this model is an outlier in how dominant its #1 value is."

**Independent Test**: View the summary table. Verify that a "Shape" column or annotation is present. Verify that models are distinguishable as having steep, moderate, or flat profiles.

**Acceptance Scenarios**:

1. **Given** the value priorities table is displayed, **When** I look at the model rows, **Then** I can see a shape indicator per model alongside the BT scores
2. **Given** one model is an outlier (unusually steep or flat compared to the rest), **When** I view the table, **Then** that model is visually distinct
3. **Given** I want to sort by shape steepness, **When** I click the shape column header, **Then** models are sorted by `rankingShape.steepness` descending (steepest first)

---

## Computations Required

### Shape Metrics (computed per model)

All inputs are the 10 BT log-strength scores for the model (`s[0]` through `s[9]`), sorted descending. There are 9 consecutive deltas: `d[i] = s[i] - s[i+1]` for `i = 0..8`.

| Metric | Exact Formula | Purpose |
|--------|--------------|---------|
| **Top gap** | `s[0] - s[1]` | Gap between #1 and #2 |
| **Bottom gap** | `s[8] - s[9]` | Gap between #9 and #10 |
| **Spread** | `s[0] - s[9]` | Total range from top to bottom |
| **Steepness** | `sum(w[i] * d[i]) / sum(w[i])` where `w[i] = 9 - i` (linear decay) | Top-weighted mean of consecutive deltas. Rank-1→2 gap gets weight 9, rank-8→9 gets weight 1. |
| **Dominance z-score** | See edge-case rules below | How unusual is topGap vs. other models in domain? |

#### Dominance Z-Score — Edge Cases

Let `gaps = [topGap_model_1, ..., topGap_model_N]` for all models in the domain.

- **N < 4**: Do not compute z-score. Set `dominanceZScore = null`. Use absolute topGap thresholds for classification (see below).
- **stddev(gaps) == 0** (all models have the same topGap): Set `dominanceZScore = 0`. All models receive label `gradual_slope`.
- **N ≥ 4 and stddev > 0**: `dominanceZScore = (topGap - mean(gaps)) / stddev(gaps)`

### Shape Classification

Rules are evaluated in strict precedence order. The first matching rule wins. Every model matches exactly one rule.

| Priority | Label | Condition |
|----------|-------|-----------|
| 1 | **bimodal** | `topGap > spread * 0.4` AND `bottomGap > spread * 0.4` AND `spread > 0.3` |
| 2 | **dominant_leader** | z-score available: `dominanceZScore > 1.5`. z-score unavailable (N < 4): `topGap > 0.5` |
| 3 | **no_clear_leader** | z-score available: `dominanceZScore < -0.5` AND `spread < medianSpread`. z-score unavailable: `topGap < 0.1` AND `spread < 0.4` |
| 4 | **gradual_slope** | Default — all models not matched above |

Notes:
- `medianSpread` is the median of `spread` across all models in the domain.
- The bimodal threshold `spread * 0.4` means both the top and bottom gaps each consume at least 40% of the total spread, leaving ≤ 20% for the middle 8 values. The `spread > 0.3` guard prevents classification on nearly-flat profiles.
- Thresholds (`0.5`, `0.1`, `0.4`, `0.3`) are initial calibration values to be validated against the first real domain dataset before UI launch.

### Domain-Level Benchmarks

Computed once across all models in the domain (needed by the API contract and tooltip):

```
domainMeanTopGap  = mean(topGap for all models)
domainStdTopGap   = stddev(topGap for all models); null if N < 4
medianSpread      = median(spread for all models)
```

---

## Data Contract

### Backend Addition to `DomainAnalysisModel`

```typescript
type RankingShape = {
  label: 'dominant_leader' | 'gradual_slope' | 'no_clear_leader' | 'bimodal';
  topGap: number;               // s[0] - s[1]
  bottomGap: number;            // s[8] - s[9]
  spread: number;               // s[0] - s[9]
  steepness: number;            // top-weighted mean of consecutive deltas (sortable)
  dominanceZScore: number | null; // null when N < 4
};

// Added to existing DomainAnalysisModel type
type DomainAnalysisModel = {
  // ... existing fields ...
  rankingShape: RankingShape;
};
```

### Domain-Level Benchmarks (new field on `DomainAnalysisResult`)

```typescript
type RankingShapeBenchmarks = {
  domainMeanTopGap: number;
  domainStdTopGap: number | null;  // null when N < 4
  medianSpread: number;
};

// Added to existing DomainAnalysisResult type
type DomainAnalysisResult = {
  // ... existing fields ...
  rankingShapeBenchmarks: RankingShapeBenchmarks;
};
```

The tooltip for each model's shape chip reads: `"#1→#2 gap: {topGap.toFixed(2)} (domain avg: {domainMeanTopGap.toFixed(2)})"`. This satisfies User Story 1 acceptance criterion 4 without deriving from z-score.

### Where computed

`cloud/apps/api/src/services/domain.ts`, in the function that assembles `DomainAnalysisResult`. **Before implementing**, confirm the exact function name and location within `domain.ts` that builds the `DomainAnalysisModel[]` array — the current assembly logic may live in the GraphQL resolver layer rather than the service, which would require extracting it into the service first. Shape metric computation must live in the service layer, not the resolver, to keep the resolver thin.

Shape metrics require a two-pass approach:

1. **Pass 1** — compute raw metrics (`topGap`, `bottomGap`, `spread`, `steepness`) for each model immediately after BT scores are normalized. These need only per-model data.
2. **Pass 2** — compute domain-level benchmarks (`domainMeanTopGap`, `domainStdTopGap`, `medianSpread`) across all models, then assign `dominanceZScore` and `label` to each model.

Both passes operate on in-memory data already present in the assembly function. No new database queries are required.

---

## UI Design

### Value Priorities Table

Add a **Shape** column to the right of the model name in the detailed BT score table. Each cell shows:
- A short label chip (e.g., "Dominant", "Flat", "Bimodal")
- Color-coded: teal = dominant, gray = gradual, amber = no clear leader, purple = bimodal
- Tooltip on hover showing: `"#1→#2 gap: {topGap} (domain avg: {domainMeanTopGap})"` and `"Full spread: {spread}"`

### Summary Table

Add a sentence to the top 3/bottom 3 summary for each model. Example:
> "Dominant leader: Benevolence scores well above the field. The gap between #1 and #2 is 2.1x the domain average."

---

## Out of Scope

- Percentile ranking of shape metrics across all domains (not just current domain)
- Shape change over time / across signatures
- Written LLM summary (separate feature)

---

## Open Questions

1. Should dominance z-score be computed relative to other models in the same domain, or relative to a global baseline across all domains? Same-domain is simpler but sensitive to small model counts. The N < 4 fallback handles the extreme case but a domain with 4–5 models still has noisy z-scores.
2. Should the bimodal case be split further (bimodal-top vs. bimodal-bottom)?
3. The numeric thresholds in the classification table (`0.5`, `0.1`, `0.4`, `0.3`, `0.4 * spread`) are initial estimates. They should be calibrated against a real domain dataset before UI launch and documented as configuration constants (not magic numbers) in the implementation.

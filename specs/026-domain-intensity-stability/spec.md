# Feature Specification: Domain Analysis — Intensity Stability

> **Feature #026**
> **Created**: 2026-02-25
> **Status**: Draft
> **Dependencies**: Domain Analysis (existing) — Complete. Scenario `content.dimensions` (numeric 1–5 intensity scores) already stored in DB and accessible in analysis pipeline.

## Overview

Each vignette scenario has dimension intensity scores (1–5) that indicate how strongly each value is at stake in that scenario. At temperature=0, the model's response to any given vignette is deterministic — so any instability we find across intensity levels is real structure, not noise.

This feature splits each model's transcripts into low-intensity and high-intensity groups, recomputes BT scores per group, and flags values whose ranking changes materially between the two groups. The core question: does a model's preference for a value hold up when that value is under serious pressure, or does it only "win" in easy scenarios?

**Core question answered**: "Is this model's top value a genuine commitment, or does it only win when the competition is weak?"

---

## User Stories

### User Story 1 — See whether value rankings hold under high intensity (Priority: P1)

As a researcher, I need to see whether each model's value ranking is stable across low- and high-intensity scenarios, so that I can distinguish genuine preferences from context-sensitive responses.

**Why this priority**: A model that ranks Self-Direction first overall might only do so when Self-Direction is competing against weak values in low-stakes scenarios. If its rank drops to #4 under high-intensity competition, the overall ranking is misleading. This is the most important analytical insight that the current system cannot provide.

**Independent Test**: View the domain analysis page. For a model where Self-Direction ranks first overall, verify that the intensity stability view shows its rank in low-intensity vs. high-intensity scenarios separately. Verify that a large rank change is flagged.

**Acceptance Scenarios**:

1. **Given** a model has transcripts spanning a range of intensity levels, **When** I view the intensity stability panel, **Then** I see separate BT rankings for low-intensity (average pair score 1.0–2.4) and high-intensity (average pair score 3.5–5.0) scenarios
2. **Given** a value's rank changes by 3 or more positions between low and high intensity, **When** I view the stability panel, **Then** that value is flagged as "unstable" with a visual indicator
3. **Given** a value's rank is consistent across intensity levels (within ±1 position), **When** I view the stability panel, **Then** that value is shown as "stable"
4. **Given** a model has fewer than 10 pairwise comparisons in either the low or high intensity stratum, **When** I view the panel, **Then** a warning is displayed noting insufficient data for that stratum, and no stability flag is shown
5. **Given** all values are stable across intensity levels, **When** I view the panel, **Then** a summary note states "Rankings are consistent across intensity levels"

---

### User Story 2 — Compare intensity stability across models (Priority: P2)

As a researcher, I need to see which models are most sensitive to intensity and which are stable, so that I can characterize overall model behavior in a domain.

**Why this priority**: Comparing stability profiles across models reveals whether sensitivity to intensity is a property of specific models or universal in the domain.

**Independent Test**: View the domain-level stability summary. Verify that models are ranked from most stable to most sensitive. Verify that a model with several unstable values is ranked as more sensitive.

**Acceptance Scenarios**:

1. **Given** intensity stability has been computed for all models in the domain, **When** I view the domain summary, **Then** I see an overall stability rating per model (e.g., "Highly stable", "Moderately sensitive", "Highly sensitive")
2. **Given** the stability summary is displayed, **When** I read it, **Then** I can see which specific values are most frequently unstable across models
3. **Given** I click a model's stability rating, **When** the detail view opens, **Then** I see the full per-value stability breakdown for that model

---

### User Story 3 — Drill into a specific value's intensity profile (Priority: P3)

As a researcher, I need to see how a specific value's BT score changes across intensity levels for a given model, so that I can understand the shape of the sensitivity, not just whether it's there.

**Why this priority**: Knowing *that* a value is unstable is useful; knowing *how* it changes (does it strengthen or weaken under pressure?) gives the full picture.

**Independent Test**: Click on an unstable value flag. Verify that a detail view shows BT scores for that value across the three intensity strata.

**Acceptance Scenarios**:

1. **Given** an unstable value is displayed, **When** I click on it, **Then** I see a breakdown of that value's BT score across low (1–2), medium (3), and high (4–5) intensity strata
2. **Given** the breakdown is displayed, **When** I read it, **Then** I can see whether the value gets stronger or weaker as intensity increases
3. **Given** insufficient data in one stratum, **When** the breakdown is displayed, **Then** that stratum is shown as "N/A — insufficient data" rather than an unreliable score

---

## Computations Required

### Intensity Stratification

**Input**: For each transcript, the associated scenario's `content.dimensions` — a `Record<string, number>` where values are intensity scores (1–5).

**How to derive intensity for a pairwise comparison** (resolved — not an open question): The intensity of a comparison between value A and value B is `(dims[A] + dims[B]) / 2`. Rationale: we are testing whether the model's preference holds when the *competition is high-stakes*, which requires both values to be under pressure. Using only the focal value's dimension loses the strength of the competing value and would bucket a "strong A vs. weak B" comparison the same as "strong A vs. strong B."

If either dimension key is missing from `scenario.content.dimensions`, the transcript is excluded from intensity stratification (still counted in the main BT score, just omitted from per-stratum BT).

**Strata**:

| Stratum | Condition |
|---------|-----------|
| Low | Average intensity 1.0 – 2.4 |
| Medium | Average intensity 2.5 – 3.4 |
| High | Average intensity 3.5 – 5.0 |

**Minimum data requirements per stratum per model**:
1. At least 10 pairwise comparisons in the stratum.
2. The comparison graph for that stratum must be **connected** — every value that appears in the stratum must be reachable from every other value through a chain of comparisons. BT is undefined on disconnected graphs. Check connectivity with a depth-first search over the comparison graph before running BT; if disconnected, mark stratum as insufficient regardless of count.

### Per-Stratum BT Scores

For each model:
1. Split transcripts into three buckets by average pair intensity
2. Run full Bradley-Terry algorithm on each bucket independently (same algorithm as the main score, just on the subset)
3. Normalize within each stratum (same geometric mean normalization as main BT)

**Note**: Strata are computed independently — BT scores within a stratum are only comparable to other scores in that same stratum, not to the main BT scores.

### Stability Metrics

| Metric | Definition |
|--------|-----------|
| **Rank delta** | `highRank - lowRank` (positive = dropped in rank; negative = rose) |
| **Score delta** | `highStratumScore - lowStratumScore` (positive = strengthened; negative = weakened) |
| **Instability flag** | `|rankDelta| >= 3` |
| **Direction** | Derived from **score delta** (not rank delta): `score delta > 0` → `strengthens`; `score delta < 0` → `weakens`; `|score delta| < 0.05` → `stable`. Rank delta is reported separately and used only for the instability flag. These two can disagree (a value can rise in score but drop in rank if peers rise faster); reporting both separately surfaces that. |
| **Model sensitivity score** | `unstableValueCount / valuesWithSufficientData` where `valuesWithSufficientData` = count of values with non-null `lowRank` AND non-null `highRank`. If `valuesWithSufficientData == 0`, `sensitivityScore = null`. |

#### Rank comparability note (addresses P1)

Ranks within a stratum are computed over the set of values that have BT scores in that stratum (i.e., values with at least one comparison in the stratum and a connected comparison graph). If the two strata contain different value sets, a value missing from one stratum gets `lowRank = null` or `highRank = null`, making `rankDelta = null` — it is excluded from the instability flag and sensitivity score denominator. **Do not compute `rankDelta` across strata with different value set sizes**, as "rank 3 of 7" and "rank 3 of 10" are not directly comparable. The implementation must assign null to any value not present in a stratum's BT result before computing deltas.

### Model Stability Rating

| Label | Condition |
|-------|-----------|
| **Highly stable** | 0 unstable values |
| **Moderately sensitive** | 1–2 unstable values |
| **Highly sensitive** | 3+ unstable values |

### Where Computed

`cloud/apps/api/src/graphql/queries/domain.ts` — added as a new computation block after the main BT score computation, with heavy logic extracted into a co-located `domain-intensity.ts` helper module. (Note: the file lives under `graphql/queries/`, not `services/` — see plan.md for the convention rationale.)

**Query shape change required**: The current domain analysis path aggregates pairwise win/loss counts from the judge analysis records and does not carry raw transcript-level scenario dimension values through the BT computation. Intensity stratification requires `scenario.content.dimensions` for each transcript. This means the query that feeds the BT computation must be expanded to include scenario content, or a separate query must fetch `{ transcriptId, scenarioDimensions }` pairs alongside the win/loss data. Either approach is acceptable; the implementation must verify which is less disruptive to the existing query structure before proceeding. **"No new queries required" is not safe to assume here** — confirm against actual query shape in `domain.ts` during implementation planning.

---

## Data Contract

### New Types

```typescript
type StratumBTResult = {
  stratum: 'low' | 'medium' | 'high';
  scores: Record<string, number>;   // valueKey → BT score within stratum
  comparisonCount: number;           // number of pairwise comparisons in this stratum
  sufficient: boolean;               // comparisonCount >= 10 AND comparison graph is connected
  insufficientReason: 'low_count' | 'disconnected_graph' | null; // null when sufficient = true
};

type ValueStabilityResult = {
  valueKey: string;
  lowRank: number | null;            // null if low stratum insufficient
  highRank: number | null;           // null if high stratum insufficient
  lowScore: number | null;           // BT score in low stratum; null if insufficient
  highScore: number | null;          // BT score in high stratum; null if insufficient
  rankDelta: number | null;          // highRank - lowRank; null if either rank is null
  scoreDelta: number | null;         // highScore - lowScore; null if either score is null
  isUnstable: boolean;               // |rankDelta| >= 3; false when rankDelta is null
  // direction is derived from scoreDelta (not rankDelta):
  direction: 'strengthens' | 'weakens' | 'stable' | 'insufficient_data';
  // 'strengthens' = scoreDelta > 0.05; 'weakens' = scoreDelta < -0.05
  // 'stable' = scoreDelta in [-0.05, 0.05]; 'insufficient_data' = scoreDelta is null
};

type ModelIntensityStability = {
  model: string;
  strata: StratumBTResult[];
  valueStability: ValueStabilityResult[];
  valuesWithSufficientData: number;  // count of values where both lowRank and highRank are non-null
  sensitivityScore: number | null;   // unstableCount / valuesWithSufficientData; null if valuesWithSufficientData == 0
  sensitivityLabel: 'highly_stable' | 'moderately_sensitive' | 'highly_sensitive' | 'insufficient_data';
  dataWarning: string | null;        // e.g., "Low stratum has only 4 comparisons (disconnected graph)"
};

type IntensityStabilityAnalysis = {
  models: ModelIntensityStability[];
  mostUnstableValues: string[];      // valueKeys unstable in 2+ models (domain-level callout)
  skipped: boolean;
  skipReason: 'insufficient_dimension_coverage' | 'no_intensity_variation' | 'all_models_insufficient' | null;
};

// Added to DomainAnalysisResult
type DomainAnalysisResult = {
  // ... existing fields ...
  intensityStability: IntensityStabilityAnalysis;
};
```

---

## UI Design

### New Section: Intensity Stability

Placed below the existing Similarity & Differences section as a fourth section on the domain analysis page.

**Section header**: "4. Value Ranking Stability Across Intensity Levels"
**Section subtext**: "Do preferences hold under pressure? Compares value rankings in low-stakes vs. high-stakes scenarios."

**Layout**:

1. **Model stability summary row** (one per model): Model name, stability label chip (green/amber/red), count of unstable values. Click to expand.

2. **Expanded model detail**: Shows a 10-row table — one row per value. Columns: Value name | Low rank | High rank | Delta | Flag. Rows with `isUnstable = true` are highlighted in amber.

3. **Domain-level callout** (top of section): "X values are unstable in 2+ models: [value chips]" — or "All rankings are stable across intensity levels" if none.

**Insufficient data handling**: If a model's stratum has fewer than 10 comparisons, the entire row shows a gray "Insufficient data" state instead of rank numbers. The section header shows a warning: "Some models lack sufficient coverage for intensity analysis."

---

## Data Availability Risk

**Key dependency**: The intensity of a scenario is derived from `scenario.content.dimensions[valueKey]`. This requires that:
1. Each scenario has dimension scores stored
2. The domain analysis pipeline surfaces these alongside the pairwise win/loss records

Based on code review, `analyze-basic.ts` already reads `scenario.content.dimensions` and the domain analysis query includes scenario data. However, **this should be verified on a real domain dataset before implementation begins** — if scenarios were generated before dimension scoring was standardized, some may be missing dimension values.

**Skip and fallback precedence** (evaluated in order; first matching rule wins):

1. **Domain-level skip** (`skipReason: 'insufficient_dimension_coverage'`): If fewer than 30% of a domain's transcripts have `scenario.content.dimensions` populated, skip the entire section and show: "Intensity analysis unavailable — vignettes in this domain do not have dimension scores." No per-model rows are shown. **Rationale for domain-wide gate**: when fewer than 30% of transcripts have dimensions, the sample available for stratification is too small to represent the domain — even models with individually sufficient strata are drawing from a biased subset. A per-model fallback would display results that appear to answer the stability question while actually reflecting an unrepresentative slice of the data.
2. **Domain-level skip** (`skipReason: 'no_intensity_variation'`): If all transcripts with dimensions fall into the same stratum, skip the entire section and show: "Intensity analysis unavailable — all scenarios have similar intensity levels."
3. **Domain-level skip** (`skipReason: 'all_models_insufficient'`): If every model's low or high stratum is insufficient (count or connectivity), skip the section and show: "Intensity analysis unavailable — insufficient data across all models."
4. **Per-model row warning**: If an individual model's stratum is insufficient (but others are not), show that model's row in a gray "Insufficient data" state with `dataWarning` text. Other models with sufficient data are shown normally. The section header shows: "Some models lack sufficient coverage for intensity analysis."

This means the section either shows fully (with possible per-model warnings) or is hidden entirely — never shown in a half-computed state at the domain level.

---

## Out of Scope

- Intensity stability across different temperature settings (different signature)
- User-adjustable stratum boundaries
- Statistical significance testing of rank changes (removed per product decision — temp=0 makes this less meaningful)
- Written LLM summary (separate feature)

---

## Open Questions

1. The medium stratum (score = 3) may have few scenarios if vignette generation skews toward extreme intensities. Should we use a two-stratum (low / high) split instead to maximize data per bucket? This can be evaluated against a real domain dataset before implementation begins.
2. Should model-level stability ratings compare against other models in the same domain, or use absolute thresholds? Current spec uses absolute thresholds (0 / 1–2 / 3+). If the domain has few values showing any instability, even 1 unstable value may be notable.

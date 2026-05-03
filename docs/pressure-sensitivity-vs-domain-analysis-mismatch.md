# Pressure Sensitivity vs Domain Analysis — Win Rate Mismatch

**Status:** Partial progress. Three bugs fixed (PRs #881, #883, #884). One structural difference remains.
**Goal for this doc:** Brief Opus on what we're trying to match, what we've already fixed, and exactly why "All Domains" still doesn't match.

---

## The Goal

The "Average win rate" column in the **Pressure Response by Value** table (Pressure Sensitivity page) should match the **Value Priorities** column in the **Domain Analysis** (Models) page, for the same model and the same domain scope.

---

## The Two Pipelines

### Domain Analysis — "Value Priorities"

**Data source:** Pre-computed snapshots in the `assumptionAnalysisSnapshot` table. Each snapshot covers one domain.

**Aggregation (within each domain snapshot), implemented in `domain-analysis-cell-win-rates.ts`:**
```
condition → vignette rate (average 25 cell rates equally)
vignette  → direction rate (average vignette rates within same authored direction)
direction → pair rate (average 2 direction means equally)
pair      → domain value rate (average pair rates equally, for all pairs containing a value)
```

**Cross-domain aggregation, in `models-analysis.ts` + `models-analysis-math.ts`:**
```
domain value rates → pooled value rate (average domain rates equally, one vote per domain)
```

So the final formula is:
```
avg_domains( avg_pairs_in_domain( avg_directions( avg_vignettes( avg_conditions ) ) ) )
```

---

### Pressure Sensitivity — "Average win rate"

**Data source:** Live query of source runs + transcripts from the DB.

**Aggregation for each pair, implemented in `aggregation.ts` (`computeDirectionBalancedPairWinRates`):**
```
(definition × cell) → rate (buildCellMetrics)
rates → grouped by domain + authored direction
per domain: avg direction buckets → domain-direction mean → domain pair rate
domains → averaged equally → cross-domain pair rate (one number per pair)
```

**Value-level aggregation, implemented in `PressureResponseByValueTable.tsx` (`buildValueRows`):**
```
pair cross-domain rates → averaged equally across all pairs containing this value
```

So the final formula is:
```
avg_pairs( avg_domains_for_pair( avg_directions( avg_cells_in_direction ) ) )
```

---

## What's Already Fixed

### PR #881 — Wrong data source
Pressure sensitivity was querying Aggregate-tagged runs, which are pooling views with no transcripts of their own. Fixed to query source runs directly.

### PR #883 — Wrong domain weighting
Within each pair, all (definition × cell) rates from all domains were pooled into one direction bucket, weighting domains by their vignette count. Fixed to group by domain, compute per-domain direction-balanced rates, then average domains equally.

### PR #884 — Direction-flip bug
For reversed-authored vignettes (authored-first ≠ canonical-first), the code was pushing `metrics.opponentWinRate` (the canonical second value's rate) into the direction bucket. But `assignOwnOpponent` always maps outcomes to canonical own/opponent regardless of authored direction — so `metrics.winRate` is always the canonical first value's rate. Fixed to use `metrics.winRate` in both direction buckets.

---

## The Remaining Structural Difference

**The aggregation order across pairs and domains is different.**

Domain analysis computes:
```
avg_domains( avg_pairs_in_domain(...) )
```
For each domain, average all pairs containing the value → get one domain-level value rate. Then average those domain rates equally.

Pressure sensitivity computes:
```
avg_pairs( avg_domains_for_pair(...) )
```
For each pair, average across domains → get one cross-domain pair rate. Then average those pair rates equally.

**For equal-weight averages, these two orders give the same result IF every domain has the same set of pairs.** In practice they don't — different domains have different pair coverage. When some pairs only exist in some domains, the aggregation order matters.

### Concrete Example

Suppose we have Security Personal in two domains:

| Pair | Domain 1 | Domain 2 | Domain 3 |
|------|----------|----------|----------|
| Security vs Tradition | 90% | 70% | — |
| Security vs Stimulation | 50% | 60% | 70% |

**Domain Analysis:**
- Domain 1 Security rate = avg(90%, 50%) = 70%
- Domain 2 Security rate = avg(70%, 60%) = 65%
- Domain 3 Security rate = avg(70%) = 70% — uses only Security vs Stimulation
- Pooled = avg(70%, 65%, 70%) = **68.3%**

**Pressure Sensitivity (current):**
- Security vs Tradition cross-domain rate = avg(90%, 70%) = 80% — Domain 3 excluded (no data)
- Security vs Stimulation cross-domain rate = avg(50%, 60%, 70%) = 60%
- Security average = avg(80%, 60%) = **70%**

The pair "Security vs Tradition" doesn't exist in Domain 3. In domain analysis, Domain 3 still contributes to Security's pooled rate (based on its one pair). In pressure sensitivity, Domain 3 doesn't influence Security vs Tradition's cross-domain rate, but the pair still gets equal weight in the value average.

**The structural issue:** Pressure sensitivity computes pair rates first (averaging domains), then averages pairs. Domain analysis computes domain-value rates first (averaging pairs within each domain), then averages domains. The two are not equivalent when pairs have different domain coverage.

---

## Key Files

| File | Role |
|------|------|
| `cloud/apps/api/src/graphql/queries/models-analysis.ts` | Domain analysis resolver — reads snapshots, averages domain rates via `computePooledWinRate` |
| `cloud/apps/api/src/graphql/queries/models-analysis-math.ts` | `computePooledWinRate` — simple equal-weight average of domain rates |
| `cloud/apps/api/src/services/analysis/domain-analysis-cell-win-rates.ts` | `computeCellWeightedDomainRates` — 4-level aggregation within a domain (condition→vignette→direction→pair→value) |
| `cloud/apps/api/src/graphql/queries/pressure-sensitivity.ts` | Pressure sensitivity resolver — queries transcripts live, calls aggregation helpers |
| `cloud/apps/api/src/services/pressure-sensitivity/aggregation.ts` | `computeDirectionBalancedPairWinRates` — per-domain direction-balanced pair rate |
| `cloud/apps/web/src/components/models/PressureResponseByValueTable.tsx` | `buildValueRows` — averages pair rates per value (front-end aggregation) |

---

## Options to Fix the Structural Difference

### Option A — Return per-domain pair rates from the resolver
Change `computeDirectionBalancedPairWinRates` to return `{ domainId, ownRate, opponentRate }[]` instead of a single aggregated number. Pass these per-domain pair rates to the frontend. In `buildValueRows`, do the correct aggregation: for each domain, average pair rates → get domain-value rate, then average domain rates equally.

Pros: Matches domain analysis exactly. No schema change needed beyond adding a new field.
Cons: More data transferred; front-end aggregation becomes more complex.

### Option B — Compute value-level rates in the resolver
Instead of computing pair-level cross-domain rates and returning them to the frontend, add a parallel aggregation pass in the resolver that computes value-level cross-domain rates directly (mirroring `computeCellWeightedDomainRates`'s approach but live). Return these alongside the pair-level data.

Pros: Clean — matches domain analysis's exact computation path; frontend stays simple.
Cons: More work in the resolver; two parallel aggregations.

### Option C — Accept the difference and document it
The two metrics are measuring related but different things. Document what each computes and stop trying to make them match.

Cons: They're supposed to be the same metric (value win rate, all domains). Leaving a silent discrepancy is confusing.

---

## What We Don't Know

1. How large the mismatch actually is in practice — it depends on how much pair coverage varies across domains.
2. Whether Option A (per-domain pair rates to frontend) or Option B (resolver-side value aggregation) is architecturally cleaner given the existing schema.
3. Whether there are any additional differences we haven't found (e.g., different run selection criteria between the snapshot builder and the live query).

# AAPOR Trust Display — Feature Spec

## Context

An AAPOR researcher asked whether ValueRank's "Win Rate by Values by Model" results are
statistically valid. The report currently shows point estimates with no confidence intervals,
no heterogeneity statistics, and no fielding-methodology disclosure. This spec closes those
gaps in three targeted changes: (1) renaming planned trust-card signals to TSE vocabulary,
(2) replacing the planned strip plot with a proper forest plot in the per-vignette drawer,
and (3) adding a collapsed AAPOR-style disclosure block to the page header. None of these
changes alter the underlying data model or existing scores.

---

## Goals & non-goals

**Goals**
- Adopt Total Survey Error (TSE) terminology in the planned trust-card UI so AAPOR readers
  recognize the framework without explanation.
- Surface per-vignette Wilson 95% CIs, a summary band (min/mean/max), and an I² heterogeneity
  index in the value-detail drawer as a forest plot. The forest plot is the primary view of
  the data; the cell mean in the table is a descriptive summary statistic.
- Add a collapsed AAPOR disclosure block at the top of `DomainAnalysis.tsx` that reports
  fielding details on demand and explicitly frames ValueRank as a revealed-preference
  characterization of one model across designed stimuli.

**Non-goals**
- Changing the pooled-win-rate formula or score calculation.
- Cell-level confidence intervals using bootstrap-over-vignettes — the cell mean is
  descriptive, not an estimate of a population parameter.
- Building the trust-card chip UI in `ValuePrioritiesTable.tsx` (the card is spec'd here;
  the table wiring is a follow-on task).
- Altering `src/` (legacy) code.
- Modifying CLAUDE.md, AGENTS.md, MEMORY.md, or any file outside `docs/specs/`.

---

## Item 1: TSE-language trust card

### Current state

No trust card exists in the codebase. `ValuePrioritiesTable.tsx` renders each cell as a
`<Button>` that navigates to the value-detail page. `ModelValueDetailDrawer.tsx` shows a
pooled win rate, vignette count, and a domain-breakdown table; there are no trust signals or
TSE labels anywhere. `ValuePrioritiesSection.tsx` has a `showSectionHelp` toggle that opens
`ValuePrioritiesHelpPanel` — that is the only existing methodology copy on this surface.

### Proposed UI

**Component:** `cloud/apps/web/src/components/domains/TrustCard.tsx`

Placement — two locations:
1. **Cell tooltip in `ValuePrioritiesTable.tsx`**: wrap each cell `<Button>` in the existing
   `<Tooltip>` component (already imported) passing `<TrustCard ... />` as `content`. The
   tooltip already accepts `ReactNode` content.
2. **Drawer header in `ModelValueDetailDrawer.tsx`**: render `<TrustCard ... />` directly
   below the `<p className="text-sm text-gray-600">` subtitle line (after "eligible domains"
   text), inside the header `<div>` that already exists.

**TrustCard props**

| Prop | Type | Source |
|---|---|---|
| `perVignettePrecision` | `TrustSignal` | avg Wilson CI half-width across cell vignettes (see thresholds) |
| `measurementReliability` | `TrustSignal` | within-vignette trial variance |
| `crossScenarioAgreement` | `TrustSignal` | cross-vignette spread / bimodality flag |
| `wordingEffect` | `TrustSignal` | gap between A→B and B→A framing directions |
| `nonresponse` | `TrustSignal` | neutral / totalTrials ratio |

```ts
type TrustSignalStatus = 'green' | 'yellow' | 'red' | 'unknown';

type TrustSignal = {
  status: TrustSignalStatus;
  label: string;          // TSE name (see labels table below)
  description: string;    // one plain-language sentence
  detail?: string;        // optional numeric detail, e.g. "n = 4 vignettes"
};
```

**Label strings and threshold rules**

| Signal | TSE label | Green | Yellow | Red | Description copy |
|---|---|---|---|---|---|
| Per-vignette precision | "Per-vignette precision" | avg per-vignette Wilson CI half-width (weighted by vignette weight) ≤ 3 pp | 3–10 pp | > 10 pp OR any single vignette half-width > 15 pp | "Precision of each scenario's response rate, averaged across the cell's scenarios." |
| Measurement reliability | "Measurement reliability" | within-vignette SD < 0.10 | 0.10–0.20 | > 0.20 | "Trial-to-trial consistency within each vignette." |
| Cross-scenario agreement | "Cross-scenario agreement" | all vignettes within 20 pp of cell mean | any vignette > 20 pp away | bimodal split detected (≥ 30 pp gap across vignettes) | "How consistently the cell's scenarios point to the same preference." |
| Mode / wording effect | "Wording effect" | A→B vs B→A gap < 5 pp | 5–15 pp gap | > 15 pp gap | "Sensitivity to which value is presented first." |
| Nonresponse / unit refusal | "Nonresponse rate" | neutral / total < 5 % | 5–15 % | > 15 % | "Share of trials that returned no clear preference." |

"Unknown" status is shown when the required data is not available (e.g. the wording-effect
gap requires both framing directions to have been run).

**Methodology footnote**

Add a two-sentence footnote to `ValuePrioritiesHelpPanel.tsx` (which is already rendered
inside `ValuePrioritiesSection`):

> "Trust signals follow a discrete-choice / revealed-preference precision and validity
> framework: Per-vignette precision, Measurement reliability, Cross-scenario agreement,
> Wording effect, and Nonresponse rate. ValueRank measures one subject (the model) across
> designed stimuli; cell numbers are summary statistics over scenarios, not population
> estimates."

### Files touched

| File | Change |
|---|---|
| `cloud/apps/web/src/components/domains/TrustCard.tsx` | New component |
| `cloud/apps/web/src/components/domains/ValuePrioritiesTable.tsx` | Pass `<TrustCard>` to existing `<Tooltip content=...>` on each value cell |
| `cloud/apps/web/src/components/models/ModelValueDetailDrawer.tsx` | Render `<TrustCard>` in drawer header |
| `cloud/apps/web/src/components/domains/ValuePrioritiesHelpPanel.tsx` | Add TSE footnote sentence |

---

## Item 2: Forest plot

### Why the forest plot is the primary view

ValueRank is a revealed-preference / discrete-choice characterization of one AI model across
designed stimuli. There is no population of Claudes being sampled. Each vignette's response
rate — computed from its trials — is the actual measurement of interest. The cell-level
number (e.g., Claude × Benevolence-Dependability × Software = 94.5%) is a descriptive
summary statistic (the mean) across those vignettes, not an estimate of a population
parameter with a sampling-distribution confidence interval. The forest plot exposes the
underlying per-vignette rates that the cell mean rolls up; it is the truth. The table mean
is the shorthand.

### Current state of the drawer

`ModelValueDetailDrawer.tsx` shows:
- A "Pooled win rate" stat card with a tooltip that tables domain-level win rates and
  vignette counts.
- A "Contributing domains" table listing `domainName`, `winRate`, and `evidenceWeight`
  (vignette count).

There is no per-vignette visualization. The drawer receives data from the
`MODELS_ANALYSIS_QUERY` (`modelsAnalysis.ts`), which returns per-domain (not per-vignette)
breakdowns. The per-vignette data lives in the separate `domainAnalysisValueDetail` resolver
(`value-detail.ts`), which the `DomainAnalysisValueDetail` page uses — the drawer does not
currently call it.

The resolver already returns per vignette: `definitionId`, `definitionName`, `otherValueKey`,
`prioritized`, `deprioritized`, `neutral`, `totalTrials`, `selectedValueWinRate`. This is
sufficient to compute Wilson CIs on the backend without a new DB query.

### Proposed ForestPlot component

**File:** `cloud/apps/web/src/components/domains/ForestPlot.tsx`

**Props**

| Prop | Type | Description |
|---|---|---|
| `rows` | `ForestPlotRow[]` | One entry per vignette, sorted by `definitionName` |
| `pooledMean` | `number` | Mean win rate across vignettes for the cell (0–1) |
| `pooledMin` | `number` | Min per-vignette win rate across the cell's vignettes (0–1) |
| `pooledMax` | `number` | Max per-vignette win rate across the cell's vignettes (0–1) |
| `iSquared` | `number \| null` | I² heterogeneity index (0–100), null if < 2 rows |
| `onRowClick` | `(row: ForestPlotRow) => void` | Navigate to existing value-detail page |
| `valueLabel` | `string` | Displayed as x-axis label |

**ForestPlotRow shape** (derived from the existing drawer query after backend changes below)

```ts
type ForestPlotRow = {
  definitionId: string;
  definitionName: string;
  otherValueKey: string;
  prioritized: number;
  totalTrials: number;
  selectedValueWinRate: number | null;  // point estimate
  winRateCI95Low: number | null;         // new backend field
  winRateCI95High: number | null;        // new backend field
  framingDirection: 'A_to_B' | 'B_to_A' | 'pooled'; // derived from otherValueKey position
};
```

**Visual spec**

- SVG-based layout, width 100 %, height auto (one row = 28 px, summary band row = 36 px).
- Left axis: `definitionName` labels, right-aligned, max 200 px wide; truncate with ellipsis.
- Point estimate: filled square, side length proportional to `sqrt(totalTrials)` (scale:
  sqrt(125) ≈ 11 px max side → clamp 4–12 px).
- CI bar: horizontal line from `winRateCI95Low` to `winRateCI95High`.
- Reference line: dashed vertical at x = 0.5.
- Summary band row (last): a horizontal line spanning `pooledMin` to `pooledMax`, with a
  small filled triangle or notch at `pooledMean`. Label: "Range across N scenarios;
  mean = X%". This communicates spread across designed stimuli, not population uncertainty.
- I² label: small text "I² = X%" placed to the right of the summary band row.
- Hover tooltip per row: `definitionName`, `otherValueKey`, `prioritized / totalTrials`,
  framing direction.
- Click: call `onRowClick(row)`.

**Placement in ModelValueDetailDrawer.tsx**

Add a new `<section>` between the existing stat cards section and the "Contributing domains"
table section. Query the `domainAnalysisValueDetail` resolver (same query already used by
`DomainAnalysisValueDetail.tsx`) from inside the drawer when a `domainId` is available,
passing `domainId`, `modelId` (from `model.modelId`), `valueKey` (from `value.valueKey`),
and `selectedSignature`. Render `<ForestPlot>` with the vignette rows from that query result.

The drawer currently receives no `domainId` or `selectedSignature` prop. These must be added:

```ts
// Updated ModelValueDetailDrawerProps
type ModelValueDetailDrawerProps = {
  open: boolean;
  model: ModelsAnalysisModelResult | null;
  value: ModelsAnalysisValueResult | null;
  domainId: string | null;          // new — null in all-domains mode (hides forest plot)
  selectedSignature: string | null;  // new — passed through to the query
  onClose: () => void;
};
```

### Backend changes

**1. New utility: `cloud/apps/api/src/utils/binomial-ci.ts`**

Export one function:

```ts
/**
 * Wilson score interval for a binomial proportion.
 * Returns [low, high] both in [0, 1], or null if n === 0.
 */
export function wilsonCI95(successes: number, n: number): [number, number] | null
```

Formula: standard Wilson interval with z = 1.96.

**2. Extend `cloud/apps/api/src/utils/pairwise-math.ts`**

Add:

```ts
/**
 * I² heterogeneity index for a set of per-vignette win-rate estimates.
 * Returns null when fewer than 2 estimates are available.
 * Uses the standard DerSimonian-Laird / Q-based formula:
 *   Q = sum wi*(yi - ybar_w)^2
 *   I² = max(0, (Q - (k-1)) / Q) * 100
 * where wi = totalTrials[i] (inverse-variance weight proxy).
 * I² is a descriptive heterogeneity index, not an inferential statistic.
 */
export function computeISquared(
  estimates: Array<{ winRate: number; totalTrials: number }>,
): number | null
```

Do NOT add `pooledWilsonCI95` — a pooled CI over vignettes is conceptually a bootstrap
over designed stimuli, which is a counterfactual about external validity, not a precision
interval. The summary band (min/mean/max) replaces it.

**3. Schema diff — `DomainAnalysisVignetteDetail` (GraphQL type)**

In `cloud/apps/api/src/graphql/queries/domain/types-detail.ts`, add two fields to
`DomainAnalysisVignetteDetailRef`:

```ts
winRateCI95Low: t.exposeFloat('winRateCI95Low', { nullable: true }),
winRateCI95High: t.exposeFloat('winRateCI95High', { nullable: true }),
```

And in `cloud/apps/api/src/graphql/queries/domain/shared.ts`, extend
`DomainAnalysisVignetteDetail`:

```ts
winRateCI95Low: number | null;
winRateCI95High: number | null;
```

**4. Schema diff — `DomainAnalysisValueDetailResult` (GraphQL type)**

In `cloud/apps/api/src/graphql/queries/domain/types-detail.ts`, add to
`DomainAnalysisValueDetailResultRef`:

```ts
pooledMin: t.exposeFloat('pooledMin', { nullable: true }),
pooledMax: t.exposeFloat('pooledMax', { nullable: true }),
pooledMean: t.exposeFloat('pooledMean', { nullable: true }),
iSquared: t.exposeFloat('iSquared', { nullable: true }),
```

And in `cloud/apps/api/src/graphql/queries/domain/shared.ts`, extend
`DomainAnalysisValueDetailResult`:

```ts
pooledMin: number | null;
pooledMax: number | null;
pooledMean: number | null;
iSquared: number | null;
```

Do NOT add `pooledCI95Low` / `pooledCI95High` — those fields are removed from this spec.

**5. Compute the new fields in `value-detail-types.ts`**

In `mapVignette` (file: `cloud/apps/api/src/graphql/queries/domain/analysis/value-detail-types.ts`),
call `wilsonCI95(vignette.prioritized, vignette.totalTrials)` and spread `[winRateCI95Low,
winRateCI95High]` or null into the returned object.

**6. Compute pooled summary stats and I² in `value-detail.ts`**

At the return statement in the resolver, derive `pooledMin`, `pooledMax`, `pooledMean` from
the `vignettes` array (`selectedValueWinRate` values) and call `computeISquared` to get
`iSquared`. Include all four in the returned object. Do not compute or return
`pooledCI95Low` / `pooledCI95High`.

**7. Web GraphQL query extension**

In `cloud/apps/web/src/api/operations/domainAnalysis.ts`, add to
`DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY`:

```graphql
vignettes {
  # existing fields...
  winRateCI95Low
  winRateCI95High
}
pooledMin
pooledMax
pooledMean
iSquared
```

And extend `DomainAnalysisValueDetailQueryResult` type accordingly. Do NOT request
`pooledCI95Low` / `pooledCI95High` — those fields are not on the schema.

Run `npm run codegen --workspace @valuerank/web` from `cloud/` after any `.graphql` or
query-string changes.

### Files touched

| File | Change |
|---|---|
| `cloud/apps/api/src/utils/binomial-ci.ts` | New — Wilson CI utility |
| `cloud/apps/api/src/utils/pairwise-math.ts` | Add `computeISquared` |
| `cloud/apps/api/src/graphql/queries/domain/shared.ts` | Add `winRateCI95Low/High`, `pooledMin`, `pooledMax`, `pooledMean`, `iSquared` to type definitions |
| `cloud/apps/api/src/graphql/queries/domain/types-detail.ts` | Expose new fields in Pothos object types |
| `cloud/apps/api/src/graphql/queries/domain/analysis/value-detail-types.ts` | Compute CI in `mapVignette` |
| `cloud/apps/api/src/graphql/queries/domain/analysis/value-detail.ts` | Compute `pooledMin`, `pooledMax`, `pooledMean`, `iSquared` in resolver return |
| `cloud/apps/web/src/api/operations/domainAnalysis.ts` | Extend query + types |
| `cloud/apps/web/src/components/domains/ForestPlot.tsx` | New component |
| `cloud/apps/web/src/components/models/ModelValueDetailDrawer.tsx` | Add `domainId` + `selectedSignature` props; add forest-plot section |

---

## Item 3: AAPOR disclosure block

### Proposed component

**File:** `cloud/apps/web/src/components/domains/MethodologyDisclosure.tsx`

Uses the native `<details>` / `<summary>` HTML elements so it is collapsed by default with
no JS state. Styled to match the existing `rounded-lg border border-gray-200 bg-white`
pattern used in `ValuePrioritiesSection`.

**Props**

| Prop | Type | Description |
|---|---|---|
| `vignetteCount` | `number` | Distinct vignettes in the current view |
| `totalTrials` | `number` | Sum of all trials (prioritized + deprioritized + neutral) |
| `modelLabels` | `string[]` | Display labels of selected models |
| `fieldPeriodStart` | `Date \| null` | Min `Run.createdAt` across feeding runs |
| `fieldPeriodEnd` | `Date \| null` | Max `Run.createdAt` across feeding runs |
| `overallRefusalRate` | `number \| null` | neutrals / totalTrials (0–1) |
| `signature` | `string \| null` | Current signature string (used to display temperature) |
| `methodologyUrl` | `string` | Link to methodology document (pass placeholder until doc exists) |

**Rendered rows** (inside the `<details>` body)

| AAPOR field | Rendered value |
|---|---|
| Sample composition | "{vignetteCount} vignettes × {trialsPerVignette estimated} trials = {totalTrials} total observations" |
| Models tested | comma-joined `modelLabels` |
| Field period | ISO date range from `fieldPeriodStart` to `fieldPeriodEnd`; "—" if null |
| Mode | "API, temperature from signature" + extracted temperature value if `signature` is not null |
| Overall refusal rate | formatted as "X.X% neutral responses"; "—" if null |
| Order / framing handling | Static: "Each vignette administered in both presentation orders; results pooled before analysis." |
| CI methodology | Static: "Per-vignette binomial Wilson 95% CI on trials within each scenario; cell-level numbers reported as summary statistics (mean, min, max) across scenarios. I² heterogeneity index (DerSimonian-Laird)." |
| Study design | Static: "Revealed-preference characterization of one model across N designed stimuli (vignettes); not a population sample." |
| Methodology document | `<a href={methodologyUrl}>Full methodology [TBD]</a>` |

### Data sources

| Field | Source in `DomainAnalysis.tsx` |
|---|---|
| `vignetteCount` | `data?.domainAnalysis.models` — count distinct `definitionId`s across vignettes; or add `targetedDefinitions` to the existing domain analysis query result |
| `totalTrials` | Sum `prioritized + deprioritized + neutral` across all vignettes in `data?.domainAnalysis` (or derive from `modelsAnalysisData`) |
| `modelLabels` | `visibleModels.map(m => m.label)` — already computed |
| `fieldPeriodStart` / `fieldPeriodEnd` | New fields on `DomainAnalysisQueryResult` (see query extension below) |
| `overallRefusalRate` | `neutral / totalTrials` derived in the component |
| `signature` | `selectedSignature` — already in scope |
| `methodologyUrl` | Hardcode `"#methodology-tbd"` for now; flag as TBD |

**Query extension — `DOMAIN_ANALYSIS_QUERY`**

Extend `domainAnalysis` response in `cloud/apps/web/src/api/operations/domainAnalysis.ts`
to request two new fields:

```graphql
domainAnalysis(...) {
  # existing fields
  fieldPeriodStart   # DateTime — min Run.createdAt
  fieldPeriodEnd     # DateTime — max Run.createdAt
}
```

These require a corresponding backend resolver change in the domain analysis service:

- File: `cloud/apps/api/src/graphql/queries/domain/analysis/domain-analysis.ts`
- Add `fieldPeriodStart: Date | null` and `fieldPeriodEnd: Date | null` to the result type.
- Compute by scanning `run.createdAt` for all runs that contribute to the current view
  (already fetched in the resolver).

Also add `targetedDefinitions: number` (total distinct vignette IDs across models in the
current view) if it is not already on the result — check `domain-analysis.ts` before adding.

**Placement in `DomainAnalysis.tsx`**

Insert `<MethodologyDisclosure ... />` as the first child inside the outer `<div
className="space-y-6">`, before `<AnalysisContextBar>`. It should always render when
`data?.domainAnalysis != null`; render nothing (or a skeleton) while loading.

### Files touched

| File | Change |
|---|---|
| `cloud/apps/web/src/components/domains/MethodologyDisclosure.tsx` | New component |
| `cloud/apps/web/src/pages/DomainAnalysis.tsx` | Render `<MethodologyDisclosure>` at top of content area |
| `cloud/apps/web/src/api/operations/domainAnalysis.ts` | Add `fieldPeriodStart`, `fieldPeriodEnd`, `targetedDefinitions` to query + types |
| `cloud/apps/api/src/graphql/queries/domain/analysis/domain-analysis.ts` | Compute and return `fieldPeriodStart`, `fieldPeriodEnd`, `targetedDefinitions` |

---

## Acceptance criteria

- [ ] `TrustCard.tsx` renders five signals with green / yellow / red / unknown status
  indicators; labels exactly match the table in Item 1 (including the renamed
  "Per-vignette precision" and "Cross-scenario agreement" signals).
- [ ] A trust card tooltip appears on hover over any value cell in `ValuePrioritiesTable`.
- [ ] A trust card appears in the `ModelValueDetailDrawer` header when the drawer is open.
- [ ] `ValuePrioritiesHelpPanel` contains the updated methodology footnote describing
  discrete-choice / revealed-preference framing.
- [ ] `ForestPlot.tsx` renders: one row per vignette, a reference line at 50 %, horizontal
  CI bars, a summary band row (min–max line with mean notch and label), and an I² label.
  No diamond row.
- [ ] The summary band label reads "Range across N scenarios; mean = X%" with correct values.
- [ ] Wilson CIs on the forest plot match manual calculation for a known vignette (e.g.
  prioritized=80, total=125 → CI ≈ [0.553, 0.716]).
- [ ] Clicking a forest-plot row navigates to the same URL that clicking the domain link in
  the existing drawer table produces.
- [ ] The drawer correctly omits the forest plot when `domainId` is null (all-domains mode).
- [ ] `MethodologyDisclosure` is collapsed by default; clicking the summary expands it.
- [ ] All nine AAPOR disclosure rows render with real data (no hardcoded dummy values except
  static copy and the TBD methodology URL); the "Study design" row displays the
  revealed-preference framing text.
- [ ] `fieldPeriodStart` and `fieldPeriodEnd` show actual min/max dates from the DB.
- [ ] `npm run build --workspace @valuerank/api` and `npm run build --workspace @valuerank/web`
  pass with no TypeScript errors.
- [ ] `npm run test --workspace @valuerank/api` passes; new utility functions have unit tests
  covering the Wilson CI formula and I² edge cases (n=0, k=1).

---

## Out of scope

- Bootstrap CIs at the cell (model × value matrix) level — cell means are descriptive
  summary statistics, not population-parameter estimates.
- Trust-card chip coloring on the matrix cells themselves (follow-on).
- Exporting the disclosure block as part of the CSV export.
- Localizing or internationalizing any of the new copy.
- Changing the pooled win rate formula or score calculation.
- The "Full methodology" document content (placeholder link only).

---

## Open questions

1. **`targetedDefinitions` on `DomainAnalysisQueryResult`**: The domain analysis query
   result type (`DomainAnalysisQueryResult` in `domainAnalysis.ts`) was not read in full —
   confirm whether `targetedDefinitions` is already returned per model or needs to be added
   as a top-level aggregate. If it exists per model, sum across `visibleModels` in the page.

2. **`fieldPeriodStart` / `fieldPeriodEnd` backend feasibility**: The domain analysis
   resolver (`domain-analysis.ts`) was not read in this session. Confirm that the resolver
   already fetches run `createdAt` values; if not, a targeted Prisma `aggregate` call is
   sufficient (no schema migration needed).

3. **Forest plot in all-domains mode**: When `selectedScope === 'ALL_DOMAINS'`, the drawer
   receives `domainId = null`. The spec says to hide the forest plot in that case. Confirm
   this is acceptable, or whether a cross-domain forest plot (one row per domain) is wanted
   instead.

4. **TrustCard data availability for `wordingEffect`**: The wording-effect gap (A→B vs B→A)
   requires that both framing directions have been run. The `value-detail` resolver tracks
   `directionKey` in `value-win-rate-aggregation.ts` (`directionKey` per group), so the gap
   is computable. Confirm whether this computation should live in the resolver or be derived
   client-side from the vignette-level data already returned.

5. **Methodology URL**: What should `methodologyUrl` point to? A static page on the
   marketing site, a PDF in the repo, or a future `/methodology` route? Flag as TBD until
   decided.

6. **Sparkline in table cells**: Should the table cell display a mini-distribution
   (sparkline) of per-vignette rates instead of just a single summary number? This would
   communicate heterogeneity at a glance without requiring the user to open the drawer, but
   it is a larger UI change and is out of scope for this spec.

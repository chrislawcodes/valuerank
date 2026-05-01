# Cluster Dot Plot

## Summary

Replace `ClusterSmallMultiples` (separate bar panels per cluster, log-odds, no shared axis) with `ClusterDotPlot` (one row per Schwartz value, 4 colored dots on a shared log-odds axis, sorted by spread). Also replace the one-liner help text in `ModelGroupsSection` with a full plain-language methodology explanation covering log-odds, mean-centering, and UPGMA clustering.

## Goals

- One row per value (10 rows), all clusters visible simultaneously on a shared axis.
- Rows sorted by spread (max − min across cluster centroids) descending — most divergent values at top.
- Shared log-odds axis with a vertical zero reference line ("50/50 — equally likely").
- Dot color matches cluster card border color (blue, amber, emerald, rose).
- Replace existing one-liner `?` help text with full high-school-language methodology explanation.
- Delete `ClusterSmallMultiples.tsx`.

## Non-Goals

- No backend changes.
- No whiskers, error bars, or uncertainty encoding.
- No recharts — pure div/CSS only.
- No changes to the cluster cards below the chart.
- No changes to any other section of the Domain Analysis page.

## Implementation

### Delete

`cloud/apps/web/src/components/domains/ClusterSmallMultiples.tsx`

---

### Create: `ClusterDotPlot.tsx`

File: `cloud/apps/web/src/components/domains/ClusterDotPlot.tsx`

**Props:**

```ts
type ClusterDotPlotProps = {
  clusters: DomainCluster[];
};
```

**Imports needed:**
- `useMemo` from `'react'`
- `type DomainCluster` from `'../../api/operations/domainAnalysis'`
- `VALUE_LABELS, VALUES, type ValueKey` from `'../../data/domainAnalysisData'`

**Dot colors (hex, matching cluster card borders):**

```ts
const DOT_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#f43f5e'];
```

Access with `DOT_COLORS[index % DOT_COLORS.length]`.

**Axis bounds:**

Compute global min and max across ALL clusters and ALL values. These define the shared axis.

```ts
const allScores = clusters.flatMap((c) => VALUES.map((vk) => c.centroid[vk] ?? 0));
if (allScores.length === 0) return { axisMin: -1, axisMax: 1 };
const axisMin = Math.min(...allScores);
const axisMax = Math.max(...allScores);
```

Edge case: if `axisMin === axisMax`, set `axisMin = axisMax - 1` so the range is never zero.

**Zero line position:**

```ts
const zeroPos = ((0 - axisMin) / (axisMax - axisMin)) * 100;
// Clamp to [0, 100] so zero line stays inside the axis even if all scores are one-signed.
const zeroPct = Math.max(0, Math.min(100, zeroPos));
```

**Row order:**

Sort `VALUES` by spread descending:

```ts
const sortedValues = [...VALUES].sort((a, b) => {
  const spreadA = Math.max(...clusters.map((c) => c.centroid[a] ?? 0)) -
                  Math.min(...clusters.map((c) => c.centroid[a] ?? 0));
  const spreadB = Math.max(...clusters.map((c) => c.centroid[b] ?? 0)) -
                  Math.min(...clusters.map((c) => c.centroid[b] ?? 0));
  return spreadB - spreadA;
});
```

**Dot x-position for a score:**

```ts
const xPct = ((score - axisMin) / (axisMax - axisMin)) * 100;
```

**Layout:**

- Outer container: `space-y-1 mb-4`
- Axis labels row (top): a single `flex` row with label spacer (`w-32 shrink-0`) then the axis annotation area. Show "← avoided" on the far left and "favored →" on the far right as `text-xs text-gray-400`.
- Zero line label: centered above the zero line, `text-xs text-gray-400`, text "50/50"
- Each value row: `flex items-center gap-2`
  - Label: `text-xs text-gray-700 w-32 shrink-0 text-right pr-2`
  - Axis track: `flex-1 relative h-5`
    - Zero line: `absolute top-0 bottom-0 w-px bg-gray-300` at `left: ${zeroPct}%`
    - For each cluster (in order, so later clusters render on top if overlap): render a `div` with `position: absolute`, inline styles `{ left: \`${xPct}%\`, top: '50%', transform: 'translate(-50%, -50%)', backgroundColor: color, width: '12px', height: '12px', borderRadius: '50%', border: '2px solid white' }`. Do NOT combine Tailwind translate classes with inline transform — use inline styles only for positioning.
    - Each dot has `title={cluster.members.map(m => m.label).join(', ') + ': ' + score.toFixed(2)}` for hover.
    - Known limitation: when dots overlap, only the topmost dot is hoverable. Accepted given the no-recharts constraint.
- Bottom axis label row: same spacer, then axis track with "−" on far left, "0" at `zeroPct`%, "+" on far right — all `text-xs text-gray-400`

**Legend row (below all value rows):**

A `flex flex-wrap gap-3 mt-2` row showing each cluster's color and member labels:

```
● GPT-4o, Claude 3.5   ● Llama 3.3   ...
```

- Each item: `flex items-center gap-1 text-xs text-gray-600`
- Dot: `w-2.5 h-2.5 rounded-full shrink-0` with inline `backgroundColor: color`
- Text: `cluster.members.map(m => m.label).join(', ')` — if `cluster.members` is empty, fall back to `cluster.name`

Use the `useMemo` hook to memoize the derived data: `sortedValues`, `axisMin`, `axisMax`, and `zeroPct`. These recalculate only when `clusters` changes.

**Guard:** Only render when `clusters.length >= 2`. The caller already guards this, but the component should return `null` if `clusters.length < 2` for safety.

---

### Edit: `ModelGroupsSection.tsx`

**Change 1 — swap import:**

Remove:
```ts
import { ClusterSmallMultiples } from './ClusterSmallMultiples';
```

Add:
```ts
import { ClusterDotPlot } from './ClusterDotPlot';
```

**Change 2 — swap component in JSX:**

Remove:
```tsx
{clusters.length >= 2 ? <ClusterSmallMultiples clusters={clusters} /> : null}
```

Add:
```tsx
{clusters.length >= 2 ? <ClusterDotPlot clusters={clusters} /> : null}
```

**Change 3 — replace help panel content:**

Remove the current help div content:
```tsx
<div className="mb-2 rounded-lg border border-blue-100 bg-blue-50 p-2.5 text-xs text-gray-700">
  Models are grouped by overall similarity in full value profiles. Each card name is a shorthand persona,
  then the lines below show what that group prioritizes and de-prioritizes based on cluster centroid scores.
</div>
```

Replace with:
```tsx
<div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-gray-700 space-y-3">
  <div>
    <p className="font-semibold text-gray-800 mb-1">What is a log-odds score?</p>
    <p>
      When we compare two values — like Achievement vs. Hedonism — a model has to pick one. We count
      how many times it picks each, then compute: score = log((wins + 1) / (losses + 1)).
    </p>
    <p className="mt-1">
      <strong>Zero</strong> means the model chose each value equally often.{' '}
      <strong>Positive</strong> means it chose this value more often than not.{' '}
      <strong>Negative</strong> means it avoided this value.
    </p>
    <p className="mt-1">
      Why not just use a percentage? Percentages distort differences at the extremes. A model that
      wins 95% of the time is far stronger than one that wins 90%, but the gap looks small (5 points).
      Log-odds shows this difference properly. The +1 in the formula also prevents extreme results
      when a value was only tested a few times.
    </p>
  </div>
  <div>
    <p className="font-semibold text-gray-800 mb-1">Why do we adjust each model&apos;s scores?</p>
    <p>
      Before grouping, we subtract each model&apos;s own average score from all 10 of its scores.
      This is called mean-centering.
    </p>
    <p className="mt-1">
      Some models have higher scores across many values simply because they have strong preferences
      in general. We don&apos;t want that to drive the grouping. After mean-centering, a positive
      score means &ldquo;this value is above this model&apos;s own average&rdquo; — not just
      &ldquo;this model scores high overall.&rdquo;
    </p>
    <p className="mt-1">Steps: (1) compute log-odds for all 10 values, (2) average those 10 numbers,
      (3) subtract the average from each score. Now we&apos;re comparing the shape of each
      model&apos;s profile — which values it ranks above or below its own typical level.</p>
  </div>
  <div>
    <p className="font-semibold text-gray-800 mb-1">How are the groups formed?</p>
    <p>
      We use a method called UPGMA (Unweighted Pair Group Method with Arithmetic Mean). It builds
      groups like a reverse tournament: start with every model alone, find the two most similar
      models and merge them, repeat until you have 4 groups.
    </p>
    <p className="mt-1">
      Similarity is measured using cosine distance on the mean-centered scores. Think of each
      model&apos;s 10 scores as an arrow pointing in a direction. Two models that rank values in a
      similar order point in nearly the same direction — small distance. Models that disagree on
      priorities point in different directions — large distance.
    </p>
    <p className="mt-1">
      The dot chart above shows all 4 groups on a shared axis. Each row is one value. The further
      apart the dots on a row, the more the groups disagree on that value. Rows are sorted from
      most disagreement (top) to least (bottom).
    </p>
  </div>
</div>
```

---

## Acceptance Criteria

- When 2 or more clusters exist, the dot plot renders above the cluster cards.
- 10 rows appear, sorted from highest spread to lowest.
- Each row has 4 dots (one per cluster) on a shared axis.
- A vertical zero reference line appears with a "50/50" label.
- Dot colors match the cluster card border colors (blue, amber, emerald, rose).
- A legend below the chart shows each cluster's color and member labels.
- The `?` help panel contains the three-section methodology explanation.
- `ClusterSmallMultiples.tsx` no longer exists.
- `npm run lint --workspace @valuerank/web` passes with no new errors.
- `npm run build --workspace @valuerank/web` passes with no type errors.

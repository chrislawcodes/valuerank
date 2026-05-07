# Slice 3 — Frontend Drawer + Forest Plot + Matrix Wiring

## Context
Wave 1, final slice of `forest-plot-pairwise-drawer`. Slices 1 and 2 added the math utilities and the `domainAnalysisPairDetail` GraphQL resolver. This slice adds the UI: a forest plot component, a drawer that hosts it, matrix wiring for click-to-open, and an integration test.

Read these for context before editing:
- `/Users/chrislaw/valuerank/.claude/worktrees/unruffled-thompson-930258/docs/workflow/feature-runs/forest-plot-pairwise-drawer/spec.md` — full spec; especially User Stories 1-4, FR-001 through FR-009, FR-017 through FR-020, Edge Cases (loading state, toggle precedence, empty/single-vignette), Key Entities (`ForestPlotRow`, `ForestPlotProps`, `PairwiseCellDrawerProps`).
- `/Users/chrislaw/valuerank/.claude/worktrees/unruffled-thompson-930258/docs/workflow/feature-runs/forest-plot-pairwise-drawer/plan.md` — Slice 3 section.
- `cloud/apps/web/src/components/domains/PairwiseWinRateMatrix.tsx` — current matrix component you'll extend with new props and click handler.
- `cloud/apps/web/src/components/models/ModelValueDetailDrawer.tsx` — design reference for the new `PairwiseCellDrawer`.
- `cloud/apps/web/src/pages/DomainAnalysis.tsx` — page that hosts the matrix; you'll add drawer state and pass new props.
- `cloud/apps/web/src/api/operations/domainAnalysis.ts` — has the new `DOMAIN_ANALYSIS_PAIR_DETAIL_QUERY` and types from Slice 2.

## What to build

### NEW: `cloud/apps/web/src/components/domains/ForestPlot.tsx`

A pure SVG-based component. Props per spec Key Entities:

```ts
type ForestPlotRow = {
  pairKey: string;
  label: string;
  framingDirection: 'A_TO_B' | 'B_TO_A' | 'AVERAGED';
  pointEstimate: number;
  ciLow: number | null;
  ciHigh: number | null;
  bracketLow: number | null;
  bracketHigh: number | null;
  totalTrials: number;
  prioritized: number;
  refusalRate: number;
  definitionIds: string[];
  directionGap: number | null;
  pairWarn: boolean;
};

type ForestPlotProps = {
  rows: ForestPlotRow[];
  pooledMin: number | null;
  pooledMean: number | null;
  pooledMax: number | null;
  iSquared: number | null;
  splitByDirection: boolean;
  onToggleSplit: () => void;
  onRowClick: (row: ForestPlotRow) => void;
  onRowExpandPair: (pairKey: string) => void; // for pair-averaged rows that span 2 directions
  expandedPairKeys: Set<string>; // pair keys currently expanded inline (only relevant in averaged view)
};
```

Visual spec (FR-003, FR-005, FR-006):
- One SVG, height auto from row count (one row = 28 px; summary band row = 36 px).
- Left column: row labels, right-aligned, max 200 px wide, truncate with ellipsis. Show ⚠ icon (with `title` attr per FR-006) next to labels where `pairWarn` is true.
- Plot area: x-axis from 0% to 100%, dashed vertical reference line at 50% (use a subtle gray, e.g., `stroke="rgba(0,0,0,0.25)"`).
- Per row:
    - Square at `pointEstimate * width`, side length `clamp(sqrt(totalTrials), 4, 12)` px, fill encodes `framingDirection` (e.g., solid for A_TO_B, hollow with same border for B_TO_A, neutral gray for AVERAGED).
    - If `ciLow`/`ciHigh` are non-null, draw a horizontal CI bar from `ciLow*width` to `ciHigh*width`, solid line, round caps.
    - Else if `bracketLow`/`bracketHigh` are non-null AND the gap > 5pp, draw an open-square-endcap dashed bracket from `bracketLow*width` to `bracketHigh*width` (visually distinct from CI bars).
    - If `refusalRate > 0.05`, render a small annotation under the row text (e.g., "refusal: 12%") in muted gray.
- Summary band (last "row"): horizontal line from `pooledMin*width` to `pooledMax*width` with a small triangle/notch at `pooledMean*width`. Suppress entirely if `rows.length < 2` or all of pooledMin/Mean/Max are null.
- I² label: small text below the summary band, e.g., "I² = 73%". Hide if `iSquared` is null.

Interaction:
- Hover row: tooltip with definitionIds (joined), framing direction (or "Averaged across both directions" for AVERAGED rows that span 2 directions), prioritized / totalTrials, refusalRate, and the unrounded numeric Wilson CI bounds when present (e.g., `"95% CI: 0.553 – 0.716"`). For AVERAGED rows that span 2 directions, show direction-specific point estimates explicitly (e.g., `"A→B: 8.8% · B→A: 100%"`).
- Click row:
    - If `framingDirection === 'AVERAGED'` AND `definitionIds.length === 2` (i.e., pair-averaged row spanning two directions), call `onRowExpandPair(pairKey)`.
    - Else (split view, or single-direction averaged row), call `onRowClick(row)`.

The component is presentational — no GraphQL, no urql, no router. Pure props in, callbacks out.

### NEW: `cloud/apps/web/src/components/domains/PairwiseCellDrawer.tsx`

The host that fetches data and turns it into ForestPlotRows.

```ts
type PairwiseCellDrawerProps = {
  open: boolean;
  rowValueKey: ValueKey | null;
  columnValueKey: ValueKey | null;
  modelId: string | null;
  domainId: string | null;
  signature: string | null;
  onClose: () => void;
};
```

Behavior:
- When `open && all keys non-null`, fetch via `DOMAIN_ANALYSIS_PAIR_DETAIL_QUERY` (urql `useQuery`).
- Render header with the value pair, model label, domain name.
- During fetch loading: render a skeleton placeholder for the forest plot area (e.g., 6 horizontal pulsing rectangles).
- On error: render a small error message and a retry button.
- Cell size cases (Edge Cases section of the spec):
    - `vignetteCount === 0`: show "No data available for this pair under the current selection."
    - `vignetteCount > 0 && validEstimateCount === 0`: show "No usable scenarios for this pair — all vignettes had zero trials."
    - `validEstimateCount === 1`: render a single-row forest plot, suppress the summary band, and show a "n = 1, treat with caution" note.
    - `validEstimateCount >= 2`: full forest plot.
- Two-mode UI:
    - Toggle: "Split by direction" (controlled by drawer-local state `splitByDirection`, default `false`).
    - In averaged view, the drawer also tracks `expandedPairKeys: Set<string>` for inline-expanded pair rows.
    - Per FR-005 step 6 & Edge Cases toggle precedence: when `splitByDirection` flips ON, clear `expandedPairKeys`. When it flips OFF, clear `expandedPairKeys`.
- Compute `ForestPlotRow[]` from the resolver result (this is the work of the drawer; it owns the per-vignette → row mapping):
    - **Split view**: one ForestPlotRow per surviving vignette. `framingDirection` from the vignette. Wilson CI from the vignette's bounds. `bracketLow/High` are null. `directionGap = null`, `pairWarn = false`.
    - **Averaged view**:
        - Group vignettes by `definitionId`-pair-key (i.e., the `(otherValueKey)` for the row, which is the same as `columnValueKey` in this drawer). Wait — re-read: vignettes already share rowValueKey/columnValueKey at this drawer's scope (we drilled into one pair). What the spec actually means by "group by other-value pair" only applies when looking at a value cell across pairs (the Win Rate by Values by Model drawer). For the Pairwise drawer we're already inside one value pair. So in averaged view there is at most 2 directions for this pair, expressed as a single row when both exist (or one row if only one exists).
        - Therefore in averaged view there is exactly 1 row when both directions exist (or 1 row when only one exists). The row's pointEstimate is the unweighted mean of the surviving directions' selectedValueWinRate. If both directions exist with non-trivial gap (>5pp), show direction brackets. If gap <=5pp, show only the square. If only one direction exists, use its CI bar (no bracket).
        - directionGap = `|rateA→B - rateB→A|` in pp when both directions exist with non-null rates; null otherwise.
        - pairWarn = `directionGap !== null && directionGap > 15`.
        - definitionIds = the surviving vignettes' definitionIds (1 or 2 entries).
    - When user expands the averaged row inline (`expandedPairKeys` contains the pair key), also include the two split rows beneath the averaged row. Visual indentation may help.
- Click navigation (FR-008): when `onRowClick` fires for a single-vignette row, navigate to the existing per-vignette detail page using `react-router-dom`. The existing destination is what `ModelValueDetailDrawer` uses for domain link clicks — re-read that file to find the route shape; mirror it.
- Selection-change lifecycle (FR-002): the parent (DomainAnalysis) closes the drawer on selection change; this drawer doesn't need to do anything special on that front.

### EXTEND: `cloud/apps/web/src/components/domains/PairwiseWinRateMatrix.tsx`

Add new props (FR-017):

```ts
type PairwiseWinRateMatrixProps = {
  models: ModelPairwiseWinRates[]; // existing
  selectedModelId: string | null; // NEW
  domainId: string | null; // NEW
  signature: string | null; // NEW
  onCellClick: (rowValueKey: ValueKey, columnValueKey: ValueKey) => void; // NEW
};
```

Make non-diagonal cells interactive ONLY when ALL of: `selectedModelId !== null && domainId !== null && signature !== null && rowValueKey !== columnValueKey`. Interactive cells get cursor pointer, click handler, and an accessible role/aria-label like `"Open drilldown for {row} vs {column}"`. Non-interactive cells stay rendered as today (no cursor pointer, no click handler, no aria role).

Do not change the cell value rendering, color coding, or grouping/header logic.

### EXTEND: `cloud/apps/web/src/pages/DomainAnalysis.tsx`

Add drawer state and selection wiring:
- New state: `const [openPair, setOpenPair] = useState<{ row: ValueKey; column: ValueKey } | null>(null);`
- Derive `selectedModelId` from current selection: if exactly one model is selected, use its id; else `null`. Re-read the existing selection state in this file to mirror its conventions.
- Effect: clear `openPair` (set to null) whenever any of `selectedModelId`, `domainId`, `signature` changes (FR-002).
- Pass `selectedModelId`, `domainId`, `signature`, `(row, column) => setOpenPair({ row, column })` as new props to `<PairwiseWinRateMatrix>`.
- Render `<PairwiseCellDrawer open={openPair !== null} ... onClose={() => setOpenPair(null)} />` at the page level (not inside the matrix component).

### NEW: Integration test for the drawer

Add a test under `cloud/apps/web/src/components/domains/__tests__/PairwiseCellDrawer.test.tsx` (or wherever the existing web tests live — re-read the project structure to match). Use vitest + React Testing Library. Mock the GraphQL response. Cover:
- Drawer opens with a forest plot when given a valid pair + model + domain + signature.
- The displayed mean matches the input mean.
- Toggling "Split by direction" changes the row count.

If the existing web test infrastructure doesn't support urql-mocked queries cleanly, write the test against the inner derive-rows function or against ForestPlot directly with synthetic input. The goal is to cover the per-vignette → row mapping logic.

## DO NOT MODIFY

- `CLAUDE.md`, `AGENTS.md`, `cloud/CLAUDE.md`, `cloud/AGENTS.md`, `cloud/agents.md`, `MEMORY.md`, `.gitignore`
- Slice 1 files (`binomial-ci.ts`, `pairwise-math.ts`)
- Slice 2 files (`pair-detail.ts`, `pair-detail-types.ts`, `aggregation.ts` extracted helper, `domainAnalysis.graphql`, `schema.graphql`, `generated/graphql.ts`, `domainAnalysis.ts`)
- Existing `ModelValueDetailDrawer.tsx` — read it for design reference but do not edit it
- The existing `pairwiseWinRates` matrix data flow
- If you think another file needs updating, note it in your output but do not write it.

## Verification

Run from `cloud/` and report results:

1. `npx turbo lint --filter=@valuerank/web`
2. `DATABASE_URL="postgresql://valuerank:valuerank@localhost:5433/valuerank_test" JWT_SECRET="test-secret-that-is-at-least-32-characters-long" npm --workspace @valuerank/web exec -- vitest run` (passes including new test)
3. `npx turbo build --filter=@valuerank/web`

All MUST pass with no errors and no `@ts-ignore` directives.

## Output

Print a summary of new and changed files. Confirm verification commands pass. Note any places where the spec was ambiguous and you made a judgment call so Sonnet can review intentionally. Do not commit — Sonnet will commit after reviewing.

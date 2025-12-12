# Cross-Run Comparison Components

This directory contains components for comparing analysis results across multiple evaluation runs.

## Quick Start

```tsx
import {
  RunSelector,
  ComparisonFilters,
  VisualizationNav,
  registerVisualization,
  type ComparisonVisualizationProps,
} from '@/components/compare';
```

## Architecture Overview

```
compare/
├── index.ts              # Re-exports all components, types, and registry
├── types.ts              # TypeScript type definitions
├── README.md             # This file
│
├── RunSelector.tsx       # Multi-select run picker with search
├── RunSelectorItem.tsx   # Individual run card component
├── ComparisonHeader.tsx  # Selected runs summary chips
├── ComparisonFilters.tsx # Model/value/display mode filters
├── VisualizationNav.tsx  # Tab navigation for visualizations
│
└── visualizations/
    ├── registry.tsx      # Visualization registration system
    ├── OverviewViz.tsx   # Aggregate stats and effect sizes
    ├── DecisionsViz.tsx  # Decision distribution comparison
    └── ValuesViz.tsx     # Value win rate comparison
```

## Adding a New Visualization

Adding a new visualization requires only ~50 lines of code. Follow these steps:

### Step 1: Create the Component

Create a new file in `visualizations/` implementing `ComparisonVisualizationProps`:

```tsx
// visualizations/MyViz.tsx
import type { ComparisonVisualizationProps } from '../types';

export function MyViz({ runs, filters, onFilterChange, statistics }: ComparisonVisualizationProps) {
  return (
    <div className="space-y-4">
      <h3>My Visualization</h3>
      <p>Comparing {runs.length} runs</p>

      {/* Your visualization content */}
      {runs.map(run => (
        <div key={run.id}>
          {run.definition?.name}: {run.aggregateStats?.overallMean.toFixed(2)}
        </div>
      ))}
    </div>
  );
}
```

### Step 2: Register the Visualization

Add registration to `visualizations/registry.tsx`:

```tsx
import { MyIcon } from 'lucide-react';
import { MyViz } from './MyViz';

registerVisualization({
  id: 'my-viz',           // Must match a VisualizationType
  label: 'My Viz',        // Tab label
  icon: MyIcon,           // Lucide icon
  component: MyViz,       // Your component
  minRuns: 2,             // Minimum runs required
  description: 'Description shown on hover',
});
```

### Step 3: Add Type (if new ID)

If using a new visualization ID, add it to `types.ts`:

```ts
export type VisualizationType =
  | 'overview'
  | 'decisions'
  | 'values'
  | 'timeline'
  | 'scenarios'
  | 'definition'
  | 'my-viz';  // Add here
```

### Step 4: Export (optional)

Add to `index.ts` if external import needed:

```ts
export { MyViz } from './visualizations/MyViz';
```

## Props Reference

### ComparisonVisualizationProps

All visualization components receive these props:

| Prop | Type | Description |
|------|------|-------------|
| `runs` | `RunWithAnalysis[]` | Selected runs with analysis data |
| `filters` | `ComparisonFilters` | Current filter state (model, value, displayMode) |
| `onFilterChange` | `(filters) => void` | Callback to update filters |
| `statistics` | `ComparisonStatistics?` | Computed comparison statistics |

### RunWithAnalysis

Each run in the `runs` array contains:

```ts
type RunWithAnalysis = {
  id: string;
  definition?: { name: string; ... };
  analysis: AnalysisResult | null;
  aggregateStats?: {
    overallMean: number;
    overallStdDev: number;
    sampleCount: number;
  };
  valueWinRates?: { valueName: string; winRate: number; }[];
};
```

### ComparisonStatistics

Pre-computed comparison data:

```ts
type ComparisonStatistics = {
  runPairs: RunPairComparison[];  // Pairwise effect sizes
  commonModels: string[];          // Models in all runs
  uniqueModels: Record<string, string[]>;
  summary: {
    totalRuns: number;
    totalSamples: number;
    meanDecisionRange: [number, number];
  };
};
```

## Using Filters

Your visualization can read and update filters:

```tsx
function MyViz({ filters, onFilterChange }: ComparisonVisualizationProps) {
  // Read current filter
  const selectedModel = filters.model;

  // Update a single filter (preserves others)
  const handleModelChange = (model: string) => {
    onFilterChange({ model });
  };

  // Use display mode
  const isOverlay = filters.displayMode === 'overlay';

  return (
    <select value={selectedModel ?? ''} onChange={e => handleModelChange(e.target.value)}>
      <option value="">All Models</option>
      {/* ... */}
    </select>
  );
}
```

## Common Patterns

### Extracting Decision Data

```tsx
function getDecisionData(runs: RunWithAnalysis[], modelFilter?: string) {
  return runs.map(run => {
    const vizData = run.analysis?.visualizationData?.decisionDistribution;
    if (!vizData) return null;

    // Filter by model if specified
    const models = modelFilter
      ? { [modelFilter]: vizData[modelFilter] }
      : vizData;

    return { runId: run.id, data: models };
  }).filter(Boolean);
}
```

### Computing Aggregates

```tsx
function computeRunMean(run: RunWithAnalysis): number {
  return run.aggregateStats?.overallMean ?? 0;
}
```

### Using Statistics

```tsx
function showEffectSizes({ statistics }: ComparisonVisualizationProps) {
  if (!statistics?.runPairs.length) return null;

  return statistics.runPairs.map(pair => (
    <div key={`${pair.run1Id}-${pair.run2Id}`}>
      Effect Size: {pair.effectSize.toFixed(2)} ({pair.effectInterpretation})
    </div>
  ));
}
```

## Statistical Utilities

Import from `@/lib/statistics`:

```tsx
import { cohensD, interpretCohenD } from '@/lib/statistics';

const result = cohensD(mean1, std1, n1, mean2, std2, n2);
// { d: 0.45, interpretation: 'small' }
```

## Testing

Test files go in `tests/components/compare/visualizations/`:

```tsx
// tests/components/compare/visualizations/MyViz.test.tsx
import { render, screen } from '@testing-library/react';
import { MyViz } from '@/components/compare/visualizations/MyViz';

describe('MyViz', () => {
  const mockRuns = [/* ... */];
  const mockFilters = { displayMode: 'overlay' as const };

  it('renders run count', () => {
    render(
      <MyViz
        runs={mockRuns}
        filters={mockFilters}
        onFilterChange={() => {}}
      />
    );
    expect(screen.getByText(/2 runs/)).toBeInTheDocument();
  });
});
```

## URL State

Visualization selection and filters are persisted in URL:

```
/compare?runs=id1,id2&viz=decisions&model=gpt-4o&display=side-by-side
```

The `useComparisonState` hook manages this automatically.

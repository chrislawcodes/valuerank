/**
 * Visualization Registry for Cross-Run Comparison
 *
 * Register new visualizations by:
 * 1. Create a component implementing ComparisonVisualizationProps
 * 2. Import and register it in this file
 * 3. The visualization will automatically appear in the navigation
 *
 * Example registration:
 * ```ts
 * import { MyViz } from './MyViz';
 * registerVisualization({
 *   id: 'my-viz',
 *   label: 'My Visualization',
 *   icon: ChartIcon,
 *   component: MyViz,
 *   minRuns: 2,
 *   description: 'Description of what this shows',
 * });
 * ```
 */

import { LayoutDashboard, BarChart3, TrendingUp, LineChart } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { VisualizationType, ComparisonVisualizationProps } from '../types';
import { OverviewViz } from './OverviewViz';
import { DecisionsViz } from './DecisionsViz';
import { ValuesViz } from './ValuesViz';
import { TimelineViz } from './TimelineViz';

// ============================================================================
// TYPES
// ============================================================================

export type VisualizationRegistration = {
  /** Unique identifier matching VisualizationType */
  id: VisualizationType;
  /** Display name shown in tabs */
  label: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** React component implementing ComparisonVisualizationProps */
  component: React.ComponentType<ComparisonVisualizationProps>;
  /** Minimum runs required (usually 2) */
  minRuns: number;
  /** Description shown on hover/help */
  description: string;
};

// ============================================================================
// REGISTRY
// ============================================================================

const visualizationRegistry = new Map<VisualizationType, VisualizationRegistration>();

/**
 * Register a visualization in the comparison system.
 * Call this when setting up visualizations.
 */
export function registerVisualization(registration: VisualizationRegistration): void {
  if (visualizationRegistry.has(registration.id)) {
    console.warn(`Visualization '${registration.id}' is already registered. Overwriting.`);
  }
  visualizationRegistry.set(registration.id, registration);
}

/**
 * Get a visualization by ID.
 * Returns null if not found.
 */
export function getVisualization(id: VisualizationType): VisualizationRegistration | null {
  return visualizationRegistry.get(id) ?? null;
}

/**
 * Get all registered visualizations.
 * Returns an array sorted by registration order.
 */
export function listVisualizations(): VisualizationRegistration[] {
  return Array.from(visualizationRegistry.values());
}

/**
 * Get visualizations that are available for the given number of runs.
 * Filters out visualizations where minRuns > runCount.
 */
export function getAvailableVisualizations(runCount: number): VisualizationRegistration[] {
  return listVisualizations().filter((viz) => runCount >= viz.minRuns);
}

/**
 * Check if a visualization ID is valid and registered.
 */
export function isValidVisualization(id: string): id is VisualizationType {
  return visualizationRegistry.has(id as VisualizationType);
}

/**
 * Get the default visualization ID.
 * Returns 'overview' if registered, otherwise the first registered visualization.
 */
export function getDefaultVisualization(): VisualizationType {
  if (visualizationRegistry.has('overview')) {
    return 'overview';
  }
  const first = listVisualizations()[0];
  return first?.id ?? 'overview';
}

// ============================================================================
// PLACEHOLDER COMPONENT
// ============================================================================

/**
 * Placeholder component shown when a visualization is not yet implemented.
 */
export function PlaceholderVisualization({ runs }: ComparisonVisualizationProps) {
  return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <div className="text-center">
        <p className="text-lg font-medium">Visualization Coming Soon</p>
        <p className="text-sm mt-1">
          Comparing {runs.length} runs
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// REGISTER VISUALIZATIONS
// ============================================================================

// Register Overview visualization
registerVisualization({
  id: 'overview',
  label: 'Overview',
  icon: LayoutDashboard,
  component: OverviewViz,
  minRuns: 2,
  description: 'High-level comparison of aggregate statistics, effect sizes, and model coverage',
});

// Register Decisions visualization
registerVisualization({
  id: 'decisions',
  label: 'Decisions',
  icon: BarChart3,
  component: DecisionsViz,
  minRuns: 2,
  description: 'Compare decision distributions (1-5 scale) across runs with KS statistics',
});

// Register Values visualization
registerVisualization({
  id: 'values',
  label: 'Values',
  icon: TrendingUp,
  component: ValuesViz,
  minRuns: 2,
  description: 'Compare value win rates across runs with significance highlighting',
});

// Register Timeline visualization
registerVisualization({
  id: 'timeline',
  label: 'Timeline',
  icon: LineChart,
  component: TimelineViz,
  minRuns: 2,
  description: 'Track model behavioral drift over time across runs',
});

/**
 * Cross-Run Comparison Components
 *
 * Re-exports all comparison-related components and types.
 *
 * @example
 * ```tsx
 * import {
 *   RunSelector,
 *   ComparisonFilters,
 *   VisualizationNav,
 *   registerVisualization,
 *   type ComparisonVisualizationProps,
 * } from '@/components/compare';
 * ```
 */

// ============================================================================
// COMPONENTS
// ============================================================================

export { RunSelector } from './RunSelector';
export { RunSelectorItem } from './RunSelectorItem';
export { ComparisonHeader } from './ComparisonHeader';
export { ComparisonFilters } from './ComparisonFilters';
export { VisualizationNav } from './VisualizationNav';

// ============================================================================
// VISUALIZATIONS
// ============================================================================

export { OverviewViz } from './visualizations/OverviewViz';
export { DecisionsViz } from './visualizations/DecisionsViz';
export { ValuesViz } from './visualizations/ValuesViz';
export { TimelineViz } from './visualizations/TimelineViz';

// ============================================================================
// TYPES
// ============================================================================

export type {
  // URL state types
  VisualizationType,
  DisplayMode,
  ComparisonConfig,
  ComparisonFilters as ComparisonFiltersType,
  // Data types
  RunWithAnalysis,
  ComparisonStatistics,
  RunPairComparison,
  EffectSizeInterpretation,
  AggregateStats,
  ValueWinRate,
  // Visualization types
  ComparisonVisualizationProps,
  VisualizationRegistration,
  DecisionDistribution,
  ValueComparison,
  TimelineDataPoint,
  TimelineMetric,
} from './types';

// ============================================================================
// VISUALIZATION REGISTRY
// ============================================================================

export {
  registerVisualization,
  getVisualization,
  listVisualizations,
  getAvailableVisualizations,
  isValidVisualization,
  getDefaultVisualization,
  PlaceholderVisualization,
} from './visualizations/registry';

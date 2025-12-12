/**
 * Cross-Run Comparison Components
 *
 * Re-exports all comparison-related components and types.
 */

// Components
export { RunSelector } from './RunSelector';
export { RunSelectorItem } from './RunSelectorItem';
export { ComparisonHeader } from './ComparisonHeader';

// Types
export type {
  VisualizationType,
  DisplayMode,
  ComparisonConfig,
  ComparisonFilters,
  RunWithAnalysis,
  ComparisonStatistics,
  RunPairComparison,
  EffectSizeInterpretation,
  ComparisonVisualizationProps,
  VisualizationRegistration,
  DecisionDistribution,
  ValueComparison,
  TimelineDataPoint,
  TimelineMetric,
  AggregateStats,
  ValueWinRate,
} from './types';

// Visualization registry
export {
  registerVisualization,
  getVisualization,
  listVisualizations,
  getAvailableVisualizations,
  isValidVisualization,
  getDefaultVisualization,
  PlaceholderVisualization,
} from './visualizations/registry';

/**
 * Types for cross-run comparison feature
 */

import type { LucideIcon } from 'lucide-react';
import type { AnalysisResult } from '../../api/operations/analysis';
import type { ComparisonRun } from '../../api/operations/comparison';

// ============================================================================
// URL STATE TYPES
// ============================================================================

export type VisualizationType = 'overview' | 'decisions' | 'values' | 'timeline' | 'scenarios' | 'definition';

export type DisplayMode = 'overlay' | 'side-by-side';

/**
 * Comparison configuration stored in URL
 */
export type ComparisonConfig = {
  runIds: string[];
  visualization: VisualizationType;
  filters: ComparisonFilters;
};

/**
 * Filter state for comparison visualizations
 */
export type ComparisonFilters = {
  /** Filter to specific model */
  model?: string;
  /** Filter to specific value */
  value?: string;
  /** Display mode for charts */
  displayMode: DisplayMode;
};

// ============================================================================
// DATA TYPES
// ============================================================================

/**
 * Run with its analysis data for comparison.
 * Extends ComparisonRun with derived aggregate statistics.
 */
export type RunWithAnalysis = ComparisonRun & {
  /** Full analysis result (from ComparisonRun) */
  analysis: AnalysisResult | null;
  /** Definition content for diff view */
  definitionContent?: {
    preamble: string;
    template: string;
  };
  /** Computed aggregate statistics across all models */
  aggregateStats?: AggregateStats;
  /** Computed value win rates across all models */
  valueWinRates?: ValueWinRate[];
};

/**
 * Aggregate statistics computed from per-model data
 */
export type AggregateStats = {
  overallMean: number;
  overallStdDev: number;
  sampleCount: number;
};

/**
 * Value win rate computed across all models
 */
export type ValueWinRate = {
  valueName: string;
  winRate: number;
};

/**
 * Computed statistics for comparing runs
 */
export type ComparisonStatistics = {
  /** Pairwise comparisons between runs */
  runPairs: RunPairComparison[];
  /** Models that appear in all selected runs */
  commonModels: string[];
  /** Models unique to each run */
  uniqueModels: Record<string, string[]>;
  /** Overall summary */
  summary: {
    totalRuns: number;
    totalSamples: number;
    meanDecisionRange: [number, number];
  };
};

/**
 * Comparison statistics between two runs
 */
export type RunPairComparison = {
  run1Id: string;
  run2Id: string;
  /** Difference in mean decision */
  meanDifference: number;
  /** Cohen's d effect size */
  effectSize: number;
  /** Interpretation of effect size */
  effectInterpretation: EffectSizeInterpretation;
  /** KS statistic for distribution comparison */
  ksStatistic?: number;
  /** Values with significant win rate changes */
  significantValueChanges: string[];
};

export type EffectSizeInterpretation = 'negligible' | 'small' | 'medium' | 'large';

// ============================================================================
// VISUALIZATION TYPES
// ============================================================================

/**
 * Props passed to all comparison visualizations
 */
export type ComparisonVisualizationProps = {
  /** Selected runs with their analysis data */
  runs: RunWithAnalysis[];
  /** Current filter state */
  filters: ComparisonFilters;
  /** Callback to update filters */
  onFilterChange: (filters: Partial<ComparisonFilters>) => void;
  /** Computed comparison statistics */
  statistics?: ComparisonStatistics;
};

/**
 * Registration for a comparison visualization
 */
export type VisualizationRegistration = {
  /** Unique identifier */
  id: VisualizationType;
  /** Display name */
  label: string;
  /** Icon component */
  icon: LucideIcon;
  /** React component */
  component: React.ComponentType<ComparisonVisualizationProps>;
  /** Minimum runs required */
  minRuns: number;
  /** Help text */
  description: string;
};

// ============================================================================
// DECISION DISTRIBUTION TYPES
// ============================================================================

/**
 * Decision count for a single run/model
 */
export type DecisionDistribution = {
  runId: string;
  modelId?: string;
  /** Counts for each decision value (1-5) */
  counts: Record<number, number>;
  /** Total samples */
  total: number;
  /** Mean decision */
  mean: number;
  /** Standard deviation */
  stdDev: number;
};

// ============================================================================
// VALUE COMPARISON TYPES
// ============================================================================

/**
 * Value win rate comparison across runs
 */
export type ValueComparison = {
  valueName: string;
  /** Win rate per run */
  runWinRates: {
    runId: string;
    winRate: number;
    confidenceInterval: {
      lower: number;
      upper: number;
    };
    sampleSize: number;
  }[];
  /** Whether this value shows significant change */
  hasSignificantChange: boolean;
  /** Maximum difference in win rate between runs */
  maxDifference: number;
};

// ============================================================================
// TIMELINE TYPES
// ============================================================================

/**
 * Data point for timeline visualization
 */
export type TimelineDataPoint = {
  runId: string;
  runName: string;
  date: Date;
  modelId: string;
  /** Metric value (mean, stdDev, or win rate) */
  value: number;
  /** Optional second metric for range display */
  upperBound?: number;
  lowerBound?: number;
};

/**
 * Metric options for timeline visualization
 */
export type TimelineMetric = 'mean' | 'stdDev' | 'valueWinRate';

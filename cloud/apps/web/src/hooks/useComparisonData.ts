/**
 * Hook for fetching comparison data
 *
 * Handles fetching both available runs and selected runs with full analysis data.
 */

import { useQuery } from 'urql';
import { useMemo } from 'react';
import {
  RUNS_WITH_ANALYSIS_QUERY,
  COMPARISON_RUNS_LIST_QUERY,
  type ComparisonRun,
  type RunsWithAnalysisQueryVariables,
  type RunsWithAnalysisQueryResult,
  type ComparisonRunsListQueryVariables,
  type ComparisonRunsListQueryResult,
} from '../api/operations/comparison';
import type { AnalysisResult, PerModelStats } from '../api/operations/analysis';
import type {
  RunWithAnalysis,
  ComparisonStatistics,
  AggregateStats,
  ValueWinRate,
} from '../components/compare/types';
import { cohensD } from '../lib/statistics/cohens-d';

type UseComparisonDataOptions = {
  /** IDs of runs to fetch with full analysis */
  selectedRunIds: string[];
  /** Filter available runs by definition */
  definitionId?: string;
  /** Only show runs with CURRENT analysis */
  onlyCurrent?: boolean;
};

type UseComparisonDataResult = {
  /** Runs available for selection (with analysis) */
  availableRuns: ComparisonRun[];
  /** Selected runs with full analysis data */
  selectedRuns: RunWithAnalysis[];
  /** Computed comparison statistics */
  statistics: ComparisonStatistics | null;
  /** Loading state for available runs */
  loadingAvailable: boolean;
  /** Loading state for selected runs */
  loadingSelected: boolean;
  /** Error from either query */
  error: Error | null;
  /** Refetch available runs */
  refetchAvailable: () => void;
  /** Refetch selected runs */
  refetchSelected: () => void;
  /** IDs of selected runs that have no analysis */
  missingAnalysisIds: string[];
};

/**
 * Hook for fetching comparison data.
 */
export function useComparisonData(options: UseComparisonDataOptions): UseComparisonDataResult {
  const { selectedRunIds, definitionId, onlyCurrent = true } = options;

  // Fetch available runs for selection
  const [availableResult, refetchAvailable] = useQuery<
    ComparisonRunsListQueryResult,
    ComparisonRunsListQueryVariables
  >({
    query: COMPARISON_RUNS_LIST_QUERY,
    variables: {
      definitionId,
      analysisStatus: onlyCurrent ? 'CURRENT' : undefined,
      limit: 50,
    },
    requestPolicy: 'cache-and-network',
  });

  // Fetch selected runs with full analysis data
  // Use network-only to ensure we get fresh data with analysis field
  // (cache-and-network can return stale data from list query without analysis)
  const [selectedResult, refetchSelected] = useQuery<
    RunsWithAnalysisQueryResult,
    RunsWithAnalysisQueryVariables
  >({
    query: RUNS_WITH_ANALYSIS_QUERY,
    variables: { ids: selectedRunIds },
    pause: selectedRunIds.length === 0,
    requestPolicy: 'network-only',
  });

  // Transform selected runs to RunWithAnalysis type with computed aggregates
  const selectedRuns = useMemo<RunWithAnalysis[]>(() => {
    const runs = selectedResult.data?.runsWithAnalysis ?? [];

    // Maintain order of selectedRunIds
    return selectedRunIds
      .map((id) => runs.find((r) => r.id === id))
      .filter((r): r is ComparisonRun => r !== undefined)
      .map((run) => {
        const aggregateStats = run.analysis
          ? computeAggregateStats(run.analysis)
          : undefined;
        const valueWinRates = run.analysis
          ? computeValueWinRates(run.analysis)
          : undefined;

        // Extract preamble/template from resolvedContent JSON
        const resolvedContent = run.definition?.resolvedContent;
        const definitionContent = resolvedContent
          ? {
              preamble: resolvedContent.preamble || '',
              template: resolvedContent.template || '',
            }
          : undefined;

        return {
          ...run,
          definitionContent,
          aggregateStats,
          valueWinRates,
        };
      });
  }, [selectedResult.data, selectedRunIds]);

  // Find runs without analysis
  const missingAnalysisIds = useMemo(
    () => selectedRuns.filter((r) => !r.analysis).map((r) => r.id),
    [selectedRuns]
  );

  // Compute comparison statistics
  const statistics = useMemo<ComparisonStatistics | null>(() => {
    if (selectedRuns.length < 2) return null;

    const runsWithAnalysis = selectedRuns.filter((r) => r.analysis && r.aggregateStats);
    if (runsWithAnalysis.length < 2) return null;

    // Compute run pairs with effect sizes
    const runPairs = computeRunPairs(runsWithAnalysis);

    // Find common and unique models
    const { commonModels, uniqueModels } = computeModelSets(runsWithAnalysis);

    // Compute summary
    const summary = computeSummary(runsWithAnalysis);

    return {
      runPairs,
      commonModels,
      uniqueModels,
      summary,
    };
  }, [selectedRuns]);

  // Combine errors
  const error = availableResult.error
    ? new Error(availableResult.error.message)
    : selectedResult.error
      ? new Error(selectedResult.error.message)
      : null;

  return {
    availableRuns: availableResult.data?.runs ?? [],
    selectedRuns,
    statistics,
    loadingAvailable: availableResult.fetching,
    loadingSelected: selectedResult.fetching,
    error,
    refetchAvailable: () => refetchAvailable({ requestPolicy: 'network-only' }),
    refetchSelected: () => refetchSelected({ requestPolicy: 'network-only' }),
    missingAnalysisIds,
  };
}

/**
 * Compute aggregate statistics from per-model data
 */
function computeAggregateStats(analysis: AnalysisResult): AggregateStats {
  const perModel = analysis.perModel;
  const models = Object.keys(perModel);

  if (models.length === 0) {
    return { overallMean: 0, overallStdDev: 0, sampleCount: 0 };
  }

  // Compute weighted mean and total sample count
  let totalSamples = 0;
  let weightedMeanSum = 0;
  let weightedVarianceSum = 0;

  for (const model of models) {
    const stats = perModel[model] as PerModelStats;
    const n = stats.sampleSize;
    const mean = stats.overall.mean;
    const stdDev = stats.overall.stdDev;

    totalSamples += n;
    weightedMeanSum += mean * n;
    weightedVarianceSum += (stdDev ** 2 + mean ** 2) * n;
  }

  const overallMean = totalSamples > 0 ? weightedMeanSum / totalSamples : 0;
  const overallVariance = totalSamples > 0
    ? weightedVarianceSum / totalSamples - overallMean ** 2
    : 0;
  const overallStdDev = Math.sqrt(Math.max(0, overallVariance));

  return {
    overallMean,
    overallStdDev,
    sampleCount: totalSamples,
  };
}

/**
 * Compute value win rates averaged across all models
 */
function computeValueWinRates(analysis: AnalysisResult): ValueWinRate[] {
  const perModel = analysis.perModel;
  const models = Object.keys(perModel);

  if (models.length === 0) return [];

  // Collect all values across all models
  const valueWinRateMap = new Map<string, { totalWinRate: number; count: number }>();

  for (const model of models) {
    const stats = perModel[model] as PerModelStats;
    const values = stats.values;

    for (const [valueName, valueStats] of Object.entries(values)) {
      const existing = valueWinRateMap.get(valueName) ?? { totalWinRate: 0, count: 0 };
      existing.totalWinRate += valueStats.winRate;
      existing.count += 1;
      valueWinRateMap.set(valueName, existing);
    }
  }

  // Compute average win rate per value
  const result: ValueWinRate[] = [];
  valueWinRateMap.forEach((data, valueName) => {
    result.push({
      valueName,
      winRate: data.count > 0 ? data.totalWinRate / data.count : 0,
    });
  });

  // Sort by win rate descending
  result.sort((a, b) => b.winRate - a.winRate);

  return result;
}

/**
 * Compute pairwise comparisons between runs
 */
function computeRunPairs(
  runs: RunWithAnalysis[]
): ComparisonStatistics['runPairs'] {
  const pairs: ComparisonStatistics['runPairs'] = [];

  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const run1 = runs[i]!;
      const run2 = runs[j]!;
      const stats1 = run1.aggregateStats;
      const stats2 = run2.aggregateStats;

      if (!stats1 || !stats2) continue;

      const meanDifference = stats1.overallMean - stats2.overallMean;

      // Calculate Cohen's d
      const effect = cohensD(
        stats1.overallMean,
        stats1.overallStdDev,
        stats1.sampleCount,
        stats2.overallMean,
        stats2.overallStdDev,
        stats2.sampleCount
      );

      // Find significant value changes (>10% difference in win rate)
      const significantValueChanges = findSignificantValueChanges(
        run1.valueWinRates ?? [],
        run2.valueWinRates ?? []
      );

      pairs.push({
        run1Id: run1.id,
        run2Id: run2.id,
        meanDifference,
        effectSize: effect.absD,
        effectInterpretation: effect.interpretation,
        significantValueChanges,
      });
    }
  }

  return pairs;
}

/**
 * Find models common to all runs vs unique to each run
 */
function computeModelSets(runs: RunWithAnalysis[]): {
  commonModels: string[];
  uniqueModels: Record<string, string[]>;
} {
  const modelSets = runs.map(
    (r) => new Set(r.config.models as string[])
  );

  // Common models: intersection of all sets
  const firstSet = modelSets[0];
  const commonModels = firstSet
    ? [...firstSet].filter((m) => modelSets.every((s) => s.has(m)))
    : [];

  // Unique models: in this run but not all others
  const uniqueModels: Record<string, string[]> = {};
  runs.forEach((run, i) => {
    const models = modelSets[i]!;
    uniqueModels[run.id] = [...models].filter(
      (m) => !commonModels.includes(m)
    );
  });

  return { commonModels, uniqueModels };
}

/**
 * Compute summary statistics across all runs
 */
function computeSummary(
  runs: RunWithAnalysis[]
): ComparisonStatistics['summary'] {
  const means = runs
    .filter((r) => r.aggregateStats)
    .map((r) => r.aggregateStats!.overallMean);

  const totalSamples = runs
    .filter((r) => r.aggregateStats)
    .reduce((sum, r) => sum + r.aggregateStats!.sampleCount, 0);

  return {
    totalRuns: runs.length,
    totalSamples,
    meanDecisionRange: means.length > 0
      ? [Math.min(...means), Math.max(...means)]
      : [0, 0],
  };
}

/**
 * Find values with >10% win rate difference between runs
 */
function findSignificantValueChanges(
  winRates1: ValueWinRate[],
  winRates2: ValueWinRate[]
): string[] {
  const SIGNIFICANCE_THRESHOLD = 0.1;
  const significantChanges: string[] = [];

  // Build map of value win rates
  const rateMap1 = new Map(winRates1.map((v) => [v.valueName, v.winRate]));
  const rateMap2 = new Map(winRates2.map((v) => [v.valueName, v.winRate]));

  // Find values present in both with significant difference
  const allValues = new Set([...rateMap1.keys(), ...rateMap2.keys()]);
  allValues.forEach((value) => {
    const rate1 = rateMap1.get(value);
    const rate2 = rateMap2.get(value);

    if (rate1 !== undefined && rate2 !== undefined) {
      if (Math.abs(rate1 - rate2) >= SIGNIFICANCE_THRESHOLD) {
        significantChanges.push(value);
      }
    }
  });

  return significantChanges;
}

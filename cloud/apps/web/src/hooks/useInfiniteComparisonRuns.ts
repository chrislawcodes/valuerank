/**
 * useInfiniteComparisonRuns Hook
 *
 * Hook for infinite scrolling through runs with analysis data for comparison.
 * Wraps the generic useInfiniteQuery with comparison-specific configuration.
 */

import { useMemo, useCallback } from 'react';
import {
  COMPARISON_RUNS_LIST_QUERY,
  type ComparisonRun,
  type ComparisonRunsListQueryVariables,
  type ComparisonRunsListQueryResult,
} from '../api/operations/comparison';
import {
  RUN_COUNT_QUERY,
  type RunCountQueryResult,
} from '../api/operations/runs';
import { useInfiniteQuery, type UseInfiniteQueryResult } from './useInfiniteQuery';
import { isNonSurveyRun } from '../lib/runClassification';

type UseInfiniteComparisonRunsOptions = {
  definitionId?: string;
  analysisStatus?: 'CURRENT' | 'SUPERSEDED';
  pageSize?: number;
  pause?: boolean;
};

type UseInfiniteComparisonRunsResult = UseInfiniteQueryResult<ComparisonRun> & {
  /** Alias for items to match previous API */
  runs: ComparisonRun[];
};

/**
 * Hook for infinite scrolling through comparison runs.
 * Loads pages incrementally and concatenates results.
 */
export function useInfiniteComparisonRuns(
  options: UseInfiniteComparisonRunsOptions = {}
): UseInfiniteComparisonRunsResult {
  const { definitionId, analysisStatus, pageSize, pause = false } = options;

  // Build filters object
  // Note: hasAnalysis is hardcoded as true in COMPARISON_RUNS_LIST_QUERY
  const filters = useMemo(
    () => ({
      definitionId: definitionId || undefined,
      analysisStatus: analysisStatus || undefined,
    }),
    [definitionId, analysisStatus]
  );

  // Count query variables
  // Note: hasAnalysis needs to be passed for runCount query
  const countVariables = useMemo(
    () => ({
      hasAnalysis: true as const,
      definitionId: definitionId || undefined,
      analysisStatus: analysisStatus || undefined,
    }),
    [definitionId, analysisStatus]
  );

  // Extract runs from query result
  const getItems = useCallback(
    (data: ComparisonRunsListQueryResult) => data.runs ?? [],
    []
  );

  const getCount = useCallback(
    (data: unknown) => (data as RunCountQueryResult).runCount,
    []
  );

  const result = useInfiniteQuery<
    ComparisonRunsListQueryResult,
    ComparisonRunsListQueryVariables,
    ComparisonRun
  >({
    query: COMPARISON_RUNS_LIST_QUERY,
    filters,
    getItems,
    countQuery: RUN_COUNT_QUERY,
    countVariables,
    getCount,
    pageSize,
    pause,
  });

  const nonSurveyRuns = useMemo(
    () => result.items.filter(isNonSurveyRun),
    [result.items]
  );

  return {
    ...result,
    items: nonSurveyRuns,
    runs: nonSurveyRuns,
  };
}

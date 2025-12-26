/**
 * useInfiniteRunsWithAnalysis Hook
 *
 * Hook for infinite scrolling through runs that have analysis results.
 * Wraps the generic useInfiniteQuery with analysis-specific configuration.
 */

import { useMemo, useCallback } from 'react';
import {
  RUNS_QUERY,
  type Run,
  type RunsQueryVariables,
  type RunsQueryResult,
} from '../api/operations/runs';
import { useInfiniteQuery, type UseInfiniteQueryResult } from './useInfiniteQuery';

type UseInfiniteRunsWithAnalysisOptions = {
  analysisStatus?: 'CURRENT' | 'SUPERSEDED';
  definitionId?: string;
  pageSize?: number;
  pause?: boolean;
};

type UseInfiniteRunsWithAnalysisResult = UseInfiniteQueryResult<Run> & {
  /** Alias for items to match previous API */
  runs: Run[];
};

/**
 * Hook for infinite scrolling through runs with analysis results.
 * Loads pages incrementally and concatenates results.
 */
export function useInfiniteRunsWithAnalysis(
  options: UseInfiniteRunsWithAnalysisOptions = {}
): UseInfiniteRunsWithAnalysisResult {
  const { analysisStatus, definitionId, pageSize, pause = false } = options;

  // Build filters object
  const filters = useMemo(
    () => ({
      hasAnalysis: true,
      analysisStatus: analysisStatus || undefined,
      definitionId: definitionId || undefined,
    }),
    [analysisStatus, definitionId]
  );

  // Count query filters
  const countFilters = useMemo(
    () => ({
      hasAnalysis: true as const,
      analysisStatus: analysisStatus || undefined,
      definitionId: definitionId || undefined,
    }),
    [analysisStatus, definitionId]
  );

  // Extract runs from query result
  const getItems = useCallback(
    (data: RunsQueryResult) => data.runs ?? [],
    []
  );

  const result = useInfiniteQuery<RunsQueryResult, RunsQueryVariables, Run>({
    query: RUNS_QUERY,
    filters,
    getItems,
    countFilters,
    pageSize,
    pause,
  });

  return {
    ...result,
    runs: result.items,
  };
}

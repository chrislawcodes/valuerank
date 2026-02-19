/**
 * useInfiniteRunsWithAnalysis Hook
 *
 * Hook for infinite scrolling through runs that have analysis results.
 * Wraps the generic useInfiniteQuery with analysis-specific configuration.
 */

import { useMemo, useCallback } from 'react';
import {
  RUNS_QUERY,
  RUN_COUNT_QUERY,
  type Run,
  type RunsQueryVariables,
  type RunsQueryResult,
  type RunCountQueryResult,
} from '../api/operations/runs';
import { useInfiniteQuery, type UseInfiniteQueryResult } from './useInfiniteQuery';
import { isNonSurveyRun } from '../lib/runClassification';

type UseInfiniteRunsWithAnalysisOptions = {
  analysisStatus?: 'CURRENT' | 'SUPERSEDED';
  definitionId?: string;
  experimentId?: string;
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
  const { analysisStatus, definitionId, experimentId, pageSize, pause = false } = options;

  // Build filters object
  const filters = useMemo(
    () => ({
      hasAnalysis: true,
      analysisStatus: analysisStatus || undefined,
      definitionId: definitionId || undefined,
      experimentId: experimentId || undefined,
    }),
    [analysisStatus, definitionId, experimentId]
  );

  // Count query variables
  const countVariables = useMemo(
    () => ({
      hasAnalysis: true as const,
      analysisStatus: analysisStatus || undefined,
      definitionId: definitionId || undefined,
      experimentId: experimentId || undefined,
    }),
    [analysisStatus, definitionId, experimentId]
  );

  // Extract runs from query result
  const getItems = useCallback(
    (data: RunsQueryResult) => data.runs ?? [],
    []
  );

  const getCount = useCallback(
    (data: unknown) => (data as RunCountQueryResult).runCount,
    []
  );

  const result = useInfiniteQuery<RunsQueryResult, RunsQueryVariables, Run>({
    query: RUNS_QUERY,
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

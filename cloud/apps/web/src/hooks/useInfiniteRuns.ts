/**
 * useInfiniteRuns Hook
 *
 * Hook for infinite scrolling through runs.
 * Wraps the generic useInfiniteQuery with run-specific configuration.
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

type UseInfiniteRunsOptions = {
  definitionId?: string;
  experimentId?: string;
  status?: string;
  runType?: 'nonSurvey' | 'survey' | 'all';
  pageSize?: number;
  pause?: boolean;
};

type UseInfiniteRunsResult = UseInfiniteQueryResult<Run> & {
  /** Alias for items to match previous API */
  runs: Run[];
};

/**
 * Hook for infinite scrolling through runs.
 * Loads pages incrementally and concatenates results.
 */
export function useInfiniteRuns(options: UseInfiniteRunsOptions = {}): UseInfiniteRunsResult {
  const {
    definitionId,
    experimentId,
    status,
    runType = 'nonSurvey',
    pageSize,
    pause = false,
  } = options;
  const runTypeFilter: 'ALL' | 'SURVEY' | 'NON_SURVEY' = runType === 'all'
    ? 'ALL'
    : runType === 'survey'
      ? 'SURVEY'
      : 'NON_SURVEY';

  // Build filters object
  const filters = useMemo(
    () => ({
      definitionId: definitionId || undefined,
      experimentId: experimentId || undefined,
      status: status || undefined,
      runType: runTypeFilter,
    }),
    [definitionId, experimentId, status, runTypeFilter]
  );

  // Count query variables
  const countVariables = useMemo(
    () => ({
      definitionId: definitionId || undefined,
      experimentId: experimentId || undefined,
      status: status || undefined,
      runType: runTypeFilter,
    }),
    [definitionId, experimentId, status, runTypeFilter]
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

  return {
    ...result,
    runs: result.items,
  };
}

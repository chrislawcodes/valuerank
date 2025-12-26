/**
 * useInfiniteComparisonRuns Hook
 *
 * Hook for infinite scrolling through runs with analysis data for comparison.
 * Loads pages incrementally and concatenates results.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery } from 'urql';
import {
  COMPARISON_RUNS_LIST_QUERY,
  type ComparisonRun,
  type ComparisonRunsListQueryVariables,
  type ComparisonRunsListQueryResult,
} from '../api/operations/comparison';
import {
  RUN_COUNT_QUERY,
  type RunCountQueryVariables,
  type RunCountQueryResult,
} from '../api/operations/runs';

const DEFAULT_PAGE_SIZE = 25;

type UseInfiniteComparisonRunsOptions = {
  definitionId?: string;
  analysisStatus?: 'CURRENT' | 'SUPERSEDED';
  pageSize?: number;
  pause?: boolean;
};

type UseInfiniteComparisonRunsResult = {
  runs: ComparisonRun[];
  loading: boolean;
  loadingMore: boolean;
  error: Error | null;
  hasNextPage: boolean;
  totalCount: number | null;
  loadMore: () => void;
  refetch: () => void;
};

/**
 * Hook for infinite scrolling through comparison runs.
 * Loads pages incrementally and concatenates results.
 */
export function useInfiniteComparisonRuns(
  options: UseInfiniteComparisonRunsOptions = {}
): UseInfiniteComparisonRunsResult {
  const { definitionId, analysisStatus, pageSize = DEFAULT_PAGE_SIZE, pause = false } = options;

  // Track loaded pages and all runs
  const [allRuns, setAllRuns] = useState<ComparisonRun[]>([]);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const prevFiltersRef = useRef({ definitionId, analysisStatus });

  // Variables for the current page query
  // Note: hasAnalysis is hardcoded as true in COMPARISON_RUNS_LIST_QUERY
  const variables: ComparisonRunsListQueryVariables = {
    definitionId: definitionId || undefined,
    analysisStatus: analysisStatus || undefined,
    limit: pageSize,
    offset: currentOffset,
  };

  // Count query variables
  // Note: hasAnalysis needs to be passed for runCount query
  const countVariables: RunCountQueryVariables = {
    hasAnalysis: true,
    definitionId: definitionId || undefined,
    analysisStatus: analysisStatus || undefined,
  };

  // Fetch current page
  const [runsResult, reexecuteQuery] = useQuery<
    ComparisonRunsListQueryResult,
    ComparisonRunsListQueryVariables
  >({
    query: COMPARISON_RUNS_LIST_QUERY,
    variables,
    pause,
    requestPolicy: 'cache-and-network',
  });

  // Fetch total count
  const [countResult] = useQuery<RunCountQueryResult, RunCountQueryVariables>({
    query: RUN_COUNT_QUERY,
    variables: countVariables,
    pause,
    requestPolicy: 'cache-and-network',
  });

  const totalCount = countResult.data?.runCount ?? null;

  // Reset when filters change
  useEffect(() => {
    const filtersChanged =
      prevFiltersRef.current.definitionId !== definitionId ||
      prevFiltersRef.current.analysisStatus !== analysisStatus;

    if (filtersChanged) {
      setAllRuns([]);
      setCurrentOffset(0);
      setIsLoadingMore(false);
      prevFiltersRef.current = { definitionId, analysisStatus };
    }
  }, [definitionId, analysisStatus]);

  // Append new runs when data arrives
  useEffect(() => {
    if (runsResult.data?.runs && !runsResult.fetching) {
      const newRuns = runsResult.data.runs;

      if (currentOffset === 0) {
        // First page - replace all
        setAllRuns(newRuns);
      } else {
        // Subsequent pages - append (avoid duplicates by ID)
        setAllRuns((prev) => {
          const existingIds = new Set(prev.map((r) => r.id));
          const uniqueNewRuns = newRuns.filter((r) => !existingIds.has(r.id));
          return [...prev, ...uniqueNewRuns];
        });
      }
      setIsLoadingMore(false);
    }
  }, [runsResult.data?.runs, runsResult.fetching, currentOffset]);

  // Check if there are more pages
  const hasNextPage = totalCount !== null
    ? allRuns.length < totalCount
    : (runsResult.data?.runs?.length ?? 0) === pageSize;

  // Load next page
  const loadMore = useCallback(() => {
    if (!hasNextPage || isLoadingMore || runsResult.fetching) {
      return;
    }
    setIsLoadingMore(true);
    setCurrentOffset((prev) => prev + pageSize);
  }, [hasNextPage, isLoadingMore, runsResult.fetching, pageSize]);

  // Full refetch (reset and reload)
  const refetch = useCallback(() => {
    setAllRuns([]);
    setCurrentOffset(0);
    setIsLoadingMore(false);
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [reexecuteQuery]);

  return {
    runs: allRuns,
    loading: runsResult.fetching && allRuns.length === 0,
    loadingMore: isLoadingMore || (runsResult.fetching && allRuns.length > 0),
    error: runsResult.error ? new Error(runsResult.error.message) : null,
    hasNextPage,
    totalCount,
    loadMore,
    refetch,
  };
}

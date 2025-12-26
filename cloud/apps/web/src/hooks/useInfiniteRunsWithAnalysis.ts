/**
 * useInfiniteRunsWithAnalysis Hook
 *
 * Hook for infinite scrolling through runs that have analysis results.
 * Loads pages incrementally and concatenates results.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery } from 'urql';
import {
  RUNS_QUERY,
  RUN_COUNT_QUERY,
  type Run,
  type RunsQueryVariables,
  type RunsQueryResult,
  type RunCountQueryVariables,
  type RunCountQueryResult,
} from '../api/operations/runs';

const DEFAULT_PAGE_SIZE = 25;

type UseInfiniteRunsWithAnalysisOptions = {
  analysisStatus?: 'CURRENT' | 'SUPERSEDED';
  definitionId?: string;
  pageSize?: number;
  pause?: boolean;
};

type UseInfiniteRunsWithAnalysisResult = {
  runs: Run[];
  loading: boolean;
  loadingMore: boolean;
  error: Error | null;
  hasNextPage: boolean;
  totalCount: number | null;
  loadMore: () => void;
  refetch: () => void;
};

/**
 * Hook for infinite scrolling through runs with analysis results.
 * Loads pages incrementally and concatenates results.
 */
export function useInfiniteRunsWithAnalysis(
  options: UseInfiniteRunsWithAnalysisOptions = {}
): UseInfiniteRunsWithAnalysisResult {
  const { analysisStatus, definitionId, pageSize = DEFAULT_PAGE_SIZE, pause = false } = options;

  // Track loaded pages and all runs
  const [allRuns, setAllRuns] = useState<Run[]>([]);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const prevFiltersRef = useRef({ analysisStatus, definitionId });

  // Variables for the current page query
  const variables: RunsQueryVariables = {
    hasAnalysis: true,
    analysisStatus: analysisStatus || undefined,
    definitionId: definitionId || undefined,
    limit: pageSize,
    offset: currentOffset,
  };

  // Count query variables
  const countVariables: RunCountQueryVariables = {
    hasAnalysis: true,
    analysisStatus: analysisStatus || undefined,
    definitionId: definitionId || undefined,
  };

  // Fetch current page
  const [runsResult, reexecuteQuery] = useQuery<RunsQueryResult, RunsQueryVariables>({
    query: RUNS_QUERY,
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
      prevFiltersRef.current.analysisStatus !== analysisStatus ||
      prevFiltersRef.current.definitionId !== definitionId;

    if (filtersChanged) {
      setAllRuns([]);
      setCurrentOffset(0);
      setIsLoadingMore(false);
      prevFiltersRef.current = { analysisStatus, definitionId };
    }
  }, [analysisStatus, definitionId]);

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

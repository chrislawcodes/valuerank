/**
 * useInfiniteQuery Hook
 *
 * Generic hook for infinite scrolling through paginated GraphQL queries.
 * Handles offset-based pagination, filter resets, and deduplication.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, type DocumentInput, type AnyVariables } from 'urql';
import {
  RUN_COUNT_QUERY,
  type RunCountQueryVariables,
  type RunCountQueryResult,
} from '../api/operations/runs';

const DEFAULT_PAGE_SIZE = 25;

type FilterValue = string | boolean | number | undefined;

export type UseInfiniteQueryOptions<
  TData,
  TVariables extends AnyVariables,
  TItem extends { id: string },
> = {
  /** The GraphQL query document */
  query: DocumentInput<TData, TVariables>;
  /** Filter variables (excluding limit/offset) */
  filters: Record<string, FilterValue>;
  /** Function to extract items array from query result */
  getItems: (data: TData) => TItem[];
  /** Variables for the count query (filters that match runCount) */
  countFilters?: RunCountQueryVariables;
  /** Page size for pagination */
  pageSize?: number;
  /** Whether to pause the query */
  pause?: boolean;
};

export type UseInfiniteQueryResult<TItem> = {
  items: TItem[];
  loading: boolean;
  loadingMore: boolean;
  error: Error | null;
  hasNextPage: boolean;
  totalCount: number | null;
  loadMore: () => void;
  refetch: () => void;
};

/**
 * Generic hook for infinite scrolling through paginated queries.
 * Loads pages incrementally and concatenates results.
 */
export function useInfiniteQuery<
  TData,
  TVariables extends AnyVariables,
  TItem extends { id: string },
>(
  options: UseInfiniteQueryOptions<TData, TVariables, TItem>
): UseInfiniteQueryResult<TItem> {
  const {
    query,
    filters,
    getItems,
    countFilters,
    pageSize = DEFAULT_PAGE_SIZE,
    pause = false,
  } = options;

  // Track loaded pages and all items
  const [allItems, setAllItems] = useState<TItem[]>([]);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Track previous filters to detect changes
  const prevFiltersRef = useRef<string>(JSON.stringify(filters));

  // Build variables with pagination
  const variables = {
    ...filters,
    limit: pageSize,
    offset: currentOffset,
  } as unknown as TVariables;

  // Fetch current page
  const [result, reexecuteQuery] = useQuery<TData, TVariables>({
    query,
    variables,
    pause,
    requestPolicy: 'cache-and-network',
  });

  // Fetch total count (if count filters provided)
  const [countResult] = useQuery<RunCountQueryResult, RunCountQueryVariables>({
    query: RUN_COUNT_QUERY,
    variables: countFilters ?? {},
    pause: pause || !countFilters,
    requestPolicy: 'cache-and-network',
  });

  const totalCount = countResult.data?.runCount ?? null;

  // Reset when filters change
  useEffect(() => {
    const currentFiltersStr = JSON.stringify(filters);
    if (prevFiltersRef.current !== currentFiltersStr) {
      setAllItems([]);
      setCurrentOffset(0);
      setIsLoadingMore(false);
      prevFiltersRef.current = currentFiltersStr;
    }
  }, [filters]);

  // Append new items when data arrives
  useEffect(() => {
    if (result.data && !result.fetching) {
      const newItems = getItems(result.data);

      if (currentOffset === 0) {
        // First page - replace all
        setAllItems(newItems);
      } else {
        // Subsequent pages - append (avoid duplicates by ID)
        setAllItems((prev) => {
          const existingIds = new Set(prev.map((item) => item.id));
          const uniqueNewItems = newItems.filter((item) => !existingIds.has(item.id));
          return [...prev, ...uniqueNewItems];
        });
      }
      setIsLoadingMore(false);
    }
  }, [result.data, result.fetching, currentOffset, getItems]);

  // Check if there are more pages
  const currentPageItems = result.data ? getItems(result.data) : [];
  const hasNextPage = totalCount !== null
    ? allItems.length < totalCount
    : currentPageItems.length === pageSize;

  // Load next page
  const loadMore = useCallback(() => {
    if (!hasNextPage || isLoadingMore || result.fetching) {
      return;
    }
    setIsLoadingMore(true);
    setCurrentOffset((prev) => prev + pageSize);
  }, [hasNextPage, isLoadingMore, result.fetching, pageSize]);

  // Full refetch (reset and reload)
  const refetch = useCallback(() => {
    setAllItems([]);
    setCurrentOffset(0);
    setIsLoadingMore(false);
    reexecuteQuery({ requestPolicy: 'network-only' });
  }, [reexecuteQuery]);

  return {
    items: allItems,
    loading: result.fetching && allItems.length === 0,
    loadingMore: isLoadingMore || (result.fetching && allItems.length > 0),
    error: result.error ? new Error(result.error.message) : null,
    hasNextPage,
    totalCount,
    loadMore,
    refetch,
  };
}

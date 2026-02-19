/**
 * useInfiniteDefinitions Hook
 *
 * Hook for infinite scrolling through definitions (vignettes).
 * Wraps the generic useInfiniteQuery with definition-specific configuration.
 */

import { useMemo, useCallback } from 'react';
import {
  DEFINITIONS_QUERY,
  DEFINITION_COUNT_QUERY,
  type Definition,
  type DefinitionsQueryVariables,
  type DefinitionsQueryResult,
  type DefinitionCountQueryResult,
} from '../api/operations/definitions';
import { useInfiniteQuery, type UseInfiniteQueryResult } from './useInfiniteQuery';

type UseInfiniteDefinitionsOptions = {
  search?: string;
  rootOnly?: boolean;
  tagIds?: string[];
  hasRuns?: boolean;
  pageSize?: number;
  pause?: boolean;
};

type UseInfiniteDefinitionsResult = UseInfiniteQueryResult<Definition> & {
  /** Alias for items to match previous API */
  definitions: Definition[];
};

/**
 * Hook for infinite scrolling through definitions.
 * Loads pages incrementally and concatenates results.
 */
export function useInfiniteDefinitions(
  options: UseInfiniteDefinitionsOptions = {}
): UseInfiniteDefinitionsResult {
  const {
    search,
    rootOnly,
    tagIds,
    hasRuns,
    pageSize,
    pause = false,
  } = options;

  // Build filters object
  const filters = useMemo(
    () => ({
      search: search || undefined,
      rootOnly: rootOnly || undefined,
      tagIds: tagIds?.length ? tagIds : undefined,
      hasRuns: hasRuns || undefined,
    }),
    [search, rootOnly, tagIds, hasRuns]
  );

  // Count query variables (same filters, no limit/offset)
  const countVariables = useMemo(
    () => ({
      search: search || undefined,
      rootOnly: rootOnly || undefined,
      tagIds: tagIds?.length ? tagIds : undefined,
      hasRuns: hasRuns || undefined,
    }),
    [search, rootOnly, tagIds, hasRuns]
  );

  // Extract definitions from query result
  const getItems = useCallback(
    (data: DefinitionsQueryResult) => data.definitions ?? [],
    []
  );

  const getCount = useCallback(
    (data: unknown) => (data as DefinitionCountQueryResult).definitionCount,
    []
  );

  const result = useInfiniteQuery<
    DefinitionsQueryResult,
    DefinitionsQueryVariables,
    Definition
  >({
    query: DEFINITIONS_QUERY,
    filters,
    getItems,
    countQuery: DEFINITION_COUNT_QUERY,
    countVariables,
    getCount,
    pageSize,
    pause,
  });

  return {
    ...result,
    definitions: result.items,
  };
}

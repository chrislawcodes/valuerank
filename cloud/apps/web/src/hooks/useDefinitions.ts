import { useQuery } from 'urql';
import {
  DEFINITIONS_QUERY,
  type Definition,
  type DefinitionsQueryVariables,
  type DefinitionsQueryResult,
} from '../api/operations/definitions';

type UseDefinitionsOptions = {
  rootOnly?: boolean;
  search?: string;
  tagIds?: string[];
  hasRuns?: boolean;
  limit?: number;
  offset?: number;
};

type UseDefinitionsResult = {
  definitions: Definition[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

export function useDefinitions(options: UseDefinitionsOptions = {}): UseDefinitionsResult {
  const variables: DefinitionsQueryVariables = {
    rootOnly: options.rootOnly,
    search: options.search || undefined,
    tagIds: options.tagIds?.length ? options.tagIds : undefined,
    hasRuns: options.hasRuns,
    limit: options.limit ?? 20,
    offset: options.offset ?? 0,
  };

  const [result, reexecuteQuery] = useQuery<DefinitionsQueryResult, DefinitionsQueryVariables>({
    query: DEFINITIONS_QUERY,
    variables,
    // Always fetch fresh data - show cached first, then update with network response
    requestPolicy: 'cache-and-network',
  });

  return {
    definitions: result.data?.definitions ?? [],
    loading: result.fetching,
    error: result.error ? new Error(result.error.message) : null,
    refetch: () => reexecuteQuery({ requestPolicy: 'network-only' }),
  };
}

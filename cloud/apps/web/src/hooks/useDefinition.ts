import { useQuery } from 'urql';
import {
  DEFINITION_QUERY,
  type Definition,
  type DefinitionQueryVariables,
  type DefinitionQueryResult,
} from '../api/operations/definitions';

type UseDefinitionOptions = {
  id: string;
  pause?: boolean;
};

type UseDefinitionResult = {
  definition: Definition | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

export function useDefinition({ id, pause = false }: UseDefinitionOptions): UseDefinitionResult {
  const [result, reexecuteQuery] = useQuery<DefinitionQueryResult, DefinitionQueryVariables>({
    query: DEFINITION_QUERY,
    variables: { id },
    pause,
  });

  return {
    definition: result.data?.definition ?? null,
    loading: result.fetching,
    error: result.error ? new Error(result.error.message) : null,
    refetch: () => reexecuteQuery({ requestPolicy: 'network-only' }),
  };
}

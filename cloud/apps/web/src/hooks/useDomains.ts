import { useMutation, useQuery } from 'urql';
import {
  DOMAINS_QUERY,
  CREATE_DOMAIN_MUTATION,
  RENAME_DOMAIN_MUTATION,
  DELETE_DOMAIN_MUTATION,
  ASSIGN_DOMAIN_TO_DEFINITIONS_MUTATION,
  ASSIGN_DOMAIN_TO_DEFINITIONS_BY_FILTER_MUTATION,
  type Domain,
  type DomainsQueryResult,
  type DomainsQueryVariables,
} from '../api/operations/domains';

type UseDomainsResult = {
  domains: Domain[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  createDomain: (name: string) => Promise<Domain | null>;
  renameDomain: (id: string, name: string) => Promise<Domain | null>;
  deleteDomain: (id: string) => Promise<{ success: boolean; affectedDefinitions: number } | null>;
  assignDomainToDefinitions: (definitionIds: string[], domainId: string | null) => Promise<{ success: boolean; affectedDefinitions: number } | null>;
  assignDomainToDefinitionsByFilter: (input: {
    domainId: string | null;
    rootOnly?: boolean;
    search?: string;
    tagIds?: string[];
    hasRuns?: boolean;
    sourceDomainId?: string;
    withoutDomain?: boolean;
  }) => Promise<{ success: boolean; affectedDefinitions: number } | null>;
};

export function useDomains(): UseDomainsResult {
  const [queryResult, reexecuteQuery] = useQuery<DomainsQueryResult, DomainsQueryVariables>({
    query: DOMAINS_QUERY,
    variables: { limit: 500, offset: 0 },
    requestPolicy: 'cache-and-network',
  });
  const [createResult, createMutation] = useMutation(CREATE_DOMAIN_MUTATION);
  const [renameResult, renameMutation] = useMutation(RENAME_DOMAIN_MUTATION);
  const [deleteResult, deleteMutation] = useMutation(DELETE_DOMAIN_MUTATION);
  const [assignIdsResult, assignIdsMutation] = useMutation(ASSIGN_DOMAIN_TO_DEFINITIONS_MUTATION);
  const [assignFilterResult, assignFilterMutation] = useMutation(ASSIGN_DOMAIN_TO_DEFINITIONS_BY_FILTER_MUTATION);

  const refetch = () => reexecuteQuery({ requestPolicy: 'network-only' });

  const createDomain = async (name: string): Promise<Domain | null> => {
    const result = await createMutation({ name });
    if (result.error) throw new Error(result.error.message);
    refetch();
    return (result.data as { createDomain?: Domain } | undefined)?.createDomain ?? null;
  };

  const renameDomain = async (id: string, name: string): Promise<Domain | null> => {
    const result = await renameMutation({ id, name });
    if (result.error) throw new Error(result.error.message);
    refetch();
    return (result.data as { renameDomain?: Domain } | undefined)?.renameDomain ?? null;
  };

  const deleteDomain = async (id: string): Promise<{ success: boolean; affectedDefinitions: number } | null> => {
    const result = await deleteMutation({ id });
    if (result.error) throw new Error(result.error.message);
    refetch();
    return (result.data as { deleteDomain?: { success: boolean; affectedDefinitions: number } } | undefined)?.deleteDomain ?? null;
  };

  const assignDomainToDefinitions = async (
    definitionIds: string[],
    domainId: string | null
  ): Promise<{ success: boolean; affectedDefinitions: number } | null> => {
    const result = await assignIdsMutation({ definitionIds, domainId: domainId ?? undefined });
    if (result.error) throw new Error(result.error.message);
    return (result.data as { assignDomainToDefinitions?: { success: boolean; affectedDefinitions: number } } | undefined)?.assignDomainToDefinitions ?? null;
  };

  const assignDomainToDefinitionsByFilter = async (input: {
    domainId: string | null;
    rootOnly?: boolean;
    search?: string;
    tagIds?: string[];
    hasRuns?: boolean;
    sourceDomainId?: string;
    withoutDomain?: boolean;
  }): Promise<{ success: boolean; affectedDefinitions: number } | null> => {
    const result = await assignFilterMutation({
      ...input,
      domainId: input.domainId ?? undefined,
      sourceDomainId: input.sourceDomainId ?? undefined,
    });
    if (result.error) throw new Error(result.error.message);
    return (result.data as { assignDomainToDefinitionsByFilter?: { success: boolean; affectedDefinitions: number } } | undefined)?.assignDomainToDefinitionsByFilter ?? null;
  };

  return {
    domains: queryResult.data?.domains ?? [],
    loading:
      queryResult.fetching ||
      createResult.fetching ||
      renameResult.fetching ||
      deleteResult.fetching ||
      assignIdsResult.fetching ||
      assignFilterResult.fetching,
    error: queryResult.error ? new Error(queryResult.error.message) : null,
    refetch,
    createDomain,
    renameDomain,
    deleteDomain,
    assignDomainToDefinitions,
    assignDomainToDefinitionsByFilter,
  };
}

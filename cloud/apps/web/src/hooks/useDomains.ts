import { useMutation, useQuery } from 'urql';
import {
  DOMAINS_QUERY,
  CREATE_DOMAIN_MUTATION,
  RENAME_DOMAIN_MUTATION,
  DELETE_DOMAIN_MUTATION,
  ASSIGN_DOMAIN_TO_DEFINITIONS_MUTATION,
  ASSIGN_DOMAIN_TO_DEFINITIONS_BY_FILTER_MUTATION,
  RUN_TRIALS_FOR_DOMAIN_MUTATION,
  type Domain,
  type DomainMutationResult,
  type DomainsQueryResult,
  type DomainsQueryVariables,
  type CreateDomainMutationResult,
  type CreateDomainMutationVariables,
  type RenameDomainMutationResult,
  type RenameDomainMutationVariables,
  type DeleteDomainMutationResult,
  type DeleteDomainMutationVariables,
  type AssignDomainToDefinitionsMutationResult,
  type AssignDomainToDefinitionsMutationVariables,
  type AssignDomainToDefinitionsByFilterMutationResult,
  type AssignDomainToDefinitionsByFilterMutationVariables,
  type RunTrialsForDomainMutationResult,
  type RunTrialsForDomainMutationVariables,
} from '../api/operations/domains';

type RunTrialsForDomainResult = RunTrialsForDomainMutationResult['runTrialsForDomain'];

type UseDomainsResult = {
  domains: Domain[];
  loading: boolean;
  queryLoading: boolean;
  creating: boolean;
  renaming: boolean;
  deleting: boolean;
  assigningByIds: boolean;
  assigningByFilter: boolean;
  runningDomainTrials: boolean;
  error: Error | null;
  refetch: () => void;
  createDomain: (name: string) => Promise<Domain | null>;
  renameDomain: (id: string, name: string) => Promise<Domain | null>;
  deleteDomain: (id: string) => Promise<DomainMutationResult | null>;
  assignDomainToDefinitions: (definitionIds: string[], domainId: string | null) => Promise<DomainMutationResult | null>;
  assignDomainToDefinitionsByFilter: (input: {
    domainId: string | null;
    rootOnly?: boolean;
    search?: string;
    tagIds?: string[];
    hasRuns?: boolean;
    sourceDomainId?: string;
    withoutDomain?: boolean;
  }) => Promise<DomainMutationResult | null>;
  runTrialsForDomain: (domainId: string, temperature?: number) => Promise<RunTrialsForDomainResult | null>;
};

export function useDomains(): UseDomainsResult {
  const [queryResult, reexecuteQuery] = useQuery<DomainsQueryResult, DomainsQueryVariables>({
    query: DOMAINS_QUERY,
    variables: { limit: 500, offset: 0 },
    requestPolicy: 'cache-and-network',
  });
  const [createResult, createMutation] = useMutation<CreateDomainMutationResult, CreateDomainMutationVariables>(CREATE_DOMAIN_MUTATION);
  const [renameResult, renameMutation] = useMutation<RenameDomainMutationResult, RenameDomainMutationVariables>(RENAME_DOMAIN_MUTATION);
  const [deleteResult, deleteMutation] = useMutation<DeleteDomainMutationResult, DeleteDomainMutationVariables>(DELETE_DOMAIN_MUTATION);
  const [assignIdsResult, assignIdsMutation] = useMutation<AssignDomainToDefinitionsMutationResult, AssignDomainToDefinitionsMutationVariables>(ASSIGN_DOMAIN_TO_DEFINITIONS_MUTATION);
  const [assignFilterResult, assignFilterMutation] = useMutation<AssignDomainToDefinitionsByFilterMutationResult, AssignDomainToDefinitionsByFilterMutationVariables>(ASSIGN_DOMAIN_TO_DEFINITIONS_BY_FILTER_MUTATION);
  const [runTrialsResult, runTrialsMutation] = useMutation<RunTrialsForDomainMutationResult, RunTrialsForDomainMutationVariables>(RUN_TRIALS_FOR_DOMAIN_MUTATION);

  const refetch = () => reexecuteQuery({ requestPolicy: 'network-only' });

  const createDomain = async (name: string): Promise<Domain | null> => {
    const result = await createMutation({ name });
    if (result.error) throw new Error(result.error.message);
    refetch();
    return result.data?.createDomain ?? null;
  };

  const renameDomain = async (id: string, name: string): Promise<Domain | null> => {
    const result = await renameMutation({ id, name });
    if (result.error) throw new Error(result.error.message);
    refetch();
    return result.data?.renameDomain ?? null;
  };

  const deleteDomain = async (id: string): Promise<DomainMutationResult | null> => {
    const result = await deleteMutation({ id });
    if (result.error) throw new Error(result.error.message);
    refetch();
    return result.data?.deleteDomain ?? null;
  };

  const assignDomainToDefinitions = async (
    definitionIds: string[],
    domainId: string | null
  ): Promise<DomainMutationResult | null> => {
    const result = await assignIdsMutation({ definitionIds, domainId });
    if (result.error) throw new Error(result.error.message);
    return result.data?.assignDomainToDefinitions ?? null;
  };

  const assignDomainToDefinitionsByFilter = async (input: {
    domainId: string | null;
    rootOnly?: boolean;
    search?: string;
    tagIds?: string[];
    hasRuns?: boolean;
    sourceDomainId?: string;
    withoutDomain?: boolean;
  }): Promise<DomainMutationResult | null> => {
    const result = await assignFilterMutation({
      ...input,
      domainId: input.domainId,
      sourceDomainId: input.sourceDomainId ?? undefined,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data?.assignDomainToDefinitionsByFilter ?? null;
  };

  const runTrialsForDomain = async (
    domainId: string,
    temperature?: number
  ): Promise<RunTrialsForDomainResult | null> => {
    const result = await runTrialsMutation({ domainId, temperature });
    if (result.error) throw new Error(result.error.message);
    const payload = result.data?.runTrialsForDomain ?? null;
    if (payload && payload.failedDefinitions > 0) {
      throw new Error(
        `Started ${payload.startedRuns}/${payload.targetedDefinitions} domain trials; ${payload.failedDefinitions} failed to start.`
      );
    }
    return payload;
  };

  return {
    domains: queryResult.data?.domains ?? [],
    // Aggregate loading flag for simple screens. Prefer granular flags for precise UX control.
    loading:
      queryResult.fetching ||
      createResult.fetching ||
      renameResult.fetching ||
      deleteResult.fetching ||
      assignIdsResult.fetching ||
      assignFilterResult.fetching ||
      runTrialsResult.fetching,
    queryLoading: queryResult.fetching,
    creating: createResult.fetching,
    renaming: renameResult.fetching,
    deleting: deleteResult.fetching,
    assigningByIds: assignIdsResult.fetching,
    assigningByFilter: assignFilterResult.fetching,
    runningDomainTrials: runTrialsResult.fetching,
    error: queryResult.error ? new Error(queryResult.error.message) : null,
    refetch,
    createDomain,
    renameDomain,
    deleteDomain,
    assignDomainToDefinitions,
    assignDomainToDefinitionsByFilter,
    runTrialsForDomain,
  };
}

import { gql } from 'urql';

export type Domain = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  definitionCount: number;
};

export const DOMAINS_QUERY = gql`
  query Domains($search: String, $limit: Int, $offset: Int) {
    domains(search: $search, limit: $limit, offset: $offset) {
      id
      name
      createdAt
      updatedAt
      definitionCount
    }
  }
`;

export const CREATE_DOMAIN_MUTATION = gql`
  mutation CreateDomain($name: String!) {
    createDomain(name: $name) {
      id
      name
      createdAt
      updatedAt
      definitionCount
    }
  }
`;

export const RENAME_DOMAIN_MUTATION = gql`
  mutation RenameDomain($id: ID!, $name: String!) {
    renameDomain(id: $id, name: $name) {
      id
      name
      createdAt
      updatedAt
      definitionCount
    }
  }
`;

export const DELETE_DOMAIN_MUTATION = gql`
  mutation DeleteDomain($id: ID!) {
    deleteDomain(id: $id) {
      success
      affectedDefinitions
    }
  }
`;

export const ASSIGN_DOMAIN_TO_DEFINITIONS_MUTATION = gql`
  mutation AssignDomainToDefinitions($definitionIds: [ID!]!, $domainId: ID) {
    assignDomainToDefinitions(definitionIds: $definitionIds, domainId: $domainId) {
      success
      affectedDefinitions
    }
  }
`;

export const ASSIGN_DOMAIN_TO_DEFINITIONS_BY_FILTER_MUTATION = gql`
  mutation AssignDomainToDefinitionsByFilter(
    $domainId: ID
    $rootOnly: Boolean
    $search: String
    $tagIds: [ID!]
    $hasRuns: Boolean
    $sourceDomainId: ID
    $withoutDomain: Boolean
  ) {
    assignDomainToDefinitionsByFilter(
      domainId: $domainId
      rootOnly: $rootOnly
      search: $search
      tagIds: $tagIds
      hasRuns: $hasRuns
      sourceDomainId: $sourceDomainId
      withoutDomain: $withoutDomain
    ) {
      success
      affectedDefinitions
    }
  }
`;

export const RUN_TRIALS_FOR_DOMAIN_MUTATION = gql`
  mutation RunTrialsForDomain($domainId: ID!, $temperature: Float, $maxBudgetUsd: Float) {
    runTrialsForDomain(domainId: $domainId, temperature: $temperature, maxBudgetUsd: $maxBudgetUsd) {
      success
      totalDefinitions
      targetedDefinitions
      startedRuns
      failedDefinitions
      skippedForBudget
      projectedCostUsd
      blockedByActiveLaunch
      runs {
        definitionId
        runId
        modelIds
      }
    }
  }
`;

export const DOMAIN_TRIALS_PLAN_QUERY = gql`
  query DomainTrialsPlan($domainId: ID!, $temperature: Float) {
    domainTrialsPlan(domainId: $domainId, temperature: $temperature) {
      domainId
      domainName
      vignettes {
        definitionId
        definitionName
        definitionVersion
        signature
        scenarioCount
      }
      models {
        modelId
        label
        isDefault
        supportsTemperature
      }
      cellEstimates {
        definitionId
        modelId
        estimatedCost
      }
      totalEstimatedCost
      existingTemperatures
      defaultTemperature
      temperatureWarning
    }
  }
`;

export const DOMAIN_TRIAL_RUNS_STATUS_QUERY = gql`
  query DomainTrialRunsStatus($runIds: [ID!]!) {
    domainTrialRunsStatus(runIds: $runIds) {
      runId
      definitionId
      status
      modelStatuses {
        modelId
        generationCompleted
        generationFailed
        generationTotal
        summarizationCompleted
        summarizationFailed
        summarizationTotal
        latestErrorMessage
      }
    }
  }
`;

export const RETRY_DOMAIN_TRIAL_CELL_MUTATION = gql`
  mutation RetryDomainTrialCell(
    $domainId: ID!
    $definitionId: ID!
    $modelId: String!
    $temperature: Float
  ) {
    retryDomainTrialCell(
      domainId: $domainId
      definitionId: $definitionId
      modelId: $modelId
      temperature: $temperature
    ) {
      success
      definitionId
      modelId
      runId
      message
    }
  }
`;

export type DomainsQueryResult = {
  domains: Domain[];
};

export type DomainsQueryVariables = {
  search?: string;
  limit?: number;
  offset?: number;
};

export type CreateDomainMutationResult = {
  createDomain: Domain;
};

export type CreateDomainMutationVariables = {
  name: string;
};

export type RenameDomainMutationResult = {
  renameDomain: Domain;
};

export type RenameDomainMutationVariables = {
  id: string;
  name: string;
};

export type DomainMutationResult = {
  success: boolean;
  affectedDefinitions: number;
};

export type DeleteDomainMutationResult = {
  deleteDomain: DomainMutationResult;
};

export type DeleteDomainMutationVariables = {
  id: string;
};

export type AssignDomainToDefinitionsMutationResult = {
  assignDomainToDefinitions: DomainMutationResult;
};

export type AssignDomainToDefinitionsMutationVariables = {
  definitionIds: string[];
  domainId?: string | null;
};

export type AssignDomainToDefinitionsByFilterMutationResult = {
  assignDomainToDefinitionsByFilter: DomainMutationResult;
};

export type AssignDomainToDefinitionsByFilterMutationVariables = {
  domainId?: string | null;
  rootOnly?: boolean;
  search?: string;
  tagIds?: string[];
  hasRuns?: boolean;
  sourceDomainId?: string;
  withoutDomain?: boolean;
};

export type RunTrialsForDomainMutationResult = {
  runTrialsForDomain: {
    success: boolean;
    totalDefinitions: number;
    targetedDefinitions: number;
    startedRuns: number;
    failedDefinitions: number;
    skippedForBudget: number;
    projectedCostUsd: number;
    blockedByActiveLaunch: boolean;
    runs: Array<{
      definitionId: string;
      runId: string;
      modelIds: string[];
    }>;
  };
};

export type RunTrialsForDomainMutationVariables = {
  domainId: string;
  temperature?: number;
  maxBudgetUsd?: number;
};

export type DomainTrialsPlanQueryResult = {
  domainTrialsPlan: {
    domainId: string;
    domainName: string;
    vignettes: Array<{
      definitionId: string;
      definitionName: string;
      definitionVersion: number;
      signature: string;
      scenarioCount: number;
    }>;
    models: Array<{
      modelId: string;
      label: string;
      isDefault: boolean;
      supportsTemperature: boolean;
    }>;
    cellEstimates: Array<{
      definitionId: string;
      modelId: string;
      estimatedCost: number;
    }>;
    totalEstimatedCost: number;
    existingTemperatures: number[];
    defaultTemperature: number | null;
    temperatureWarning: string | null;
  };
};

export type DomainTrialsPlanQueryVariables = {
  domainId: string;
  temperature?: number;
};

export type DomainTrialRunsStatusQueryResult = {
  domainTrialRunsStatus: Array<{
    runId: string;
    definitionId: string;
    status: string;
    modelStatuses: Array<{
      modelId: string;
      generationCompleted: number;
      generationFailed: number;
      generationTotal: number;
      summarizationCompleted: number;
      summarizationFailed: number;
      summarizationTotal: number;
      latestErrorMessage: string | null;
    }>;
  }>;
};

export type DomainTrialRunsStatusQueryVariables = {
  runIds: string[];
};

export type RetryDomainTrialCellMutationResult = {
  retryDomainTrialCell: {
    success: boolean;
    definitionId: string;
    modelId: string;
    runId: string | null;
    message: string | null;
  };
};

export type RetryDomainTrialCellMutationVariables = {
  domainId: string;
  definitionId: string;
  modelId: string;
  temperature?: number;
};

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
  mutation RunTrialsForDomain($domainId: ID!, $temperature: Float, $maxBudgetUsd: Float, $definitionIds: [ID!]) {
    runTrialsForDomain(domainId: $domainId, temperature: $temperature, maxBudgetUsd: $maxBudgetUsd, definitionIds: $definitionIds) {
      domainEvaluationId
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

export const START_DOMAIN_EVALUATION_MUTATION = gql`
  mutation StartDomainEvaluation(
    $domainId: ID!
    $scopeCategory: String
    $temperature: Float
    $maxBudgetUsd: Float
    $definitionIds: [ID!]
    $modelIds: [String!]
    $samplePercentage: Int
    $samplesPerScenario: Int
  ) {
    startDomainEvaluation(
      domainId: $domainId
      scopeCategory: $scopeCategory
      temperature: $temperature
      maxBudgetUsd: $maxBudgetUsd
      definitionIds: $definitionIds
      modelIds: $modelIds
      samplePercentage: $samplePercentage
      samplesPerScenario: $samplesPerScenario
    ) {
      domainEvaluationId
      scopeCategory
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

export const DOMAIN_EVALUATIONS_QUERY = gql`
  query DomainEvaluations($domainId: ID!, $scopeCategory: String, $status: String, $limit: Int, $offset: Int) {
    domainEvaluations(domainId: $domainId, scopeCategory: $scopeCategory, status: $status, limit: $limit, offset: $offset) {
      id
      domainId
      domainNameAtLaunch
      scopeCategory
      status
      createdAt
      startedAt
      completedAt
      startedRuns
      failedDefinitions
      skippedForBudget
      projectedCostUsd
      models
      temperature
      maxBudgetUsd
      memberCount
    }
  }
`;

export const DOMAIN_EVALUATION_QUERY = gql`
  query DomainEvaluation($id: ID!) {
    domainEvaluation(id: $id) {
      id
      domainId
      domainNameAtLaunch
      scopeCategory
      status
      createdAt
      startedAt
      completedAt
      startedRuns
      failedDefinitions
      skippedForBudget
      projectedCostUsd
      models
      temperature
      maxBudgetUsd
      memberCount
      members {
        runId
        definitionIdAtLaunch
        definitionNameAtLaunch
        domainIdAtLaunch
        createdAt
        runStatus
        runCategory
        runStartedAt
        runCompletedAt
      }
    }
  }
`;

export const DOMAIN_EVALUATION_MEMBERS_QUERY = gql`
  query DomainEvaluationMembers($id: ID!) {
    domainEvaluationMembers(id: $id) {
      runId
      definitionIdAtLaunch
      definitionNameAtLaunch
      domainIdAtLaunch
      createdAt
      runStatus
      runCategory
      runStartedAt
      runCompletedAt
    }
  }
`;

export const DOMAIN_EVALUATION_STATUS_QUERY = gql`
  query DomainEvaluationStatus($id: ID!) {
    domainEvaluationStatus(id: $id) {
      id
      status
      totalRuns
      pendingRuns
      runningRuns
      completedRuns
      failedRuns
      cancelledRuns
    }
  }
`;

export const DOMAIN_RUN_SUMMARY_QUERY = gql`
  query DomainRunSummary($domainId: ID!, $scopeCategory: String) {
    domainRunSummary(domainId: $domainId, scopeCategory: $scopeCategory) {
      domainId
      scopeCategory
      totalEvaluations
      pendingEvaluations
      runningEvaluations
      completedEvaluations
      failedEvaluations
      cancelledEvaluations
      totalMemberRuns
      pendingMemberRuns
      runningMemberRuns
      completedMemberRuns
      failedMemberRuns
      cancelledMemberRuns
      pilotEvaluations
      productionEvaluations
      replicationEvaluations
      validationEvaluations
      latestEvaluationId
      latestEvaluationStatus
      latestScopeCategory
      latestEvaluationCreatedAt
    }
  }
`;

export const DOMAIN_TRIALS_PLAN_QUERY = gql`
  query DomainTrialsPlan($domainId: ID!, $temperature: Float, $definitionIds: [ID!]) {
    domainTrialsPlan(domainId: $domainId, temperature: $temperature, definitionIds: $definitionIds) {
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

export const ESTIMATE_DOMAIN_EVALUATION_COST_QUERY = gql`
  query EstimateDomainEvaluationCost(
    $domainId: ID!
    $definitionIds: [ID!]
    $modelIds: [String!]
    $temperature: Float
    $samplePercentage: Int
    $samplesPerScenario: Int
    $scopeCategory: String
  ) {
    estimateDomainEvaluationCost(
      domainId: $domainId
      definitionIds: $definitionIds
      modelIds: $modelIds
      temperature: $temperature
      samplePercentage: $samplePercentage
      samplesPerScenario: $samplesPerScenario
      scopeCategory: $scopeCategory
    ) {
      domainId
      domainName
      scopeCategory
      targetedDefinitions
      totalScenarioCount
      totalEstimatedCost
      basedOnSampleCount
      isUsingFallback
      fallbackReason
      estimateConfidence
      knownExclusions
      models {
        modelId
        label
        isDefault
        supportsTemperature
        estimatedCost
        basedOnSampleCount
        isUsingFallback
      }
      definitions {
        definitionId
        definitionName
        definitionVersion
        signature
        scenarioCount
        estimatedCost
        basedOnSampleCount
        isUsingFallback
      }
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
    $scopeCategory: String
  ) {
    retryDomainTrialCell(
      domainId: $domainId
      definitionId: $definitionId
      modelId: $modelId
      temperature: $temperature
      scopeCategory: $scopeCategory
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
    domainEvaluationId: string | null;
    scopeCategory: string;
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

export type StartDomainEvaluationMutationResult = {
  startDomainEvaluation: {
    domainEvaluationId: string | null;
    scopeCategory: string;
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

export type StartDomainEvaluationMutationVariables = {
  domainId: string;
  scopeCategory?: 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION';
  temperature?: number;
  maxBudgetUsd?: number;
  definitionIds?: string[];
  modelIds?: string[];
  samplePercentage?: number;
  samplesPerScenario?: number;
};

export type DomainEvaluation = {
  id: string;
  domainId: string;
  domainNameAtLaunch: string;
  scopeCategory: 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION';
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  startedRuns: number;
  failedDefinitions: number;
  skippedForBudget: number;
  projectedCostUsd: number;
  models: string[];
  temperature: number | null;
  maxBudgetUsd: number | null;
  memberCount: number;
};

export type DomainEvaluationMember = {
  runId: string;
  definitionIdAtLaunch: string;
  definitionNameAtLaunch: string;
  domainIdAtLaunch: string;
  createdAt: string;
  runStatus: string;
  runCategory: string;
  runStartedAt: string | null;
  runCompletedAt: string | null;
};

export type DomainEvaluationStatus = {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  totalRuns: number;
  pendingRuns: number;
  runningRuns: number;
  completedRuns: number;
  failedRuns: number;
  cancelledRuns: number;
};

export type DomainRunSummary = {
  domainId: string;
  scopeCategory: 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION' | null;
  totalEvaluations: number;
  pendingEvaluations: number;
  runningEvaluations: number;
  completedEvaluations: number;
  failedEvaluations: number;
  cancelledEvaluations: number;
  totalMemberRuns: number;
  pendingMemberRuns: number;
  runningMemberRuns: number;
  completedMemberRuns: number;
  failedMemberRuns: number;
  cancelledMemberRuns: number;
  pilotEvaluations: number;
  productionEvaluations: number;
  replicationEvaluations: number;
  validationEvaluations: number;
  latestEvaluationId: string | null;
  latestEvaluationStatus: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | null;
  latestScopeCategory: 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION' | null;
  latestEvaluationCreatedAt: string | null;
};

export type DomainEvaluationsQueryResult = {
  domainEvaluations: DomainEvaluation[];
};

export type DomainEvaluationsQueryVariables = {
  domainId: string;
  scopeCategory?: 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION';
  status?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  limit?: number;
  offset?: number;
};

export type DomainEvaluationQueryResult = {
  domainEvaluation: (DomainEvaluation & { members: DomainEvaluationMember[] }) | null;
};

export type DomainEvaluationQueryVariables = {
  id: string;
};

export type DomainEvaluationMembersQueryResult = {
  domainEvaluationMembers: DomainEvaluationMember[];
};

export type DomainEvaluationMembersQueryVariables = {
  id: string;
};

export type DomainEvaluationStatusQueryResult = {
  domainEvaluationStatus: DomainEvaluationStatus | null;
};

export type DomainEvaluationStatusQueryVariables = {
  id: string;
};

export type DomainRunSummaryQueryResult = {
  domainRunSummary: DomainRunSummary;
};

export type DomainRunSummaryQueryVariables = {
  domainId: string;
  scopeCategory?: 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION';
};

export type RunTrialsForDomainMutationVariables = {
  domainId: string;
  temperature?: number;
  maxBudgetUsd?: number;
  definitionIds?: string[];
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
  definitionIds?: string[];
};

export type DomainEvaluationCostEstimateModel = {
  modelId: string;
  label: string;
  isDefault: boolean;
  supportsTemperature: boolean;
  estimatedCost: number;
  basedOnSampleCount: number;
  isUsingFallback: boolean;
};

export type DomainEvaluationCostEstimateDefinition = {
  definitionId: string;
  definitionName: string;
  definitionVersion: number;
  signature: string;
  scenarioCount: number;
  estimatedCost: number;
  basedOnSampleCount: number;
  isUsingFallback: boolean;
};

export type DomainEvaluationCostEstimate = {
  domainId: string;
  domainName: string;
  scopeCategory: string;
  targetedDefinitions: number;
  totalScenarioCount: number;
  totalEstimatedCost: number;
  basedOnSampleCount: number;
  isUsingFallback: boolean;
  fallbackReason: string | null;
  estimateConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  knownExclusions: string[];
  models: DomainEvaluationCostEstimateModel[];
  definitions: DomainEvaluationCostEstimateDefinition[];
  existingTemperatures: number[];
  defaultTemperature: number | null;
  temperatureWarning: string | null;
};

export type EstimateDomainEvaluationCostQueryResult = {
  estimateDomainEvaluationCost: DomainEvaluationCostEstimate;
};

export type EstimateDomainEvaluationCostQueryVariables = {
  domainId: string;
  definitionIds?: string[];
  modelIds?: string[];
  temperature?: number;
  samplePercentage?: number;
  samplesPerScenario?: number;
  scopeCategory?: 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION';
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
  scopeCategory?: 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION';
};

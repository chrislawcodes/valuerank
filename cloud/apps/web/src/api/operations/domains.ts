import { gql } from 'urql';

export type Domain = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  definitionCount: number;
  defaultLevelPresetVersionId: string | null;
  defaultPreambleVersionId: string | null;
  defaultContextId: string | null;
  defaultModelIds: string[];
  sentencePrefix: string | null;
  labelPrefix: string | null;
};

export const DOMAINS_QUERY = gql`
  query Domains($search: String, $limit: Int, $offset: Int) {
    domains(search: $search, limit: $limit, offset: $offset) {
      id
      name
      createdAt
      updatedAt
      definitionCount
      defaultLevelPresetVersionId
      defaultPreambleVersionId
      defaultContextId
      defaultModelIds
      sentencePrefix
      labelPrefix
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
    $targetBatchCount: Int
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
      targetBatchCount: $targetBatchCount
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

export const BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION = gql`
  mutation BackfillDomainEvaluationModels(
    $domainEvaluationId: ID!
    $modelIds: [String!]!
    $definitionIds: [ID!]
    $targetBatchCount: Int
  ) {
    backfillDomainEvaluationModels(
      domainEvaluationId: $domainEvaluationId
      modelIds: $modelIds
      definitionIds: $definitionIds
      targetBatchCount: $targetBatchCount
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
      launchableDefinitionIds
      launchableDefinitions {
        definitionId
        definitionName
        pairKey
      }
      samplePercentage
      samplesPerScenario
      targetBatchCount
      temperature
      maxBudgetUsd
      memberCount
      members {
        runId
        definitionIdAtLaunch
        definitionNameAtLaunch
        domainIdAtLaunch
        modelIds
        createdAt
        runStatus
        runCategory
        runStartedAt
        runCompletedAt
      }
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

export const DOMAIN_TRIALS_PLAN_QUERY = gql`
  query DomainTrialsPlan($domainId: ID!, $temperature: Float, $definitionIds: [ID!], $scopeCategory: String) {
    domainTrialsPlan(domainId: $domainId, temperature: $temperature, definitionIds: $definitionIds, scopeCategory: $scopeCategory) {
      domainId
      domainName
      vignettes {
        definitionId
        definitionName
        definitionVersion
        signature
        scenarioCount
        existingBatchCount
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
      updatedAt
      stalledModels
      analysisStatus
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

export type BackfillDomainEvaluationModelsMutationResult = {
  backfillDomainEvaluationModels: {
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
  targetBatchCount?: number;
};

export type BackfillDomainEvaluationModelsMutationVariables = {
  domainEvaluationId: string;
  modelIds: string[];
  definitionIds?: string[];
  targetBatchCount?: number;
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
  launchableDefinitionIds?: string[];
  launchableDefinitions?: Array<{
    definitionId: string;
    definitionName: string;
    pairKey: string | null;
  }>;
  samplePercentage?: number | null;
  samplesPerScenario?: number | null;
  targetBatchCount?: number | null;
  temperature: number | null;
  maxBudgetUsd: number | null;
  memberCount: number;
};

export type DomainEvaluationMember = {
  runId: string;
  definitionIdAtLaunch: string;
  definitionNameAtLaunch: string;
  domainIdAtLaunch: string;
  modelIds: string[];
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

export type DomainEvaluationStatusQueryResult = {
  domainEvaluationStatus: DomainEvaluationStatus | null;
};

export type DomainEvaluationStatusQueryVariables = {
  id: string;
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
      existingBatchCount: number;
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
  scopeCategory?: string;
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
    updatedAt: string;
    stalledModels: string[];
    analysisStatus: string | null;
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

// ============================================================================
// Domain Settings (T025)
// ============================================================================

export type ValueStatementWithVersions = {
  id: string;
  token: string;
  currentContent: string;
  previousContent: string | null;
};

export type DomainSettings = {
  domainId: string;
  preambleVersionId: string | null;
  levelPresetVersionId: string | null;
  contextId: string | null;
  defaultModelIds: string[];
  sentencePrefix: string | null;
  labelPrefix: string | null;
  valueStatements: ValueStatementWithVersions[];
};

export type DomainConfigSnapshotSummary = {
  id: string;
  createdAt: string;
  preambleLabel: string | null;
  levelPresetLabel: string | null;
  contextLabel: string | null;
  valueStatementCount: number;
};

export const DOMAIN_SETTINGS_QUERY = `
  query DomainSettings($domainId: ID!) {
    domainSettings(domainId: $domainId) {
      domainId
      preambleVersionId
      levelPresetVersionId
      contextId
      defaultModelIds
      sentencePrefix
      labelPrefix
      valueStatements {
        id
        token
        currentContent
        previousContent
      }
    }
  }
`;

export type DomainSettingsQueryResult = {
  domainSettings: DomainSettings | null;
};

export type DomainSettingsQueryVariables = {
  domainId: string;
};

export const DOMAIN_CONFIG_SNAPSHOTS_QUERY = `
  query DomainConfigSnapshots($domainId: ID!, $limit: Int) {
    domainConfigSnapshots(domainId: $domainId, limit: $limit) {
      id
      createdAt
      preambleLabel
      levelPresetLabel
      contextLabel
      valueStatementCount
    }
  }
`;

export type DomainConfigSnapshotsQueryResult = {
  domainConfigSnapshots: DomainConfigSnapshotSummary[];
};

export type DomainConfigSnapshotsQueryVariables = {
  domainId: string;
  limit?: number;
};

export const SET_DOMAIN_SETTINGS_MUTATION = `
  mutation SetDomainSettings(
    $domainId: ID!
    $preambleVersionId: ID
    $levelPresetVersionId: ID
    $contextId: ID
    $defaultModelIds: [String!]
    $sentencePrefix: String
    $labelPrefix: String
    $valueStatements: [ValueStatementInput!]!
  ) {
    setDomainSettings(
      domainId: $domainId
      preambleVersionId: $preambleVersionId
      levelPresetVersionId: $levelPresetVersionId
      contextId: $contextId
      defaultModelIds: $defaultModelIds
      sentencePrefix: $sentencePrefix
      labelPrefix: $labelPrefix
      valueStatements: $valueStatements
    ) {
      id
      name
      defaultPreambleVersionId
      defaultLevelPresetVersionId
      defaultContextId
      defaultModelIds
    }
  }
`;

export type SetDomainSettingsMutationResult = {
  setDomainSettings: {
    id: string;
    name: string;
    defaultPreambleVersionId: string | null;
    defaultLevelPresetVersionId: string | null;
    defaultContextId: string | null;
    defaultModelIds: string[];
  };
};

export type SetDomainSettingsMutationVariables = {
  domainId: string;
  preambleVersionId?: string | null;
  levelPresetVersionId?: string | null;
  contextId?: string | null;
  defaultModelIds?: string[] | null;
  sentencePrefix?: string | null;
  labelPrefix?: string | null;
  valueStatements: Array<{ token: string; content: string }>;
};

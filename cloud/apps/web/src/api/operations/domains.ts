import { gql } from 'urql';
import type {
  DomainsQueryVariables as GeneratedDomainsQueryVariables,
  CreateDomainMutation as GeneratedCreateDomainMutation,
  CreateDomainMutationVariables as GeneratedCreateDomainMutationVariables,
  RenameDomainMutation as GeneratedRenameDomainMutation,
  RenameDomainMutationVariables as GeneratedRenameDomainMutationVariables,
  DeleteDomainMutation as GeneratedDeleteDomainMutation,
  DeleteDomainMutationVariables as GeneratedDeleteDomainMutationVariables,
  AssignDomainToDefinitionsMutation as GeneratedAssignDomainToDefinitionsMutation,
  AssignDomainToDefinitionsMutationVariables as GeneratedAssignDomainToDefinitionsMutationVariables,
  AssignDomainToDefinitionsByFilterMutation as GeneratedAssignDomainToDefinitionsByFilterMutation,
  AssignDomainToDefinitionsByFilterMutationVariables as GeneratedAssignDomainToDefinitionsByFilterMutationVariables,
  RunTrialsForDomainMutation as GeneratedRunTrialsForDomainMutation,
  RunTrialsForDomainMutationVariables as GeneratedRunTrialsForDomainMutationVariables,
  StartDomainEvaluationMutation as GeneratedStartDomainEvaluationMutation,
  StartDomainEvaluationMutationVariables as GeneratedStartDomainEvaluationMutationVariables,
  DomainEvaluationsQuery as GeneratedDomainEvaluationsQuery,
  DomainEvaluationsQueryVariables as GeneratedDomainEvaluationsQueryVariables,
  DomainEvaluationQueryVariables as GeneratedDomainEvaluationQueryVariables,
  DomainEvaluationStatusQuery as GeneratedDomainEvaluationStatusQuery,
  DomainEvaluationStatusQueryVariables as GeneratedDomainEvaluationStatusQueryVariables,
  DomainTrialsPlanQuery as GeneratedDomainTrialsPlanQuery,
  DomainTrialsPlanQueryVariables as GeneratedDomainTrialsPlanQueryVariables,
  EstimateDomainEvaluationCostQueryVariables as GeneratedEstimateDomainEvaluationCostQueryVariables,
  DomainTrialRunsStatusQueryVariables as GeneratedDomainTrialRunsStatusQueryVariables,
  DomainSettingsQueryVariables as GeneratedDomainSettingsQueryVariables,
  DomainConfigSnapshotsQuery as GeneratedDomainConfigSnapshotsQuery,
  DomainConfigSnapshotsQueryVariables as GeneratedDomainConfigSnapshotsQueryVariables,
} from '../../generated/graphql';

// ============================================================================
// DOCUMENTS — codegen
// ============================================================================

export {
  DomainsDocument as DOMAINS_QUERY,
  CreateDomainDocument as CREATE_DOMAIN_MUTATION,
  RenameDomainDocument as RENAME_DOMAIN_MUTATION,
  DeleteDomainDocument as DELETE_DOMAIN_MUTATION,
  AssignDomainToDefinitionsDocument as ASSIGN_DOMAIN_TO_DEFINITIONS_MUTATION,
  AssignDomainToDefinitionsByFilterDocument as ASSIGN_DOMAIN_TO_DEFINITIONS_BY_FILTER_MUTATION,
  RunTrialsForDomainDocument as RUN_TRIALS_FOR_DOMAIN_MUTATION,
  StartDomainEvaluationDocument as START_DOMAIN_EVALUATION_MUTATION,
  DomainEvaluationsDocument as DOMAIN_EVALUATIONS_QUERY,
  DomainEvaluationDocument as DOMAIN_EVALUATION_QUERY,
  DomainEvaluationStatusDocument as DOMAIN_EVALUATION_STATUS_QUERY,
  DomainTrialsPlanDocument as DOMAIN_TRIALS_PLAN_QUERY,
  EstimateDomainEvaluationCostDocument as ESTIMATE_DOMAIN_EVALUATION_COST_QUERY,
  DomainTrialRunsStatusDocument as DOMAIN_TRIAL_RUNS_STATUS_QUERY,
  DomainSettingsDocument as DOMAIN_SETTINGS_QUERY,
  DomainConfigSnapshotsDocument as DOMAIN_CONFIG_SNAPSHOTS_QUERY,
  SetDomainSettingsDocument as SET_DOMAIN_SETTINGS_MUTATION,
} from '../../generated/graphql';

// ============================================================================
// DOCUMENT — manual (backfillDomainEvaluationModels not in schema yet)
// ============================================================================

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

// ============================================================================
// MANUAL TYPES
// Manual types are kept where the schema type is incomplete or where the
// consumer code relies on fields not yet in the schema (defaultModelIds,
// sentencePrefix, labelPrefix, launchableDefinitions, modelIds on members).
// ============================================================================

// Domain — schema doesn't yet have defaultModelIds, sentencePrefix, labelPrefix.
// Those fields are optional so the generated type (which omits them) is assignable here.
export type Domain = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  definitionCount: number;
  defaultLevelPresetVersionId?: string | null;
  defaultPreambleVersionId?: string | null;
  defaultContextId?: string | null;
  defaultModelIds?: string[];
  sentencePrefix?: string | null;
  labelPrefix?: string | null;
};

export type DomainMutationResult = {
  success: boolean;
  affectedDefinitions: number;
};

// DomainEvaluationMember — schema doesn't have modelIds
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

// DomainEvaluation — schema doesn't have launchableDefinitionIds, launchableDefinitions,
// samplePercentage, samplesPerScenario, targetBatchCount
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

export type DomainEvaluationStatus = NonNullable<GeneratedDomainEvaluationStatusQuery['domainEvaluationStatus']>;

// DomainSettings — schema doesn't have defaultModelIds, sentencePrefix, labelPrefix
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

export type DomainConfigSnapshotSummary = GeneratedDomainConfigSnapshotsQuery['domainConfigSnapshots'][number];

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

// ============================================================================
// QUERY RESULT TYPES
// ============================================================================

export type DomainsQueryResult = { domains: Domain[] };
export type DomainsQueryVariables = GeneratedDomainsQueryVariables;

export type DomainEvaluationsQueryResult = GeneratedDomainEvaluationsQuery;
export type DomainEvaluationsQueryVariables = GeneratedDomainEvaluationsQueryVariables;

export type DomainEvaluationQueryResult = {
  domainEvaluation: (DomainEvaluation & { members: DomainEvaluationMember[] }) | null;
};
export type DomainEvaluationQueryVariables = GeneratedDomainEvaluationQueryVariables;

export type DomainEvaluationStatusQueryResult = GeneratedDomainEvaluationStatusQuery;
export type DomainEvaluationStatusQueryVariables = GeneratedDomainEvaluationStatusQueryVariables;

export type DomainTrialsPlanQueryResult = GeneratedDomainTrialsPlanQuery;
export type DomainTrialsPlanQueryVariables = GeneratedDomainTrialsPlanQueryVariables;

// Manual — estimateConfidence is string in generated type but consumers expect
// the narrower union 'HIGH' | 'MEDIUM' | 'LOW' (LaunchConfirmModal prop type).
export type EstimateDomainEvaluationCostQueryResult = {
  estimateDomainEvaluationCost: DomainEvaluationCostEstimate;
};
export type EstimateDomainEvaluationCostQueryVariables = GeneratedEstimateDomainEvaluationCostQueryVariables;

// Manual — analysisStatus is typed string | null | undefined in the generated type,
// but consumers declare RowView.analysisStatus as string | null and assign directly.
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
export type DomainTrialRunsStatusQueryVariables = GeneratedDomainTrialRunsStatusQueryVariables;

export type DomainSettingsQueryResult = { domainSettings: DomainSettings | null };
export type DomainSettingsQueryVariables = GeneratedDomainSettingsQueryVariables;

export type DomainConfigSnapshotsQueryResult = GeneratedDomainConfigSnapshotsQuery;
export type DomainConfigSnapshotsQueryVariables = GeneratedDomainConfigSnapshotsQueryVariables;

// ============================================================================
// MUTATION RESULT TYPES
// ============================================================================

export type CreateDomainMutationResult = GeneratedCreateDomainMutation;
export type CreateDomainMutationVariables = GeneratedCreateDomainMutationVariables;

export type RenameDomainMutationResult = GeneratedRenameDomainMutation;
export type RenameDomainMutationVariables = GeneratedRenameDomainMutationVariables;

export type DeleteDomainMutationResult = GeneratedDeleteDomainMutation;
export type DeleteDomainMutationVariables = GeneratedDeleteDomainMutationVariables;

export type AssignDomainToDefinitionsMutationResult = GeneratedAssignDomainToDefinitionsMutation;
export type AssignDomainToDefinitionsMutationVariables = GeneratedAssignDomainToDefinitionsMutationVariables;

export type AssignDomainToDefinitionsByFilterMutationResult = GeneratedAssignDomainToDefinitionsByFilterMutation;
export type AssignDomainToDefinitionsByFilterMutationVariables = GeneratedAssignDomainToDefinitionsByFilterMutationVariables;

export type RunTrialsForDomainMutationResult = GeneratedRunTrialsForDomainMutation;
export type RunTrialsForDomainMutationVariables = GeneratedRunTrialsForDomainMutationVariables;

export type StartDomainEvaluationMutationResult = GeneratedStartDomainEvaluationMutation;
export type StartDomainEvaluationMutationVariables = GeneratedStartDomainEvaluationMutationVariables;

// BackfillDomainEvaluationModels — not in schema yet, manual types
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

export type BackfillDomainEvaluationModelsMutationVariables = {
  domainEvaluationId: string;
  modelIds: string[];
  definitionIds?: string[];
  targetBatchCount?: number;
};

// SetDomainSettings — schema omits defaultModelIds, sentencePrefix, labelPrefix from args
// and result; keep variables manual to preserve the richer call signature used in the app
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

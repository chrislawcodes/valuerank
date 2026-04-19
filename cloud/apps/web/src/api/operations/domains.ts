import type {
  DomainsQuery,
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
  DomainEvaluationsQuery,
  DomainEvaluationsQueryVariables as GeneratedDomainEvaluationsQueryVariables,
  DomainEvaluationQuery,
  DomainEvaluationQueryVariables as GeneratedDomainEvaluationQueryVariables,
  DomainEvaluationStatusQuery as GeneratedDomainEvaluationStatusQuery,
  DomainEvaluationStatusQueryVariables as GeneratedDomainEvaluationStatusQueryVariables,
  DomainTrialsPlanQuery as GeneratedDomainTrialsPlanQuery,
  DomainTrialsPlanQueryVariables as GeneratedDomainTrialsPlanQueryVariables,
  EstimateDomainEvaluationCostQuery,
  EstimateDomainEvaluationCostQueryVariables as GeneratedEstimateDomainEvaluationCostQueryVariables,
  DomainTrialRunsStatusQuery,
  DomainTrialRunsStatusQueryVariables as GeneratedDomainTrialRunsStatusQueryVariables,
  DomainSettingsQuery,
  DomainSettingsQueryVariables as GeneratedDomainSettingsQueryVariables,
  DomainConfigSnapshotsQuery,
  DomainConfigSnapshotsQueryVariables as GeneratedDomainConfigSnapshotsQueryVariables,
  SetDomainSettingsMutation,
  SetDomainSettingsMutationVariables as GeneratedSetDomainSettingsMutationVariables,
  BackfillDomainEvaluationModelsMutation,
  BackfillDomainEvaluationModelsMutationVariables as GeneratedBackfillDomainEvaluationModelsMutationVariables,
} from '../../generated/graphql';

// ============================================================================
// DOCUMENTS
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
  BackfillDomainEvaluationModelsDocument as BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION,
} from '../../generated/graphql';

// ============================================================================
// TYPES
// ============================================================================

export type Domain = DomainsQuery['domains'][number];

export type DomainMutationResult = GeneratedDeleteDomainMutation['deleteDomain'];

export type DomainEvaluationMember =
  NonNullable<DomainEvaluationQuery['domainEvaluation']>['members'][number];

export type DomainEvaluation = NonNullable<DomainEvaluationQuery['domainEvaluation']>;

export type DomainEvaluationStatus =
  NonNullable<GeneratedDomainEvaluationStatusQuery['domainEvaluationStatus']>;

export type DomainSettings = NonNullable<DomainSettingsQuery['domainSettings']>;

export type ValueStatementWithVersions = DomainSettings['valueStatements'][number];

export type DomainConfigSnapshotSummary = DomainConfigSnapshotsQuery['domainConfigSnapshots'][number];

type GeneratedCostEstimate = NonNullable<EstimateDomainEvaluationCostQuery['estimateDomainEvaluationCost']>;

export type DomainEvaluationCostEstimateModel = GeneratedCostEstimate['models'][number];

export type DomainEvaluationCostEstimateDefinition = GeneratedCostEstimate['definitions'][number];

export type DomainEvaluationCostEstimate = Omit<GeneratedCostEstimate, 'estimateConfidence'> & {
  estimateConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
};

// ============================================================================
// QUERY RESULT TYPES
// ============================================================================

export type DomainsQueryResult = DomainsQuery;
export type DomainsQueryVariables = GeneratedDomainsQueryVariables;

export type DomainEvaluationsQueryResult = DomainEvaluationsQuery;
export type DomainEvaluationsQueryVariables = GeneratedDomainEvaluationsQueryVariables;

export type DomainEvaluationQueryResult = DomainEvaluationQuery;
export type DomainEvaluationQueryVariables = GeneratedDomainEvaluationQueryVariables;

export type DomainEvaluationStatusQueryResult = GeneratedDomainEvaluationStatusQuery;
export type DomainEvaluationStatusQueryVariables = GeneratedDomainEvaluationStatusQueryVariables;

export type DomainTrialsPlanQueryResult = GeneratedDomainTrialsPlanQuery;
export type DomainTrialsPlanQueryVariables = GeneratedDomainTrialsPlanQueryVariables;

export type EstimateDomainEvaluationCostQueryResult = EstimateDomainEvaluationCostQuery;
export type EstimateDomainEvaluationCostQueryVariables = GeneratedEstimateDomainEvaluationCostQueryVariables;

export type DomainTrialRunsStatusQueryResult = DomainTrialRunsStatusQuery;
export type DomainTrialRunsStatusQueryVariables = GeneratedDomainTrialRunsStatusQueryVariables;

export type DomainSettingsQueryResult = DomainSettingsQuery;
export type DomainSettingsQueryVariables = GeneratedDomainSettingsQueryVariables;

export type DomainConfigSnapshotsQueryResult = DomainConfigSnapshotsQuery;
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

export type BackfillDomainEvaluationModelsMutationResult = BackfillDomainEvaluationModelsMutation;
export type BackfillDomainEvaluationModelsMutationVariables = GeneratedBackfillDomainEvaluationModelsMutationVariables;

export type SetDomainSettingsMutationResult = SetDomainSettingsMutation;
export type SetDomainSettingsMutationVariables = GeneratedSetDomainSettingsMutationVariables;

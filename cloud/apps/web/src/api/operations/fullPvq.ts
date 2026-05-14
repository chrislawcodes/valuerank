import type {
  CreateFullPvqMutation as GeneratedCreateFullPvqMutation,
  CreateFullPvqMutationVariables as GeneratedCreateFullPvqMutationVariables,
  DeleteFullPvqMutation as GeneratedDeleteFullPvqMutation,
  DeleteFullPvqMutationVariables as GeneratedDeleteFullPvqMutationVariables,
  FullPvqCategoryResult as GeneratedFullPvqCategoryResult,
  FullPvqModelScore as GeneratedFullPvqModelScore,
  FullPvqResultModel as GeneratedFullPvqResultModel,
  FullPvqResults as GeneratedFullPvqResults,
  FullPvqResultsQuery as GeneratedFullPvqResultsQuery,
  FullPvqResultsQueryVariables as GeneratedFullPvqResultsQueryVariables,
  FullPvqSurvey as GeneratedFullPvqSurvey,
  FullPvqSurveyQuery as GeneratedFullPvqSurveyQuery,
  FullPvqSurveyQueryVariables as GeneratedFullPvqSurveyQueryVariables,
  FullPvqSurveysQuery as GeneratedFullPvqSurveysQuery,
  FullPvqSurveysQueryVariables as GeneratedFullPvqSurveysQueryVariables,
  FullPvqTrialCategoryScore as GeneratedFullPvqTrialCategoryScore,
  FullPvqTrialDetail as GeneratedFullPvqTrialDetail,
  FullPvqTrialDetailQuery as GeneratedFullPvqTrialDetailQuery,
  FullPvqTrialDetailQueryVariables as GeneratedFullPvqTrialDetailQueryVariables,
  StartFullPvqRunMutation as GeneratedStartFullPvqRunMutation,
  StartFullPvqRunMutationVariables as GeneratedStartFullPvqRunMutationVariables,
} from '../../generated/graphql';

export type FullPvqAnalysisPlan = NonNullable<GeneratedFullPvqSurvey['analysisPlan']>;
export type FullPvqSurvey = GeneratedFullPvqSurvey;
export type FullPvqModelScore = GeneratedFullPvqModelScore;
export type FullPvqCategoryResult = GeneratedFullPvqCategoryResult;
export type FullPvqResultModel = GeneratedFullPvqResultModel;
export type FullPvqResults = GeneratedFullPvqResults;
export type FullPvqTrialCategoryScore = GeneratedFullPvqTrialCategoryScore;
export type FullPvqTrialDetail = GeneratedFullPvqTrialDetail;
export type FullPvqSurveysQueryResult = GeneratedFullPvqSurveysQuery;
export type FullPvqSurveysQueryVariables = GeneratedFullPvqSurveysQueryVariables;
export type FullPvqSurveyQueryResult = GeneratedFullPvqSurveyQuery;
export type FullPvqSurveyQueryVariables = GeneratedFullPvqSurveyQueryVariables;
export type CreateFullPvqMutationResult = GeneratedCreateFullPvqMutation;
export type CreateFullPvqMutationVariables = GeneratedCreateFullPvqMutationVariables;
export type DeleteFullPvqMutationResult = GeneratedDeleteFullPvqMutation;
export type DeleteFullPvqMutationVariables = GeneratedDeleteFullPvqMutationVariables;
export type StartFullPvqRunMutationResult = GeneratedStartFullPvqRunMutation;
export type StartFullPvqRunMutationVariables = GeneratedStartFullPvqRunMutationVariables;
export type FullPvqResultsQueryResult = GeneratedFullPvqResultsQuery;
export type FullPvqResultsQueryVariables = GeneratedFullPvqResultsQueryVariables;
export type FullPvqTrialDetailQueryResult = GeneratedFullPvqTrialDetailQuery;
export type FullPvqTrialDetailQueryVariables = GeneratedFullPvqTrialDetailQueryVariables;

// Queries and mutations (re-exported from generated)
export { FullPvqSurveysDocument as FULL_PVQ_SURVEYS_QUERY } from '../../generated/graphql';
export { FullPvqSurveyDocument as FULL_PVQ_SURVEY_QUERY } from '../../generated/graphql';
export { FullPvqResultsDocument as FULL_PVQ_RESULTS_QUERY } from '../../generated/graphql';
export { FullPvqTrialDetailDocument as FULL_PVQ_TRIAL_DETAIL_QUERY } from '../../generated/graphql';
export { CreateFullPvqDocument as CREATE_FULL_PVQ_MUTATION } from '../../generated/graphql';
export { DeleteFullPvqDocument as DELETE_FULL_PVQ_MUTATION } from '../../generated/graphql';
export { StartFullPvqRunDocument as START_FULL_PVQ_RUN_MUTATION } from '../../generated/graphql';

// ============================================================================
// TYPES (manual — JSON scalar fields need typed shapes)
// ============================================================================

export type SurveyQuestion = {
  id: string;
  text: string;
  order: number;
};

export type SurveyResponseOption = {
  id: string;
  label: string;
  order: number;
  value: number;
};

export type SurveyPlan = {
  kind: 'survey';
  version: number;
  surveyKey?: string;
  definitionId: string;
  description?: string;
  instructions?: string;
  responseOptions?: SurveyResponseOption[];
  // Legacy compatibility for already-saved surveys
  responseScale?: {
    min: number;
    max: number;
    minLabel?: string | null;
    maxLabel?: string | null;
  };
  questions: SurveyQuestion[];
};

export type Survey = {
  id: string;
  name: string;
  hypothesis: string | null;
  analysisPlan: SurveyPlan | null;
  createdAt: string;
  updatedAt: string;
  runCount: number;
};

// ============================================================================
// QUERIES
// ============================================================================

export { SurveysDocument as SURVEYS_QUERY } from '../../generated/graphql';

// ============================================================================
// MUTATIONS
// ============================================================================

export { CreateSurveyDocument as CREATE_SURVEY_MUTATION } from '../../generated/graphql';
export { UpdateSurveyDocument as UPDATE_SURVEY_MUTATION } from '../../generated/graphql';
export { DeleteSurveyDocument as DELETE_SURVEY_MUTATION } from '../../generated/graphql';
export { DuplicateSurveyDocument as DUPLICATE_SURVEY_MUTATION } from '../../generated/graphql';

// ============================================================================
// RESULT TYPES (manual — preserves app-level types without __typename)
// ============================================================================

export type SurveysQueryResult = {
  surveys: Survey[];
};

export type CreateSurveyMutationResult = {
  createSurvey: Survey;
};

export type UpdateSurveyMutationResult = {
  updateSurvey: Survey;
};

export type DeleteSurveyMutationResult = {
  deleteSurvey: boolean;
};

export type DuplicateSurveyMutationResult = {
  duplicateSurvey: Survey;
};

// ============================================================================
// INPUT TYPES (manual — not from schema)
// ============================================================================

export type CreateSurveyInput = {
  name: string;
  description?: string;
  instructions?: string;
  responseOptions: Array<{
    label: string;
  }>;
  questions: Array<{
    text: string;
  }>;
};

export type UpdateSurveyInput = {
  name?: string;
  description?: string;
  instructions?: string;
  responseOptions?: Array<{
    label: string;
  }>;
  questions?: Array<{
    text: string;
  }>;
};

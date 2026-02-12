import { gql } from 'urql';

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

export const SURVEYS_QUERY = gql`
  query Surveys($search: String) {
    surveys(search: $search) {
      id
      name
      hypothesis
      analysisPlan
      createdAt
      updatedAt
      runCount
    }
  }
`;

export const CREATE_SURVEY_MUTATION = gql`
  mutation CreateSurvey($input: CreateSurveyInput!) {
    createSurvey(input: $input) {
      id
      name
      hypothesis
      analysisPlan
      createdAt
      updatedAt
      runCount
    }
  }
`;

export const UPDATE_SURVEY_MUTATION = gql`
  mutation UpdateSurvey($id: ID!, $input: UpdateSurveyInput!) {
    updateSurvey(id: $id, input: $input) {
      id
      name
      hypothesis
      analysisPlan
      createdAt
      updatedAt
      runCount
    }
  }
`;

export const DELETE_SURVEY_MUTATION = gql`
  mutation DeleteSurvey($id: ID!) {
    deleteSurvey(id: $id)
  }
`;

export const DUPLICATE_SURVEY_MUTATION = gql`
  mutation DuplicateSurvey($id: ID!, $name: String) {
    duplicateSurvey(id: $id, name: $name) {
      id
      name
      hypothesis
      analysisPlan
      createdAt
      updatedAt
      runCount
    }
  }
`;

export type SurveysQueryResult = {
  surveys: Survey[];
};

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

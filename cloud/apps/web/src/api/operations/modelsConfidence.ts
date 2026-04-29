import type {
  ModelsConfidenceQuery as GeneratedModelsConfidenceQuery,
  ModelsConfidenceQueryVariables as GeneratedModelsConfidenceQueryVariables,
} from '../../generated/graphql';

export { ModelsConfidenceDocument as MODELS_CONFIDENCE_QUERY } from '../../generated/graphql';

export type ModelsConfidenceQueryResult = GeneratedModelsConfidenceQuery;
export type ModelsConfidenceQueryVariables = GeneratedModelsConfidenceQueryVariables;

export type ModelsConfidenceModelResult = GeneratedModelsConfidenceQuery['modelsConfidence']['models'][number];
export type ModelsConfidenceValueResult = ModelsConfidenceModelResult['values'][number];

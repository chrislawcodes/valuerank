import { gql } from 'urql';

export type ModelsConfidenceValueResult = {
  valueKey: string;
  confidence: number | null;
  strongCount: number;
  leanCount: number;
};

export type ModelsConfidenceModelResult = {
  modelId: string;
  label: string;
  overallConfidence: number | null;
  overallStrongCount: number;
  overallLeanCount: number;
  values: ModelsConfidenceValueResult[];
};

export type ModelsConfidenceQueryResult = {
  modelsConfidence: {
    models: ModelsConfidenceModelResult[];
  };
};

export type ModelsConfidenceQueryVariables = {
  signature?: string | null;
};

export const MODELS_CONFIDENCE_QUERY = gql`
  query ModelsConfidence($signature: String) {
    modelsConfidence(signature: $signature) {
      models {
        modelId
        label
        overallConfidence
        overallStrongCount
        overallLeanCount
        values {
          valueKey
          confidence
          strongCount
          leanCount
        }
      }
    }
  }
`;

import { gql } from 'urql';

export type ModelsAnalysisDomainBreakdown = {
  domainId: string;
  domainName: string;
  evidenceWeight: number;
  winRate: number;
};

export type ModelsAnalysisValueResult = {
  valueKey: string;
  pooledWinRate: number | null;
  stabilityScore: number | null;
  eligibleDomainCount: number;
  domains: ModelsAnalysisDomainBreakdown[];
};

export type ModelsAnalysisModelResult = {
  modelId: string;
  label: string;
  values: ModelsAnalysisValueResult[];
};

export type ModelsAnalysisQueryResult = {
  modelsAnalysis: {
    models: ModelsAnalysisModelResult[];
  };
};

export type ModelsAnalysisQueryVariables = {
  domainId?: string | null;
};

export const MODELS_ANALYSIS_QUERY = gql`
  query ModelsAnalysis($domainId: ID) {
    modelsAnalysis(domainId: $domainId) {
      models {
        modelId
        label
        values {
          valueKey
          pooledWinRate
          stabilityScore
          eligibleDomainCount
          domains {
            domainId
            domainName
            winRate
            evidenceWeight
          }
        }
      }
    }
  }
`;

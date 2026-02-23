import { gql } from 'urql';

export const DOMAIN_ANALYSIS_QUERY = gql`
  query DomainAnalysis($domainId: ID!) {
    domainAnalysis(domainId: $domainId) {
      domainId
      domainName
      totalDefinitions
      targetedDefinitions
      definitionsWithAnalysis
      generatedAt
      models {
        model
        label
        values {
          valueKey
          score
          prioritized
          deprioritized
          neutral
          totalComparisons
        }
      }
      unavailableModels {
        model
        label
        reason
      }
    }
  }
`;

export type DomainAnalysisValueScore = {
  valueKey: string;
  score: number;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalComparisons: number;
};

export type DomainAnalysisModel = {
  model: string;
  label: string;
  values: DomainAnalysisValueScore[];
};

export type DomainAnalysisUnavailableModel = {
  model: string;
  label: string;
  reason: string;
};

export type DomainAnalysisResult = {
  domainId: string;
  domainName: string;
  totalDefinitions: number;
  targetedDefinitions: number;
  definitionsWithAnalysis: number;
  generatedAt: string;
  models: DomainAnalysisModel[];
  unavailableModels: DomainAnalysisUnavailableModel[];
};

export type DomainAnalysisQueryResult = {
  domainAnalysis: DomainAnalysisResult;
};

export type DomainAnalysisQueryVariables = {
  domainId: string;
};

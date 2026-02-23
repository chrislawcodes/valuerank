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

export const DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY = gql`
  query DomainAnalysisValueDetail($domainId: ID!, $modelId: String!, $valueKey: String!) {
    domainAnalysisValueDetail(domainId: $domainId, modelId: $modelId, valueKey: $valueKey) {
      domainId
      domainName
      modelId
      modelLabel
      valueKey
      score
      prioritized
      deprioritized
      neutral
      totalTrials
      generatedAt
      vignettes {
        definitionId
        definitionName
        definitionVersion
        otherValueKey
        prioritized
        deprioritized
        neutral
        totalTrials
        selectedValueWinRate
        conditions {
          scenarioId
          conditionName
          prioritized
          deprioritized
          neutral
          totalTrials
          selectedValueWinRate
          meanDecisionScore
        }
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

export type DomainAnalysisValueDetailCondition = {
  scenarioId: string | null;
  conditionName: string;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalTrials: number;
  selectedValueWinRate: number | null;
  meanDecisionScore: number | null;
};

export type DomainAnalysisValueDetailVignette = {
  definitionId: string;
  definitionName: string;
  definitionVersion: number;
  otherValueKey: string;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalTrials: number;
  selectedValueWinRate: number | null;
  conditions: DomainAnalysisValueDetailCondition[];
};

export type DomainAnalysisValueDetailResult = {
  domainId: string;
  domainName: string;
  modelId: string;
  modelLabel: string;
  valueKey: string;
  score: number;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalTrials: number;
  generatedAt: string;
  vignettes: DomainAnalysisValueDetailVignette[];
};

export type DomainAnalysisValueDetailQueryResult = {
  domainAnalysisValueDetail: DomainAnalysisValueDetailResult;
};

export type DomainAnalysisValueDetailQueryVariables = {
  domainId: string;
  modelId: string;
  valueKey: string;
};

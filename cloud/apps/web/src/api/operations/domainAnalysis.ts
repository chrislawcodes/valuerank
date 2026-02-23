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

export const DOMAIN_ANALYSIS_CONDITION_TRANSCRIPTS_QUERY = gql`
  query DomainAnalysisConditionTranscripts(
    $domainId: ID!
    $modelId: String!
    $valueKey: String!
    $definitionId: ID!
    $scenarioId: ID
    $limit: Int
  ) {
    domainAnalysisConditionTranscripts(
      domainId: $domainId
      modelId: $modelId
      valueKey: $valueKey
      definitionId: $definitionId
      scenarioId: $scenarioId
      limit: $limit
    ) {
      id
      runId
      scenarioId
      modelId
      decisionCode
      decisionCodeSource
      turnCount
      tokenCount
      durationMs
      createdAt
      content
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

export type DomainAnalysisConditionTranscript = {
  id: string;
  runId: string;
  scenarioId: string | null;
  modelId: string;
  decisionCode: string | null;
  decisionCodeSource: string | null;
  turnCount: number;
  tokenCount: number;
  durationMs: number;
  createdAt: string;
  content: unknown;
};

export type DomainAnalysisConditionTranscriptsQueryResult = {
  domainAnalysisConditionTranscripts: DomainAnalysisConditionTranscript[];
};

export type DomainAnalysisConditionTranscriptsQueryVariables = {
  domainId: string;
  modelId: string;
  valueKey: string;
  definitionId: string;
  scenarioId?: string | null;
  limit?: number;
};

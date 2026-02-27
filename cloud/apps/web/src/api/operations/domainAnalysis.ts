import { gql } from 'urql';

export const DOMAIN_ANALYSIS_QUERY = gql`
  query DomainAnalysis($domainId: ID!, $scoreMethod: String, $signature: String) {
    domainAnalysis(domainId: $domainId, scoreMethod: $scoreMethod, signature: $signature) {
      domainId
      domainName
      totalDefinitions
      targetedDefinitions
      coveredDefinitions
      missingDefinitionIds
      missingDefinitions {
        definitionId
        definitionName
        reasonCode
        reasonLabel
        missingAllModels
        missingModelIds
        missingModelLabels
      }
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
        rankingShape {
          topStructure
          bottomStructure
          topGap
          bottomGap
          spread
          steepness
          dominanceZScore
        }
      }
      unavailableModels {
        model
        label
        reason
      }
      rankingShapeBenchmarks {
        domainMeanTopGap
        domainStdTopGap
        medianSpread
      }
      clusterAnalysis {
        skipped
        skipReason
        defaultPair
        clusters {
          id
          name
          definingValues
          centroid
          members {
            model
            label
            silhouetteScore
            isOutlier
            nearestClusterIds
            distancesToNearestClusters
          }
        }
        faultLinesByPair
      }
      intensityStability {
        skipped
        skipReason
        mostUnstableValues
        models {
          model
          label
          sensitivityLabel
          sensitivityScore
          valuesWithSufficientData
          dataWarning
          valueStability {
            valueKey
            lowRank
            highRank
            lowScore
            highScore
            rankDelta
            scoreDelta
            isUnstable
            direction
          }
          strata {
            stratum
            comparisonCount
            sufficient
            insufficientReason
          }
        }
      }
    }
  }
`;

export const DOMAIN_ANALYSIS_QUERY_LEGACY = gql`
  query DomainAnalysisLegacy($domainId: ID!) {
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
  query DomainAnalysisValueDetail($domainId: ID!, $modelId: String!, $valueKey: String!, $scoreMethod: String, $signature: String) {
    domainAnalysisValueDetail(domainId: $domainId, modelId: $modelId, valueKey: $valueKey, scoreMethod: $scoreMethod, signature: $signature) {
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
      targetedDefinitions
      coveredDefinitions
      missingDefinitionIds
      generatedAt
      vignettes {
        definitionId
        definitionName
        definitionVersion
        aggregateRunId
        otherValueKey
        prioritized
        deprioritized
        neutral
        totalTrials
        selectedValueWinRate
        conditions {
          scenarioId
          conditionName
          dimensions
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

export const DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY_LEGACY = gql`
  query DomainAnalysisValueDetailLegacy($domainId: ID!, $modelId: String!, $valueKey: String!) {
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
        aggregateRunId
        otherValueKey
        prioritized
        deprioritized
        neutral
        totalTrials
        selectedValueWinRate
        conditions {
          scenarioId
          conditionName
          dimensions
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
    $signature: String
  ) {
    domainAnalysisConditionTranscripts(
      domainId: $domainId
      modelId: $modelId
      valueKey: $valueKey
      definitionId: $definitionId
      scenarioId: $scenarioId
      limit: $limit
      signature: $signature
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

export const DOMAIN_AVAILABLE_SIGNATURES_QUERY = gql`
  query DomainAvailableSignatures($domainId: ID!) {
    domainAvailableSignatures(domainId: $domainId) {
      signature
      label
      isVirtual
      temperature
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

export type TopStructureLabel = 'strong_leader' | 'tied_leaders' | 'even_spread';
export type BottomStructureLabel = 'hard_no' | 'mild_avoidance' | 'no_hard_no';

export type RankingShape = {
  topStructure: TopStructureLabel;
  bottomStructure: BottomStructureLabel;
  topGap: number;
  bottomGap: number;
  spread: number;
  steepness: number;
  dominanceZScore: number | null;
};

export type RankingShapeBenchmarks = {
  domainMeanTopGap: number;
  domainStdTopGap: number | null;
  medianSpread: number;
};

export type DomainAnalysisModel = {
  model: string;
  label: string;
  values: DomainAnalysisValueScore[];
  rankingShape?: RankingShape;
};

export type DomainAnalysisUnavailableModel = {
  model: string;
  label: string;
  reason: string;
};

export type ClusterMember = {
  model: string;
  label: string;
  silhouetteScore: number;
  isOutlier: boolean;
  nearestClusterIds: string[] | null;
  distancesToNearestClusters: number[] | null;
};

export type DomainCluster = {
  id: string;
  name: string;
  definingValues: string[];
  centroid: Record<string, number>;
  members: ClusterMember[];
};

export type ValueFaultLine = {
  valueKey: string;
  clusterAId: string;
  clusterBId: string;
  clusterAScore: number;
  clusterBScore: number;
  delta: number;
  absDelta: number;
};

export type ClusterPairFaultLines = {
  clusterAId: string;
  clusterBId: string;
  distance: number;
  faultLines: ValueFaultLine[];
};

export type ClusterAnalysis = {
  skipped: boolean;
  skipReason: string | null;
  defaultPair: string[] | null;
  clusters: DomainCluster[];
  faultLinesByPair: Record<string, ClusterPairFaultLines>;
};

export type ValueStabilityResult = {
  valueKey: string;
  lowRank: number | null;
  highRank: number | null;
  lowScore: number | null;
  highScore: number | null;
  rankDelta: number | null;
  scoreDelta: number | null;
  isUnstable: boolean;
  direction: 'strengthens' | 'weakens' | 'stable' | 'insufficient_data';
};

export type StratumResult = {
  stratum: 'low' | 'medium' | 'high';
  comparisonCount: number;
  sufficient: boolean;
  insufficientReason: 'low_count' | 'disconnected_graph' | null;
};

export type ModelIntensityStability = {
  model: string;
  label: string;
  sensitivityLabel: 'highly_stable' | 'moderately_sensitive' | 'highly_sensitive' | 'insufficient_data';
  sensitivityScore: number | null;
  valuesWithSufficientData: number;
  dataWarning: string | null;
  valueStability: ValueStabilityResult[];
  strata: StratumResult[];
};

export type IntensityStabilityAnalysis = {
  skipped: boolean;
  skipReason: 'insufficient_dimension_coverage' | 'no_intensity_variation' | 'all_models_insufficient' | null;
  mostUnstableValues: string[];
  models: ModelIntensityStability[];
};

export type DomainAnalysisResult = {
  domainId: string;
  domainName: string;
  totalDefinitions: number;
  targetedDefinitions: number;
  coveredDefinitions: number;
  missingDefinitionIds: string[];
  missingDefinitions: {
    definitionId: string;
    definitionName: string;
    reasonCode: 'NO_COMPLETED_RUNS' | 'NO_SIGNATURE_MATCH' | 'NO_TRANSCRIPTS';
    reasonLabel: string;
    missingAllModels: boolean;
    missingModelIds: string[];
    missingModelLabels: string[];
  }[];
  definitionsWithAnalysis: number;
  generatedAt: string;
  models: DomainAnalysisModel[];
  unavailableModels: DomainAnalysisUnavailableModel[];
  rankingShapeBenchmarks?: RankingShapeBenchmarks;
  clusterAnalysis?: ClusterAnalysis;
  intensityStability?: IntensityStabilityAnalysis;
};

export type DomainAnalysisQueryResult = {
  domainAnalysis: DomainAnalysisResult;
};

export type DomainAnalysisQueryVariables = {
  domainId: string;
  scoreMethod?: 'LOG_ODDS' | 'FULL_BT';
  signature?: string;
};

export type DomainAnalysisValueDetailCondition = {
  scenarioId: string | null;
  conditionName: string;
  dimensions: Record<string, string | number> | null;
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
  aggregateRunId: string | null;
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
  targetedDefinitions: number;
  coveredDefinitions: number;
  missingDefinitionIds: string[];
  generatedAt: string;
  vignettes: DomainAnalysisValueDetailVignette[];
};

export type DomainAvailableSignature = {
  signature: string;
  label: string;
  isVirtual: boolean;
  temperature: number | null;
};

export type DomainAvailableSignaturesQueryResult = {
  domainAvailableSignatures: DomainAvailableSignature[];
};

export type DomainAvailableSignaturesQueryVariables = {
  domainId: string;
};

export type DomainAnalysisValueDetailQueryResult = {
  domainAnalysisValueDetail: DomainAnalysisValueDetailResult;
};

export type DomainAnalysisValueDetailQueryVariables = {
  domainId: string;
  modelId: string;
  valueKey: string;
  scoreMethod?: 'LOG_ODDS' | 'FULL_BT';
  signature?: string;
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
  signature?: string;
};

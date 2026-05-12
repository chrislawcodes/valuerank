import type {
  DomainAnalysisQueryVariables as GeneratedDomainAnalysisQueryVariables,
  RefreshDomainAnalysisMutationVariables as GeneratedRefreshDomainAnalysisMutationVariables,
  DomainAnalysisPairDetailQuery as GeneratedDomainAnalysisPairDetailQuery,
  DomainAnalysisPairDetailQueryVariables as GeneratedDomainAnalysisPairDetailQueryVariables,
  DomainAnalysisValueDetailQueryVariables as GeneratedDomainAnalysisValueDetailQueryVariables,
  DomainAnalysisConditionTranscriptsQueryVariables as GeneratedDomainAnalysisConditionTranscriptsQueryVariables,
  DomainAvailableSignaturesQueryVariables as GeneratedDomainAvailableSignaturesQueryVariables,
  DomainFindingsEligibilityQueryVariables as GeneratedDomainFindingsEligibilityQueryVariables,
} from '../../generated/graphql';

import type { TranscriptDecisionModelV2 } from './runs';

// ============================================================================
// QUERIES
// ============================================================================

export { DomainAnalysisDocument as DOMAIN_ANALYSIS_QUERY } from '../../generated/graphql';
export { RefreshDomainAnalysisDocument as REFRESH_DOMAIN_ANALYSIS_MUTATION } from '../../generated/graphql';
export { DomainAnalysisLegacyDocument as DOMAIN_ANALYSIS_QUERY_LEGACY } from '../../generated/graphql';
export { DomainAnalysisPairDetailDocument as DOMAIN_ANALYSIS_PAIR_DETAIL_QUERY } from '../../generated/graphql';
export { DomainAnalysisValueDetailDocument as DOMAIN_ANALYSIS_VALUE_DETAIL_QUERY } from '../../generated/graphql';
export { DomainAnalysisConditionTranscriptsDocument as DOMAIN_ANALYSIS_CONDITION_TRANSCRIPTS_QUERY } from '../../generated/graphql';
export { DomainAvailableSignaturesDocument as DOMAIN_AVAILABLE_SIGNATURES_QUERY } from '../../generated/graphql';
export { DomainFindingsEligibilityDocument as DOMAIN_FINDINGS_ELIGIBILITY_QUERY } from '../../generated/graphql';

// ============================================================================
// MANUAL TYPES (kept manual — JSON scalars: centroid, faultLinesByPair, dimensions, content, decisionModelV2)
// ============================================================================

export type DomainAnalysisValueScore = {
  valueKey: string;
  score: number;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalComparisons: number;
  winRateExcNeutral: number | null;
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

export type DomainAnalysisResult = {
  domainId: string;
  domainName: string;
  contributionSummary: Array<{
    domainId: string;
    domainName: string;
    rawTrialCount: number;
    share: number;
  }>;
  excludedDataSummary: Array<{
    domainId: string;
    domainName: string;
    reasonCode: string;
    count: number;
  }>;
  totalDefinitions: number;
  targetedDefinitions: number;
  coveredDefinitions: number;
  missingDefinitionIds: string[];
  missingDefinitions: {
    definitionId: string;
    definitionName: string;
    reasonCode: 'NO_COMPLETED_RUNS' | 'NO_SIGNATURE_MATCH' | 'NO_TRANSCRIPTS' | 'NO_ANALYSIS';
    reasonLabel: string;
    missingAllModels: boolean;
    missingModelIds: string[];
    missingModelLabels: string[];
  }[];
  definitionsWithAnalysis: number;
  cacheStatus: 'FRESH' | 'UPDATING' | 'OUT_OF_DATE';
  generatedAt: string;
  refreshProgress: { completedRuns: number; totalRuns: number } | null;
  models: DomainAnalysisModel[];
  unavailableModels: DomainAnalysisUnavailableModel[];
  rankingShapeBenchmarks?: RankingShapeBenchmarks;
  clusterAnalysis?: ClusterAnalysis;
  clusterAnalysisByMethod?: Record<string, ClusterAnalysis>;
};

export type DomainAnalysisQueryResult = {
  domainAnalysis: DomainAnalysisResult;
};

export type DomainAnalysisQueryVariables = GeneratedDomainAnalysisQueryVariables;

export type RefreshDomainAnalysisMutationResult = {
  refreshDomainAnalysis: {
    success: boolean;
    mode: 'QUEUED' | 'REFRESHED';
    message: string;
  };
};

export type RefreshDomainAnalysisMutationVariables = GeneratedRefreshDomainAnalysisMutationVariables;

export type DomainFindingsEligibility = {
  domainId: string;
  eligible: boolean;
  status: 'ELIGIBLE' | 'DIAGNOSTIC_ONLY';
  summary: string;
  reasons: string[];
  recommendedActions: string[];
  consideredScopeCategories: Array<'PRODUCTION' | 'REPLICATION'>;
  completedEligibleEvaluationCount: number;
  latestEligibleEvaluationId: string | null;
  latestEligibleScopeCategory: 'PRODUCTION' | 'REPLICATION' | null;
  latestEligibleCompletedAt: string | null;
};

export type DomainFindingsEligibilityQueryResult = {
  domainFindingsEligibility: DomainFindingsEligibility;
};

export type DomainFindingsEligibilityQueryVariables = GeneratedDomainFindingsEligibilityQueryVariables;

export type DomainAnalysisValueDetailCondition = {
  scenarioId: string | null;
  conditionName: string;
  dimensions: Record<string, string | number> | null;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalTrials: number;
  selectedValueWinRate: number | null;
  strongly: number;
  somewhat: number;
  opponentSomewhat: number;
  opponentStrongly: number;
  unknownCount: number;
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

export type DomainAvailableSignaturesQueryVariables = GeneratedDomainAvailableSignaturesQueryVariables;

export type DomainAnalysisValueDetailQueryResult = {
  domainAnalysisValueDetail: DomainAnalysisValueDetailResult;
};

export type DomainAnalysisValueDetailQueryVariables = GeneratedDomainAnalysisValueDetailQueryVariables;

export type DomainAnalysisPairDetailQueryResult = GeneratedDomainAnalysisPairDetailQuery;
export type DomainAnalysisPairDetailQueryVariables = GeneratedDomainAnalysisPairDetailQueryVariables;
export type DomainAnalysisPairDetailResult = GeneratedDomainAnalysisPairDetailQuery['domainAnalysisPairDetail'];
export type DomainAnalysisPairVignetteDetail = DomainAnalysisPairDetailResult['vignettes'][number];

export type DomainAnalysisConditionTranscript = {
  id: string;
  runId: string;
  scenarioId: string | null;
  modelId: string;
  decisionModelV2?: TranscriptDecisionModelV2 | null;
  turnCount: number;
  tokenCount: number;
  durationMs: number;
  createdAt: string;
  content: unknown;
};

export type DomainAnalysisConditionTranscriptsQueryResult = {
  domainAnalysisConditionTranscripts: DomainAnalysisConditionTranscript[];
};

export type DomainAnalysisConditionTranscriptsQueryVariables = GeneratedDomainAnalysisConditionTranscriptsQueryVariables;

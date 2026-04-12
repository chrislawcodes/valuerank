import type { AggregateMetadata } from '../../api/operations/analysis';

export type SemanticUnavailableReason =
  | 'legacy-analysis'
  | 'aggregate-analysis'
  | 'suppressed-run-type'
  | 'unknown-analysis-version'
  | 'no-repeat-coverage'
  | 'insufficient-preference-data'
  | 'invalid-summary-shape';

export type AvailabilityState =
  | { status: 'available' }
  | { status: 'unavailable'; reason: SemanticUnavailableReason; message: string };

export type PreferenceViewModel = {
  modelId: string;
  overallLean: 'A' | 'B' | 'NEUTRAL' | null;
  topPrioritizedValues: Array<{ name: string; winRate: number | null }>;
  topDeprioritizedValues: Array<{ name: string; winRate: number | null }>;
  neutralValues: Array<{ name: string; winRate: number | null }>;
  availability: AvailabilityState;
};

export type ReliabilityViewModel = {
  modelId: string;
  baselineReliability: number | null;
  baselineNoise: number | null;
  directionalAgreement: number | null;
  neutralShare: number | null;
  coverageCount: number;
  uniqueScenarios: number;
  repeatCoverageShare: number | null;
  contributingRunCount: number | null;
  weightedOverallSignedCenterSd: number | null;
  hasLowCoverageWarning: boolean;
  hasHighDriftWarning: boolean;
  availability: AvailabilityState;
};

export type AnalysisSemanticsView = {
  preference: {
    rowAvailability: AvailabilityState;
    byModel: Record<string, PreferenceViewModel>;
  };
  reliability: {
    rowAvailability: AvailabilityState;
    byModel: Record<string, ReliabilityViewModel>;
    hasAnyAvailableModel: boolean;
    hasMixedAvailability: boolean;
    aggregateWarnings: {
      isEligibleAggregate: boolean;
      lowCoverageModels: string[];
      highDriftModels: string[];
    };
  };
};

export type RawPreferenceValueStats = {
  winRate: number;
  count?: {
    prioritized: number;
    deprioritized: number;
    neutral: number;
  };
};

export type PreferenceValueSummary = {
  name: string;
  winRate: number | null;
};

export type RawModelPreferenceSummary = {
  preferenceDirection: {
    byValue: Record<string, RawPreferenceValueStats>;
    overallLean: 'A' | 'B' | 'NEUTRAL' | null;
    overallSignedCenter: number | null;
  };
  preferenceStrength: number | null;
};

export type RawModelReliabilitySummary = {
  baselineNoise: number | null;
  baselineReliability: number | null;
  directionalAgreement: number | null;
  neutralShare: number | null;
  coverageCount: number;
  uniqueScenarios: number;
};

export type ParsedAggregateMetadata = AggregateMetadata;

export type SemverTuple = readonly [number, number, number];

export type AggregateSource = 'prop' | 'analysisType';

/**
 * JSON scalar descriptor types for runs.
 *
 * These types document the shape of JSON scalar fields in the GraphQL schema.
 * Codegen types them as `unknown`; this file gives them precise TypeScript shapes.
 * They live outside api/operations/ to keep the ESLint no-hand-typed-graphql-shapes
 * rule scoped correctly.
 */

export type RunConfig = {
  models: string[];
  samplePercentage?: number;
  sampleSeed?: number;
  temperature?: number | null;
  priority?: string;
  companionRunId?: string | null;
  jobChoiceLaunchMode?: 'PAIRED_BATCH' | 'PAIRED_BATCH_TOPUP' | 'AD_HOC_BATCH' | 'STANDARD' | null;
  jobChoiceBatchGroupId?: string | null;
  /** @deprecated Use definitionSnapshot.components.value_first.token instead. */
  jobChoiceValueFirst?: string | null;
  isAggregate?: boolean;
  sourceRunIds?: string[];
  methodologySafe?: boolean | null;
};

export type TranscriptDecisionModelV2RawEvidence = {
  matchedText: string | null;
  matchedLabel: string | null;
  parseClass: 'exact' | 'fallback_resolved' | 'ambiguous' | 'unparseable' | null;
  parsePath: string | null;
  parserVersion: string | null;
  responseExcerpt: string | null;
  manualOverride: {
    previousValue: string | null;
    overriddenAt: string | null;
    overriddenByUserId: string | null;
  } | null;
};

export type TranscriptDecisionModelV2Canonical = {
  favoredValueKey: string | null;
  opposedValueKey: string | null;
  direction: 'favor_first' | 'favor_second' | 'neutral' | 'unknown';
  strength: 'strong' | 'lean' | 'neutral' | 'unknown';
  normalizationApplied: boolean;
  normalizationReason: 'orientation_flipped' | null;
  source: 'deterministic' | 'manual' | 'error' | 'unknown';
};

export type TranscriptDecisionModelV2 = {
  raw: TranscriptDecisionModelV2RawEvidence;
  canonical: TranscriptDecisionModelV2Canonical;
};

export type AnalysisFolderCountOverrides = {
  aggregateCount: number;
  untaggedCount: number;
  aggregateUntaggedCount: number;
  tagCounts: Record<string, number>;
  aggregateTagCounts: Record<string, number>;
};

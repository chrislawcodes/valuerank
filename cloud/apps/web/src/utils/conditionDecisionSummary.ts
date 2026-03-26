import type { Transcript } from '../api/operations/runs';
import { formatDisplayLabel } from './displayLabels';
import { hasRenderableTranscriptDecisionModelV2 } from './transcriptDecisionModel';

export const CONDITION_DECISION_BUCKET_ORDER = [
  'strong_first',
  'lean_first',
  'neutral',
  'lean_second',
  'strong_second',
  'unknown',
] as const;

export type ConditionDecisionBucketKey = (typeof CONDITION_DECISION_BUCKET_ORDER)[number];

export type ConditionDecisionLabelPair = {
  firstValueLabel: string;
  secondValueLabel: string;
};

export type ConditionDecisionBucket = {
  key: ConditionDecisionBucketKey;
  label: string;
  count: number;
};

export type ConditionDecisionSummary = {
  buckets: ConditionDecisionBucket[];
  labelPair: ConditionDecisionLabelPair | null;
  knownCount: number;
  unknownCount: number;
  totalCount: number;
};

function getConditionDecisionBucketKey(transcript: Transcript): ConditionDecisionBucketKey {
  if (!hasRenderableTranscriptDecisionModelV2(transcript)) {
    return 'unknown';
  }

  const canonical = transcript.decisionModelV2?.canonical;
  if (!canonical) {
    return 'unknown';
  }

  if (canonical.direction === 'neutral' && canonical.strength === 'neutral') {
    return 'neutral';
  }

  if (canonical.direction === 'favor_first' && canonical.strength === 'strong') {
    return 'strong_first';
  }

  if (canonical.direction === 'favor_first' && canonical.strength === 'lean') {
    return 'lean_first';
  }

  if (canonical.direction === 'favor_second' && canonical.strength === 'lean') {
    return 'lean_second';
  }

  if (canonical.direction === 'favor_second' && canonical.strength === 'strong') {
    return 'strong_second';
  }

  return 'unknown';
}

function resolveLabelPair(transcripts: Transcript[]): ConditionDecisionLabelPair | null {
  for (const transcript of transcripts) {
    if (!hasRenderableTranscriptDecisionModelV2(transcript)) {
      continue;
    }

    const canonical = transcript.decisionModelV2.canonical;
    if (canonical.favoredValueKey == null || canonical.opposedValueKey == null) {
      continue;
    }

    return {
      firstValueLabel: formatDisplayLabel(canonical.favoredValueKey),
      secondValueLabel: formatDisplayLabel(canonical.opposedValueKey),
    };
  }

  return null;
}

function buildBucketLabels(labelPair: ConditionDecisionLabelPair | null): Record<ConditionDecisionBucketKey, string> {
  const firstValueLabel = labelPair?.firstValueLabel ?? 'canonical first value';
  const secondValueLabel = labelPair?.secondValueLabel ?? 'canonical second value';

  return {
    strong_first: `Strongly favors ${firstValueLabel}`,
    lean_first: `Somewhat favors ${firstValueLabel}`,
    neutral: 'Neutral',
    lean_second: `Somewhat favors ${secondValueLabel}`,
    strong_second: `Strongly favors ${secondValueLabel}`,
    unknown: 'Unknown',
  };
}

export function summarizeConditionDecisionBuckets(transcripts: Transcript[]): ConditionDecisionSummary {
  const counts: Record<ConditionDecisionBucketKey, number> = {
    strong_first: 0,
    lean_first: 0,
    neutral: 0,
    lean_second: 0,
    strong_second: 0,
    unknown: 0,
  };

  for (const transcript of transcripts) {
    const bucket = getConditionDecisionBucketKey(transcript);
    counts[bucket] += 1;
  }

  const labelPair = resolveLabelPair(transcripts);
  const labels = buildBucketLabels(labelPair);

  const buckets = CONDITION_DECISION_BUCKET_ORDER.map((key) => ({
    key,
    label: labels[key],
    count: counts[key],
  }));

  return {
    buckets,
    labelPair,
    knownCount:
      counts.strong_first
      + counts.lean_first
      + counts.neutral
      + counts.lean_second
      + counts.strong_second,
    unknownCount: counts.unknown,
    totalCount: transcripts.length,
  };
}

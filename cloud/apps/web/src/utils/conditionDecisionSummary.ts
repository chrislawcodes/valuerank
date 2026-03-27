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
  const pairCounts = new Map<string, { count: number; firstValueLabel: string; secondValueLabel: string }>();

  for (const transcript of transcripts) {
    if (!hasRenderableTranscriptDecisionModelV2(transcript)) {
      continue;
    }

    const canonical = transcript.decisionModelV2.canonical;
    if (canonical.favoredValueKey == null || canonical.opposedValueKey == null) {
      continue;
    }

    const firstValueLabel = formatDisplayLabel(canonical.favoredValueKey);
    const secondValueLabel = formatDisplayLabel(canonical.opposedValueKey);
    const key = `${firstValueLabel}||${secondValueLabel}`;
    const current = pairCounts.get(key);
    if (current) {
      current.count += 1;
    } else {
      pairCounts.set(key, {
        count: 1,
        firstValueLabel,
        secondValueLabel,
      });
    }
  }

  if (pairCounts.size === 0) {
    return null;
  }

  const bestPair = Array.from(pairCounts.values())
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }

      const firstCompare = a.firstValueLabel.localeCompare(b.firstValueLabel);
      if (firstCompare !== 0) {
        return firstCompare;
      }

      return a.secondValueLabel.localeCompare(b.secondValueLabel);
    })[0] ?? null;

  if (!bestPair) {
    return null;
  }

  return {
    firstValueLabel: bestPair.firstValueLabel,
    secondValueLabel: bestPair.secondValueLabel,
  };
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

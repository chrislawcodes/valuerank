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

type PairLabelStats = {
  count: number;
  labels: [string, string];
};

function getConditionDecisionBucketKey(transcript: Transcript): ConditionDecisionBucketKey {
  if (!hasRenderableTranscriptDecisionModelV2(transcript)) {
    return 'unknown';
  }

  const canonical = transcript.decisionModelV2?.canonical;
  if (!canonical) {
    return 'unknown';
  }

  if (canonical.strength === 'neutral') {
    return 'neutral';
  }

  const { favoredValueKey, opposedValueKey, strength } = canonical;
  if (favoredValueKey == null || opposedValueKey == null) {
    return 'unknown';
  }

  // Alphabetically-first value is canonical "first" (blue) side; second is "second" (orange).
  // This is stable across both runs in a paired batch, unlike canonical.direction which is
  // position-based (valueA/valueB) and flips between companion runs.
  const isFirst = favoredValueKey.localeCompare(opposedValueKey) < 0;

  if (isFirst && strength === 'strong') return 'strong_first';
  if (isFirst && strength === 'lean') return 'lean_first';
  if (!isFirst && strength === 'lean') return 'lean_second';
  if (!isFirst && strength === 'strong') return 'strong_second';

  return 'unknown';
}

export function resolveConditionDecisionLabelPair(transcripts: Transcript[]): ConditionDecisionLabelPair | null {
  const pairCounts = new Map<string, PairLabelStats>();

  for (const transcript of transcripts) {
    if (!hasRenderableTranscriptDecisionModelV2(transcript)) {
      continue;
    }

    const canonical = transcript.decisionModelV2.canonical;
    if (canonical.favoredValueKey == null || canonical.opposedValueKey == null) {
      continue;
    }

    const favoredValueLabel = formatDisplayLabel(canonical.favoredValueKey);
    const opposedValueLabel = formatDisplayLabel(canonical.opposedValueKey);
    // labels[0] is always the alphabetically-first value — stable "first" (blue) side
    const labels = [favoredValueLabel, opposedValueLabel].sort((left, right) => left.localeCompare(right)) as [string, string];
    const key = `${labels[0]}||${labels[1]}`;
    const current = pairCounts.get(key);
    if (current) {
      current.count += 1;
    } else {
      pairCounts.set(key, { count: 1, labels });
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

      const firstCompare = a.labels[0].localeCompare(b.labels[0]);
      if (firstCompare !== 0) {
        return firstCompare;
      }

      return a.labels[1].localeCompare(b.labels[1]);
    })[0] ?? null;

  if (!bestPair) {
    return null;
  }

  return {
    firstValueLabel: bestPair.labels[0],
    secondValueLabel: bestPair.labels[1],
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

  const labelPair = resolveConditionDecisionLabelPair(transcripts);
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

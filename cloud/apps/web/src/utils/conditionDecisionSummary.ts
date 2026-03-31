import type { Transcript } from '../api/operations/runs';
import { formatDisplayLabel } from './displayLabels';
import { hasRenderableTranscriptDecisionModelV2 } from './transcriptDecisionModel';

export type ConditionDecisionFilterParams = {
  decisionStrength: 'strong' | 'lean' | 'neutral' | 'unknown';
  favoredValueKey?: string;
};

export type ConditionDecisionLabelPair = {
  firstValueKey: string;
  firstValueLabel: string;
  secondValueKey: string;
  secondValueLabel: string;
};

export type ConditionDecisionBucket = {
  label: string;
  count: number;
  filterParams: ConditionDecisionFilterParams | null;
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
  firstValueKey: string;
  secondValueKey: string;
  labels: [string, string];
};

type ConditionDecisionBucketSlot = 0 | 1 | 2 | 3 | 4 | 5;

type ConditionDecisionBucketSpec = {
  label: string;
  filterParams: ConditionDecisionFilterParams | null;
};

function getConditionDecisionBucketSlot(transcript: Transcript): ConditionDecisionBucketSlot {
  if (!hasRenderableTranscriptDecisionModelV2(transcript)) {
    return 5;
  }

  const canonical = transcript.decisionModelV2?.canonical;
  if (!canonical) {
    return 5;
  }

  if (canonical.strength === 'neutral') {
    return 2;
  }

  const { favoredValueKey, opposedValueKey, strength } = canonical;
  if (favoredValueKey == null || opposedValueKey == null) {
    return 5;
  }

  // Alphabetically-first value is canonical "first" (blue) side; second is "second" (orange).
  // This is stable across both runs in a paired batch, unlike canonical.direction which is
  // position-based (valueA/valueB) and flips between companion runs.
  const isFirst = favoredValueKey.localeCompare(opposedValueKey) < 0;

  if (isFirst && strength === 'strong') return 0;
  if (isFirst && strength === 'lean') return 1;
  if (!isFirst && strength === 'lean') return 3;
  if (!isFirst && strength === 'strong') return 4;

  return 5;
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

    const firstValueKey = canonical.favoredValueKey.localeCompare(canonical.opposedValueKey) < 0
      ? canonical.favoredValueKey
      : canonical.opposedValueKey;
    const secondValueKey = firstValueKey === canonical.favoredValueKey
      ? canonical.opposedValueKey
      : canonical.favoredValueKey;
    const labels = [
      formatDisplayLabel(firstValueKey),
      formatDisplayLabel(secondValueKey),
    ] as [string, string];
    const key = `${firstValueKey}||${secondValueKey}`;
    const current = pairCounts.get(key);
    if (current) {
      current.count += 1;
    } else {
      pairCounts.set(key, {
        count: 1,
        firstValueKey,
        secondValueKey,
        labels,
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
    firstValueKey: bestPair.firstValueKey,
    firstValueLabel: bestPair.labels[0],
    secondValueKey: bestPair.secondValueKey,
    secondValueLabel: bestPair.labels[1],
  };
}

function buildBucketSpecs(labelPair: ConditionDecisionLabelPair | null): ConditionDecisionBucketSpec[] {
  const firstValueLabel = labelPair?.firstValueLabel ?? 'canonical first value';
  const secondValueLabel = labelPair?.secondValueLabel ?? 'canonical second value';

  return [
    {
      label: `Strongly favors ${firstValueLabel}`,
      filterParams: labelPair == null
        ? null
        : { decisionStrength: 'strong', favoredValueKey: labelPair.firstValueKey },
    },
    {
      label: `Somewhat favors ${firstValueLabel}`,
      filterParams: labelPair == null
        ? null
        : { decisionStrength: 'lean', favoredValueKey: labelPair.firstValueKey },
    },
    {
      label: 'Neutral',
      filterParams: { decisionStrength: 'neutral' },
    },
    {
      label: `Somewhat favors ${secondValueLabel}`,
      filterParams: labelPair == null
        ? null
        : { decisionStrength: 'lean', favoredValueKey: labelPair.secondValueKey },
    },
    {
      label: `Strongly favors ${secondValueLabel}`,
      filterParams: labelPair == null
        ? null
        : { decisionStrength: 'strong', favoredValueKey: labelPair.secondValueKey },
    },
    {
      label: 'Unknown',
      filterParams: { decisionStrength: 'unknown' },
    },
  ];
}

export function summarizeConditionDecisionBuckets(transcripts: Transcript[]): ConditionDecisionSummary {
  const counts: Record<ConditionDecisionBucketSlot, number> = {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  for (const transcript of transcripts) {
    const bucket = getConditionDecisionBucketSlot(transcript);
    counts[bucket] += 1;
  }

  const labelPair = resolveConditionDecisionLabelPair(transcripts);
  const buckets = buildBucketSpecs(labelPair).map((bucket, index) => ({
    ...bucket,
    count: counts[index as ConditionDecisionBucketSlot],
  }));

  return {
    buckets,
    labelPair,
    knownCount:
      counts[0]
      + counts[1]
      + counts[2]
      + counts[3]
      + counts[4],
    unknownCount: counts[5],
    totalCount: transcripts.length,
  };
}

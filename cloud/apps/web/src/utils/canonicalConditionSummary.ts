import type { Transcript } from '../api/operations/runs';

export type CanonicalConditionSummary = {
  strongly: number;
  somewhat: number;
  neutral: number;
  opponentSomewhat: number;
  opponentStrongly: number;
  unknownCount: number;
  totalTrials: number;
  netScore: number | null;
  direction: 'self' | 'opponent' | 'neutral';
  hasData: boolean;
};

export type CanonicalConditionCounts = {
  strongly: number;
  somewhat: number;
  neutral: number;
  opponentSomewhat: number;
  opponentStrongly: number;
};

export type CanonicalTranscriptIndex = Map<string, Map<string, Transcript[]>>;

type CanonicalBucket = 'strongly' | 'somewhat' | 'neutral' | 'opponentSomewhat' | 'opponentStrongly';
type CanonicalConditionTally = CanonicalConditionCounts & { unknownCount: number };

function getCanonicalBucket(transcript: Transcript): CanonicalBucket | null {
  const canonical = transcript.decisionModelV2?.canonical;
  if (!canonical) {
    return null;
  }

  if (canonical.strength === 'neutral') {
    return 'neutral';
  }

  const { favoredValueKey, opposedValueKey, strength } = canonical;
  if (favoredValueKey == null || opposedValueKey == null) {
    return null;
  }

  // Alphabetically-first value is the canonical "first" (blue) side; second is
  // the "opponent" (orange) side.  This is stable across both runs in a paired
  // batch, unlike canonical.direction which is position-based (valueA/valueB)
  // and flips between companion runs.
  const isFirst = favoredValueKey.localeCompare(opposedValueKey) < 0;

  if (isFirst && strength === 'strong') return 'strongly';
  if (isFirst && strength === 'lean') return 'somewhat';
  if (!isFirst && strength === 'lean') return 'opponentSomewhat';
  if (!isFirst && strength === 'strong') return 'opponentStrongly';

  return null;
}

export function buildCanonicalTranscriptIndex(transcripts: Transcript[] | null | undefined): CanonicalTranscriptIndex {
  const index = new Map<string, Map<string, Transcript[]>>();

  for (const transcript of transcripts ?? []) {
    if (!transcript.scenarioId) {
      continue;
    }

    const modelId = transcript.modelId;
    const scenarioId = String(transcript.scenarioId);
    const byScenario = index.get(modelId) ?? new Map<string, Transcript[]>();
    const current = byScenario.get(scenarioId);
    if (current) {
      current.push(transcript);
    } else {
      byScenario.set(scenarioId, [transcript]);
    }
    index.set(modelId, byScenario);
  }

  return index;
}

export function collectCanonicalConditionTranscripts(
  transcriptIndex: CanonicalTranscriptIndex,
  modelId: string,
  scenarioIds: string[],
): Transcript[] {
  const byScenario = transcriptIndex.get(modelId);
  if (!byScenario) {
    return [];
  }

  const collected: Transcript[] = [];
  scenarioIds.forEach((scenarioId) => {
    collected.push(...(byScenario.get(scenarioId) ?? []));
  });
  return collected;
}

export function summarizeCanonicalConditionTranscripts(
  transcripts: Transcript[] | null | undefined,
): CanonicalConditionSummary {
  const counts: CanonicalConditionTally = {
    strongly: 0,
    somewhat: 0,
    neutral: 0,
    opponentSomewhat: 0,
    opponentStrongly: 0,
    unknownCount: 0,
  };

  for (const transcript of transcripts ?? []) {
    const bucket = getCanonicalBucket(transcript);
    if (!bucket) {
      counts.unknownCount += 1;
      continue;
    }

    counts[bucket] += 1;
  }

  return summarizeCanonicalConditionTally(counts);
}

export function summarizeCanonicalConditionCounts(
  counts: CanonicalConditionCounts,
): CanonicalConditionSummary {
  return summarizeCanonicalConditionTally({
    strongly: coerceNonNegativeFiniteCount(counts.strongly),
    somewhat: coerceNonNegativeFiniteCount(counts.somewhat),
    neutral: coerceNonNegativeFiniteCount(counts.neutral),
    opponentSomewhat: coerceNonNegativeFiniteCount(counts.opponentSomewhat),
    opponentStrongly: coerceNonNegativeFiniteCount(counts.opponentStrongly),
    unknownCount: 0,
  });
}

function coerceNonNegativeFiniteCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function summarizeCanonicalConditionTally(counts: CanonicalConditionTally): CanonicalConditionSummary {
  const totalTrials =
    counts.strongly
    + counts.somewhat
    + counts.neutral
    + counts.opponentSomewhat
    + counts.opponentStrongly;

  if (totalTrials === 0) {
    return {
      ...counts,
      totalTrials,
      netScore: null,
      direction: 'neutral',
      hasData: false,
    };
  }

  const netScore = (
    (2 * counts.strongly + counts.somewhat)
    - (2 * counts.opponentStrongly + counts.opponentSomewhat)
  ) / totalTrials;

  // Threshold is inclusive (>= 0.05) so it aligns with the one-decimal label:
  // |netScore| >= 0.05 rounds to "0.1" and should render directional, not neutral.
  let direction: CanonicalConditionSummary['direction'] = 'neutral';
  if (netScore >= 0.05) {
    direction = 'self';
  } else if (netScore <= -0.05) {
    direction = 'opponent';
  }

  return {
    ...counts,
    totalTrials,
    netScore,
    direction,
    hasData: true,
  };
}

export type ConditionCellDisplay = {
  netScore: number | null;
  direction: 'self' | 'opponent' | 'neutral';
  hasData: boolean;
  label: string;
  backgroundColor: string | undefined;
  textColorClass: string;
};

export function getConditionCellDisplay(summary: CanonicalConditionSummary): ConditionCellDisplay {
  if (!summary.hasData) {
    return {
      netScore: null,
      direction: summary.direction,
      hasData: false,
      label: '—',
      backgroundColor: undefined,
      textColorClass: 'text-gray-500',
    };
  }

  const netScore = summary.netScore ?? 0;
  const magnitude = Math.abs(netScore);
  const label = magnitude.toFixed(1);

  if (summary.direction === 'neutral') {
    return {
      netScore: summary.netScore,
      direction: 'neutral',
      hasData: true,
      label,
      backgroundColor: undefined,
      textColorClass: 'text-gray-500',
    };
  }

  // Directional fill: magnitude in [0, 2] maps linearly to opacity [0, 0.5].
  const clamped = Math.min(2, Math.max(0, magnitude));
  const opacity = (clamped / 2) * 0.5;
  const isOpposing = summary.direction === 'opponent';
  const backgroundColor = isOpposing
    ? `rgba(251, 146, 60, ${opacity})`
    : `rgba(59, 130, 246, ${opacity})`;
  const textColorClass = isOpposing ? 'text-orange-700' : 'text-blue-700';

  return {
    netScore: summary.netScore,
    direction: summary.direction,
    hasData: true,
    label,
    backgroundColor,
    textColorClass,
  };
}

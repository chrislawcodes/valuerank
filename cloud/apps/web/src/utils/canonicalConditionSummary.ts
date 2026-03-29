import type { Transcript } from '../api/operations/runs';

export type CanonicalConditionSummary = {
  strongly: number;
  somewhat: number;
  neutral: number;
  opponentSomewhat: number;
  opponentStrongly: number;
  unknownCount: number;
  totalTrials: number;
  selectedValueWinRate: number | null;
  isOpponent: boolean;
};

export type CanonicalTranscriptIndex = Map<string, Map<string, Transcript[]>>;

type CanonicalBucket = 'strongly' | 'somewhat' | 'neutral' | 'opponentSomewhat' | 'opponentStrongly';

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
  const counts = {
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
      selectedValueWinRate: null,
      isOpponent: false,
    };
  }

  const selectedValueWinRate = (counts.strongly + counts.somewhat) / totalTrials;
  const isOpponent = (selectedValueWinRate ?? 0.5) < 0.5;

  return {
    ...counts,
    totalTrials,
    selectedValueWinRate,
    isOpponent,
  };
}

export function getCanonicalConditionBackground(score: number, isOpponent: boolean): string {
  // score is selectedValueWinRate (0–1). Opacity reflects distance from 0.5 (neutral),
  // mapped to 0–1 so both strong-selected (1.0) and strong-opponent (0.0) render at full intensity.
  const clamped = Math.min(1, Math.max(0, score));
  const opacity = Math.abs(clamped - 0.5) * 2;
  if (isOpponent) {
    return `rgba(251, 146, 60, ${opacity * 0.5})`;
  }
  return `rgba(59, 130, 246, ${opacity * 0.5})`;
}

export function getCanonicalConditionTextColor(isOpponent: boolean): string {
  return isOpponent ? 'text-orange-700' : 'text-blue-700';
}

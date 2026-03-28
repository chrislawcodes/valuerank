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
  meanPreferenceScore: number | null;
  opponentMeanPreferenceScore: number | null;
  displayScore: number | null;
  isOpponent: boolean;
};

export type CanonicalTranscriptIndex = Map<string, Map<string, Transcript[]>>;

type CanonicalBucket = 'strongly' | 'somewhat' | 'neutral' | 'opponentSomewhat' | 'opponentStrongly';

function getCanonicalBucket(transcript: Transcript): CanonicalBucket | null {
  const canonical = transcript.decisionModelV2?.canonical;
  if (!canonical) {
    return null;
  }

  if (canonical.direction === 'neutral' && canonical.strength === 'neutral') {
    return 'neutral';
  }

  if (canonical.direction === 'favor_first' && canonical.strength === 'strong') {
    return 'strongly';
  }

  if (canonical.direction === 'favor_first' && canonical.strength === 'lean') {
    return 'somewhat';
  }

  if (canonical.direction === 'favor_second' && canonical.strength === 'lean') {
    return 'opponentSomewhat';
  }

  if (canonical.direction === 'favor_second' && canonical.strength === 'strong') {
    return 'opponentStrongly';
  }

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
      meanPreferenceScore: null,
      opponentMeanPreferenceScore: null,
      displayScore: null,
      isOpponent: false,
    };
  }

  const meanPreferenceScore = (2 * counts.strongly + counts.somewhat) / totalTrials;
  const opponentMeanPreferenceScore = (2 * counts.opponentStrongly + counts.opponentSomewhat) / totalTrials;
  const isOpponent = opponentMeanPreferenceScore > meanPreferenceScore;
  // Ties read as 0 (neutral) — neither side won a clear majority.
  const isTie = !isOpponent && meanPreferenceScore === opponentMeanPreferenceScore && meanPreferenceScore > 0;
  const displayScore = isTie ? 0 : isOpponent ? opponentMeanPreferenceScore : meanPreferenceScore;

  return {
    ...counts,
    totalTrials,
    selectedValueWinRate: (counts.strongly + counts.somewhat) / totalTrials,
    meanPreferenceScore,
    opponentMeanPreferenceScore,
    displayScore,
    isOpponent,
  };
}

export function getCanonicalConditionBackground(score: number, isOpponent: boolean): string {
  const opacity = Math.min(1, Math.max(0, score / 2));
  if (isOpponent) {
    return `rgba(251, 146, 60, ${opacity * 0.5})`;
  }
  return `rgba(59, 130, 246, ${opacity * 0.5})`;
}

export function getCanonicalConditionTextColor(isOpponent: boolean): string {
  return isOpponent ? 'text-orange-700' : 'text-blue-700';
}

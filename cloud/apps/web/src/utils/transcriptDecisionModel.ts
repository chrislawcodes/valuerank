import type { Transcript } from '../api/operations/runs';
import { formatDisplayLabel } from './displayLabels';

export type TranscriptDecisionDisplayMode = 'legacy' | 'audit';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function hasTranscriptDecisionModelV2(
  transcript: Transcript,
): transcript is Transcript & { decisionModelV2: NonNullable<Transcript['decisionModelV2']> } {
  return transcript.decisionModelV2 != null;
}

export function formatCanonicalDecisionHeadline(transcript: Transcript): string {
  const canonical = transcript.decisionModelV2?.canonical;
  if (!canonical) return '-';

  if (canonical.direction === 'neutral') {
    return 'Neutral';
  }

  if (
    canonical.favoredValueKey == null
    || canonical.opposedValueKey == null
    || canonical.direction === 'unknown'
    || canonical.strength === 'unknown'
  ) {
    return 'Unknown';
  }

  return `${formatDisplayLabel(canonical.favoredValueKey)} > ${formatDisplayLabel(canonical.opposedValueKey)}`;
}

export function formatCanonicalDecisionSubtitle(transcript: Transcript): string {
  const canonical = transcript.decisionModelV2?.canonical;
  if (!canonical) return '';

  if (canonical.direction === 'unknown' || canonical.strength === 'unknown') {
    return 'Unknown decision';
  }

  if (canonical.direction === 'neutral') {
    return 'Neutral';
  }

  const directionLabel = canonical.direction === 'favor_first'
    ? 'Favors first value'
    : 'Favors second value';
  return `${directionLabel} · ${canonical.strength}`;
}

export function normalizeLegacyDecisionCode(decision: string, normalizeDecision: boolean): string {
  if (!normalizeDecision) {
    return decision;
  }

  if (!['1', '2', '3', '4', '5'].includes(decision)) {
    return decision;
  }

  return String(6 - Number(decision));
}

export function getTranscriptDecisionSortValue(
  transcript: Transcript,
  displayMode: TranscriptDecisionDisplayMode,
): string | number {
  if (displayMode === 'audit') {
    return transcript.decisionModelV2?.legacy?.canonicalScore ?? '';
  }

  const fallbackCandidates = [
    transcript.decisionCode,
    (transcript.content as { decisionCode?: unknown } | null)?.decisionCode,
    (transcript.content as { decision?: unknown } | null)?.decision,
    (transcript.content as { score?: unknown } | null)?.score,
    (transcript.content as { summary?: { decisionCode?: unknown; decision?: unknown; score?: unknown } } | null)?.summary?.decisionCode,
    (transcript.content as { summary?: { decisionCode?: unknown; decision?: unknown; score?: unknown } } | null)?.summary?.decision,
    (transcript.content as { summary?: { decisionCode?: unknown; decision?: unknown; score?: unknown } } | null)?.summary?.score,
  ];

  for (const candidate of fallbackCandidates) {
    if (typeof candidate === 'number' || typeof candidate === 'string') {
      return candidate;
    }
  }

  return '';
}

export function isTranscriptDecisionMetadata(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

import type { Transcript } from '../api/operations/runs';
import { formatDisplayLabel } from './displayLabels';

export type TranscriptDecisionDisplayMode = 'legacy' | 'audit';

export class CanonicalTranscriptRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalTranscriptRenderError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasRenderableDecisionModelV2(
  value: Transcript['decisionModelV2'],
): value is NonNullable<Transcript['decisionModelV2']> {
  const canonical = value?.canonical;
  const raw = value?.raw;

  if (!value || !canonical || !raw) {
    return false;
  }

  if (typeof raw.parseClass !== 'string' || raw.parseClass.trim().length === 0) {
    return false;
  }

  if (canonical.direction === 'neutral') {
    return canonical.strength === 'neutral';
  }

  if (canonical.direction === 'unknown' || canonical.strength === 'unknown') {
    return false;
  }

  return (
    canonical.favoredValueKey != null
    && canonical.opposedValueKey != null
  );
}

export function hasRenderableTranscriptDecisionModelV2(
  transcript: Transcript,
): transcript is Transcript & { decisionModelV2: NonNullable<Transcript['decisionModelV2']> } {
  return hasRenderableDecisionModelV2(transcript.decisionModelV2);
}

export function hasTranscriptDecisionModelV2(
  transcript: Transcript,
): transcript is Transcript & { decisionModelV2: NonNullable<Transcript['decisionModelV2']> } {
  return hasRenderableTranscriptDecisionModelV2(transcript);
}

export function requireRenderableTranscriptDecisionModelV2(
  transcript: Transcript,
  context = 'Transcript report surface',
): Transcript & { decisionModelV2: NonNullable<Transcript['decisionModelV2']> } {
  if (hasRenderableTranscriptDecisionModelV2(transcript)) {
    return transcript;
  }

  throw new CanonicalTranscriptRenderError(
    `${context}: transcript ${transcript.id} is missing renderable canonical decisionModelV2 data.`,
  );
}

function hasReportRenderableTranscriptDecisionModelV2(
  value: Transcript['decisionModelV2'],
): value is NonNullable<Transcript['decisionModelV2']> {
  if (!value || !isRecord(value) || !isRecord(value.raw) || !isRecord(value.canonical) || !isRecord(value.legacy)) {
    return false;
  }

  if (typeof value.raw.parseClass !== 'string' || value.raw.parseClass.trim().length === 0) {
    return false;
  }

  if (typeof value.canonical.direction !== 'string' || typeof value.canonical.strength !== 'string') {
    return false;
  }

  if (value.canonical.direction === 'neutral') {
    return value.canonical.strength === 'neutral';
  }

  if (value.canonical.direction === 'unknown' || value.canonical.strength === 'unknown') {
    return true;
  }

  return (
    typeof value.canonical.favoredValueKey === 'string'
    && value.canonical.favoredValueKey.trim().length > 0
    && typeof value.canonical.opposedValueKey === 'string'
    && value.canonical.opposedValueKey.trim().length > 0
  );
}

export function hasReportTranscriptDecisionModelV2(
  transcript: Transcript,
): transcript is Transcript & { decisionModelV2: NonNullable<Transcript['decisionModelV2']> } {
  return hasReportRenderableTranscriptDecisionModelV2(transcript.decisionModelV2);
}

export function assertReportTranscriptDecisionModelV2(
  transcript: Transcript,
): asserts transcript is Transcript & { decisionModelV2: NonNullable<Transcript['decisionModelV2']> } {
  if (!hasReportTranscriptDecisionModelV2(transcript)) {
    throw new Error(`Survey results require canonical decision-model-v2 data for transcript ${transcript.id}`);
  }
}

export function getTranscriptDecisionDisplayMode(
  transcripts: Transcript[],
): TranscriptDecisionDisplayMode {
  if (transcripts.length === 0) {
    return 'legacy';
  }

  return transcripts.every(hasRenderableTranscriptDecisionModelV2)
    ? 'audit'
    : 'legacy';
}

function getCanonicalTranscriptDecisionSortValue(transcript: Transcript): string | number {
  const canonical = transcript.decisionModelV2?.canonical;
  if (!canonical) {
    return '';
  }

  if (canonical.direction === 'neutral') {
    return 2;
  }

  if (canonical.direction === 'favor_first' && canonical.strength === 'strong') {
    return 0;
  }

  if (canonical.direction === 'favor_first' && canonical.strength === 'lean') {
    return 1;
  }

  if (canonical.direction === 'favor_second' && canonical.strength === 'lean') {
    return 3;
  }

  if (canonical.direction === 'favor_second' && canonical.strength === 'strong') {
    return 4;
  }

  return '';
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

  const strengthLabel = canonical.strength === 'strong' ? 'Strongly favors' : 'Somewhat favors';
  return `${strengthLabel} ${formatDisplayLabel(canonical.favoredValueKey)}`;
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

  return '';
}

export function getTranscriptDecisionAuditBadge(transcript: Transcript): string | null {
  const raw = transcript.decisionModelV2?.raw;
  if (!raw) return null;
  if (raw.manualOverride) return 'Manual';
  if (raw.parseClass === 'exact') return null;
  return 'Fallback';
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
    return getCanonicalTranscriptDecisionSortValue(transcript);
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

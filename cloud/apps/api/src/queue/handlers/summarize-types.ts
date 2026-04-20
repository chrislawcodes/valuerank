import crypto from 'crypto';
import { Prisma, type SummaryCache } from '@valuerank/db';

export type { SummarizeTranscriptJobData } from '../types.js';

export type WinnerFirstSummaryCache = NonNullable<SummaryCache['summary']['canonicalDecision']>;
export type SummaryCacheRecord = SummaryCache;

export function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function buildDecisionMetadataForPersist(
  decisionMetadata: unknown,
  rawDecisionEvidence: unknown,
  summaryCache?: SummaryCache,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (decisionMetadata == null) {
    return Prisma.DbNull;
  }

  if (!isPlainJsonObject(decisionMetadata)) {
    return decisionMetadata as Prisma.InputJsonValue;
  }

  const { summaryCache: _ignoredSummaryCache, ...persistedDecisionMetadata } = decisionMetadata;

  return {
    ...persistedDecisionMetadata,
    rawDecisionEvidence,
    ...(summaryCache ? { summaryCache } : {}),
  } as Prisma.InputJsonValue;
}

export function getTranscriptResponseText(transcriptContent: unknown): string {
  if (!isPlainJsonObject(transcriptContent)) {
    return '';
  }

  const turns = transcriptContent.turns;
  if (!Array.isArray(turns)) {
    return '';
  }

  const responses: string[] = [];
  for (const turn of turns) {
    if (!isPlainJsonObject(turn)) {
      continue;
    }

    const response = turn.targetResponse;
    if (typeof response === 'string' && response.length > 0) {
      responses.push(response);
    }
  }

  return responses.join('\n').trim();
}

export function computeTranscriptResponseSha256(transcriptContent: unknown): string | null {
  const responseText = getTranscriptResponseText(transcriptContent);
  if (responseText.length === 0) {
    return null;
  }

  return crypto.createHash('sha256').update(responseText, 'utf8').digest('hex');
}

export function isWinnerFirstSummaryCache(value: unknown): value is WinnerFirstSummaryCache {
  if (!isPlainJsonObject(value)) {
    return false;
  }

  // cacheVersion 2 is the only accepted shape. The remove-decisionCode
  // migration migrated every v1 row to v2; the tolerance bridge has been
  // removed.
  if (value.cacheVersion !== 2) {
    return false;
  }

  if (
    value.decisionState !== 'resolved'
    && value.decisionState !== 'neutral'
    && value.decisionState !== 'unknown'
    && value.decisionState !== 'refusal'
  ) {
    return false;
  }

  if (value.decisionState === 'resolved') {
    return (
      typeof value.favoredValueKey === 'string'
      && value.favoredValueKey.length > 0
      && (value.strength === 'strong' || value.strength === 'lean')
    );
  }

  if (value.decisionState === 'neutral') {
    return value.favoredValueKey === null && value.strength === 'neutral';
  }

  // "unknown" and "refusal" — both have null favored key and strength 'unknown'.
  return value.favoredValueKey === null && value.strength === 'unknown';
}

export function isSummaryCacheSummary(value: unknown): value is SummaryCache['summary'] {
  if (!isPlainJsonObject(value)) {
    return false;
  }

  // decisionCode/decisionCodeSource were removed from the write path. Stored
  // rows may still carry them (pre-migration), but the validator no longer
  // requires them. Post-migration rows have canonicalDecision as the only
  // decision signal.
  return (
    (typeof value.decisionText === 'string' || value.decisionText === null) &&
    isPlainJsonObject(value.decisionMetadata) &&
    (!('canonicalDecision' in value) || isWinnerFirstSummaryCache(value.canonicalDecision)) &&
    !('summaryCache' in value)
  );
}

export function isSummaryCache(value: unknown): value is SummaryCache {
  if (!isPlainJsonObject(value)) {
    return false;
  }

  return (
    typeof value.responseSha256 === 'string' &&
    value.responseSha256.length > 0 &&
    typeof value.parserVersion === 'string' &&
    value.parserVersion.length > 0 &&
    typeof value.modelId === 'string' &&
    value.modelId.length > 0 &&
    isSummaryCacheSummary(value.summary)
  );
}

import type { Transcript } from '../api/operations/runs';
import { formatCanonicalDecisionHeadline, hasRenderableTranscriptDecisionModelV2 } from './transcriptDecisionModel';

export const REPORT_DECISION_BUCKET_ORDER = ['strong', 'lean', 'neutral', 'unknown'] as const;

export type ReportDecisionBucketKind = (typeof REPORT_DECISION_BUCKET_ORDER)[number];

export type ReportTranscriptDecision = {
  transcriptId: string;
  headline: string;
  kind: ReportDecisionBucketKind;
  renderable: boolean;
};

export type ReportDecisionBucket = {
  kind: ReportDecisionBucketKind;
  label: string;
  count: number;
};

export type ReportDecisionSummary = {
  headline: string;
  totalCount: number;
  renderableCount: number;
  unknownCount: number;
  buckets: ReportDecisionBucket[];
};

function getBucketKind(headline: string, renderable: boolean): ReportDecisionBucketKind {
  if (!renderable || headline === 'Unknown') {
    return 'unknown';
  }

  if (headline === 'Neutral') {
    return 'neutral';
  }

  return headline.startsWith('Strongly favors ') ? 'strong' : 'lean';
}

function getBucketOrder(kind: ReportDecisionBucketKind): number {
  return REPORT_DECISION_BUCKET_ORDER.indexOf(kind);
}

export function normalizeReportTranscriptDecision(transcript: Transcript): ReportTranscriptDecision {
  if (!hasRenderableTranscriptDecisionModelV2(transcript)) {
    return {
      transcriptId: transcript.id,
      headline: 'Unknown',
      kind: 'unknown',
      renderable: false,
    };
  }

  const headline = formatCanonicalDecisionHeadline(transcript);
  return {
    transcriptId: transcript.id,
    headline,
    kind: getBucketKind(headline, true),
    renderable: true,
  };
}

export function summarizeReportTranscriptDecisions(transcripts: Transcript[]): ReportDecisionSummary {
  if (transcripts.length === 0) {
    return {
      headline: '—',
      totalCount: 0,
      renderableCount: 0,
      unknownCount: 0,
      buckets: [],
    };
  }

  const normalized = transcripts.map(normalizeReportTranscriptDecision);
  const bucketMap = new Map<string, ReportDecisionBucket>();

  let renderableCount = 0;
  let unknownCount = 0;

  normalized.forEach((decision) => {
    if (decision.renderable) {
      renderableCount += 1;
    } else {
      unknownCount += 1;
    }

    const bucketKey = `${decision.kind}::${decision.headline}`;
    const bucket = bucketMap.get(bucketKey);
    if (bucket) {
      bucket.count += 1;
      return;
    }

    bucketMap.set(bucketKey, {
      kind: decision.kind,
      label: decision.headline,
      count: 1,
    });
  });

  const renderableBuckets = normalized
    .filter((decision) => decision.renderable)
    .reduce((counts, decision) => {
      counts.set(decision.headline, (counts.get(decision.headline) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());

  let headline = 'Mixed';
  if (renderableCount === 0) {
    headline = 'Unknown';
  } else {
    let maxLabel = '';
    let maxCount = 0;
    let hasTie = false;

    renderableBuckets.forEach((count, label) => {
      if (count > maxCount) {
        maxLabel = label;
        maxCount = count;
        hasTie = false;
        return;
      }

      if (count === maxCount) {
        hasTie = true;
      }
    });

    if (!hasTie && maxCount > renderableCount / 2) {
      headline = maxLabel;
    }
  }

  const buckets = [...bucketMap.values()].sort((a, b) => {
    const kindDelta = getBucketOrder(a.kind) - getBucketOrder(b.kind);
    if (kindDelta !== 0) {
      return kindDelta;
    }
    return a.label.localeCompare(b.label);
  });

  return {
    headline,
    totalCount: normalized.length,
    renderableCount,
    unknownCount,
    buckets,
  };
}

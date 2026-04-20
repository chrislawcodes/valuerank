import { resolveTranscriptDecisionModel } from '../../graphql/queries/domain/shared.js';

export type DecisionDirection = 'favor_first' | 'favor_second' | 'neutral' | 'refusal' | 'unknown';
export type DecisionStrength = 'strong' | 'lean' | 'neutral' | 'unknown';
export type DecisionReason = 'rendered' | 'parse_failed' | 'missing_metadata' | 'invalid_pair' | 'empty_input';
export type DecisionBucketLabel =
  | 'First side strong'
  | 'First side lean'
  | 'Neutral'
  | 'Second side lean'
  | 'Second side strong'
  | 'Unknown';

export type ExportDecisionDisplay = {
  direction: DecisionDirection;
  strength: DecisionStrength;
  reason: DecisionReason;
  bucketLabel: DecisionBucketLabel;
  preferenceScore: number | null;
  decisionSource: string;
  parseClass: string;
  parsePath: string;
  matchedLabel: string;
  favoredValueKey: string | null;
};

export const DECISION_BUCKET_LABELS: readonly DecisionBucketLabel[] = [
  'First side strong',
  'First side lean',
  'Neutral',
  'Second side lean',
  'Second side strong',
  'Unknown',
] as const;

export type DecisionDisplayTranscript = {
  decisionMetadata?: unknown;
  definitionSnapshot?: unknown;
  scenario?: {
    orientationFlipped?: boolean | null;
    content?: unknown;
  } | null;
  content?: unknown;
};

export type DimensionColumnMap = {
  headers: string[];
  rawKeyToHeader: Map<string, string>;
};

type TranscriptDimensionSource = {
  scenario?: {
    content?: unknown;
  } | null;
};

function normalizeVisibleHeader(label: string): string {
  const trimmed = label.trim();
  return trimmed.length === 0 ? 'Unnamed Dimension' : trimmed;
}

export function collectVisibleDimensionColumns(
  transcripts: TranscriptDimensionSource[],
  reservedHeaders: Iterable<string> = [],
): DimensionColumnMap {
  const rawKeys = new Set<string>();

  for (const transcript of transcripts) {
    const scenarioContent = transcript.scenario?.content as
      | { dimensions?: Record<string, unknown> }
      | null
      | undefined;
    const dimensions = scenarioContent?.dimensions;
    if (!dimensions || typeof dimensions !== 'object') {
      continue;
    }

    for (const [key, value] of Object.entries(dimensions)) {
      if (typeof value === 'number') {
        rawKeys.add(key);
      }
    }
  }

  const sortedKeys = Array.from(rawKeys)
    .map((rawKey) => ({ rawKey, visible: normalizeVisibleHeader(rawKey) }))
    .sort((left, right) => {
      const visibleCompare = left.visible.localeCompare(right.visible);
      if (visibleCompare !== 0) {
        return visibleCompare;
      }
      return left.rawKey.localeCompare(right.rawKey);
    });

  const headers: string[] = [];
  const rawKeyToHeader = new Map<string, string>();
  const usedHeaders = new Set(Array.from(reservedHeaders, normalizeVisibleHeader));

  for (const entry of sortedKeys) {
    let candidate = entry.visible;
    let suffix = 2;
    while (usedHeaders.has(candidate)) {
      candidate = `${entry.visible} (${suffix})`;
      suffix += 1;
    }

    usedHeaders.add(candidate);
    headers.push(candidate);
    rawKeyToHeader.set(entry.rawKey, candidate);
  }

  return { headers, rawKeyToHeader };
}

function getDecisionReason(
  transcript: DecisionDisplayTranscript,
  parseClass: string,
  canonicalDirection: DecisionDirection,
  canonicalStrength: DecisionStrength,
): DecisionReason {
  const hasMeaningfulInput = (
    transcript.decisionMetadata !== null && transcript.decisionMetadata !== undefined
  ) || (
    transcript.definitionSnapshot !== null && transcript.definitionSnapshot !== undefined
  );

  if (!hasMeaningfulInput) {
    return 'empty_input';
  }

  if (canonicalDirection === 'refusal') {
    return 'rendered';
  }

  if (canonicalDirection !== 'unknown' && canonicalStrength !== 'unknown') {
    return 'rendered';
  }

  const orientationKnown = transcript.scenario?.orientationFlipped !== null && transcript.scenario?.orientationFlipped !== undefined;
  if (!orientationKnown) {
    return 'missing_metadata';
  }

  if (parseClass === 'exact' || parseClass === 'fallback_resolved') {
    return 'invalid_pair';
  }

  return 'parse_failed';
}

export function formatDecisionDisplay(transcript: DecisionDisplayTranscript): ExportDecisionDisplay {
  const model = resolveTranscriptDecisionModel({
    decisionMetadata: transcript.decisionMetadata,
    definitionSnapshot: transcript.definitionSnapshot,
    orientationFlipped: transcript.scenario?.orientationFlipped ?? null,
  });

  const canonical = model.canonical;
  const raw = model.raw;
  const parseClass = raw.parseClass ?? '';
  const direction = canonical.direction;
  const strength = canonical.strength;
  const reason = getDecisionReason(transcript, parseClass, direction, strength);
  const bucketLabel = getDecisionBucketLabel({
    direction,
    strength,
    reason,
    bucketLabel: 'Unknown',
    preferenceScore: null,
    decisionSource: canonical.source,
    parseClass,
    parsePath: raw.parsePath ?? '',
    matchedLabel: raw.matchedLabel ?? '',
    favoredValueKey: null,
  });
  const preferenceScore = getDecisionPreferenceScore({
    direction,
    strength,
    reason,
    bucketLabel,
    preferenceScore: null,
    decisionSource: canonical.source,
    parseClass,
    parsePath: raw.parsePath ?? '',
    matchedLabel: raw.matchedLabel ?? '',
    favoredValueKey: null,
  });

  return {
    direction,
    strength,
    reason,
    bucketLabel,
    preferenceScore,
    decisionSource: canonical.source,
    parseClass,
    parsePath: raw.parsePath ?? '',
    matchedLabel: raw.matchedLabel ?? '',
    favoredValueKey: canonical.favoredValueKey,
  };
}

export function getDecisionBucketLabel(display: ExportDecisionDisplay): (typeof DECISION_BUCKET_LABELS)[number] {
  if (display.direction === 'favor_first' && display.strength === 'strong') {
    return 'First side strong';
  }
  if (display.direction === 'favor_first' && display.strength === 'lean') {
    return 'First side lean';
  }
  if (display.direction === 'neutral' && display.strength === 'neutral') {
    return 'Neutral';
  }
  if (display.direction === 'favor_second' && display.strength === 'lean') {
    return 'Second side lean';
  }
  if (display.direction === 'favor_second' && display.strength === 'strong') {
    return 'Second side strong';
  }
  return 'Unknown';
}

export function getDecisionPreferenceScore(display: ExportDecisionDisplay): number | null {
  if (display.direction === 'favor_first' && display.strength === 'strong') {
    return 2;
  }
  if (display.direction === 'favor_first' && display.strength === 'lean') {
    return 1;
  }
  if (display.direction === 'neutral' && display.strength === 'neutral') {
    return 0;
  }
  if (display.direction === 'favor_second' && display.strength === 'lean') {
    return 1;
  }
  if (display.direction === 'favor_second' && display.strength === 'strong') {
    return 2;
  }
  return null;
}

export function createEmptyDecisionDistribution(): Record<DecisionBucketLabel, number> {
  return {
    'First side strong': 0,
    'First side lean': 0,
    Neutral: 0,
    'Second side lean': 0,
    'Second side strong': 0,
    Unknown: 0,
  };
}

import {
  resolveAnalysisScore,
} from './decision-model.js';
import {
  resolveTranscriptDecisionModel,
  type DecisionSource,
  type RawDecisionEvidence,
  type TranscriptDecisionModelInput,
  type TranscriptDecisionModelResult,
} from '../graphql/queries/domain/shared.js';

export type DecisionModelShadowValidationBucket =
  | 'exact'
  | 'fallback_resolved'
  | 'ambiguous'
  | 'unparseable'
  | 'missing_metadata';

type DecisionModelShadowValidationScore = 1 | 2 | 3 | 4 | 5 | null;

export type DecisionModelShadowValidationTranscriptInput = TranscriptDecisionModelInput & {
  transcriptId: string;
  runId: string | null;
  modelId: string;
  scenarioId: string | null;
};

export type DecisionModelShadowValidationComparison = {
  legacyScore: DecisionModelShadowValidationScore;
  v2Score: DecisionModelShadowValidationScore;
  matches: boolean | null;
};

export type DecisionModelShadowValidationTranscript = {
  transcriptId: string;
  runId: string | null;
  modelId: string;
  scenarioId: string | null;
  bucket: DecisionModelShadowValidationBucket;
  parseClass: RawDecisionEvidence['parseClass'];
  canonicalSource: DecisionSource;
  canonical: TranscriptDecisionModelResult['canonical'];
  comparison: DecisionModelShadowValidationComparison;
};

export type DecisionModelShadowValidationReport = {
  generatedAt: string;
  transcriptCount: number;
  exactCount: number;
  fallbackResolvedCount: number;
  ambiguousCount: number;
  unparseableCount: number;
  missingMetadataCount: number;
  comparisonEligibleCount: number;
  comparisonMismatchCount: number;
  bucketExemplars: Record<DecisionModelShadowValidationBucket, DecisionModelShadowValidationTranscript[]>;
  comparisonMismatchExemplars: DecisionModelShadowValidationTranscript[];
  transcripts: DecisionModelShadowValidationTranscript[];
};

const EXAMPLE_LIMIT = 3;

function takeLimited<T>(items: T[], item: T, limit: number): void {
  if (items.length < limit) {
    items.push(item);
  }
}

function classifyBucket(result: TranscriptDecisionModelResult): DecisionModelShadowValidationBucket {
  const parseClass = result.raw.parseClass;
  if (parseClass === 'ambiguous') {
    return 'ambiguous';
  }
  if (parseClass === 'unparseable') {
    return 'unparseable';
  }
  if (parseClass === 'exact' || parseClass === 'fallback_resolved') {
    if (result.canonical.source === 'deterministic' || result.canonical.source === 'manual') {
      return parseClass;
    }
    return 'missing_metadata';
  }
  return 'missing_metadata';
}

function compareScores(
  transcript: DecisionModelShadowValidationTranscriptInput,
): DecisionModelShadowValidationComparison {
  const legacyScore = resolveAnalysisScore(transcript, false) as DecisionModelShadowValidationScore;
  const v2Score = resolveAnalysisScore(transcript, true) as DecisionModelShadowValidationScore;

  if (legacyScore === null && v2Score === null) {
    return {
      legacyScore,
      v2Score,
      matches: null,
    };
  }

  if (legacyScore === null || v2Score === null) {
    return {
      legacyScore,
      v2Score,
      matches: false,
    };
  }

  return {
    legacyScore,
    v2Score,
    matches: legacyScore === v2Score,
  };
}

function emptyBuckets(): Record<DecisionModelShadowValidationBucket, DecisionModelShadowValidationTranscript[]> {
  return {
    exact: [],
    fallback_resolved: [],
    ambiguous: [],
    unparseable: [],
    missing_metadata: [],
  };
}

export function buildDecisionModelShadowValidationReport(
  transcripts: DecisionModelShadowValidationTranscriptInput[],
  now: Date = new Date(),
): DecisionModelShadowValidationReport {
  const bucketExemplars = emptyBuckets();
  const comparisonMismatchExemplars: DecisionModelShadowValidationTranscript[] = [];
  const transcriptResults: DecisionModelShadowValidationTranscript[] = [];

  let exactCount = 0;
  let fallbackResolvedCount = 0;
  let ambiguousCount = 0;
  let unparseableCount = 0;
  let missingMetadataCount = 0;
  let comparisonEligibleCount = 0;
  let comparisonMismatchCount = 0;

  for (const transcript of transcripts) {
    const result = resolveTranscriptDecisionModel(transcript);
    const bucket = classifyBucket(result);
    const comparison = compareScores(transcript);
    const record: DecisionModelShadowValidationTranscript = {
      transcriptId: transcript.transcriptId,
      runId: transcript.runId,
      modelId: transcript.modelId,
      scenarioId: transcript.scenarioId,
      bucket,
      parseClass: result.raw.parseClass,
      canonicalSource: result.canonical.source,
      canonical: result.canonical,
      comparison,
    };

    transcriptResults.push(record);
    takeLimited(bucketExemplars[bucket], record, EXAMPLE_LIMIT);

    if (bucket === 'exact') {
      exactCount += 1;
    } else if (bucket === 'fallback_resolved') {
      fallbackResolvedCount += 1;
    } else if (bucket === 'ambiguous') {
      ambiguousCount += 1;
    } else if (bucket === 'unparseable') {
      unparseableCount += 1;
    } else {
      missingMetadataCount += 1;
    }

    if (comparison.matches !== null) {
      comparisonEligibleCount += 1;
    }
    if (comparison.matches === false) {
      comparisonMismatchCount += 1;
      takeLimited(comparisonMismatchExemplars, record, EXAMPLE_LIMIT);
    }
  }

  return {
    generatedAt: now.toISOString(),
    transcriptCount: transcriptResults.length,
    exactCount,
    fallbackResolvedCount,
    ambiguousCount,
    unparseableCount,
    missingMetadataCount,
    comparisonEligibleCount,
    comparisonMismatchCount,
    bucketExemplars,
    comparisonMismatchExemplars,
    transcripts: transcriptResults,
  };
}

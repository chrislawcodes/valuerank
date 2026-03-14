import type { Transcript } from '../api/operations/runs';
import { getDecisionMetadata } from './methodology';

export type ModelDecisionCoverage = {
  modelId: string;
  totalTranscripts: number;
  scoredTranscripts: number;
  unresolvedTranscripts: number;
  parserScoredTranscripts: number;
  manuallyAdjudicatedTranscripts: number;
  exactMatchTranscripts: number;
  fallbackResolvedTranscripts: number;
  ambiguousTranscripts: number;
  legacyNumericTranscripts: number;
};

export type DecisionCoverageSummary = {
  totalTranscripts: number;
  scoredTranscripts: number;
  unresolvedTranscripts: number;
  parserScoredTranscripts: number;
  manuallyAdjudicatedTranscripts: number;
  exactMatchTranscripts: number;
  fallbackResolvedTranscripts: number;
  ambiguousTranscripts: number;
  legacyNumericTranscripts: number;
  hasMethodologySignals: boolean;
  perModel: Record<string, ModelDecisionCoverage>;
};

function createEmptyModelCoverage(modelId: string): ModelDecisionCoverage {
  return {
    modelId,
    totalTranscripts: 0,
    scoredTranscripts: 0,
    unresolvedTranscripts: 0,
    parserScoredTranscripts: 0,
    manuallyAdjudicatedTranscripts: 0,
    exactMatchTranscripts: 0,
    fallbackResolvedTranscripts: 0,
    ambiguousTranscripts: 0,
    legacyNumericTranscripts: 0,
  };
}

function isNumericDecisionCode(decisionCode: string | null | undefined): boolean {
  return decisionCode === '1' || decisionCode === '2' || decisionCode === '3' || decisionCode === '4' || decisionCode === '5';
}

function hasMeaningfulMetadata(transcript: Transcript): boolean {
  const metadata = getDecisionMetadata(transcript.decisionMetadata);
  if (!metadata) {
    return false;
  }

  return Boolean(
    metadata.parseClass ||
      metadata.parsePath ||
      metadata.parserVersion ||
      metadata.matchedLabel ||
      metadata.responseExcerpt ||
      metadata.responseSha256 ||
      metadata.manualOverride ||
      (metadata.scaleLabels && metadata.scaleLabels.length > 0)
  );
}

export function summarizeDecisionCoverage(transcripts: Transcript[]): DecisionCoverageSummary {
  const summary: DecisionCoverageSummary = {
    totalTranscripts: 0,
    scoredTranscripts: 0,
    unresolvedTranscripts: 0,
    parserScoredTranscripts: 0,
    manuallyAdjudicatedTranscripts: 0,
    exactMatchTranscripts: 0,
    fallbackResolvedTranscripts: 0,
    ambiguousTranscripts: 0,
    legacyNumericTranscripts: 0,
    hasMethodologySignals: false,
    perModel: {},
  };

  for (const transcript of transcripts) {
    const modelId = transcript.modelId;
    const perModel = summary.perModel[modelId] ?? createEmptyModelCoverage(modelId);
    summary.perModel[modelId] = perModel;

    const metadata = getDecisionMetadata(transcript.decisionMetadata);
    const parseClass = metadata?.parseClass;
    const hasManualOverride = Boolean(metadata?.manualOverride);
    const isScored = isNumericDecisionCode(transcript.decisionCode);

    summary.totalTranscripts += 1;
    perModel.totalTranscripts += 1;

    if (hasMeaningfulMetadata(transcript)) {
      summary.hasMethodologySignals = true;
    }

    if (parseClass === 'ambiguous') {
      summary.ambiguousTranscripts += 1;
      perModel.ambiguousTranscripts += 1;
    }

    if (isScored) {
      summary.scoredTranscripts += 1;
      perModel.scoredTranscripts += 1;

      if (hasManualOverride) {
        summary.manuallyAdjudicatedTranscripts += 1;
        perModel.manuallyAdjudicatedTranscripts += 1;
        continue;
      }

      if (parseClass === 'exact') {
        summary.parserScoredTranscripts += 1;
        summary.exactMatchTranscripts += 1;
        perModel.parserScoredTranscripts += 1;
        perModel.exactMatchTranscripts += 1;
        continue;
      }

      if (parseClass === 'fallback_resolved') {
        summary.parserScoredTranscripts += 1;
        summary.fallbackResolvedTranscripts += 1;
        perModel.parserScoredTranscripts += 1;
        perModel.fallbackResolvedTranscripts += 1;
        continue;
      }

      summary.legacyNumericTranscripts += 1;
      perModel.legacyNumericTranscripts += 1;
      continue;
    }

    summary.unresolvedTranscripts += 1;
    perModel.unresolvedTranscripts += 1;
  }

  return summary;
}

function normalizeModelId(modelId: string): string {
  const parts = modelId.split(':');
  return parts[parts.length - 1] ?? modelId;
}

export function getCoverageForModel(
  coverage: DecisionCoverageSummary | null | undefined,
  modelId: string,
): ModelDecisionCoverage | null {
  if (!coverage) {
    return null;
  }

  if (coverage.perModel[modelId]) {
    return coverage.perModel[modelId] ?? null;
  }

  const normalizedModelId = normalizeModelId(modelId);
  const matchedEntry = Object.values(coverage.perModel).find(
    (entry) => normalizeModelId(entry.modelId) === normalizedModelId,
  );

  return matchedEntry ?? null;
}

export function shouldShowDecisionCoverage(coverage: DecisionCoverageSummary | null | undefined): boolean {
  if (!coverage) {
    return false;
  }

  return coverage.hasMethodologySignals || coverage.unresolvedTranscripts > 0 || coverage.manuallyAdjudicatedTranscripts > 0;
}

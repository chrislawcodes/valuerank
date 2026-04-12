import {
  type AggregateWorkerTranscript,
} from './contracts.js';
import {
  buildScenarioAnalysisDimensionRecord,
  normalizeScenarioAnalysisMetadata,
} from '../scenario-metadata.js';
import { resolveTranscriptDecisionModel } from '../../../graphql/queries/domain/decision-model.js';
import { buildCanonicalValueOutcomes } from './aggregate-helpers.js';

type TranscriptRecordForBuilder = {
  id: string;
  runId: string;
  sampleIndex: number;
  modelId: string;
  scenarioId: string | null;
  decisionCode: string | null;
  decisionMetadata: unknown;
  definitionSnapshot: unknown;
  scenario: {
    id: string;
    name: string;
    deletedAt: Date | null;
    orientationFlipped: boolean;
    content: unknown;
  } | null;
};

export function buildAggregateWorkerTranscripts(
  transcripts: TranscriptRecordForBuilder[],
  valueA: string | null,
  valueB: string | null,
): AggregateWorkerTranscript[] {
  return transcripts.map((transcript) => {
    const normalizedScenarioMetadata = normalizeScenarioAnalysisMetadata(transcript.scenario?.content ?? null);
    const dimensions = buildScenarioAnalysisDimensionRecord(normalizedScenarioMetadata);
    const orientationFlipped = transcript.scenario?.orientationFlipped ?? false;
    const resolved = resolveTranscriptDecisionModel({
      decisionCode: transcript.decisionCode,
      decisionMetadata: transcript.decisionMetadata,
      definitionSnapshot: transcript.definitionSnapshot,
      orientationFlipped,
    });
    const values = buildCanonicalValueOutcomes(
      resolved.canonical.direction,
      valueA,
      valueB,
    );

    return {
      id: transcript.id,
      runId: transcript.runId,
      modelId: transcript.modelId,
      scenarioId: transcript.scenarioId!,
      sampleIndex: transcript.sampleIndex,
      orientationFlipped,
      summary: values != null ? { values } : {},
      decisionModelV2: resolved.canonical.direction !== 'unknown'
        ? { canonical: { direction: resolved.canonical.direction, strength: resolved.canonical.strength } }
        : null,
      scenario: {
        name: transcript.scenario?.name ?? transcript.scenarioId ?? '',
        dimensions,
      },
    };
  });
}

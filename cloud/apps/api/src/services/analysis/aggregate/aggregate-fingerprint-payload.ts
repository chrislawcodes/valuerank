import { resolveTranscriptDecisionModel } from '../../../graphql/queries/domain/decision-model.js';
import {
  type AggregateMetadata,
  type AggregateWorkerInput,
  type AggregateWorkerTranscript,
} from './contracts.js';

type RunForFingerprint = {
  id: string;
  createdAt: Date;
  runCategory: string;
  status: string;
  config: unknown;
  tags: { tag: { name: string } }[];
  analysisResults: {
    id: string;
    createdAt: Date;
    codeVersion: string;
    status: string;
    output: unknown;
  }[];
};

type AnalysisForFingerprint = {
  id: string;
  createdAt: Date;
  codeVersion: string;
  inputHash?: string;
  output: unknown;
};

type ScenarioForFingerprint = {
  id: string;
  name: string;
  content: unknown;
};

type TranscriptForFingerprint = {
  id: string;
  runId: string;
  sampleIndex: number;
  modelId: string;
  scenarioId: string | null;
  decisionMetadata: unknown;
  definitionSnapshot: unknown;
  createdAt: Date;
  scenario: {
    id: string;
    name: string;
    orientationFlipped: boolean;
    deletedAt: Date | null;
    content: unknown;
  } | null;
};


export type FingerprintPayload = {
  definitionId: string;
  selection: {
    preambleVersionId: string | null;
    definitionVersion: number | null;
    temperature: number | null;
  };
  scenarios: { id: string; name: string; content: unknown }[];
  runs: {
    id: string;
    createdAt: string | null;
    runCategory: string;
    status: string;
    config: unknown;
    tagNames: string[];
    currentAnalysis: {
      id: string;
      createdAt: string | null;
      codeVersion: string;
      status: string;
      output: unknown;
    } | null;
  }[];
  analyses: {
    id: string;
    createdAt: string | null;
    codeVersion: string;
    inputHash: string | undefined;
    output: unknown;
  }[];
  transcripts: {
    id: string;
    runId: string;
    sampleIndex: number;
    modelId: string;
    scenarioId: string | null;
    decision: unknown;
    createdAt: string | null;
    scenario: {
      id: string;
      name: string;
      orientationFlipped: boolean;
      deletedAt: string | null;
      content: unknown;
    } | null;
  }[];
  aggregateEligibility: AggregateMetadata['aggregateEligibility'];
  aggregateIneligibilityReason: string | null;
  aggregateWorkerTranscripts: AggregateWorkerTranscript[];
  aggregateWorkerInput: AggregateWorkerInput | null;
  aggregateMetadataBase: Pick<
    AggregateMetadata,
    | 'aggregateEligibility'
    | 'aggregateIneligibilityReason'
    | 'sourceRunCount'
    | 'sourceRunIds'
    | 'conditionCoverage'
    | 'perModelRepeatCoverage'
    | 'perModelDrift'
  >;
  sampleSize: number;
  valuePair: { valueA: string | null; valueB: string | null };
};

export function buildFingerprintPayload(args: {
  definitionId: string;
  selection: { preambleVersionId: string | null; definitionVersion: number | null; temperature: number | null };
  scenarios: ScenarioForFingerprint[];
  runs: RunForFingerprint[];
  parsedConfigs: Map<string, unknown>;
  analyses: AnalysisForFingerprint[];
  transcripts: TranscriptForFingerprint[];
  aggregateEligibility: AggregateMetadata['aggregateEligibility'];
  aggregateIneligibilityReason: string | null;
  aggregateWorkerTranscripts: AggregateWorkerTranscript[];
  aggregateWorkerInput: AggregateWorkerInput | null;
  aggregateMetadataBase: FingerprintPayload['aggregateMetadataBase'];
  sampleSize: number;
  valueA: string | null;
  valueB: string | null;
}): FingerprintPayload {
  const {
    definitionId, selection, scenarios, runs, parsedConfigs, analyses, transcripts,
    aggregateEligibility, aggregateIneligibilityReason, aggregateWorkerTranscripts,
    aggregateWorkerInput, aggregateMetadataBase, sampleSize, valueA, valueB,
  } = args;

  return {
    definitionId,
    selection,
    scenarios: scenarios.map((s) => ({ id: s.id, name: s.name, content: s.content })),
    runs: runs.map((run) => {
      const config = parsedConfigs.get(run.id);
      return {
        id: run.id,
        createdAt: run.createdAt?.toISOString?.() ?? null,
        runCategory: run.runCategory,
        status: run.status,
        config,
        tagNames: run.tags.map((entry) => entry.tag.name).sort(),
        currentAnalysis: run.analysisResults[0]
          ? {
              id: run.analysisResults[0].id,
              createdAt: run.analysisResults[0].createdAt?.toISOString?.() ?? null,
              codeVersion: run.analysisResults[0].codeVersion,
              status: run.analysisResults[0].status,
              output: run.analysisResults[0].output,
            }
          : null,
      };
    }),
    analyses: analyses.map((analysis) => ({
      id: analysis.id,
      createdAt: analysis.createdAt?.toISOString?.() ?? null,
      codeVersion: analysis.codeVersion,
      inputHash: analysis.inputHash,
      output: analysis.output,
    })),
    transcripts: transcripts.map((transcript) => ({
      id: transcript.id,
      runId: transcript.runId,
      sampleIndex: transcript.sampleIndex,
      modelId: transcript.modelId,
      scenarioId: transcript.scenarioId,
      decision: resolveTranscriptDecisionModel({
        decisionMetadata: transcript.decisionMetadata,
        definitionSnapshot: transcript.definitionSnapshot,
        orientationFlipped: transcript.scenario?.orientationFlipped ?? null,
      }).canonical,
      createdAt: transcript.createdAt?.toISOString?.() ?? null,
      scenario: transcript.scenario == null
        ? null
        : {
            id: transcript.scenario.id,
            name: transcript.scenario.name,
            orientationFlipped: transcript.scenario.orientationFlipped,
            deletedAt: transcript.scenario.deletedAt?.toISOString?.() ?? null,
            content: transcript.scenario.content,
          },
    })),
    aggregateEligibility,
    aggregateIneligibilityReason,
    aggregateWorkerTranscripts,
    aggregateWorkerInput,
    aggregateMetadataBase,
    sampleSize,
    valuePair: { valueA, valueB },
  };
}

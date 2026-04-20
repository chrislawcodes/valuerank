import { randomUUID } from 'crypto';
import { db, resolveDefinitionContent, type AnalysisStatus, type Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import {
  DRIFT_WARNING_THRESHOLD,
  LOW_COVERAGE_CAUTION_THRESHOLD,
  MIN_REPEAT_COVERAGE_COUNT,
  MIN_REPEAT_COVERAGE_SHARE,
} from './constants.js';
import {
  type AggregateMetadata,
  type AggregateWorkerInput,
  type AggregateWorkerTranscript,
  zAnalysisOutput,
  zRunConfig,
} from './contracts.js';
import {
  getConfigTemperature,
  getSnapshotMeta,
} from './config.js';
import { aggregateAnalysesLogic } from './aggregate-logic.js';
import {
  computeAggregateFingerprint,
} from './aggregate-helpers.js';
import { buildAggregateWorkerTranscripts } from './aggregate-transcript-builder.js';
import { buildFingerprintPayload } from './aggregate-fingerprint-payload.js';
import { computeAggregateEligibility } from './aggregate-eligibility.js';
import {
  type AggregateRecomputeClaim,
  type AggregateRunConfig,
  type AggregateRunPreparation,
} from './aggregate-types.js';

const log = createLogger('analysis:aggregate');
const AGGREGATE_CLAIM_LEASE_MS = 300_000;

type AggregateAnalysisRecord = {
  id: string;
  createdAt: Date;
  deletedAt: Date | null;
  runId: string;
  analysisType: string;
  codeVersion: string;
  status: AnalysisStatus;
  inputHash?: string;
  output: Prisma.JsonValue;
};

type AggregateTranscriptRecord = {
  id: string;
  runId: string;
  sampleIndex: number;
  modelId: string;
  scenarioId: string | null;
  decisionCode: string | null;
  decisionMetadata: unknown;
  definitionSnapshot: unknown;
  summarizedAt: Date | null;
  createdAt: Date;
  scenario: {
    id: string;
    name: string;
    deletedAt: Date | null;
    orientationFlipped: boolean;
    content: unknown;
  } | null;
};

export async function prepareAggregateRunSnapshot(
  definitionId: string,
  preambleVersionId: string | null,
  definitionVersion: number | null,
  temperature: number | null = null,
): Promise<AggregateRunPreparation | null> {
  if (!definitionId) {
    log.error('Cannot prepare aggregate run without definitionId');
    return null;
  }

  const scenarios = await db.scenario.findMany({
    where: {
      definitionId,
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      content: true,
    },
  });

  const runs = await db.run.findMany({
    where: {
      definitionId,
      status: 'COMPLETED',
      tags: {
        none: {
          tag: {
            name: 'Aggregate',
          },
        },
      },
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      analysisResults: {
        where: { status: 'CURRENT' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
      },
      tags: {
        include: {
          tag: {
            select: { name: true },
          },
        },
      },
      definition: true,
      _count: {
        select: { transcripts: true },
      },
    },
  });

  const compatibleRuns = runs.filter((run) => {
    const parseResult = zRunConfig.safeParse(run.config);
    if (!parseResult.success) return false;

    const config = parseResult.data;
    const runMeta = getSnapshotMeta(config);
    const runTemperature = getConfigTemperature(config);
    const preambleMatch =
      preambleVersionId === null
        ? runMeta.preambleVersionId === null
        : runMeta.preambleVersionId === preambleVersionId;
    const definitionVersionMatch =
      definitionVersion === null
        ? runMeta.definitionVersion === null
        : runMeta.definitionVersion === definitionVersion;
    const temperatureMatch = runTemperature === temperature;
    return preambleMatch && definitionVersionMatch && temperatureMatch;
  });

  if (compatibleRuns.length === 0) {
    log.info({ definitionId, preambleVersionId, definitionVersion, temperature }, 'No compatible runs found for aggregation');
    return null;
  }

  const parsedConfigs = new Map(
    compatibleRuns.map((run) => {
      const parseResult = zRunConfig.safeParse(run.config);
      return [run.id, parseResult.success ? parseResult.data : null] as const;
    })
  );

  const validAnalyses: AggregateAnalysisRecord[] = (
    compatibleRuns
      .map((run) => run.analysisResults[0])
      .filter((analysis): analysis is NonNullable<typeof analysis> => analysis !== undefined && analysis !== null)
  ) as AggregateAnalysisRecord[];

  if (validAnalyses.length === 0) {
    log.info({ definitionId }, 'No valid analysis results found for compatible runs');
    return null;
  }

  const analysisObjects = validAnalyses
    .map((analysis) => {
      const parseResult = zAnalysisOutput.safeParse(analysis.output);
      if (!parseResult.success) {
        log.warn({ analysisResultId: analysis.id, error: parseResult.error }, 'Invalid analysis output structure, skipping');
        return null;
      }

      const output = parseResult.data;
      return {
        ...analysis,
        output,
        perModel: output.perModel,
        visualizationData: output.visualizationData ?? {},
        mostContestedScenarios: output.mostContestedScenarios ?? undefined,
      };
    })
    .filter((analysis): analysis is NonNullable<typeof analysis> => Boolean(analysis));

  if (analysisObjects.length === 0) {
    log.info({ definitionId }, 'No valid analysis objects after validation');
    return null;
  }

  let valueA: string | null = null;
  let valueB: string | null = null;
  try {
    const resolved = await resolveDefinitionContent(definitionId);
    valueA = resolved.resolvedContent.dimensions[0]?.name ?? null;
    valueB = resolved.resolvedContent.dimensions[1]?.name ?? null;
  } catch (err) {
    log.warn({ definitionId, err }, 'Failed to resolve definition value pair for aggregate analysis');
  }

  const allTranscripts: AggregateTranscriptRecord[] = await db.transcript.findMany({
    where: {
      runId: { in: compatibleRuns.map((run) => run.id) },
      scenarioId: { not: null },
      summarizedAt: { not: null },
    },
    orderBy: [{ runId: 'asc' }, { scenarioId: 'asc' }, { modelId: 'asc' }, { sampleIndex: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      runId: true,
      sampleIndex: true,
      modelId: true,
      scenarioId: true,
      decisionCode: true,
      decisionMetadata: true,
      definitionSnapshot: true,
      summarizedAt: true,
      createdAt: true,
      scenario: {
        select: {
          id: true,
          name: true,
          deletedAt: true,
          orientationFlipped: true,
          content: true,
        },
      },
    },
  });

  const validAggregateTranscripts = allTranscripts.filter(
    (transcript) =>
      transcript.modelId != null &&
      transcript.modelId !== '' &&
      transcript.scenarioId != null &&
      transcript.scenarioId !== '' &&
      transcript.summarizedAt != null &&
      transcript.scenario != null &&
      transcript.scenario.deletedAt == null
  );

  const aggregatedResult = aggregateAnalysesLogic(analysisObjects, validAggregateTranscripts, scenarios);

  const { conditionCoverage, aggregateEligibility, aggregateIneligibilityReason } = computeAggregateEligibility({
    scenarios,
    allTranscripts,
    validAggregateTranscripts,
    validAnalyses: analysisObjects,
    compatibleRuns,
    parsedConfigs,
  });

  const plannedScenarioIds = scenarios.map((scenario) => scenario.id).sort();

  const aggregateWorkerTranscripts: AggregateWorkerTranscript[] = buildAggregateWorkerTranscripts(
    validAggregateTranscripts,
    valueA,
    valueB,
  );

  const aggregateMetadataBase = {
    aggregateEligibility,
    aggregateIneligibilityReason,
    sourceRunCount: compatibleRuns.length,
    sourceRunIds: compatibleRuns.map((run) => run.id),
    conditionCoverage,
    perModelRepeatCoverage: {},
    perModelDrift: {},
  } satisfies Pick<
    AggregateMetadata,
    'aggregateEligibility' | 'aggregateIneligibilityReason' | 'sourceRunCount' | 'sourceRunIds' | 'conditionCoverage' | 'perModelRepeatCoverage' | 'perModelDrift'
  >;

  const sampleSize = compatibleRuns.reduce((sum, run) => sum + (run._count?.transcripts || 0), 0);
  const analysisCount = analysisObjects.length;
  const templateRun = compatibleRuns[0];
  if (!templateRun) {
    log.error('Unexpected state: compatibleRuns is empty but length check passed');
    return null;
  }

  const templateConfigResult = zRunConfig.safeParse(templateRun.config);
  const templateConfig = templateConfigResult.success ? templateConfigResult.data : {};
  const templateConfigWithCompanion = templateConfig as { companionRunId?: unknown };
  const targetCompanionRunId =
    typeof templateConfigWithCompanion.companionRunId === 'string'
      && templateConfigWithCompanion.companionRunId.trim() !== ''
      ? templateConfigWithCompanion.companionRunId
      : null;

  let aggregateWorkerInput: AggregateWorkerInput | null = null;

  if (aggregateEligibility === 'eligible_same_signature_baseline') {
    aggregateWorkerInput = {
      runId: `aggregate:${definitionId}:${preambleVersionId ?? 'none'}:${definitionVersion ?? 'none'}:${temperature ?? 'default'}`,
      emitVignetteSemantics: true,
      aggregateSemantics: {
        mode: 'same_signature_v1',
        plannedScenarioIds,
        minRepeatCoverageCount: MIN_REPEAT_COVERAGE_COUNT,
        minRepeatCoverageShare: MIN_REPEAT_COVERAGE_SHARE,
        lowCoverageCautionThreshold: LOW_COVERAGE_CAUTION_THRESHOLD,
        driftWarningThreshold: DRIFT_WARNING_THRESHOLD,
      },
      valuePair: {
        valueA,
        valueB,
      },
      targetCompanionRunId,
      transcripts: aggregateWorkerTranscripts,
    };
  }

  const finalRunConfig: AggregateRunConfig = {
    ...templateConfig,
    isAggregate: true,
    sourceRunIds: aggregateMetadataBase.sourceRunIds,
    transcriptCount: sampleSize,
    temperature,
    aggregateSourceFingerprint: '',
  };

  const fingerprintPayload = buildFingerprintPayload({
    definitionId,
    selection: { preambleVersionId, definitionVersion, temperature },
    scenarios,
    runs: compatibleRuns,
    parsedConfigs,
    analyses: analysisObjects,
    transcripts: validAggregateTranscripts,
    aggregateEligibility,
    aggregateIneligibilityReason,
    aggregateWorkerTranscripts,
    aggregateWorkerInput,
    aggregateMetadataBase,
    sampleSize,
    valueA,
    valueB,
  });

  const sourceFingerprint = computeAggregateFingerprint(fingerprintPayload);
  const claim: AggregateRecomputeClaim = {
    token: randomUUID(),
    sourceFingerprint,
    leaseExpiresAt: new Date(Date.now() + AGGREGATE_CLAIM_LEASE_MS).toISOString(),
  };

  finalRunConfig.aggregateSourceFingerprint = sourceFingerprint;

  return {
    definitionId,
    selection: {
      preambleVersionId,
      definitionVersion,
      temperature,
    },
    scenarios,
    sourceRunIds: aggregateMetadataBase.sourceRunIds,
    analysisCount,
    sampleSize,
    templateRun: {
      createdByUserId: templateRun.createdByUserId,
      experimentId: templateRun.experimentId,
      config: templateConfig,
    },
    finalRunConfig,
    aggregateMetadataBase,
    aggregateWorkerInput,
    aggregateWorkerTranscripts,
    aggregatedResult,
    claim,
    sourceFingerprint,
  };
}

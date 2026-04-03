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
  type AnalysisOutput,
  zAnalysisOutput,
  zRunConfig,
} from './contracts.js';
import {
  getConfigTemperature,
  getSnapshotMeta,
  isBaselineCompatibleRun,
} from './config.js';
import { aggregateAnalysesLogic } from './aggregate-logic.js';
import {
  buildScenarioAnalysisDimensionRecord,
  normalizeScenarioAnalysisMetadata,
} from '../scenario-metadata.js';
import { resolveTranscriptDecisionModel } from '../../../graphql/queries/domain/decision-model.js';
import {
  buildCanonicalValueOutcomes,
  computeAggregateFingerprint,
} from './aggregate-helpers.js';
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

  const plannedScenarioIds = scenarios.map((scenario) => scenario.id).sort();
  const observedScenarioIds = Array.from(
    new Set(
      validAggregateTranscripts
        .map((transcript) => transcript.scenarioId)
        .filter((scenarioId): scenarioId is string => scenarioId != null && scenarioId !== '')
    )
  ).sort();
  const hasDeletedOrMissingScenarioRows = allTranscripts.some(
    (transcript) => transcript.scenario == null || transcript.scenario.deletedAt != null
  );
  const pooledModelIds = new Set(
    validAnalyses.flatMap((analysis) => Object.keys((analysis.output as AnalysisOutput).perModel ?? {}))
  );
  const observedScenarioIdsByModel = new Map<string, Set<string>>();
  for (const transcript of validAggregateTranscripts) {
    const scenarioId = transcript.scenarioId;
    if (scenarioId == null || scenarioId === '') continue;
    const existing = observedScenarioIdsByModel.get(transcript.modelId) ?? new Set<string>();
    existing.add(scenarioId);
    observedScenarioIdsByModel.set(transcript.modelId, existing);
  }

  const conditionCoverage = {
    plannedConditionCount: plannedScenarioIds.length,
    observedConditionCount: observedScenarioIds.length,
    complete:
      !hasDeletedOrMissingScenarioRows &&
      plannedScenarioIds.length > 0 &&
      plannedScenarioIds.every((scenarioId) => observedScenarioIds.includes(scenarioId)),
  };

  const baselineEligible = compatibleRuns.every((run) => {
    const config = parsedConfigs.get(run.id);
    return isBaselineCompatibleRun(config ?? null, run.tags);
  });

  const hasStableModelIds = validAggregateTranscripts.every(
    (transcript) => typeof transcript.modelId === 'string' && transcript.modelId !== ''
  );
  const hasPerModelConditionCoverage = Array.from(pooledModelIds).every((modelId) => {
    const scenarioIds = observedScenarioIdsByModel.get(modelId);
    return (
      scenarioIds != null &&
      plannedScenarioIds.length > 0 &&
      plannedScenarioIds.every((scenarioId) => scenarioIds.has(scenarioId))
    );
  });

  let aggregateEligibility: AggregateMetadata['aggregateEligibility'] = 'eligible_same_signature_baseline';
  let aggregateIneligibilityReason: string | null = null;

  if (!baselineEligible) {
    aggregateEligibility = 'ineligible_run_type';
    aggregateIneligibilityReason = 'This aggregate mixes in assumption or manipulated runs, so it cannot be shown as baseline analysis.';
  } else if (!hasStableModelIds) {
    aggregateEligibility = 'ineligible_model_instability';
    aggregateIneligibilityReason = 'This aggregate is missing stable model identity metadata.';
  } else if (!conditionCoverage.complete || !hasPerModelConditionCoverage) {
    aggregateEligibility = 'ineligible_partial_coverage';
    aggregateIneligibilityReason = !conditionCoverage.complete
      ? 'This aggregate does not cover the full baseline condition set for this signature.'
      : 'At least one model is missing planned baseline conditions, so pooled baseline summaries would be incomplete.';
  }

  const aggregateWorkerTranscripts: AggregateWorkerTranscript[] = validAggregateTranscripts.map((transcript) => {
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
      summary: values ? { values } : {},
      scenario: {
        name: transcript.scenario?.name ?? transcript.scenarioId ?? '',
        dimensions,
      },
    };
  });

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
      transcripts: aggregateWorkerTranscripts,
    };
  }

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

  const finalRunConfig: AggregateRunConfig = {
    ...templateConfig,
    isAggregate: true,
    sourceRunIds: aggregateMetadataBase.sourceRunIds,
    transcriptCount: sampleSize,
    temperature,
    aggregateSourceFingerprint: '',
  };

  const fingerprintPayload = {
    definitionId,
    selection: {
      preambleVersionId,
      definitionVersion,
      temperature,
    },
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      content: scenario.content,
    })),
    runs: compatibleRuns.map((run) => {
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
    analyses: analysisObjects.map((analysis) => ({
      id: analysis.id,
      createdAt: analysis.createdAt?.toISOString?.() ?? null,
      codeVersion: analysis.codeVersion,
      inputHash: analysis.inputHash,
      output: analysis.output,
    })),
    transcripts: validAggregateTranscripts.map((transcript) => ({
      id: transcript.id,
      runId: transcript.runId,
      sampleIndex: transcript.sampleIndex,
      modelId: transcript.modelId,
      scenarioId: transcript.scenarioId,
      decision: resolveTranscriptDecisionModel({
        decisionCode: transcript.decisionCode,
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
    valuePair: {
      valueA,
      valueB,
    },
  };

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

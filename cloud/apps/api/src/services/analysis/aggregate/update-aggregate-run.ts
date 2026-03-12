import path from 'path';
import { db, resolveDefinitionContent } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { Prisma } from '@valuerank/db';
import { spawnPython } from '../../../queue/spawn.js';
import {
  AGGREGATE_ANALYSIS_CODE_VERSION,
  ANALYZE_WORKER_PATH,
  DRIFT_WARNING_THRESHOLD,
  LOW_COVERAGE_CAUTION_THRESHOLD,
  MIN_REPEAT_COVERAGE_COUNT,
  MIN_REPEAT_COVERAGE_SHARE,
} from './constants.js';
import {
  type AggregateMetadata,
  type AggregateWorkerInput,
  type AggregateWorkerOutput,
  type AggregateWorkerTranscript,
  type AnalysisOutput,
  type RunConfig,
  zAnalysisOutput,
  zRunConfig,
} from './contracts.js';
import {
  getConfigTemperature,
  getSnapshotMeta,
  isBaselineCompatibleRun,
} from './config.js';
import { aggregateAnalysesLogic } from './aggregate-logic.js';

const log = createLogger('analysis:aggregate');

function buildValueOutcomes(
  score: number | null,
  orientationFlipped: boolean,
  valueA: string | null,
  valueB: string | null
): Record<string, 'prioritized' | 'deprioritized' | 'neutral'> | undefined {
  if (score == null || valueA == null || valueB == null) return undefined;
  const normalizedScore = orientationFlipped ? 6 - score : score;

  if (normalizedScore >= 4) {
    return {
      [valueA]: 'prioritized',
      [valueB]: 'deprioritized',
    };
  }
  if (normalizedScore <= 2) {
    return {
      [valueA]: 'deprioritized',
      [valueB]: 'prioritized',
    };
  }
  return {
    [valueA]: 'neutral',
    [valueB]: 'neutral',
  };
}

export async function updateAggregateRun(
  definitionId: string,
  preambleVersionId: string | null,
  definitionVersion: number | null,
  temperature: number | null = null,
) {
  if (!definitionId) {
    log.error('Cannot update aggregate run without definitionId');
    return;
  }

  log.info({ definitionId, preambleVersionId, definitionVersion, temperature }, 'Updating aggregate run (with lock)');

  const scenarios = await db.scenario.findMany({
    where: {
      definitionId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      content: true,
    },
  });

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    try {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${definitionId}))`;
    } catch (err) {
      log.error({ err, definitionId }, 'Failed to acquire advisory lock');
      throw err;
    }

    const runs = await tx.run.findMany({
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
      include: {
        analysisResults: {
          where: { status: 'CURRENT' },
          orderBy: { createdAt: 'desc' },
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
      log.info('No compatible runs found for aggregation');
      return;
    }

    const sourceRunIds = compatibleRuns.map((run) => run.id);
    const parsedConfigs = new Map(
      compatibleRuns.map((run) => {
        const parseResult = zRunConfig.safeParse(run.config);
        return [run.id, parseResult.success ? parseResult.data : null] as const;
      })
    );

    const validAnalyses = compatibleRuns
      .map((run) => run.analysisResults[0])
      .filter((analysis): analysis is NonNullable<typeof compatibleRuns[number]['analysisResults'][number]> => analysis !== undefined && analysis !== null);

    if (validAnalyses.length === 0) {
      log.info('No valid analysis results found for compatible runs');
      return;
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
      log.info('No valid analysis objects after validation');
      return;
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

    const allTranscripts = await tx.transcript.findMany({
      where: {
        runId: { in: sourceRunIds },
        scenarioId: { not: null },
        decisionCode: { in: ['1', '2', '3', '4', '5'] },
      },
      select: {
        id: true,
        runId: true,
        sampleIndex: true,
        modelId: true,
        scenarioId: true,
        decisionCode: true,
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
        transcript.decisionCode != null &&
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
      const score = transcript.decisionCode == null ? null : Number.parseInt(transcript.decisionCode, 10);
      const rawDimensions = (transcript.scenario?.content as Record<string, unknown> | null)?.dimensions as Record<string, unknown> | undefined;
      const dimensions: Record<string, number> = {};
      for (const [key, value] of Object.entries(rawDimensions ?? {})) {
        if (typeof value === 'number') {
          dimensions[key] = value;
        }
      }
      const orientationFlipped = transcript.scenario?.orientationFlipped ?? false;
      const values = buildValueOutcomes(
        Number.isFinite(score) ? score : null,
        orientationFlipped,
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
        summary: values ? { score, values } : { score },
        scenario: {
          name: transcript.scenario?.name ?? transcript.scenarioId ?? '',
          dimensions,
        },
      };
    });

    let preferenceSummary: { perModel: Record<string, unknown> } | null = null;
    let reliabilitySummary: { perModel: Record<string, unknown> } | null = null;
    let aggregateSemanticMetadata: Pick<AggregateMetadata, 'perModelRepeatCoverage' | 'perModelDrift'> = {
      perModelRepeatCoverage: {},
      perModelDrift: {},
    };

    if (aggregateEligibility === 'eligible_same_signature_baseline') {
      const workerResult = await spawnPython<AggregateWorkerInput, AggregateWorkerOutput>(
        ANALYZE_WORKER_PATH,
        {
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
        },
        { cwd: path.resolve(process.cwd(), '../..'), timeout: 120000 }
      );

      if (!workerResult.success) {
        throw new Error(`Aggregate semantic worker failed: ${workerResult.error}`);
      }

      if (!workerResult.data.success) {
        throw new Error(`${workerResult.data.error.code}: ${workerResult.data.error.message}`);
      }

      preferenceSummary = workerResult.data.analysis.preferenceSummary ?? null;
      reliabilitySummary = workerResult.data.analysis.reliabilitySummary ?? null;
      aggregateSemanticMetadata = {
        perModelRepeatCoverage:
          workerResult.data.analysis.aggregateSemantics?.perModelRepeatCoverage ?? {},
        perModelDrift:
          workerResult.data.analysis.aggregateSemantics?.perModelDrift ?? {},
      };
    }

    const aggregateMetadata: AggregateMetadata = {
      aggregateEligibility,
      aggregateIneligibilityReason,
      sourceRunCount: sourceRunIds.length,
      sourceRunIds,
      conditionCoverage,
      perModelRepeatCoverage: aggregateSemanticMetadata.perModelRepeatCoverage,
      perModelDrift: aggregateSemanticMetadata.perModelDrift,
    };

    const aggregateRuns = await tx.run.findMany({
      where: {
        definitionId,
        tags: {
          some: {
            tag: {
              name: 'Aggregate',
            },
          },
        },
        deletedAt: null,
      },
    });

    let aggregateRun = aggregateRuns.find((run) => {
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

    const sampleSize = compatibleRuns.reduce((sum, run) => sum + (run._count?.transcripts || 0), 0);

    const templateRun = compatibleRuns[0];
    if (!templateRun) {
      log.error('Unexpected state: compatibleRuns is empty but length check passed');
      return;
    }

    const templateConfigResult = zRunConfig.safeParse(templateRun.config);
    const templateConfig = templateConfigResult.success ? templateConfigResult.data : {};

    const newConfig: RunConfig = {
      ...templateConfig,
      isAggregate: true,
      sourceRunIds,
      transcriptCount: sampleSize,
      temperature,
    };

    if (!aggregateRun) {
      log.info('Creating new Aggregate Run');
      aggregateRun = await tx.run.create({
        data: {
          definitionId,
          createdByUserId: templateRun.createdByUserId,
          status: 'COMPLETED',
          config: newConfig as unknown as Prisma.InputJsonValue,
          tags: {
            create: {
              tag: {
                connectOrCreate: {
                  where: { name: 'Aggregate' },
                  create: { name: 'Aggregate' },
                },
              },
            },
          },
        },
      });
    } else {
      log.info({ runId: aggregateRun.id }, 'Updating existing Aggregate Run');
      const existingConfigResult = zRunConfig.safeParse(aggregateRun.config);
      const existingConfig = existingConfigResult.success ? existingConfigResult.data : {};

      const updatedConfig: RunConfig = {
        ...existingConfig,
        sourceRunIds,
        transcriptCount: sampleSize,
        temperature,
      };

      await tx.run.update({
        where: { id: aggregateRun.id },
        data: {
          config: updatedConfig as unknown as Prisma.InputJsonValue,
          status: 'COMPLETED',
        },
      });
    }

    await tx.analysisResult.updateMany({
      where: { runId: aggregateRun.id, status: 'CURRENT' },
      data: { status: 'SUPERSEDED' },
    });

    const newOutput: Record<string, unknown> = {
      perModel: aggregatedResult.perModel,
      preferenceSummary,
      reliabilitySummary,
      aggregateMetadata,
      modelAgreement: aggregatedResult.modelAgreement,
      visualizationData: aggregatedResult.visualizationData,
      mostContestedScenarios: aggregatedResult.mostContestedScenarios,
      varianceAnalysis: aggregatedResult.varianceAnalysis,
      decisionStats: aggregatedResult.decisionStats,
      valueAggregateStats: aggregatedResult.valueAggregateStats,
      runCount: validAnalyses.length,
      sourceRunIds,
      methodsUsed: {
        aggregateSemantics: 'same-signature-v1',
        codeVersion: AGGREGATE_ANALYSIS_CODE_VERSION,
      },
      warnings: [],
      computedAt: new Date().toISOString(),
      durationMs: 0,
    };

    await tx.analysisResult.create({
      data: {
        runId: aggregateRun.id,
        analysisType: 'AGGREGATE',
        status: 'CURRENT',
        codeVersion: AGGREGATE_ANALYSIS_CODE_VERSION,
        inputHash: `aggregate - ${Date.now()} `,
        output: newOutput as unknown as Prisma.InputJsonValue,
      },
    });
  });
}

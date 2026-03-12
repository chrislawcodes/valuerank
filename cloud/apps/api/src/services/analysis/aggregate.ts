
import path from 'path';
import { db, resolveDefinitionContent } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { Prisma } from '@valuerank/db';
import { z } from 'zod';
import { normalizeAnalysisArtifacts } from './normalize-analysis-output.js';
import { parseTemperature } from '../../utils/temperature.js';
import { spawnPython } from '../../queue/spawn.js';

const log = createLogger('analysis:aggregate');
const AGGREGATE_ANALYSIS_CODE_VERSION = '1.2.0';
const MIN_REPEAT_COVERAGE_COUNT = 3;
const MIN_REPEAT_COVERAGE_SHARE = 0.2;
const LOW_COVERAGE_CAUTION_THRESHOLD = 5;
const DRIFT_WARNING_THRESHOLD = 0.25;
const BASELINE_COMPATIBLE_ASSUMPTION_KEYS = new Set(['temp_zero_determinism']);
const ANALYZE_WORKER_PATH = 'workers/analyze_basic.py';

// --- Feature-Specific Interfaces & Zod Schemas ---

const zRunSnapshot = z.object({
    _meta: z.object({
        preambleVersionId: z.string().optional(),
        definitionVersion: z.union([z.number(), z.string()]).optional(),
    }).optional(),
    preambleVersionId: z.string().optional(),
    version: z.union([z.number(), z.string()]).optional(),
});

const zRunConfig = z.object({
    definitionSnapshot: zRunSnapshot.optional(),
    isAggregate: z.boolean().optional(),
    sourceRunIds: z.array(z.string()).optional(),
    transcriptCount: z.number().optional(),
    temperature: z.number().nullable().optional(),
    assumptionKey: z.string().optional(),
}).passthrough(); // Allow unknown properies

type RunConfig = z.infer<typeof zRunConfig>;

// Helper schemas for AnalysisOutput
const zConfidenceInterval = z.object({
    lower: z.number(),
    upper: z.number(),
    level: z.number(),
    method: z.string(),
});

export const zValueStats = z.object({
    count: z.object({
        prioritized: z.number(),
        deprioritized: z.number(),
        neutral: z.number(),
    }),
    winRate: z.number(),
    confidenceInterval: zConfidenceInterval,
});

export const zModelStats = z.object({
    sampleSize: z.number().optional(),
    values: z.record(zValueStats).optional(),
    overall: z.object({
        mean: z.number(),
        stdDev: z.number(),
        min: z.number(),
        max: z.number(),
    }).optional(),
});


const zVisualizationData = z.object({
    decisionDistribution: z.record(z.record(z.number())).optional(),
    modelScenarioMatrix: z.record(z.record(z.number())).optional(),
    scenarioDimensions: z.record(z.record(z.union([z.number(), z.string()]))).optional(),
}).passthrough();

const zVarianceStats = z.object({
    sampleCount: z.number(),
    mean: z.number(),
    stdDev: z.number(),
    variance: z.number(),
    min: z.number(),
    max: z.number(),
    range: z.number(),
    scoreCounts: z.record(z.string(), z.number()).optional(),
    direction: z.enum(['A', 'B', 'NEUTRAL']).nullable().optional(),
    directionalAgreement: z.number().nullable().optional(),
    medianSignedDistance: z.number().nullable().optional(),
    iqr: z.number().nullable().optional(),
    neutralShare: z.number().nullable().optional(),
    orientationCorrected: z.boolean().optional(),
});

const zModelVarianceStats = z.object({
    totalSamples: z.number(),
    uniqueScenarios: z.number(),
    samplesPerScenario: z.number(),
    avgWithinScenarioVariance: z.number(),
    maxWithinScenarioVariance: z.number(),
    consistencyScore: z.number(),
    perScenario: z.record(zVarianceStats),
});

const zContestedScenario = z.object({
    scenarioId: z.string(),
    variance: z.number(),
}).passthrough();

const zScenarioVarianceStats = z.object({
    scenarioId: z.string(),
    scenarioName: z.string(),
    modelId: z.string().optional(),
    mean: z.number(),
    stdDev: z.number(),
    variance: z.number(),
    range: z.number(),
    sampleCount: z.number(),
    scoreCounts: z.record(z.string(), z.number()).optional(),
    direction: z.enum(['A', 'B', 'NEUTRAL']).nullable().optional(),
    directionalAgreement: z.number().nullable().optional(),
    medianSignedDistance: z.number().nullable().optional(),
    iqr: z.number().nullable().optional(),
    neutralShare: z.number().nullable().optional(),
    orientationCorrected: z.boolean().optional(),
}).passthrough();

const zRunVarianceAnalysis = z.object({
    isMultiSample: z.boolean(),
    samplesPerScenario: z.number(),
    perModel: z.record(zModelVarianceStats),
    mostVariableScenarios: z.array(zScenarioVarianceStats).optional(),
    leastVariableScenarios: z.array(zScenarioVarianceStats).optional(),
    orientationCorrectedCount: z.number().optional(),
}).passthrough();

type RunVarianceAnalysis = z.infer<typeof zRunVarianceAnalysis>;
type ModelVarianceStats = z.infer<typeof zModelVarianceStats>;
type VarianceStats = z.infer<typeof zVarianceStats>;
type ScenarioVarianceStats = z.infer<typeof zScenarioVarianceStats>;

export const zAnalysisOutput = z.object({
    perModel: z.record(zModelStats),
    visualizationData: zVisualizationData.optional(),
    mostContestedScenarios: z.array(zContestedScenario).optional(),
    varianceAnalysis: zRunVarianceAnalysis.optional(),
    modelAgreement: z.unknown().optional(),
}).passthrough();

type AnalysisOutput = z.infer<typeof zAnalysisOutput>;
type ModelStats = z.infer<typeof zModelStats>;
type ContestedScenario = z.infer<typeof zContestedScenario>;

type AggregateEligibility =
    | 'eligible_same_signature_baseline'
    | 'ineligible_mixed_signature'
    | 'ineligible_run_type'
    | 'ineligible_partial_coverage'
    | 'ineligible_missing_metadata'
    | 'ineligible_missing_repeatability'
    | 'ineligible_model_instability';

type AggregateMetadata = {
    aggregateEligibility: AggregateEligibility;
    aggregateIneligibilityReason: string | null;
    sourceRunCount: number;
    sourceRunIds: string[];
    conditionCoverage: {
        plannedConditionCount: number;
        observedConditionCount: number;
        complete: boolean;
    };
    perModelRepeatCoverage: Record<string, {
        repeatCoverageCount: number;
        repeatCoverageShare: number;
        contributingRunCount: number;
    }>;
    perModelDrift: Record<string, {
        weightedOverallSignedCenterSd: number | null;
        exceedsWarningThreshold: boolean;
    }>;
};

type AggregateWorkerTranscript = {
    id: string;
    runId: string;
    modelId: string;
    scenarioId: string;
    sampleIndex: number;
    orientationFlipped: boolean;
    summary: {
        score: number | null;
        values?: Record<string, 'prioritized' | 'deprioritized' | 'neutral'>;
    };
    scenario: {
        name: string;
        dimensions: Record<string, number>;
    };
};

type AggregateWorkerInput = {
    runId: string;
    emitVignetteSemantics: true;
    aggregateSemantics: {
        mode: 'same_signature_v1';
        plannedScenarioIds: string[];
        minRepeatCoverageCount: number;
        minRepeatCoverageShare: number;
        lowCoverageCautionThreshold: number;
        driftWarningThreshold: number;
    };
    transcripts: AggregateWorkerTranscript[];
};

type AggregateWorkerOutput = {
    success: true;
    analysis: {
        preferenceSummary?: {
            perModel: Record<string, unknown>;
        } | null;
        reliabilitySummary?: {
            perModel: Record<string, unknown>;
        } | null;
        aggregateSemantics?: {
            perModelRepeatCoverage: AggregateMetadata['perModelRepeatCoverage'];
            perModelDrift: AggregateMetadata['perModelDrift'];
        } | null;
    };
} | {
    success: false;
    error: { message: string; code: string; retryable: boolean };
};

interface DecisionStatsOption {
    mean: number;
    sd: number;
    sem: number;
    n: number;
}

interface DecisionStats {
    options: Record<number, DecisionStatsOption>;
}

interface ValueAggregateStatsValue {
    winRateMean: number;
    winRateSem: number;
    winRateSd: number;
}

interface ValueAggregateStats {
    values: Record<string, ValueAggregateStatsValue>;
}

interface AggregatedResult {
    perModel: Record<string, ModelStats>;
    modelAgreement: unknown;
    visualizationData: {
        decisionDistribution: Record<string, Record<string, number>>;
        modelScenarioMatrix: Record<string, Record<string, number>>;
        scenarioDimensions: Record<string, Record<string, number | string>>;
    };
    mostContestedScenarios: ContestedScenario[];
    varianceAnalysis: RunVarianceAnalysis | null;
    decisionStats: Record<string, DecisionStats>;
    valueAggregateStats: Record<string, ValueAggregateStats>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAggregatedVisualizationData(
    value: unknown
): value is AggregatedResult['visualizationData'] {
    if (!isPlainObject(value)) return false;
    return (
        isPlainObject(value.decisionDistribution)
        && isPlainObject(value.modelScenarioMatrix)
        && isPlainObject(value.scenarioDimensions)
    );
}

function isRunVarianceAnalysis(value: unknown): value is RunVarianceAnalysis {
    if (!isPlainObject(value)) return false;
    return (
        typeof value.isMultiSample === 'boolean'
        && typeof value.samplesPerScenario === 'number'
        && isPlainObject(value.perModel)
    );
}

function parseDefinitionVersion(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string' || value.trim() === '') return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function getSnapshotMeta(config: RunConfig): { preambleVersionId: string | null; definitionVersion: number | null } {
    const snapshot = config.definitionSnapshot;
    const preambleVersionId =
        snapshot?._meta?.preambleVersionId ??
        snapshot?.preambleVersionId ??
        null;
    const definitionVersion =
        parseDefinitionVersion(snapshot?._meta?.definitionVersion) ??
        parseDefinitionVersion(snapshot?.version);
    return { preambleVersionId, definitionVersion };
}

function getConfigTemperature(config: RunConfig): number | null {
    return parseTemperature(config.temperature);
}

function getAssumptionKey(config: RunConfig): string | null {
    return typeof config.assumptionKey === 'string' && config.assumptionKey.trim() !== ''
        ? config.assumptionKey
        : null;
}

function hasAssumptionRunTag(tags: Array<{ tag: { name: string } }>): boolean {
    return tags.some((entry) => entry.tag.name === 'assumption-run');
}

function isBaselineCompatibleRun(config: RunConfig | null, tags: Array<{ tag: { name: string } }>): boolean {
    if (config == null) return false;

    const assumptionKey = getAssumptionKey(config);
    if (assumptionKey === null) {
        return !hasAssumptionRunTag(tags);
    }

    return BASELINE_COMPATIBLE_ASSUMPTION_KEYS.has(assumptionKey);
}

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

/**
 * Updates or creates the "Aggregate" run for a given definition and preamble version.
 * Uses advisory locks to ensure serial execution for a given definition.
 */
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

    // Fetch scenarios outside the transaction to reduce lock duration.
    // Note: this can read slightly stale scenario data if scenarios change during aggregation.
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

    // Wrap in transaction to hold the lock for the duration of the update
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
        // 0. Acquire Advisory Lock
        // We hash the definitionId to get a 64-bit bigint for the lock key.
        // pg_advisory_xact_lock automatically releases at end of transaction.
        // This effectively serializes concurrent UpdateAggregate jobs for the same definition.
        try {
            // Use raw query for locking.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${definitionId}))`;
        } catch (err) {
            log.error({ err, definitionId }, 'Failed to acquire advisory lock');
            throw err; // Abort transaction
        }

        // 1. Find all COMPLETED runs for this definition+preamble (excluding existing aggregates)
        // We avoid explicit cast to Prisma.RunWhereInput to let TS inference work and catch errors
        const runs = await tx.run.findMany({
            where: {
                definitionId,
                status: 'COMPLETED',
                // Exclude the aggregate run itself (which we tag)
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
                    select: { transcripts: true }
                }
            },
        });

        // Filter by Preamble Version (from snapshot)
        // We need to parse config to check preambleVersionId match
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

        const sourceRunIds = compatibleRuns.map((r) => r.id);
        const parsedConfigs = new Map(
            compatibleRuns.map((run) => {
                const parseResult = zRunConfig.safeParse(run.config);
                return [run.id, parseResult.success ? parseResult.data : null] as const;
            })
        );

        // Get valid analysis results with safe access to includes
        const validAnalyses = compatibleRuns
            .map((r) => r.analysisResults[0])
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            .filter((a): a is NonNullable<typeof compatibleRuns[number]['analysisResults'][number]> => a !== undefined && a !== null);

        if (validAnalyses.length === 0) {
            log.info('No valid analysis results found for compatible runs');
            return;
        }

        // 2. Perform Aggregation
        // Convert DB JsonValue to AnalysisOutput structure for processing
        const analysisObjects = validAnalyses.map((a) => {
            // Validate output using Zod
            const parseResult = zAnalysisOutput.safeParse(a.output);
            if (!parseResult.success) {
                log.warn({ analysisResultId: a.id, error: parseResult.error }, 'Invalid analysis output structure, skipping');
                return null;
            }
            const output = parseResult.data;

            return {
                ...a,
                output,
                perModel: output.perModel,
                visualizationData: output.visualizationData ?? {},
                mostContestedScenarios: output.mostContestedScenarios ?? undefined,
            };
        }).filter((a): a is NonNullable<typeof a> => !!a);

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

        // Transcript set for aggregate processing
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
                    }
                }
            }
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
            validAnalyses.flatMap((analysis) => Object.keys((analysis.output as AnalysisOutput).perModel ?? {})),
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
            return scenarioIds != null &&
                plannedScenarioIds.length > 0 &&
                plannedScenarioIds.every((scenarioId) => scenarioIds.has(scenarioId));
        });

        let aggregateEligibility: AggregateEligibility = 'eligible_same_signature_baseline';
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

        // 3. Find/Create Aggregate Run
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

        // Find the one matching our preamble
        let aggregateRun = aggregateRuns.find((r) => {
            const parseResult = zRunConfig.safeParse(r.config);
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


        const sampleSize = compatibleRuns.reduce((sum, r) => sum + (r._count?.transcripts || 0), 0);

        // Use the first compatible run as a template for config
        const templateRun = compatibleRuns[0];
        if (!templateRun) {
            log.error('Unexpected state: compatibleRuns is empty but length check passed');
            return;
        }
        // Safe parse template config
        const templateConfigResult = zRunConfig.safeParse(templateRun.config);
        const templateConfig = templateConfigResult.success ? templateConfigResult.data : {};

        const newConfig: RunConfig = {
            ...templateConfig,
            isAggregate: true,
            sourceRunIds: sourceRunIds,
            transcriptCount: sampleSize,
            temperature,
        };

        if (!aggregateRun) {
            // Create new
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
                                    create: { name: 'Aggregate' }
                                }
                            }
                        }
                    }
                },
            });
        } else {
            // Update existing
            log.info({ runId: aggregateRun.id }, 'Updating existing Aggregate Run');
            // Merge with existing config
            const existingConfigResult = zRunConfig.safeParse(aggregateRun.config);
            const existingConfig = existingConfigResult.success ? existingConfigResult.data : {};

            const updatedConfig: RunConfig = {
                ...existingConfig,
                sourceRunIds: sourceRunIds,
                transcriptCount: sampleSize,
                temperature,
            };

            await tx.run.update({
                where: { id: aggregateRun.id },
                data: {
                    config: updatedConfig as unknown as Prisma.InputJsonValue,
                    status: 'COMPLETED'
                }
            });
        }

        // 4. Save Analysis Result
        // Invalidate old current result
        await tx.analysisResult.updateMany({
            where: { runId: aggregateRun.id, status: 'CURRENT' },
            data: { status: 'SUPERSEDED' }
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

        // Save new
        await tx.analysisResult.create({
            data: {
                runId: aggregateRun.id,
                analysisType: 'AGGREGATE',
                status: 'CURRENT',
                codeVersion: AGGREGATE_ANALYSIS_CODE_VERSION,
                inputHash: `aggregate - ${Date.now()} `,
                output: newOutput as unknown as Prisma.InputJsonValue
            }
        });
    });
}


// --- Logic Ported from Frontend ---

function aggregateAnalysesLogic(
    analyses: AnalysisOutput[],
    transcripts: { modelId: string, scenarioId: string | null, decisionCode: string | null, scenario: { orientationFlipped: boolean } | null }[],
    scenarios: { id: string, name: string, content: Prisma.JsonValue }[]
): AggregatedResult {

    // Basic structural setup
    if (analyses.length === 0) {
        throw new Error('Cannot aggregate empty analyses list');
    }
    const template = analyses[0]!;
    const modelIds = Array.from(new Set(analyses.flatMap(a => Object.keys(a.perModel))));
    const aggregatedPerModel: Record<string, ModelStats> = {};
    const decisionStats: Record<string, DecisionStats> = {};
    const valueAggregateStats: Record<string, ValueAggregateStats> = {};

    modelIds.forEach(modelId => {
        const validAnalyses = analyses.filter(a => Boolean(a.perModel[modelId]));
        if (validAnalyses.length === 0) return;

        const totalModelSamples = validAnalyses.reduce((sum, a) => {
            const stats = a.perModel[modelId];
            if (!stats) return sum;
            return sum + (stats.sampleSize ?? 0);
        }, 0);

        // A. Decision Distributions (Calculated from stats/analyses)
        const modelDecisions: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };

        validAnalyses.forEach(analysis => {
            const dist = analysis.visualizationData?.decisionDistribution?.[modelId];
            if (dist) {
                const runTotal = Object.values(dist).reduce((sum, c) => sum + (c), 0);
                if (runTotal > 0) {
                    Object.entries(dist).forEach(([option, count]) => {
                        const opt = parseInt(option);
                        if (!isNaN(opt)) modelDecisions[opt]!.push((count) / runTotal);
                    });
                    [1, 2, 3, 4, 5].forEach(opt => {
                        if (dist[String(opt)] === undefined) modelDecisions[opt]!.push(0);
                    });
                }
            }
        });

        decisionStats[modelId] = { options: {} };
        [1, 2, 3, 4, 5].forEach(opt => {
            const values = modelDecisions[opt] || [];
            if (values.length > 0) {
                const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
                const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length > 0 ? values.length : 1);
                const sd = Math.sqrt(variance);
                const sem = sd / Math.sqrt(values.length);
                decisionStats[modelId]!.options[opt] = { mean, sd, sem, n: values.length };
            }
        });

        // B. Win Rates
        type ValueStatsBuilder = {
            count: { prioritized: number; deprioritized: number; neutral: number };
            winRate: number;
            confidenceInterval: { lower: number; upper: number; level: number; method: string };
        };
        const aggregatedValues: Record<string, ValueStatsBuilder> = {};
        const modelValueRates: Record<string, number[]> = {};

        validAnalyses.forEach(analysis => {
            const pms = analysis.perModel[modelId];
            if (pms && pms.values) {
                Object.entries(pms.values).forEach(([valueId, vStats]) => {
                    if (!aggregatedValues[valueId]) {
                        aggregatedValues[valueId] = {
                            count: { prioritized: 0, deprioritized: 0, neutral: 0 },
                            winRate: 0,
                            confidenceInterval: { lower: 0, upper: 0, level: 0.95, method: 'aggregate' }
                        };
                        modelValueRates[valueId] = [];
                    }

                    const target = aggregatedValues[valueId];
                    if (target !== undefined) {
                        target.count.prioritized += vStats.count.prioritized;
                        target.count.deprioritized += vStats.count.deprioritized;
                        target.count.neutral += vStats.count.neutral;
                    }

                    if (modelValueRates[valueId]) {
                        modelValueRates[valueId].push(vStats.winRate);
                    }
                });
            }
        });

        valueAggregateStats[modelId] = { values: {} };
        Object.keys(aggregatedValues).forEach(valueId => {
            const target = aggregatedValues[valueId];
            if (!target) return;

            const totalWins = target.count.prioritized;
            const totalBattles = target.count.prioritized + target.count.deprioritized;
            target.winRate = totalBattles > 0 ? totalWins / totalBattles : 0;

            const rates = modelValueRates[valueId] || [];
            if (rates.length > 0) {
                const mean = rates.reduce((sum, v) => sum + v, 0) / rates.length;
                const variance = rates.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (rates.length > 0 ? rates.length : 1);
                const sd = Math.sqrt(variance);
                const sem = sd / Math.sqrt(rates.length);

                valueAggregateStats[modelId]!.values[valueId] = {
                    winRateMean: mean,
                    winRateSd: sd,
                    winRateSem: sem
                };

                target.confidenceInterval = {
                    lower: Math.max(0, mean - (1.96 * sem)),
                    upper: Math.min(1, mean + (1.96 * sem)),
                    level: 0.95,
                    method: 'aggregate-sem'
                };
            }
        });

        aggregatedPerModel[modelId] = {
            sampleSize: totalModelSamples,
            values: aggregatedValues,
            overall: { mean: 0, stdDev: 0, min: 0, max: 0 }
        };
    });

    // Merge Visualization Data
    const mergedVizData: AggregatedResult['visualizationData'] & { scenarioDimensions: Record<string, Record<string, number | string>> } = {
        decisionDistribution: {},
        modelScenarioMatrix: {},
        scenarioDimensions: {} // Initialize
    };

    // Calculate Decision Distribution using "Mean of Means" logic per scenario
    // 1. Group by Model -> Scenario -> Decisions
    const decisionsByScenario: Record<string, Record<string, number[]>> = {};

    transcripts.forEach(t => {
        if (t.decisionCode == null || t.decisionCode === '' || t.modelId == null || t.modelId === '' || t.scenarioId == null || t.scenarioId === '') return;
        const code = parseInt(t.decisionCode);
        if (isNaN(code)) return;

        if (decisionsByScenario[t.modelId] && decisionsByScenario[t.modelId]![t.scenarioId]) {
            decisionsByScenario[t.modelId]![t.scenarioId]!.push(code);
        } else if (decisionsByScenario[t.modelId]) {
            decisionsByScenario[t.modelId]![t.scenarioId] = [code];
        } else {
            decisionsByScenario[t.modelId] = { [t.scenarioId]: [code] };
        }
    });

    // 2. Aggregate per scenario and build distribution
    modelIds.forEach(mId => {
        const dist: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
        const scenarioDecisions = decisionsByScenario[mId];

        if (scenarioDecisions) {
            Object.values(scenarioDecisions).forEach(decisions => {
                if (decisions.length === 0) return;

                // Calculate mean
                const sum = decisions.reduce((a, b) => a + b, 0);
                const mean = sum / decisions.length;

                // Round to closest integer
                const rounded = Math.round(mean);

                // Ensure bounds (though unlikely to exceed 1-5 unless input is weird)
                const clamped = Math.max(1, Math.min(5, rounded));

                dist[String(clamped)] = (dist[String(clamped)] ?? 0) + 1;
            });
        }

        mergedVizData.decisionDistribution[mId] = dist;

        // Populate modelScenarioMatrix (Model -> Scenario -> Mean Score)
        const scenarioMeans: Record<string, number> = {};
        if (scenarioDecisions) {
            Object.entries(scenarioDecisions).forEach(([scenarioId, decisions]) => {
                if (decisions.length === 0) return;
                const sum = decisions.reduce((a, b) => a + b, 0);
                const mean = sum / decisions.length;
                scenarioMeans[scenarioId] = mean;
            });
        }
        mergedVizData.modelScenarioMatrix[mId] = scenarioMeans;
    });

    // Merge Contested Scenarios
    const scenarioMap = new Map<string, { varianceSum: number, count: number, scenario: ContestedScenario }>();
    analyses.forEach(a => {
        // Safe access now
        if (a.mostContestedScenarios) {
            a.mostContestedScenarios.forEach((s) => {
                const scen = s; // Strictly typed due to Zod parsing (well, Zod returns unknown for extra props?)
                // Zod passthrough keeps unknown props. TypeScript sees intersection of defined props + Record signature if filtered?
                // Our type definition: zContestedScenario is { scenarioId: string, variance: number } & {[k:string]: unknown}
                const existing = scenarioMap.get(scen.scenarioId) || { varianceSum: 0, count: 0, scenario: scen };
                existing.varianceSum += scen.variance;
                existing.count += 1;
                scenarioMap.set(scen.scenarioId, existing);
            });
        }
    });

    const mergedContested = Array.from(scenarioMap.values())
        .map(v => ({
            ...v.scenario,
            variance: v.varianceSum / v.count
        }))
        .sort((a, b) => b.variance - a.variance)
        .slice(0, 20);

    // Populate scenarioDimensions
    const dimensionsMap: Record<string, Record<string, number | string>> = {};
    const isDimensionValue = (value: unknown): value is number | string =>
        typeof value === 'number' || typeof value === 'string';
    const toDimensionRecord = (
        value: unknown,
        scenarioId: string
    ): Record<string, number | string> | null => {
        if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
        const entries = Object.entries(value);
        const sanitized: Record<string, number | string> = {};
        let dropped = 0;
        for (const [key, entry] of entries) {
            if (!isDimensionValue(entry)) {
                dropped += 1;
                continue;
            }
            sanitized[key] = entry;
        }
        if (dropped > 0) {
            log.warn({ scenarioId, dropped }, 'Dropped invalid dimension values');
        }
        return Object.keys(sanitized).length > 0 ? sanitized : null;
    };
    scenarios.forEach(s => {
        if (s.content == null || typeof s.content !== 'object' || Array.isArray(s.content)) return;
        const content = s.content as Record<string, unknown>;
        const dimensions = content['dimensions'];
        const validated = toDimensionRecord(dimensions, s.id);
        if (validated) {
            dimensionsMap[s.id] = validated;
        }
    });
    mergedVizData.scenarioDimensions = dimensionsMap;

    // Compute Variance Analysis
    const varianceAnalysis = computeVarianceAnalysis(transcripts, scenarios);

    const normalizedArtifacts = normalizeAnalysisArtifacts({
        visualizationData: mergedVizData,
        varianceAnalysis,
        scenarios: scenarios.map((scenario) => ({
            id: scenario.id,
            name: scenario.name,
            content: scenario.content,
        })),
    });

    const normalizedVisualizationData = isAggregatedVisualizationData(normalizedArtifacts.visualizationData)
        ? normalizedArtifacts.visualizationData
        : mergedVizData;
    const normalizedVarianceAnalysis = isRunVarianceAnalysis(normalizedArtifacts.varianceAnalysis)
        ? normalizedArtifacts.varianceAnalysis
        : varianceAnalysis;

    return {
        perModel: aggregatedPerModel,
        modelAgreement: template.modelAgreement,
        visualizationData: normalizedVisualizationData,
        mostContestedScenarios: mergedContested,
        varianceAnalysis: normalizedVarianceAnalysis,
        decisionStats,
        valueAggregateStats
    };
}

// --- Variance Analysis Logic (Ported from Python) ---

function computeVarianceStats(scores: number[]): VarianceStats {
    if (scores.length === 0) {
        return {
            sampleCount: 0,
            mean: 0,
            stdDev: 0,
            variance: 0,
            min: 0,
            max: 0,
            range: 0,
        };
    }

    const n = scores.length;
    const sum = scores.reduce((a, b) => a + b, 0);
    const mean = sum / n;

    // Sample variance (ddof=1)
    let variance = 0;
    if (n > 1) {
        const sumSqDiff = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
        variance = sumSqDiff / (n - 1);
    }

    const stdDev = Math.sqrt(variance);
    const min = Math.min(...scores);
    const max = Math.max(...scores);

    return {
        sampleCount: n,
        mean: parseFloat(mean.toFixed(6)),
        stdDev: parseFloat(stdDev.toFixed(6)),
        variance: parseFloat(variance.toFixed(6)),
        min: parseFloat(min.toFixed(6)),
        max: parseFloat(max.toFixed(6)),
        range: parseFloat((max - min).toFixed(6)),
    };
}

function computeConsistencyScore(variances: number[], maxPossibleVariance = 4.0): number {
    if (variances.length === 0) return 1.0;
    const sum = variances.reduce((a, b) => a + b, 0);
    const avgVariance = sum / variances.length;

    // Normalize: 0 variance = 1.0 consistency, max variance = 0.0 consistency
    const score = 1.0 - (avgVariance / maxPossibleVariance);
    return parseFloat(Math.max(0.0, Math.min(1.0, score)).toFixed(6));
}

function computeMedian(sorted: number[]): number {
    if (sorted.length === 0) return 0;
    const arr = [...sorted].sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 === 0
        ? (arr[mid - 1]! + arr[mid]!) / 2
        : arr[mid]!;
}

function computeIQR(values: number[]): number {
    if (values.length < 2) return 0;
    const arr = [...values].sort((a, b) => a - b);
    const n = arr.length;
    const q1 = arr[Math.floor(n * 0.25)]!;
    const q3 = arr[Math.floor(n * 0.75)]!;
    return q3 - q1;
}

function computeVarianceAnalysis(
    transcripts: { modelId: string, scenarioId: string | null, decisionCode: string | null, scenario: { orientationFlipped: boolean } | null }[],
    scenarios: { id: string, content: Prisma.JsonValue }[]
): RunVarianceAnalysis {
    const scenarioNames = new Map<string, string>();
    scenarios.forEach(s => {
        const content = s.content as Record<string, unknown>;
        const name = typeof content.name === 'string' ? content.name : s.id;
        scenarioNames.set(s.id, name);
    });

    // Group by (scenarioId, modelId) -> list of scores
    const grouped = new Map<string, number[]>();
    const correctedScenarioIds = new Set<string>();

    transcripts.forEach(t => {
        if (t.scenarioId == null || t.scenarioId === '' || t.decisionCode == null || t.decisionCode === '' || t.modelId == null || t.modelId === '') return;
        const rawScore = parseFloat(t.decisionCode);
        if (isNaN(rawScore)) return;

        const orientationFlipped = t.scenario?.orientationFlipped ?? false;
        const score = orientationFlipped ? 6 - rawScore : rawScore;
        if (orientationFlipped) {
            correctedScenarioIds.add(t.scenarioId);
        }

        const key = `${t.scenarioId}||${t.modelId}`;
        const current = grouped.get(key) || [];
        current.push(score);
        grouped.set(key, current);
    });

    let maxSamples = 1;
    if (grouped.size > 0) {
        maxSamples = Math.max(...Array.from(grouped.values()).map(s => s.length));
    }
    const isMultiSample = maxSamples > 1;

    // Compute per-model variance stats
    const perModel: Record<string, ModelVarianceStats> = {};
    const modelScenarioScores = new Map<string, Map<string, number[]>>();

    grouped.forEach((scores, key) => {
        const [scenarioId, modelId] = key.split('||');
        if (modelId === undefined || modelId === '' || scenarioId === undefined || scenarioId === '') return;

        let modelMap = modelScenarioScores.get(modelId);
        if (!modelMap) {
            modelMap = new Map<string, number[]>();
            modelScenarioScores.set(modelId, modelMap);
        }
        modelMap.set(scenarioId, scores);
    });

    modelScenarioScores.forEach((scenarioMap, modelId) => {
        const perScenario: Record<string, VarianceStats> = {};
        const variances: number[] = [];
        let totalSamples = 0;

        scenarioMap.forEach((scores, scenarioId) => {
            const stats = computeVarianceStats(scores);

            if (scores.length > 0) {
                const signed = scores.map(s => s - 3);
                const medianSd = computeMedian(signed);

                const direction: 'A' | 'B' | 'NEUTRAL' = medianSd > 0 ? 'A' : medianSd < 0 ? 'B' : 'NEUTRAL';

                const sameCount = signed.filter(s =>
                    direction === 'A' ? s > 0 :
                        direction === 'B' ? s < 0 :
                            s === 0
                ).length;

                const n = scores.length;
                const neutralCount = scores.filter(s => s === 3).length;

                const scoreCounts: Record<string, number> = {};
                for (const sv of [1, 2, 3, 4, 5]) {
                    scoreCounts[String(sv)] = scores.filter(s => s === sv).length;
                }

                const iqrVal = n >= 2 ? computeIQR(signed) : undefined;

                Object.assign(stats, {
                    scoreCounts,
                    direction,
                    directionalAgreement: parseFloat((sameCount / n).toFixed(6)),
                    medianSignedDistance: parseFloat(medianSd.toFixed(6)),
                    iqr: iqrVal !== undefined ? parseFloat(iqrVal.toFixed(6)) : undefined,
                    neutralShare: parseFloat((neutralCount / n).toFixed(6)),
                    orientationCorrected: correctedScenarioIds.has(scenarioId),
                });
            }

            // PR Feedback: Key by scenarioId, NOT name. Frontend expects IDs.
            // const name = scenarioNames.get(scenarioId) || scenarioId;
            perScenario[scenarioId] = stats;

            if (stats.sampleCount > 1) {
                variances.push(stats.variance);
            }
            totalSamples += stats.sampleCount;
        });

        const avgVariance = variances.length > 0
            ? variances.reduce((a, b) => a + b, 0) / variances.length
            : 0;

        const maxVariance = variances.length > 0
            ? Math.max(...variances)
            : 0;

        perModel[modelId] = {
            totalSamples,
            uniqueScenarios: scenarioMap.size,
            samplesPerScenario: maxSamples,
            avgWithinScenarioVariance: parseFloat(avgVariance.toFixed(6)),
            maxWithinScenarioVariance: parseFloat(maxVariance.toFixed(6)),
            consistencyScore: computeConsistencyScore(variances),
            perScenario
        };
    });

    // Find most/least variable scenarios
    const allScenarioVariances: ScenarioVarianceStats[] = [];
    grouped.forEach((scores, key) => {
        const [scenarioId, modelId] = key.split('||');
        if (typeof modelId !== 'string' || typeof scenarioId !== 'string') return;

        if (scores.length > 1) {
            const stats = computeVarianceStats(scores);
            allScenarioVariances.push({
                scenarioId,
                scenarioName: scenarioNames.get(scenarioId) ?? scenarioId,
                modelId,
                variance: stats.variance,
                stdDev: stats.stdDev,
                range: stats.range,
                sampleCount: stats.sampleCount,
                mean: stats.mean
            });
        }
    });

    allScenarioVariances.sort((a, b) => b.variance - a.variance);
    const mostVariable = allScenarioVariances.slice(0, 5);
    const leastVariable = allScenarioVariances.slice(-5).reverse();

    return {
        isMultiSample,
        samplesPerScenario: maxSamples,
        perModel,
        mostVariableScenarios: mostVariable,
        leastVariableScenarios: leastVariable,
        orientationCorrectedCount: correctedScenarioIds.size,
    };
}

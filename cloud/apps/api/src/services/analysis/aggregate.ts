
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { Prisma } from '@valuerank/db';
import { z } from 'zod';
import { normalizeAnalysisArtifacts } from './normalize-analysis-output.js';

const log = createLogger('analysis:aggregate');

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
}).passthrough();

const zRunVarianceAnalysis = z.object({
    isMultiSample: z.boolean(),
    samplesPerScenario: z.number(),
    perModel: z.record(zModelVarianceStats),
    mostVariableScenarios: z.array(zScenarioVarianceStats).optional(),
    leastVariableScenarios: z.array(zScenarioVarianceStats).optional(),
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

function parseTemperature(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
            const preambleMatch =
                preambleVersionId === null
                    ? runMeta.preambleVersionId === null
                    : runMeta.preambleVersionId === preambleVersionId;
            const definitionVersionMatch =
                definitionVersion === null
                    ? runMeta.definitionVersion === null
                    : runMeta.definitionVersion === definitionVersion;
            const runTemperature = parseTemperature(config.temperature);
            const temperatureMatch = runTemperature === temperature;
            return preambleMatch && definitionVersionMatch && temperatureMatch;
        });

        if (compatibleRuns.length === 0) {
            log.info('No compatible runs found for aggregation');
            return;
        }

        const sourceRunIds = compatibleRuns.map(r => r.id);

        // Get valid analysis results with safe access to includes
        const validAnalyses = compatibleRuns
            .map(r => r.analysisResults[0])
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

        // Valid transcripts for aggregation
        const allTranscripts = await tx.transcript.findMany({
            where: {
                runId: { in: sourceRunIds },
                decisionCode: { not: null },
                scenarioId: { not: null },
                scenario: {
                    deletedAt: null
                }
            },
            select: {
                modelId: true,
                scenarioId: true,
                decisionCode: true
            }
        });

        const aggregatedResult = aggregateAnalysesLogic(analysisObjects, allTranscripts, scenarios);

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
            const preambleMatch =
                preambleVersionId === null
                    ? runMeta.preambleVersionId === null
                    : runMeta.preambleVersionId === preambleVersionId;
            const definitionVersionMatch =
                definitionVersion === null
                    ? runMeta.definitionVersion === null
                    : runMeta.definitionVersion === definitionVersion;
            const runTemperature = parseTemperature(config.temperature);
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
            modelAgreement: aggregatedResult.modelAgreement,
            visualizationData: aggregatedResult.visualizationData,
            mostContestedScenarios: aggregatedResult.mostContestedScenarios,
            varianceAnalysis: aggregatedResult.varianceAnalysis,
            decisionStats: aggregatedResult.decisionStats,
            valueAggregateStats: aggregatedResult.valueAggregateStats,
            runCount: validAnalyses.length,
            sourceRunIds,
        };

        // Save new
        await tx.analysisResult.create({
            data: {
                runId: aggregateRun.id,
                analysisType: 'AGGREGATE',
                status: 'CURRENT',
                codeVersion: '1.0.0',
                inputHash: `aggregate - ${Date.now()} `,
                output: newOutput as unknown as Prisma.InputJsonValue
            }
        });
    });
}


// --- Logic Ported from Frontend ---

function aggregateAnalysesLogic(
    analyses: AnalysisOutput[],
    transcripts: { modelId: string, scenarioId: string | null, decisionCode: string | null }[],
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

function computeVarianceAnalysis(
    transcripts: { modelId: string, scenarioId: string | null, decisionCode: string | null }[],
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

    transcripts.forEach(t => {
        if (t.scenarioId == null || t.scenarioId === '' || t.decisionCode == null || t.decisionCode === '' || t.modelId == null || t.modelId === '') return;
        const score = parseFloat(t.decisionCode);
        if (isNaN(score)) return;

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
        leastVariableScenarios: leastVariable
    };
}

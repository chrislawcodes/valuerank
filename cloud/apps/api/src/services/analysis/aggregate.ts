import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { Prisma } from '@valuerank/db';

const log = createLogger('analysis:aggregate');

// --- Feature-Specific Interfaces ---

interface RunSnapshot {
    _meta?: { preambleVersionId?: string };
    preambleVersionId?: string;
}

interface RunConfig {
    definitionSnapshot?: RunSnapshot;
    isAggregate?: boolean;
    sourceRunIds?: string[];
    transcriptCount?: number;
    [key: string]: unknown; // Allow other properties for forward compatibility
}

interface AnalysisOutput {
    perModel: Record<string, {
        sampleSize?: number;
        values?: Record<string, {
            count: { prioritized: number; deprioritized: number; neutral: number };
            winRate: number;
            confidenceInterval: { lower: number; upper: number; level: number; method: string };
        }>;
        overall?: { mean: number; stdDev: number; min: number; max: number };
    }>;
    visualizationData: {
        decisionDistribution?: Record<string, Record<string, number>>;
        modelScenarioMatrix?: Record<string, Record<string, number>>;
        [key: string]: unknown;
    };
    mostContestedScenarios?: Array<{
        scenarioId: string;
        variance: number;
        [key: string]: unknown;
    }>;
    modelAgreement?: unknown; // Type can be refined if structure is known
    [key: string]: unknown; // Allow other properties for forward compatibility
}

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
    perModel: Record<string, unknown>; // Refined type based on aggregateAnalysesLogic output
    modelAgreement: unknown;
    visualizationData: {
        decisionDistribution: Record<string, Record<string, number>>;
        modelScenarioMatrix: Record<string, Record<string, number>>;
    };
    mostContestedScenarios: Array<{
        scenarioId: string;
        variance: number;
        [key: string]: unknown;
    }>;
    decisionStats: Record<string, DecisionStats>;
    valueAggregateStats: Record<string, ValueAggregateStats>;
}


/**
 * Updates or creates the "Aggregate" run for a given definition and preamble version.
 * Uses advisory locks to ensure serial execution for a given definition.
 */
export async function updateAggregateRun(definitionId: string, preambleVersionId: string | null) {
    if (!definitionId) {
        log.error('Cannot update aggregate run without definitionId');
        return;
    }

    log.info({ definitionId, preambleVersionId }, 'Updating aggregate run (with lock)');

    // Wrap in transaction to hold the lock for the duration of the update
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
        // 0. Acquire Advisory Lock
        // We hash the definitionId to get a 64-bit bigint for the lock key.
        // pg_advisory_xact_lock automatically releases at end of transaction.
        // This effectively serializes concurrent UpdateAggregate jobs for the same definition.
        try {
            // Use raw query for locking. Note: BigInt is needed for 64-bit key if we used that, 
            // but hashtext returns int which fits in 32-bit args for the 1-arg version? 
            // Actually hashtext returns integer. pg_advisory_xact_lock takes (bigint) or (int, int).
            // hashtext result is safe to cast to generic number/int in SQL.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${definitionId}))`;
        } catch (err) {
            log.error({ err, definitionId }, 'Failed to acquire advisory lock');
            throw err; // Abort transaction
        }

        // 1. Find all COMPLETED runs for this definition+preamble (excluding existing aggregates)
        const runWhere: Prisma.RunWhereInput = {
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
        };

        const runs = await tx.run.findMany({
            where: runWhere,
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
            const config = run.config as unknown as RunConfig;
            const snapshot = config?.definitionSnapshot;

            const runPreambleId =
                snapshot?._meta?.preambleVersionId ??
                snapshot?.preambleVersionId;

            // Handle null case (legacy runs might be null)
            if (preambleVersionId === null) return runPreambleId == null;
            return runPreambleId === preambleVersionId;
        });

        if (compatibleRuns.length === 0) {
            log.info('No compatible runs found for aggregation');
            return;
        }

        const sourceRunIds = compatibleRuns.map(r => r.id);

        // Get valid analysis results with safe access to includes
        const validAnalyses = compatibleRuns
            .map(r => r.analysisResults && r.analysisResults[0])
            .filter((a): a is NonNullable<typeof r.analysisResults[0]> => !!a);

        if (validAnalyses.length === 0) {
            log.info('No valid analysis results found for compatible runs');
            return;
        }

        // 2. Perform Aggregation
        // Convert DB JsonValue to AnalysisOutput structure for processing
        const analysisObjects = validAnalyses.map((a) => {
            // Cast the output JSON to our typed interface
            const output = a.output as unknown as AnalysisOutput;
            return {
                ...a,
                output, // Keep original output for reference if needed
                perModel: output.perModel,
                visualizationData: output.visualizationData,
                mostContestedScenarios: output.mostContestedScenarios,
            };
        });

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

        const aggregatedResult = aggregateAnalysesLogic(analysisObjects, allTranscripts);

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
            const config = r.config as unknown as RunConfig;
            const snapshot = config?.definitionSnapshot;

            const runPreambleId =
                snapshot?._meta?.preambleVersionId ??
                snapshot?.preambleVersionId;

            if (preambleVersionId === null) return runPreambleId == null;
            return runPreambleId === preambleVersionId;
        });


        const sampleSize = compatibleRuns.reduce((sum, r) => sum + (r._count?.transcripts || 0), 0);

        // Use the first compatible run as a template for config
        const templateRun = compatibleRuns[0];
        if (!templateRun) {
            log.error('Unexpected state: compatibleRuns is empty but length check passed');
            return;
        }
        const templateConfig = templateRun.config as unknown as RunConfig;

        const newConfig: RunConfig = {
            ...templateConfig,
            isAggregate: true,
            sourceRunIds: sourceRunIds,
            transcriptCount: sampleSize,
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
            const existingConfig = aggregateRun.config as unknown as RunConfig;
            const updatedConfig: RunConfig = {
                ...existingConfig,
                sourceRunIds: sourceRunIds,
                transcriptCount: sampleSize,
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
                inputHash: `aggregate-${Date.now()}`,
                output: newOutput as unknown as Prisma.InputJsonValue
            }
        });
    });
}


// --- Logic Ported from Frontend ---

interface DecisionStats {
    options: Record<number, {
        mean: number;
        sd: number;
        sem: number;
        n: number;
    }>;
}

interface ValueAggregateStats {
    values: Record<string, {
        winRateMean: number;
        winRateSem: number;
        winRateSd: number;
    }>;
}

function aggregateAnalysesLogic(analyses: any[], transcripts: { modelId: string, scenarioId: string | null, decisionCode: string | null }[]): any {
    // Basic structural setup
    const template = analyses[0];
    const modelIds = Array.from(new Set(analyses.flatMap(a => Object.keys(a.perModel))));
    const aggregatedPerModel: Record<string, any> = {};
    const decisionStats: Record<string, DecisionStats> = {};
    const valueAggregateStats: Record<string, ValueAggregateStats> = {};

    modelIds.forEach(modelId => {
        const validAnalyses = analyses.filter(a => a.perModel[modelId]);
        if (validAnalyses.length === 0) return;

        const totalModelSamples = validAnalyses.reduce((sum, a) => {
            const stats = a.perModel[modelId];
            return sum + (stats ? (stats.sampleSize || 0) : 0);
        }, 0);

        // A. Decision Distributions (Calculated from stats/analyses)
        // We defer the main distribution calc to the transcript-based section below
        // But we still calculate detailed stats here from run-level summaries if needed.
        // Actually, let's keep the detailed stats logic as is, it calculates descriptive stats of the *distributions*.
        // Wait, if the distribution concept changes (Raw -> Scenario Mean), these stats (lines 235-265) might need updates?
        // Lines 235-253 sum up raw counts to get `modelDecisions`.
        // Then lines 255-265 calculate mean/sd of the *raw* decisions.
        // The user specifically asked for "Decision Distribution by model" (the chart) to change.
        // The stats (mean/sd) "per option" (Line 263) might typically reflect the raw variance.
        // I will leave the stats logic as is for now, assuming "Decision Distribution" refers to the visualization data.

        // const aggregatedDist: Record<string, number> = {};
        const modelDecisions: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };

        validAnalyses.forEach(analysis => {
            const dist = analysis.visualizationData?.decisionDistribution?.[modelId];
            if (dist) {
                const runTotal = Object.values(dist).reduce((sum: number, c: any) => sum + (c as number), 0);
                // Keep summing for stats purposes?
                // Actually, if we change the distribution chart, maybe we should align statistics?
                // But "mean option" across all transcripts is still valid.
                // The "aggregated distribution" is a specialized view.

                if (runTotal > 0) {
                    Object.entries(dist).forEach(([option, count]) => {
                        const opt = parseInt(option);
                        if (!isNaN(opt)) modelDecisions[opt].push((count as number) / runTotal);
                    });
                    [1, 2, 3, 4, 5].forEach(opt => {
                        if (!dist[String(opt)]) modelDecisions[opt].push(0);
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
                decisionStats[modelId].options[opt] = { mean, sd, sem, n: values.length };
            }
        });

        // B. Win Rates
        // Helper type for stats
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
                Object.entries(pms.values).forEach(([valueId, vStats]: [string, any]) => {
                    if (!aggregatedValues[valueId]) {
                        aggregatedValues[valueId] = {
                            count: { prioritized: 0, deprioritized: 0, neutral: 0 },
                            winRate: 0,
                            confidenceInterval: { lower: 0, upper: 0, level: 0.95, method: 'aggregate' }
                        };
                        modelValueRates[valueId] = [];
                    }

                    const target = aggregatedValues[valueId];
                    if (target) {
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
            if (!target) return; // Should not happen given keys from object

            const totalWins = target.count.prioritized;
            const totalBattles = target.count.prioritized + target.count.deprioritized;
            target.winRate = totalBattles > 0 ? totalWins / totalBattles : 0;

            const rates = modelValueRates[valueId] || [];
            if (rates.length > 0) {
                const mean = rates.reduce((sum, v) => sum + v, 0) / rates.length;
                const variance = rates.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (rates.length > 0 ? rates.length : 1);
                const sd = Math.sqrt(variance);
                const sem = sd / Math.sqrt(rates.length);

                valueAggregateStats[modelId].values[valueId] = {
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
    const mergedVizData: any = {
        decisionDistribution: {},
        modelScenarioMatrix: {}
    };

    // Calculate Decision Distribution using "Mean of Means" logic per scenario
    // 1. Group by Model -> Scenario -> Decisions
    const decisionsByScenario: Record<string, Record<string, number[]>> = {};

    transcripts.forEach(t => {
        if (!t.decisionCode || !t.modelId || !t.scenarioId) return;
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

                dist[String(clamped)] = (dist[String(clamped)] || 0) + 1;
            });
        }

        mergedVizData.decisionDistribution[mId] = dist;
    });

    // Merge Contested Scenarios
    const scenarioMap = new Map<string, { varianceSum: number, count: number, scenario: any }>();
    analyses.forEach(a => {
        if (a.mostContestedScenarios) {
            a.mostContestedScenarios.forEach((s: any) => {
                const existing = scenarioMap.get(s.scenarioId) || { varianceSum: 0, count: 0, scenario: s };
                existing.varianceSum += s.variance;
                existing.count += 1;
                scenarioMap.set(s.scenarioId, existing);
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

    return {
        perModel: aggregatedPerModel,
        modelAgreement: template.modelAgreement, // We don't recompute agreement yet
        visualizationData: mergedVizData,
        mostContestedScenarios: mergedContested,
        decisionStats,
        valueAggregateStats
    };
}

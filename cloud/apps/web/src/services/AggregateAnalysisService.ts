import type {
    AnalysisResult,
    PerModelStats,
    VisualizationData,
    ContestedScenario
} from '../api/operations/analysis';

/**
 * Service to handle client-side aggregation of multiple analysis results.
 * This effectively creates a "Virtual Run" in memory.
 */

export interface DecisionStats {
    // Stats for each decision option (1-5)
    options: Record<number, {
        mean: number; // Mean percentage (0-1)
        sd: number;   // Standard Deviation
        sem: number;  // Standard Error of mean
        n: number;    // Number of runs contributing (usually total runs)
    }>;
}

export interface ValueAggregateStats {
    // Stats for each value's win rate using the win/loss counts
    values: Record<string, {
        winRateMean: number;
        winRateSem: number;
        winRateSd: number;
    }>;
}

export interface AggregateAnalysisResult extends AnalysisResult {
    isAggregate: true;
    runCount: number;
    sourceRunIds: string[];
    // Extended stats for error bars
    decisionStats: Record<string, DecisionStats>;          // Key: modelId
    valueAggregateStats: Record<string, ValueAggregateStats>; // Key: modelId
}

/**
 * Aggregates multiple AnalysisResult objects into a single result.
 */
export function aggregateAnalyses(analyses: AnalysisResult[]): AggregateAnalysisResult {
    if (analyses.length === 0) {
        throw new Error('Cannot aggregate empty list of analyses');
    }

    // Use the first analysis as a template for metadata (definition, etc.)
    // We assume all analyses are compatible (checked by caller)
    const template = analyses[0];
    if (!template) throw new Error('Template analysis is undefined');

    const runCount = analyses.length;
    const sourceRunIds = analyses.map(a => a.runId);

    // 1. Merge Metadata
    // Timestamps: min(createdAt), max(computedAt)
    const startTimes = analyses.map(a => new Date(a.createdAt).getTime()).filter(t => !isNaN(t));
    const endTimes = analyses.map(a => a.computedAt ? new Date(a.computedAt).getTime() : 0).filter(t => t > 0);

    const earliestStart = startTimes.length ? new Date(Math.min(...startTimes)).toISOString() : template.createdAt;
    const latestEnd = endTimes.length ? new Date(Math.max(...endTimes)).toISOString() : null;

    // 2. Identify all models across all runs
    const modelIds = Array.from(new Set(analyses.flatMap(a => Object.keys(a.perModel))));

    // 3. Initialize containers
    const aggregatedPerModel: Record<string, PerModelStats> = {};

    const decisionStats: Record<string, DecisionStats> = {};
    const valueAggregateStats: Record<string, ValueAggregateStats> = {};

    // 4. Process each model
    modelIds.forEach(modelId => {
        // Collect valid analyses for this model
        const validAnalyses = analyses.filter(a => a.perModel[modelId]);
        if (validAnalyses.length === 0) return;

        const totalModelSamples = validAnalyses.reduce((sum, a) => {
            const stats = a.perModel[modelId];
            return sum + (stats ? stats.sampleSize : 0);
        }, 0);

        // --- A. Aggregate Decision Distributions (for VisualizationData & Stats) ---
        const aggregatedDist: Record<string, number> = {};
        const modelDecisions: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };

        validAnalyses.forEach(analysis => {
            const dist = analysis.visualizationData?.decisionDistribution?.[modelId];
            if (dist) {
                const runTotal = Object.values(dist).reduce((sum, c) => sum + c, 0);

                Object.entries(dist).forEach(([option, count]) => {
                    aggregatedDist[option] = (aggregatedDist[option] || 0) + count;
                });

                // Calculate distribution percentages for this single run (for stats)
                if (runTotal > 0) {
                    Object.entries(dist).forEach(([option, count]) => {
                        const opt = parseInt(option);
                        if (!isNaN(opt)) modelDecisions[opt].push(count / runTotal);
                    });
                    // Handle 0 counts for missing options
                    [1, 2, 3, 4, 5].forEach(opt => {
                        if (!dist[String(opt)]) modelDecisions[opt].push(0);
                    });
                }
            }
        });

        // Calculate Decision Stats (Mean, SD, SEM of percentages)
        decisionStats[modelId] = { options: {} };
        [1, 2, 3, 4, 5].forEach(opt => {
            const values = modelDecisions[opt] || [];
            if (values.length > 0) {
                const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
                const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length > 0 ? values.length : 1);
                const sd = Math.sqrt(variance);
                const sem = sd / Math.sqrt(values.length);

                // Safe access to decisionStats[modelId] which is initialized above
                decisionStats[modelId].options[opt] = { mean, sd, sem, n: values.length };
            }
        });

        // --- B. Aggregate Value Scores (Win Rates) ---
        // Helper type for mutable value stats construction
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
                    if (target) {
                        target.count.prioritized += vStats.count.prioritized;
                        target.count.deprioritized += vStats.count.deprioritized;
                        target.count.neutral += vStats.count.neutral;
                    }

                    const rates = modelValueRates[valueId];
                    if (rates) rates.push(vStats.winRate);
                });
            }
        });

        // Recalculate combined win rates and value stats
        valueAggregateStats[modelId] = { values: {} };
        Object.keys(aggregatedValues).forEach(valueId => {
            const target = aggregatedValues[valueId];
            if (!target) return;

            const totalWins = target.count.prioritized;
            const totalBattles = target.count.prioritized + target.count.deprioritized;
            target.winRate = totalBattles > 0 ? totalWins / totalBattles : 0; // Weighted average effectively

            // Calculate Value Stats (Variation across runs)
            const rates = modelValueRates[valueId] || []; // Guard against undefined
            if (rates.length > 0) {
                const mean = rates.reduce((sum, v) => sum + v, 0) / rates.length;
                const variance = rates.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (rates.length > 0 ? rates.length : 1);
                const sd = Math.sqrt(variance);
                const sem = sd / Math.sqrt(rates.length);

                if (valueAggregateStats[modelId]) {
                    valueAggregateStats[modelId].values[valueId] = {
                        winRateMean: mean,
                        winRateSd: sd,
                        winRateSem: sem
                    };
                }

                // Update the public/standard stats with the Aggregate CI
                // 95% CI = Mean +/- 1.96 * SEM
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
            overall: { mean: 0, stdDev: 0, min: 0, max: 0 } // Legacy/Placeholder
        };
    });

    // 5. Merge Contested Scenarios
    const scenarioMap = new Map<string, { varianceSum: number, count: number, scenario: ContestedScenario }>();

    analyses.forEach(a => {
        if (a.mostContestedScenarios) {
            a.mostContestedScenarios.forEach(s => {
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

    // Reconstruct Visualization Data
    const mergedVizData: VisualizationData = {
        decisionDistribution: {},
        modelScenarioMatrix: {}
    };

    modelIds.forEach(mId => {
        mergedVizData.decisionDistribution[mId] = {};
        analyses.forEach(a => {
            const d = a.visualizationData?.decisionDistribution?.[mId];
            if (d) {
                Object.entries(d).forEach(([k, v]) => {
                    const currentDist = mergedVizData.decisionDistribution[mId];
                    if (currentDist) {
                        currentDist[k] = (currentDist[k] || 0) + v;
                    }
                });
            }
        });
    });

    return {
        ...template,
        id: `aggregate-${Date.now()}`,
        runId: `aggregate-${Date.now()}`,
        analysisType: 'AGGREGATE',
        status: 'CURRENT', // Explicitly set status to satisfy type
        computedAt: latestEnd,
        createdAt: earliestStart,
        durationMs: 0,
        perModel: aggregatedPerModel,
        modelAgreement: template.modelAgreement,
        dimensionAnalysis: null,
        visualizationData: mergedVizData,
        varianceAnalysis: null,
        mostContestedScenarios: mergedContested,
        isAggregate: true,
        runCount,
        sourceRunIds,
        decisionStats,
        valueAggregateStats
    };
}

/**
 * Stability Tab
 *
 * Displays Condition x AI Standard Error of the Mean (SEM) report.
 * Replaces the old Values tab.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PerModelStats } from './types';
import type { VisualizationData, VarianceAnalysis } from '../../../api/operations/analysis';
import { Button } from '../../ui/Button';

type StabilityTabProps = {
    runId: string;
    perModel: Record<string, PerModelStats>;
    visualizationData: VisualizationData | null | undefined;
    varianceAnalysis?: VarianceAnalysis | null;
};

type ConditionRow = {
    id: string;
    attributeALevel: string;
    attributeBLevel: string;
    scenarioIds: string[];
};

/**
 * Calculate Standard Error of the Mean (SEM).
 * SEM = StdDev / sqrt(N)
 * StdDev = sqrt(Variance)
 * Variance = sum((x - mean)^2) / (N - 1)
 */
function calculateSEM(scores: number[]): number | null {
    const n = scores.length;
    if (n < 2) return null; // Need at least 2 samples for variance

    const mean = scores.reduce((sum, score) => sum + score, 0) / n;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / (n - 1);
    const stdDev = Math.sqrt(variance);
    const sem = stdDev / Math.sqrt(n);

    return sem;
}

function getSEMColor(sem: number): string {
    if (sem === -1) {
        // Insufficient data (N < 2)
        return 'rgba(243, 244, 246, 1)'; // bg-gray-100
    }
    if (sem >= 0.2) {
        // Light Red for high instability
        return 'rgba(254, 242, 242, 1)'; // bg-red-50
    }
    if (sem > 0.1) {
        // Light Yellow for moderate instability
        return 'rgba(255, 251, 235, 1)'; // bg-yellow-50
    }
    // Default (transparent/white) for low instability
    return 'transparent';
}

function getSEMTextColor(sem: number): string {
    if (sem === -1) return 'text-gray-400 text-xs italic';
    if (sem >= 0.2) return 'text-red-700 font-medium';
    if (sem > 0.1) return 'text-amber-700 font-medium';
    return 'text-gray-500';
}

function ConditionStabilityMatrix({
    runId,
    perModel,
    visualizationData,
    varianceAnalysis,
}: {
    runId: string;
    perModel: Record<string, PerModelStats>;
    visualizationData: VisualizationData | null | undefined;
    varianceAnalysis?: VarianceAnalysis | null;
}) {
    const navigate = useNavigate();
    const scenarioDimensions = visualizationData?.scenarioDimensions;
    const modelScenarioMatrix = visualizationData?.modelScenarioMatrix;
    const models = useMemo(() => Object.keys(perModel).sort(), [perModel]);

    const availableAttributes = useMemo(() => {
        if (!scenarioDimensions) return [];
        const scenarios = Object.values(scenarioDimensions);
        if (scenarios.length === 0) return [];
        const firstScenario = scenarios[0];
        if (!firstScenario) return [];
        return Object.keys(firstScenario).sort();
    }, [scenarioDimensions]);

    const [attributeA, setAttributeA] = useState<string>(availableAttributes[0] ?? '');
    const [attributeB, setAttributeB] = useState<string>(availableAttributes[1] ?? availableAttributes[0] ?? '');
    const [selectedModels, setSelectedModels] = useState<string[]>(models);

    useEffect(() => {
        const nextA = availableAttributes[0] ?? '';
        const nextB = availableAttributes[1] ?? availableAttributes[0] ?? '';

        if (!availableAttributes.includes(attributeA)) {
            setAttributeA(nextA);
        }
        if (!availableAttributes.includes(attributeB)) {
            setAttributeB(nextB);
        }
    }, [availableAttributes, attributeA, attributeB]);

    useEffect(() => {
        setSelectedModels((current) => {
            const next = current.filter((modelId) => models.includes(modelId));
            return next.length > 0 ? next : models;
        });
    }, [models]);

    const visibleModels = useMemo(
        () => models.filter((modelId) => selectedModels.includes(modelId)),
        [models, selectedModels]
    );

    const toggleModel = (modelId: string) => {
        setSelectedModels((current) => {
            if (current.includes(modelId)) {
                return current.filter((id) => id !== modelId);
            }
            return [...current, modelId];
        });
    };

    const conditionRows = useMemo<ConditionRow[]>(() => {
        if (!scenarioDimensions || !attributeA || !attributeB) return [];

        const grouped = new Map<string, ConditionRow>();
        Object.entries(scenarioDimensions).forEach(([scenarioId, dimensions]) => {
            const aLevel = String(dimensions[attributeA] ?? 'N/A');
            const bLevel = String(dimensions[attributeB] ?? 'N/A');
            const id = `${aLevel}||${bLevel}`;
            const current = grouped.get(id);
            if (current) {
                current.scenarioIds.push(scenarioId);
                return;
            }
            grouped.set(id, {
                id,
                attributeALevel: aLevel,
                attributeBLevel: bLevel,
                scenarioIds: [scenarioId],
            });
        });

        return [...grouped.values()].sort((left, right) => {
            if (left.attributeALevel === right.attributeALevel) {
                return left.attributeBLevel.localeCompare(right.attributeBLevel);
            }
            return left.attributeALevel.localeCompare(right.attributeALevel);
        });
    }, [scenarioDimensions, attributeA, attributeB]);

    const getModelSEM = (modelId: string, scenarioIds: string[]): { sem: number | null, count: number } | null => {
        // 1. Try Variance Analysis (Multi-sample / Aggregate)
        if (varianceAnalysis) {
            const modelStats = varianceAnalysis.perModel[modelId];
            if (modelStats && modelStats.perScenario) {
                const sems: number[] = [];
                let hasAnyStats = false;
                let totalCount = 0;

                scenarioIds.forEach(scenId => {
                    const stats = modelStats.perScenario[scenId];
                    if (stats) {
                        hasAnyStats = true;
                        totalCount += stats.sampleCount;
                        if (stats.sampleCount > 1) {
                            sems.push(stats.stdDev / Math.sqrt(stats.sampleCount));
                        }
                    }
                });

                if (sems.length > 0) {
                    // Return average SEM
                    return {
                        sem: sems.reduce((a, b) => a + b, 0) / sems.length,
                        count: totalCount
                    };
                }

                // If we had stats but NONE had > 1 sample
                if (hasAnyStats) {
                    return { sem: -1, count: totalCount };
                }

                // If no stats found for any scenario in this condition
                if (totalCount === 0) return null;
            }
        }

        // 2. Fallback to existing logic
        const byScenario = modelScenarioMatrix?.[modelId];
        if (!byScenario) return null;

        const scores: number[] = [];
        scenarioIds.forEach((scenarioId) => {
            const score = byScenario[scenarioId];
            if (typeof score === 'number' && Number.isFinite(score)) {
                scores.push(score);
            }
        });

        if (scores.length === 0) return null;

        return {
            sem: calculateSEM(scores),
            count: scores.length
        };
    };

    const handleCellClick = (modelId: string, row: ConditionRow) => {
        const params = new URLSearchParams({
            rowDim: attributeA,
            colDim: attributeB,
            row: row.attributeALevel,
            col: row.attributeBLevel,
            model: modelId,
        });
        navigate(`/analysis/${runId}/transcripts?${params.toString()}`);
    };

    if (!scenarioDimensions || !modelScenarioMatrix) {
        return (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                Condition-level matrix data is unavailable. Recompute analysis to regenerate scenario dimensions.
            </div>
        );
    }

    if (availableAttributes.length < 2) {
        return (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                Need at least two condition attributes to build an attribute A/B stability table.
            </div>
        );
    }

    return (
        <div className="space-y-4 rounded-lg border border-gray-200 p-4">
            <div className="flex flex-wrap items-end gap-4">
                <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Attribute A</label>
                    <select
                        value={attributeA}
                        onChange={(event) => setAttributeA(event.target.value)}
                        className="block w-52 rounded-md border-gray-300 text-sm shadow-sm focus:border-teal-500 focus:ring-teal-500"
                    >
                        {availableAttributes.map((attribute) => (
                            <option key={attribute} value={attribute}>
                                {attribute}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Attribute B</label>
                    <select
                        value={attributeB}
                        onChange={(event) => setAttributeB(event.target.value)}
                        className="block w-52 rounded-md border-gray-300 text-sm shadow-sm focus:border-teal-500 focus:ring-teal-500"
                    >
                        {availableAttributes.map((attribute) => (
                            <option key={attribute} value={attribute}>
                                {attribute}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="mb-1 block text-xs font-medium uppercase text-gray-500">AI Columns</label>
                    <details className="relative">
                        <summary className="min-w-52 cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm">
                            {visibleModels.length === models.length
                                ? 'All target AIs'
                                : `${visibleModels.length} of ${models.length} selected`}
                        </summary>
                        <div className="absolute z-10 mt-2 w-64 rounded-md border border-gray-200 bg-white p-3 shadow-lg">
                            <div className="mb-2 flex items-center justify-between">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-auto min-h-0 px-0 py-0 text-xs font-medium text-teal-700 hover:text-teal-800"
                                    onClick={() => setSelectedModels(models)}
                                >
                                    Select all
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-auto min-h-0 px-0 py-0 text-xs font-medium text-gray-600 hover:text-gray-800"
                                    onClick={() => setSelectedModels([])}
                                >
                                    Clear
                                </Button>
                            </div>
                            <div className="max-h-52 space-y-2 overflow-y-auto">
                                {models.map((modelId) => (
                                    <label key={modelId} className="flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={selectedModels.includes(modelId)}
                                            onChange={() => toggleModel(modelId)}
                                            className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                                        />
                                        <span className="truncate" title={modelId}>
                                            {modelId}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </details>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                    <thead>
                        <tr>
                            <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                                Condition
                            </th>
                            {visibleModels.map((modelId) => (
                                <th
                                    key={modelId}
                                    className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700"
                                    title={modelId}
                                >
                                    {modelId}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {conditionRows.map((row) => (
                            <tr key={row.id}>
                                <td className="border border-gray-200 px-3 py-2 text-sm text-gray-700">
                                    {attributeA}: {row.attributeALevel}, {attributeB}: {row.attributeBLevel}
                                </td>
                                {visibleModels.map((modelId) => {
                                    const result = getModelSEM(modelId, row.scenarioIds);
                                    const canOpen = result !== null;
                                    const sem = result?.sem ?? null;
                                    const count = result?.count ?? 0;

                                    return (
                                        <td
                                            key={`${row.id}-${modelId}`}
                                            className={`border border-gray-200 px-3 py-2 text-center text-sm transition-colors ${canOpen ? 'cursor-pointer hover:ring-1 hover:ring-teal-300' : ''
                                                }`}
                                            style={{ backgroundColor: sem === null ? undefined : getSEMColor(sem) }}
                                            title={
                                                canOpen
                                                    ? `View ${count} transcripts for ${modelId} | ${attributeA}: ${row.attributeALevel}, ${attributeB}: ${row.attributeBLevel}`
                                                    : 'No score available'
                                            }
                                            onClick={canOpen ? () => handleCellClick(modelId, row) : undefined}
                                        >
                                            {result === null ? (
                                                <span className="text-gray-300">-</span>
                                            ) : (
                                                <div className="flex flex-col items-center">
                                                    {sem === -1 ? (
                                                        <span className={getSEMTextColor(sem)}>N&lt;2</span>
                                                    ) : (
                                                        <span className={getSEMTextColor(sem!)}>{sem!.toFixed(3)}</span>
                                                    )}
                                                    <span className="text-[10px] text-gray-400 mt-0.5">n={count}</span>
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
                {visibleModels.length === 0 && (
                    <div className="mt-2 text-xs text-amber-700">Select at least one AI column to display data.</div>
                )}
            </div>
        </div>
    );
}

export function StabilityTab({ runId, perModel, visualizationData, varianceAnalysis }: StabilityTabProps) {
    return (
        <div className="space-y-6">
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-700">Condition x AI Standard Error of Mean (SEM)</h3>
                <p className="text-xs text-gray-500">
                    Rows are condition combinations (attribute A level + attribute B level). Columns are target AIs.
                    Each cell shows the Standard Error of the Mean (SEM) of decisions. Lower is more stable.
                </p>
                <ConditionStabilityMatrix
                    runId={runId}
                    perModel={perModel}
                    visualizationData={visualizationData}
                    varianceAnalysis={varianceAnalysis}
                />
            </div>
        </div>
    );
}

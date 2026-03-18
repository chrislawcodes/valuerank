/**
 * Stability Tab
 *
 * Displays Condition x AI directional stability report.
 * Replaces the old Values tab.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PerModelStats } from './types';
import type { VisualizationData, VarianceAnalysis } from '../../../api/operations/analysis';
import { Button } from '../../ui/Button';
import { CopyVisualButton } from '../../ui/CopyVisualButton';
import { DecisionCoverageBanner } from '../DecisionCoverageBanner';
import { ANALYSIS_BASE_PATH, type AnalysisBasePath, buildAnalysisTranscriptsPath } from '../../../utils/analysisRouting';
import {
    getCoverageForModel,
    type DecisionCoverageSummary,
} from '../../../utils/analysisCoverage';
import type { PairedScopeContext } from '../../../utils/pairedScopeAdapter';

type StabilityTabProps = {
    runId: string;
    analysisBasePath?: AnalysisBasePath;
    analysisSearchParams?: URLSearchParams | string;
    analysisMode?: 'single' | 'paired';
    pairedScopeContext?: PairedScopeContext;
    perModel: Record<string, PerModelStats>;
    visualizationData: VisualizationData | null | undefined;
    varianceAnalysis?: VarianceAnalysis | null;
    decisionCoverage?: DecisionCoverageSummary | null;
};

type ConditionRow = {
    id: string;
    attributeALevel: string;
    attributeBLevel: string;
    scenarioIds: string[];
};

export type CellStabilityMetrics = {
    direction: 'A' | 'B' | 'NEUTRAL' | null;
    agreementCount: number;
    totalCount: number;
    directionalAgreement: number | null;
    medianSignedDistance: number | null;
    iqr: number | null;
    neutralShare: number | null;
};

/**
 * Aggregate directional stability metrics across multiple scenarios in a condition cell.
 * Returns null if varianceAnalysis is absent or no perScenario data exists for this model.
 */
export function getModelStabilityMetrics(
    modelId: string,
    scenarioIds: string[],
    varianceAnalysis: VarianceAnalysis | null | undefined
): CellStabilityMetrics | null {
    if (!varianceAnalysis) return null;
    const modelStats = varianceAnalysis.perModel[modelId];
    if (!modelStats?.perScenario) return null;

    const scenStats = scenarioIds
        .map((id) => modelStats.perScenario[id])
        .filter((s): s is NonNullable<typeof s> => s != null && s.sampleCount > 0);

    if (scenStats.length === 0) return null;

    const totalCount = scenStats.reduce((sum, s) => sum + s.sampleCount, 0);
    const directionWeights: Record<string, number> = { A: 0, B: 0, NEUTRAL: 0 };
    for (const s of scenStats) {
        if (s.direction != null) {
            directionWeights[s.direction] = (directionWeights[s.direction] ?? 0) + s.sampleCount;
        }
    }

    const hasDirectionalData = scenStats.some((s) => s.direction != null);
    if (!hasDirectionalData) {
        return {
            direction: null,
            agreementCount: 0,
            totalCount,
            directionalAgreement: null,
            medianSignedDistance: null,
            iqr: null,
            neutralShare: null,
        };
    }

    let cellDirection: 'A' | 'B' | 'NEUTRAL' | null = null;
    for (const dir of ['A', 'B', 'NEUTRAL'] as const) {
        if (cellDirection === null || (directionWeights[dir] ?? 0) > (directionWeights[cellDirection] ?? 0)) {
            cellDirection = dir;
        }
    }

    let agreementCount = 0;
    for (const s of scenStats) {
        if (s.direction != null && s.directionalAgreement != null && s.direction === cellDirection) {
            agreementCount += Math.round(s.directionalAgreement * s.sampleCount);
        }
    }

    const directionalAgreement = totalCount > 0 ? agreementCount / totalCount : null;
    const scenWithMedian = scenStats.filter((s) => s.medianSignedDistance != null);
    const weightedMedian = scenWithMedian.length > 0
        ? scenWithMedian.reduce((sum, s) => sum + (s.medianSignedDistance! * s.sampleCount), 0) /
          scenWithMedian.reduce((sum, s) => sum + s.sampleCount, 0)
        : null;

    const scenWithIQR = scenStats.filter((s) => s.iqr != null);
    const weightedIQR = scenWithIQR.length > 0
        ? scenWithIQR.reduce((sum, s) => sum + (s.iqr! * s.sampleCount), 0) /
          scenWithIQR.reduce((sum, s) => sum + s.sampleCount, 0)
        : null;

    const scenWithNeutral = scenStats.filter((s) => s.neutralShare != null);
    const weightedNeutral = scenWithNeutral.length > 0
        ? scenWithNeutral.reduce((sum, s) => sum + (s.neutralShare! * s.sampleCount), 0) /
          scenWithNeutral.reduce((sum, s) => sum + s.sampleCount, 0)
        : null;

    return {
        direction: cellDirection,
        agreementCount,
        totalCount,
        directionalAgreement,
        medianSignedDistance: weightedMedian !== null ? parseFloat(weightedMedian.toFixed(2)) : null,
        iqr: weightedIQR !== null ? parseFloat(weightedIQR.toFixed(2)) : null,
        neutralShare: weightedNeutral !== null ? parseFloat(weightedNeutral.toFixed(2)) : null,
    };
}

/**
 * Returns stability label based on directional agreement and sample count.
 * High: all replicates agree. Moderate: all but one. Low: less.
 * Returns null when N < 2 (not enough samples to assess stability).
 */
export function getStabilityLabel(
    agreementCount: number,
    totalCount: number
): 'High' | 'Moderate' | 'Low' | null {
    if (totalCount < 2) return null;
    if (agreementCount === totalCount) return 'High';
    if (agreementCount === totalCount - 1) return 'Moderate';
    return 'Low';
}

/**
 * Returns Tailwind background color class for direction.
 */
export function getDirectionBgColor(direction: 'A' | 'B' | 'NEUTRAL' | null): string {
    if (direction === 'A') return 'bg-blue-50';
    if (direction === 'B') return 'bg-orange-50';
    return '';
}

/**
 * Returns Tailwind text color class for direction.
 */
export function getDirectionTextColor(direction: 'A' | 'B' | 'NEUTRAL' | null): string {
    if (direction === 'A') return 'text-blue-700 font-medium';
    if (direction === 'B') return 'text-orange-700 font-medium';
    if (direction === 'NEUTRAL') return 'text-gray-600';
    return 'text-gray-400';
}

function ConditionStabilityMatrix({
    runId,
    analysisBasePath = ANALYSIS_BASE_PATH,
    analysisSearchParams,
    perModel,
    visualizationData,
    varianceAnalysis,
}: {
    runId: string;
    analysisBasePath?: AnalysisBasePath;
    analysisSearchParams?: URLSearchParams | string;
    perModel: Record<string, PerModelStats>;
    visualizationData: VisualizationData | null | undefined;
    varianceAnalysis?: VarianceAnalysis | null;
}) {
    const tableRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const scenarioDimensions = visualizationData?.scenarioDimensions;
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

    const handleCellClick = (modelId: string, row: ConditionRow) => {
        const params = new URLSearchParams({
            rowDim: attributeA,
            colDim: attributeB,
            row: row.attributeALevel,
            col: row.attributeBLevel,
            model: modelId,
        });
        navigate(buildAnalysisTranscriptsPath(analysisBasePath, runId, params, analysisSearchParams));
      };

    if (!scenarioDimensions) {
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
        <div ref={tableRef} className="space-y-4 rounded-lg border border-gray-200 p-4">
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

            <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase text-gray-500">Condition x AI Directional Stability</h4>
                <CopyVisualButton targetRef={tableRef} label="condition by AI stability table" />
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
                                    const metrics = getModelStabilityMetrics(modelId, row.scenarioIds, varianceAnalysis);
                                    const canOpen = metrics !== null;
                                    const stabilityLabel = metrics != null
                                        ? getStabilityLabel(metrics.agreementCount, metrics.totalCount)
                                        : null;

                                    return (
                                        <td
                                            key={`${row.id}-${modelId}`}
                                            className={`relative border border-gray-200 px-2 py-2 text-center text-sm transition-colors ${canOpen ? 'cursor-pointer hover:ring-1 hover:ring-teal-300' : ''} ${metrics?.direction != null ? getDirectionBgColor(metrics.direction) : ''}`}
                                            title={
                                                metrics !== null
                                                    ? `View ${metrics.totalCount} transcripts for ${modelId} | ${attributeA}: ${row.attributeALevel}, ${attributeB}: ${row.attributeBLevel}`
                                                    : 'No score available'
                                            }
                                            onClick={canOpen ? () => handleCellClick(modelId, row) : undefined}
                                        >
                                            {metrics === null ? (
                                                <span className="text-gray-300">-</span>
                                            ) : (
                                                <div className="flex flex-col items-center gap-0.5">
                                                    <div className="flex items-center gap-1">
                                                        <span className={`text-xs ${getDirectionTextColor(metrics.direction)}`}>
                                                            {metrics.direction === 'A' ? 'Favors A' :
                                                                metrics.direction === 'B' ? 'Favors B' :
                                                                    metrics.direction === 'NEUTRAL' ? 'Neutral' : '—'}
                                                        </span>
                                                        {metrics.totalCount > 1 && metrics.directionalAgreement != null && (
                                                            <span className="text-[10px] text-gray-500">
                                                                · {metrics.agreementCount}/{metrics.totalCount}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {metrics.totalCount >= 2 && metrics.medianSignedDistance != null && (
                                                        <div className="text-[10px] text-gray-400">
                                                            {metrics.medianSignedDistance >= 0 ? '+' : ''}
                                                            {metrics.medianSignedDistance.toFixed(1)}
                                                            {metrics.iqr != null && ` · IQR ${metrics.iqr.toFixed(1)}`}
                                                        </div>
                                                    )}
                                                    {stabilityLabel != null && (
                                                        <span className={`absolute top-0.5 right-0.5 text-[9px] px-1 rounded font-medium ${stabilityLabel === 'High' ? 'bg-green-100 text-green-700' :
                                                            stabilityLabel === 'Moderate' ? 'bg-yellow-100 text-yellow-700' :
                                                                'bg-red-100 text-red-600'
                                                            }`}>
                                                            {stabilityLabel}
                                                        </span>
                                                    )}
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

export function StabilityTab({
    runId,
    analysisBasePath = ANALYSIS_BASE_PATH,
    analysisSearchParams,
    analysisMode,
    pairedScopeContext,
    perModel,
    visualizationData,
    varianceAnalysis,
    decisionCoverage,
}: StabilityTabProps) {
    const orientationCorrectedCount = varianceAnalysis?.orientationCorrectedCount ?? 0;
    const showPairedOrientationBanner = pairedScopeContext?.hasOrientationPairing ?? false;
    const visibleCoverageRows = useMemo(
        () => Object.keys(perModel)
            .sort()
            .map((modelId) => ({
                modelId,
                coverage: getCoverageForModel(decisionCoverage, modelId),
            }))
            .filter((entry) => entry.coverage !== null),
        [decisionCoverage, perModel],
    );

    return (
        <div className="space-y-6">
            <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-700">Condition x AI Directional Stability</h3>
                <p className="text-xs text-gray-500">
                    Rows are condition combinations (attribute A level + attribute B level). Columns are target AIs.
                    Each cell shows the predominant direction (Favors A / Favors B / Neutral) and the fraction of
                    replicates that agree. High stability means all replicates pointed the same direction.
                    {analysisMode === 'paired'
                        ? ' Paired mode keeps the matched vignette context visible while you review these stability metrics.'
                        : analysisMode === 'single'
                        ? ' Single mode keeps the analysis focused on one vignette at a time.'
                        : null}
                </p>
                {showPairedOrientationBanner && pairedScopeContext != null && (
                    <div className="rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
                        <span className="font-medium">Paired orientation pooling: </span>
                        {pairedScopeContext.orientationCorrectedCount} scenario{pairedScopeContext.orientationCorrectedCount === 1 ? '' : 's'} had
                        their presentation order reversed for the B-first vignette. Scores were normalized to
                        the canonical A-first orientation before computing direction.{' '}
                        <span className="font-medium">Favors A</span> and{' '}
                        <span className="font-medium">Favors B</span> refer to the A-first value order.
                    </div>
                )}
                {decisionCoverage && (
                    <div className="space-y-3">
                        <DecisionCoverageBanner
                            coverage={decisionCoverage}
                            contextLabel={analysisMode === 'paired' ? 'paired vignette stability metrics' : 'stability metrics'}
                            compact
                        />
                        {visibleCoverageRows.length > 0 && (
                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
                                                AI
                                            </th>
                                            <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">
                                                Scored
                                            </th>
                                            <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">
                                                Parser
                                            </th>
                                            <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">
                                                Manual
                                            </th>
                                            <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-600">
                                                Unresolved
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                        {visibleCoverageRows.map(({ modelId, coverage }) => (
                                            coverage && (
                                                <tr key={modelId}>
                                                    <td className="px-3 py-2 text-sm text-gray-700">{modelId}</td>
                                                    <td className="px-3 py-2 text-right text-sm text-gray-700">
                                                        {coverage.scoredTranscripts}/{coverage.totalTranscripts}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-sm text-gray-700">
                                                        {coverage.parserScoredTranscripts}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-sm text-gray-700">
                                                        {coverage.manuallyAdjudicatedTranscripts}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-sm text-amber-700">
                                                        {coverage.unresolvedTranscripts}
                                                    </td>
                                                </tr>
                                            )
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            <ConditionStabilityMatrix
                runId={runId}
                analysisBasePath={analysisBasePath}
                analysisSearchParams={analysisSearchParams}
                perModel={perModel}
                visualizationData={visualizationData}
                varianceAnalysis={varianceAnalysis}
            />
                {orientationCorrectedCount > 0 && !showPairedOrientationBanner && (
                    <p className="mt-1 text-xs text-gray-400">
                        * Scores for {orientationCorrectedCount} scenario(s) with reversed presentation order were
                        normalized before computing direction.
                    </p>
                )}
            </div>
        </div>
    );
}

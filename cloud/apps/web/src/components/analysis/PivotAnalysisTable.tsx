
import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VisualizationData } from '../../api/operations/analysis';
import type { Transcript } from '../../api/operations/runs';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import { Button } from '../ui/Button';
import {
    getDecisionSideNames,
    mapDecisionSidesToScenarioAttributes,
    resolveScenarioAttributes,
} from '../../utils/decisionLabels';
import { formatDisplayLabel } from '../../utils/displayLabels';
import {
    ANALYSIS_BASE_PATH,
    type AnalysisBasePath,
    buildAnalysisConditionDetailPath,
    buildConditionKey,
} from '../../utils/analysisRouting';
import {
    buildCanonicalTranscriptIndex,
    collectCanonicalConditionTranscripts,
    summarizeCanonicalConditionTranscripts,
    getCanonicalConditionBackground,
    getCanonicalConditionTextColor,
    type CanonicalConditionSummary,
} from '../../utils/canonicalConditionSummary';
import { compareConditionLevels } from '../../utils/conditionOrdering';

type PivotAnalysisTableProps = {
    runId: string;
    analysisBasePath?: AnalysisBasePath;
    analysisSearchParams?: URLSearchParams | string;
    analysisMode?: 'single' | 'paired';
    visualizationData: VisualizationData;
    transcripts?: Transcript[];
    dimensionLabels?: Record<string, string>;
    expectedAttributes?: string[];
    companionRunId?: string | null;
};

type LegendCounts = {
    low: number;
    neutral: number;
    high: number;
};

function Legend({ lowName, highName, counts }: { lowName: string; highName: string; counts: LegendCounts }) {
    return (
        <div className="flex items-center gap-4 text-xs text-gray-500">
            <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-blue-100 border border-blue-200"></span>
                <span className="font-medium text-blue-800">{formatDisplayLabel(lowName)} {counts.low}</span>
            </div>
            <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-gray-100 border border-gray-200"></span>
                <span>Neutral {counts.neutral}</span>
            </div>
            <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-orange-100 border border-orange-200"></span>
                <span className="font-medium text-orange-800">{formatDisplayLabel(highName)} {counts.high}</span>
            </div>
        </div>
    );
}

export function PivotAnalysisTable({
    runId,
    analysisBasePath = ANALYSIS_BASE_PATH,
    analysisSearchParams,
    visualizationData,
    transcripts,
    dimensionLabels,
    expectedAttributes = [],
    companionRunId,
}: PivotAnalysisTableProps) {
    const tableRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const { modelScenarioMatrix, scenarioDimensions } = visualizationData;

    // 1. Identify available dimensions
    const availableDimensions = useMemo(() => {
        return resolveScenarioAttributes(scenarioDimensions, expectedAttributes, modelScenarioMatrix);
    }, [expectedAttributes, scenarioDimensions, modelScenarioMatrix]);

    // Models list
    const models = useMemo(() => Object.keys(modelScenarioMatrix || {}).sort(), [modelScenarioMatrix]);

    // State for selected dimensions and model
    const [rowDim, setRowDim] = useState<string>(availableDimensions[0] || '');
    const [colDim, setColDim] = useState<string>(availableDimensions[1] || availableDimensions[0] || '');
    // Default to first alphabetical model if available
    const [selectedModel, setSelectedModel] = useState<string>(models[0] || '');
    const [showDetails, setShowDetails] = useState<boolean>(false);
    const decisionSideNames = useMemo(() => getDecisionSideNames(dimensionLabels), [dimensionLabels]);
    const sideAttributeMap = useMemo(
        () => mapDecisionSidesToScenarioAttributes(decisionSideNames.aName, decisionSideNames.bName, [rowDim, colDim].filter((d) => d !== '')),
        [colDim, decisionSideNames.aName, decisionSideNames.bName, rowDim]
    );

    useEffect(() => {
        const nextRow = availableDimensions[0] ?? '';
        const nextCol = availableDimensions[1] ?? availableDimensions[0] ?? '';

        if (availableDimensions.length === 0) {
            if (rowDim !== '') setRowDim('');
            if (colDim !== '') setColDim('');
            return;
        }

        if (!availableDimensions.includes(rowDim)) {
            setRowDim(nextRow);
        }

        if (!availableDimensions.includes(colDim)) {
            setColDim(nextCol);
        }
    }, [availableDimensions, rowDim, colDim]);

    useEffect(() => {
        const nextModel = models[0] ?? '';

        if (models.length === 0) {
            if (selectedModel !== '') setSelectedModel('');
            return;
        }

        if (!models.includes(selectedModel)) {
            setSelectedModel(nextModel);
        }
    }, [models, selectedModel]);

    // 2. Build canonical transcript index
    const transcriptIndex = useMemo(
        () => buildCanonicalTranscriptIndex(transcripts),
        [transcripts],
    );

    // 3. Aggregate Data based on selection using canonical scoring
    const pivotData = useMemo(() => {
        if (!scenarioDimensions || !modelScenarioMatrix) return null;
        if (!rowDim || !colDim || !selectedModel) return null;

        // Collect scenario IDs per cell
        const scenarioIdsByCell: Record<string, Record<string, string[]>> = {};
        const rowValues = new Set<string>();
        const colValues = new Set<string>();

        Object.entries(scenarioDimensions).forEach(([scenarioId, dims]) => {
            const rVal = String(dims[rowDim] ?? 'N/A');
            const cVal = String(dims[colDim] ?? 'N/A');

            rowValues.add(rVal);
            colValues.add(cVal);

            if (!scenarioIdsByCell[rVal]) scenarioIdsByCell[rVal] = {};
            if (!scenarioIdsByCell[rVal][cVal]) scenarioIdsByCell[rVal][cVal] = [];
            scenarioIdsByCell[rVal][cVal].push(scenarioId);
        });

        // Compute canonical summary per cell
        const grid: Record<string, Record<string, CanonicalConditionSummary>> = {};

        Object.entries(scenarioIdsByCell).forEach(([rVal, cols]) => {
            const rowGrid: Record<string, CanonicalConditionSummary> = {};
            grid[rVal] = rowGrid;
            Object.entries(cols).forEach(([cVal, scenarioIds]) => {
                const cellTranscripts = collectCanonicalConditionTranscripts(transcriptIndex, selectedModel, scenarioIds);
                rowGrid[cVal] = summarizeCanonicalConditionTranscripts(cellTranscripts);
            });
        });

        return {
            grid,
            rows: Array.from(rowValues).sort(compareConditionLevels),
            cols: Array.from(colValues).sort(compareConditionLevels),
        };

    }, [scenarioDimensions, modelScenarioMatrix, rowDim, colDim, selectedModel, transcriptIndex]);

    const legendCounts = useMemo<LegendCounts>(() => {
        if (!scenarioDimensions || !selectedModel) {
            return { low: 0, neutral: 0, high: 0 };
        }

        let low = 0;
        let neutral = 0;
        let high = 0;

        for (const scenarioId of Object.keys(scenarioDimensions)) {
            const cellTranscripts = collectCanonicalConditionTranscripts(transcriptIndex, selectedModel, [scenarioId]);
            const summary = summarizeCanonicalConditionTranscripts(cellTranscripts);
            if (summary.totalTrials === 0) continue;

            if (summary.isOpponent) {
                high += 1;
            } else if (summary.neutral > 0 && summary.strongly === 0 && summary.somewhat === 0) {
                neutral += 1;
            } else {
                low += 1;
            }
        }

        return { low, neutral, high };
    }, [scenarioDimensions, selectedModel, transcriptIndex]);

    const handleCellClick = (row: string, col: string) => {
        const params = new URLSearchParams({
            rowDim,
            colDim,
            modelId: selectedModel || '',
        });
        if (companionRunId != null && companionRunId !== '') {
            params.set('companionRunId', companionRunId);
        }
        navigate(
            buildAnalysisConditionDetailPath(
                analysisBasePath,
                runId,
                buildConditionKey(row, col),
                params,
                analysisSearchParams,
            )
        );
    };

    if (!scenarioDimensions || availableDimensions.length === 0) {
        return <div className="p-4 text-gray-500 italic">No dimension data available for pivot analysis.</div>;
    }

    if (models.length === 0) {
        return <div className="p-4 text-gray-500 italic">No models available for analysis.</div>;
    }

    return (
        <div ref={tableRef} className="space-y-4 bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-900">Pivot Analysis</h3>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDetails((current) => !current)}
                        className="min-h-0 px-2 py-1 text-xs"
                        aria-expanded={showDetails}
                    >
                        {showDetails ? 'Hide Details' : 'Details'}
                    </Button>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    <Legend
                        lowName={sideAttributeMap.lowAttribute}
                        highName={sideAttributeMap.highAttribute}
                        counts={legendCounts}
                    />
                    <CopyVisualButton targetRef={tableRef} label="pivot analysis table" />
                </div>
            </div>
            {showDetails && (
                <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-sm text-gray-600">
                        Pick the two condition axes you want to compare. Each box in the table shows the model&apos;s average preference score (0–2) for that pair of condition levels.
                    </p>
                    <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-xs font-medium uppercase text-gray-500">
                            <span>Row</span>
                            <select
                                aria-label="Row Dimension (Y-Axis)"
                                value={rowDim}
                                onChange={e => setRowDim(e.target.value)}
                                className="block w-48 rounded-md border-gray-300 bg-white text-sm font-normal normal-case text-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                            >
                                {availableDimensions.map(d => <option key={d} value={d}>{formatDisplayLabel(d)}</option>)}
                            </select>
                        </label>

                        <label className="flex items-center gap-2 text-xs font-medium uppercase text-gray-500">
                            <span>Column</span>
                            <select
                                aria-label="Column Dimension (X-Axis)"
                                value={colDim}
                                onChange={e => setColDim(e.target.value)}
                                className="block w-48 rounded-md border-gray-300 bg-white text-sm font-normal normal-case text-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                            >
                                {availableDimensions.map(d => <option key={d} value={d}>{formatDisplayLabel(d)}</option>)}
                            </select>
                        </label>
                    </div>
                </div>
            )}
            <div className="flex flex-wrap items-end gap-4">
                <label className="flex items-center gap-2 text-xs font-medium uppercase text-gray-500">
                    <span>Model</span>
                    <select
                        aria-label="Model"
                        value={selectedModel}
                        onChange={e => setSelectedModel(e.target.value)}
                        className="block w-48 rounded-md border-gray-300 bg-white text-sm font-normal normal-case text-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    >
                        {models.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </label>
            </div>
            {/* Grid */}
            {pivotData && (
                <div className="space-y-2">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 border-collapse">
                            <thead>
                            {/* Row 1: Empty + Column Dimension Label */}
                            <tr>
                                <th className="p-2 bg-gray-50 border border-gray-200 border-b-0"></th>
                                <th
                                    colSpan={pivotData.cols.length}
                                    className="p-2 bg-gray-100 border border-gray-200 text-center text-xs font-bold text-gray-700 uppercase"
                                >
                                    {formatDisplayLabel(colDim)}
                                </th>
                            </tr>
                            {/* Row 2: Row Dimension Label + Column Values */}
                            <tr>
                                <th className="p-3 bg-gray-100 border border-gray-200 text-left text-xs font-bold text-gray-700 uppercase w-32">
                                    {formatDisplayLabel(rowDim)}
                                </th>
                                {pivotData.cols.map(col => (
                                    <th key={col} className="p-3 bg-gray-50 border border-gray-200 text-center text-xs font-medium text-gray-500 font-mono">
                                        {formatDisplayLabel(col)}
                                    </th>
                                ))}
                            </tr>
                            </thead>
                            <tbody className="bg-white">
                            {pivotData.rows.map(row => (
                                <tr key={row}>
                                    <td className="p-3 bg-gray-50 border border-gray-200 text-left text-xs font-medium text-gray-500 font-mono whitespace-nowrap">
                                        {formatDisplayLabel(row)}
                                    </td>
                                    {pivotData.cols.map(col => {
                                        const summary = pivotData.grid[row]?.[col];
                                        const hasScore = summary != null && summary.displayScore != null && summary.totalTrials > 0;

                                        return (
                                            <td
                                                key={`${row}-${col}`}
                                                className="p-4 border border-gray-100 text-center text-sm transition-colors cursor-pointer hover:ring-1 hover:ring-teal-300"
                                                style={{
                                                    backgroundColor: hasScore && summary != null
                                                        ? getCanonicalConditionBackground(summary.displayScore ?? 0, summary.isOpponent)
                                                        : undefined,
                                                }}
                                                onClick={() => handleCellClick(row, col)}
                                            >
                                                {hasScore && summary != null ? (
                                                    <span className={`font-semibold ${getCanonicalConditionTextColor(summary.isOpponent)}`}>
                                                        {(summary.displayScore ?? 0).toFixed(2)}
                                                    </span>
                                                ) : <span className="text-gray-500">-</span>}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            </tbody>
                        </table>
                        <div className="mt-2 text-xs text-gray-500">
                            Click a cell to view pooled condition details.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

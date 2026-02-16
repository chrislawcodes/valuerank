
import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VisualizationData } from '../../api/operations/analysis';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import {
    getDecisionSideNames,
    mapDecisionSidesToScenarioAttributes,
    resolveScenarioAttributes,
} from '../../utils/decisionLabels';

type PivotAnalysisTableProps = {
    runId: string;
    visualizationData: VisualizationData;
    dimensionLabels?: Record<string, string>;
    expectedAttributes?: string[];
};

// Start color: Green 50 (bg-emerald-50)
// End color: Red 50 (bg-red-50)
// 1 (Blue) -> 3 (Grey) -> 5 (Orange)
function getHeatmapColor(value: number): string {
    if (value < 1 || value > 5) return 'bg-gray-50'; // Out of bounds or 0

    // Normalize to 0..1 for two scales
    if (value <= 2.5) {
        // Blueish (1.0 = Strong Blue, 2.5 = Weak Blue)
        const intensity = Math.max(0.1, (3 - value) / 2); // 1->1.0, 3->0
        // Blue-500 is rgb(59, 130, 246)
        return `rgba(59, 130, 246, ${intensity * 0.3})`;
    } else if (value >= 3.5) {
        // Orangeish (3.5 = Weak Orange, 5.0 = Strong Orange)
        const intensity = Math.max(0.1, (value - 3) / 2); // 3->0, 5->1.0
        // Orange-500 is rgb(249, 115, 22)
        return `rgba(249, 115, 22, ${intensity * 0.3})`;
    } else {
        // Neutral/Grey
        return `rgba(156, 163, 175, 0.15)`;
    }
}

function getScoreTextColor(value: number): string {
    if (value <= 2.5) return 'text-blue-700';
    if (value >= 3.5) return 'text-orange-700';
    return 'text-gray-600';
}

type LegendCounts = {
    low: number;
    neutral: number;
    high: number;
};

function Legend({ lowName, highName, counts }: { lowName: string; highName: string; counts: LegendCounts }) {
    return (
        <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
            <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-blue-100 border border-blue-200"></span>
                <span className="font-medium text-blue-800">{lowName} {counts.low}</span>
            </div>
            <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-gray-100 border border-gray-200"></span>
                <span>Neutral {counts.neutral}</span>
            </div>
            <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-orange-100 border border-orange-200"></span>
                <span className="font-medium text-orange-800">{highName} {counts.high}</span>
            </div>
        </div>
    );
}

export function PivotAnalysisTable({
    runId,
    visualizationData,
    dimensionLabels,
    expectedAttributes = [],
}: PivotAnalysisTableProps) {
    const tableRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const { modelScenarioMatrix, scenarioDimensions } = visualizationData;

    // 1. Identify available dimensions
    const availableDimensions = useMemo(() => {
        return resolveScenarioAttributes(scenarioDimensions, expectedAttributes);
    }, [expectedAttributes, scenarioDimensions]);

    // Models list
    const models = useMemo(() => Object.keys(modelScenarioMatrix || {}).sort(), [modelScenarioMatrix]);

    // State for selected dimensions and model
    const [rowDim, setRowDim] = useState<string>(availableDimensions[0] || '');
    const [colDim, setColDim] = useState<string>(availableDimensions[1] || availableDimensions[0] || '');
    // Default to first alphabetical model if available
    const [selectedModel, setSelectedModel] = useState<string>(models[0] || '');
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

    // 2. Aggregate Data based on selection
    const pivotData = useMemo(() => {
        if (!scenarioDimensions || !modelScenarioMatrix) return null;
        if (!rowDim || !colDim || !selectedModel) return null;

        const grid: Record<string, Record<string, { sum: number, count: number }>> = {};
        const rowValues = new Set<string>();
        const colValues = new Set<string>();

        // Iterate all scenarios
        Object.entries(scenarioDimensions).forEach(([scenarioId, dims]) => {
            const rVal = String(dims[rowDim] ?? 'N/A');
            const cVal = String(dims[colDim] ?? 'N/A');

            rowValues.add(rVal);
            colValues.add(cVal);

            if (!grid[rVal]) grid[rVal] = {};
            if (!grid[rVal][cVal]) grid[rVal][cVal] = { sum: 0, count: 0 };

            // Get score for selected model
            const score = modelScenarioMatrix[selectedModel]?.[scenarioId];
            if (score) {
                grid[rVal][cVal].sum += score;
                grid[rVal][cVal].count += 1;
            }
        });

        return {
            grid,
            rows: Array.from(rowValues).sort(),
            cols: Array.from(colValues).sort()
        };

    }, [scenarioDimensions, modelScenarioMatrix, rowDim, colDim, selectedModel]);

    const legendCounts = useMemo<LegendCounts>(() => {
        if (!scenarioDimensions || !modelScenarioMatrix || !selectedModel) {
            return { low: 0, neutral: 0, high: 0 };
        }

        const byScenario = modelScenarioMatrix[selectedModel] ?? {};

        let low = 0;
        let neutral = 0;
        let high = 0;

        // Count scenario-level decisions for this model (used as a proxy for trial counts in pivot).
        for (const scenarioId of Object.keys(scenarioDimensions)) {
            const score = byScenario[scenarioId];
            if (typeof score !== 'number' || !Number.isFinite(score)) continue;
            if (score < 1 || score > 5) continue;

            if (score <= 2.5) low += 1;
            else if (score >= 3.5) high += 1;
            else neutral += 1;
        }

        return { low, neutral, high };
    }, [scenarioDimensions, modelScenarioMatrix, selectedModel]);

    const handleCellClick = (row: string, col: string, options?: { decisionCode?: string }) => {
        const params = new URLSearchParams({
            rowDim,
            colDim,
            row,
            col,
            model: selectedModel || '',
        });
        if (options?.decisionCode) {
            params.set('decisionCode', options.decisionCode);
        }
        navigate(`/analysis/${runId}/transcripts?${params.toString()}`);
    };

    if (!scenarioDimensions || availableDimensions.length === 0) {
        return <div className="p-4 text-gray-500 italic">No dimension data available for pivot analysis.</div>;
    }

    if (models.length === 0) {
        return <div className="p-4 text-gray-500 italic">No models available for analysis.</div>;
    }

    return (
        <div ref={tableRef} className="space-y-4 bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex flex-wrap gap-6 items-end border-b border-gray-100 pb-4">
                {/* Selectors */}
                <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Row Dimension (Y-Axis)</label>
                    <select
                        value={rowDim}
                        onChange={e => setRowDim(e.target.value)}
                        className="block w-48 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    >
                        {availableDimensions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Column Dimension (X-Axis)</label>
                    <select
                        value={colDim}
                        onChange={e => setColDim(e.target.value)}
                        className="block w-48 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    >
                        {availableDimensions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Model</label>
                    <select
                        value={selectedModel}
                        onChange={e => setSelectedModel(e.target.value)}
                        className="block w-48 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    >
                        {models.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>

                <div className="ml-auto flex items-center gap-2">
                    <CopyVisualButton targetRef={tableRef} label="pivot analysis table" />
                    <Legend
                        lowName={sideAttributeMap.lowAttribute}
                        highName={sideAttributeMap.highAttribute}
                        counts={legendCounts}
                    />
                </div>
            </div>

            {/* Grid */}
            {pivotData && (
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
                                    {colDim}
                                </th>
                            </tr>
                            {/* Row 2: Row Dimension Label + Column Values */}
                            <tr>
                                <th className="p-3 bg-gray-100 border border-gray-200 text-left text-xs font-bold text-gray-700 uppercase w-32">
                                    {rowDim}
                                </th>
                                {pivotData.cols.map(col => (
                                    <th key={col} className="p-3 bg-gray-50 border border-gray-200 text-center text-xs font-medium text-gray-500 font-mono">
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white">
                            {pivotData.rows.map(row => (
                                <tr key={row}>
                                    <td className="p-3 bg-gray-50 border border-gray-200 text-sm font-bold text-gray-900 font-mono whitespace-nowrap">
                                        {row}
                                    </td>
                                    {pivotData.cols.map(col => {
                                        const cell = pivotData.grid[row]?.[col];
                                        const mean = cell && cell.count > 0 ? cell.sum / cell.count : null;
                                        const isOtherCell = mean === null;
                                        const canOpen = true;

                                        return (
                                            <td
                                                key={`${row}-${col}`}
                                                className={`p-4 border border-gray-100 text-center text-sm transition-colors ${canOpen ? 'cursor-pointer hover:ring-1 hover:ring-teal-300' : ''}`}
                                                style={{ backgroundColor: mean ? getHeatmapColor(mean) : undefined }}
                                                onClick={() => handleCellClick(row, col, isOtherCell ? { decisionCode: 'other' } : undefined)}
                                            >
                                                {mean ? (
                                                    <span className={`font-semibold ${getScoreTextColor(mean)}`}>
                                                        {mean.toFixed(2)}
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
                        Click a cell to view transcripts for that condition.
                    </div>
                </div>
            )}
        </div>
    );
}


import { useState, useMemo, useEffect } from 'react';
import type { VisualizationData } from '../../api/operations/analysis';

type PivotAnalysisTableProps = {
    visualizationData: VisualizationData;
    dimensionLabels?: Record<string, string>;
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

function Legend({ dimensionLabels }: { dimensionLabels?: Record<string, string> }) {
    const label1 = dimensionLabels?.['1'] || "Low Score (1.0)";
    const label5 = dimensionLabels?.['5'] || "High Score (5.0)";

    return (
        <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
            <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-blue-100 border border-blue-200"></span>
                <span className="font-medium text-blue-800">{label1}</span>
            </div>
            <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-gray-100 border border-gray-200"></span>
                <span>Neutral (3.0)</span>
            </div>
            <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-orange-100 border border-orange-200"></span>
                <span className="font-medium text-orange-800">{label5}</span>
            </div>
        </div>
    );
}

export function PivotAnalysisTable({ visualizationData, dimensionLabels }: PivotAnalysisTableProps) {
    const { modelScenarioMatrix, scenarioDimensions } = visualizationData;

    // 1. Identify available dimensions
    const availableDimensions = useMemo(() => {
        if (!scenarioDimensions) return [];
        const firstScenario = Object.values(scenarioDimensions)[0];
        if (!firstScenario) return [];
        return Object.keys(firstScenario).sort();
    }, [scenarioDimensions]);

    // Models list
    const models = useMemo(() => Object.keys(modelScenarioMatrix || {}).sort(), [modelScenarioMatrix]);

    // State for selected dimensions and model
    const [rowDim, setRowDim] = useState<string>(availableDimensions[0] || '');
    const [colDim, setColDim] = useState<string>(availableDimensions[1] || availableDimensions[0] || '');
    // Default to first alphabetical model if available
    const [selectedModel, setSelectedModel] = useState<string>(models[0] || '');

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

    if (!scenarioDimensions || availableDimensions.length === 0) {
        return <div className="p-4 text-gray-500 italic">No dimension data available for pivot analysis.</div>;
    }

    if (models.length === 0) {
        return <div className="p-4 text-gray-500 italic">No models available for analysis.</div>;
    }

    return (
        <div className="space-y-4 bg-white p-4 rounded-lg border border-gray-200">
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

                <div className="ml-auto">
                    <Legend dimensionLabels={dimensionLabels} />
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

                                        return (
                                            <td
                                                key={`${row}-${col}`}
                                                className="p-4 border border-gray-100 text-center text-sm transition-colors"
                                                style={{ backgroundColor: mean ? getHeatmapColor(mean) : undefined }}
                                            >
                                                {mean ? (
                                                    <span className={`font-semibold ${getScoreTextColor(mean)}`}>
                                                        {mean.toFixed(2)}
                                                    </span>
                                                ) : <span className="text-gray-300">-</span>}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

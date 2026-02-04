/**
 * ConditionAnalysisTable Component
 * 
 * Interactive table showing how models responded to specific conditions.
 * Features:
 * - Sort by Condition Name or Disagreement (Variance)
 * - Color-coded mean scores (Green=1.0 to Red=5.0)
 * - Visual variance indicator
 */

import { useState, useMemo } from 'react';
import { ArrowUpDown } from 'lucide-react';
import type { VisualizationData, ContestedScenario } from '../../api/operations/analysis';

type ConditionAnalysisTableProps = {
    visualizationData: VisualizationData;
    contestedScenarios: ContestedScenario[];
};

type SortField = 'name' | 'variance';
type SortOrder = 'asc' | 'desc';

/**
 * Calculate color for mean score cell.
 * Green (1.0) -> Yellow (3.0) -> Red (5.0)
 */
function getScoreColor(value: number): string {
    if (value === 0) return 'bg-gray-50 text-gray-400';

    // 1.0 (Green) to 5.0 (Red)
    // Normalize 1..5 to 0..1
    const ratio = Math.max(0, Math.min(1, (value - 1) / 4));

    // Interpolate colors (Tailwind-ish values)
    // Green-50 (236, 253, 245) -> Red-50 (254, 242, 242) for background?
    // Let's use stronger colors for the cell background to match heatmap style but lighter for text legibility

    // Using the logic from ScenarioHeatmap for consistency but slightly lighter for text contrast if needed
    // R: 34 -> 239
    // G: 197 -> 68
    // B: 94 -> 68

    const r = Math.round(34 + (239 - 34) * ratio);
    const g = Math.round(197 - (197 - 68) * ratio);
    const b = Math.round(94 - (94 - 68) * ratio);

    return `rgba(${r}, ${g}, ${b}, 0.15)`; // Low opacity background
}

function getScoreTextColor(value: number): string {
    if (value < 2.5) return 'text-emerald-700';
    if (value > 3.5) return 'text-red-700';
    return 'text-amber-700';
}

export function ConditionAnalysisTable({ visualizationData, contestedScenarios }: ConditionAnalysisTableProps) {
    const [sortField, setSortField] = useState<SortField>('variance');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    const { modelScenarioMatrix } = visualizationData;

    // Extract models from the matrix
    const models = useMemo(
        () => Object.keys(modelScenarioMatrix || {}).sort(),
        [modelScenarioMatrix]
    );

    // Build row data
    const tableRows = useMemo(() => {
        if (!modelScenarioMatrix) return [];

        // Get all unique scenario keys
        const scenarioIds = new Set<string>();
        Object.values(modelScenarioMatrix).forEach(scenarios => {
            Object.keys(scenarios).forEach(k => scenarioIds.add(k));
        });

        // Create a map of variance for quick lookup
        const varianceMap = new Map<string, number>();
        contestedScenarios.forEach(cs => varianceMap.set(cs.scenarioId, cs.variance));

        return Array.from(scenarioIds).map(scenarioId => {
            // Find the display name from contestedScenarios if available, or fall back to ID
            // Note: scenarioId in matrix is the ID/Name. 
            // In contestedScenarios it has both specific ID and Name if they differ.
            // Usually the keys in matrix are the Names if generated from transcript.scenarioId which might be the text
            // Let's assume the key is the display identifier for now.

            const variance = varianceMap.get(scenarioId) ?? 0;

            const rowData = {
                id: scenarioId,
                name: scenarioId, // Ideally this would be a prettified name
                variance,
                scores: {} as Record<string, number>
            };

            models.forEach(model => {
                rowData.scores[model] = modelScenarioMatrix[model]?.[scenarioId] ?? 0;
            });

            return rowData;
        });
    }, [modelScenarioMatrix, contestedScenarios, models]);

    // Sort rows
    const sortedRows = useMemo(() => {
        return [...tableRows].sort((a, b) => {
            let comparison = 0;
            if (sortField === 'name') {
                comparison = a.name.localeCompare(b.name);
            } else {
                comparison = a.variance - b.variance;
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });
    }, [tableRows, sortField, sortOrder]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc'); // Default to desc (High variance) for new field usually
        }
    };

    if (!modelScenarioMatrix || models.length === 0) {
        return <div className="text-gray-500 text-center py-4">No condition data available.</div>;
    }

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-medium text-gray-700">Condition Analysis</h3>
                <p className="text-xs text-gray-500 mt-1">
                    Detailed breakdown of how each model scored on specific conditions.
                    Sort by &quot;Disagreement&quot; to see where models diverge most.
                </p>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th
                                    scope="col"
                                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 w-1/3"
                                    onClick={() => handleSort('name')}
                                >
                                    <div className="flex items-center gap-1">
                                        Condition
                                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'name' ? 'text-gray-900' : 'text-gray-400'}`} />
                                    </div>
                                </th>
                                <th
                                    scope="col"
                                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 w-24"
                                    onClick={() => handleSort('variance')}
                                >
                                    <div className="flex items-center gap-1">
                                        Disagreement
                                        <ArrowUpDown className={`w-3 h-3 ${sortField === 'variance' ? 'text-gray-900' : 'text-gray-400'}`} />
                                    </div>
                                </th>
                                {models.map(model => (
                                    <th key={model} scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        {model.length > 15 ? model.slice(0, 12) + '...' : model}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {sortedRows.map((row) => (
                                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                                        {row.name}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                        <div className="flex items-center gap-2">
                                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${row.variance > 1.0 ? 'bg-red-400' : row.variance > 0.5 ? 'bg-amber-400' : 'bg-green-400'}`}
                                                    style={{ width: `${Math.min(100, row.variance * 25)}%` }} // Scale roughly 0-4 range
                                                />
                                            </div>
                                            <span className="text-xs">{row.variance.toFixed(2)}</span>
                                        </div>
                                    </td>
                                    {models.map(model => {
                                        const score = row.scores[model] ?? 0;
                                        if (score === 0) return <td key={model} className="px-4 py-3 text-xs text-gray-400">-</td>;

                                        return (
                                            <td key={model} className="px-4 py-3 text-sm" style={{ backgroundColor: getScoreColor(score) }}>
                                                <span className={`font-medium ${getScoreTextColor(score)}`}>
                                                    {score.toFixed(1)}
                                                </span>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

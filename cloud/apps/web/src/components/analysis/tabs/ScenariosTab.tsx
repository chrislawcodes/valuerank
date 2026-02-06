/**
 * Scenarios Tab
 *
 * Displays scenario heatmap and most contested scenarios list.
 */

import { ScenarioHeatmap } from '../ScenarioHeatmap';
import { ContestedScenariosList } from '../ContestedScenariosList';
import { ConditionAnalysisTable } from '../ConditionAnalysisTable';
import { PivotAnalysisTable } from '../PivotAnalysisTable';
import type { VisualizationData, ContestedScenario } from '../../../api/operations/analysis';
type ScenariosTabProps = {
  runId: string;
  visualizationData: VisualizationData | null | undefined;
  contestedScenarios: ContestedScenario[];
  dimensionLabels?: Record<string, string>;
};

export function ScenariosTab({ runId, visualizationData, contestedScenarios, dimensionLabels }: ScenariosTabProps) {
  return (
    <div className="space-y-8">
      {visualizationData ? (
        <>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700">Pivot Analysis</h3>
              <p className="text-xs text-gray-500 mt-1">
                Explore how AI decisions change based on variable interactions (e.g. Conformity vs Power).
              </p>
            </div>
            <PivotAnalysisTable
              runId={runId}
              visualizationData={visualizationData}
              dimensionLabels={dimensionLabels}
            />
          </div>

          <div className="border-t border-gray-200 pt-6">
            <ConditionAnalysisTable
              visualizationData={visualizationData}
              contestedScenarios={contestedScenarios}
            />
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Heatmap Overview</h3>
            <ScenarioHeatmap visualizationData={visualizationData} />
          </div>
        </>
      ) : (
        <div className="text-center py-8 text-gray-500">
          No condition data available. Re-run analysis to compute visualization data.
        </div>
      )}
      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Most Contested Conditions</h3>
        <ContestedScenariosList scenarios={contestedScenarios} />
      </div>
    </div>
  );
}

/**
 * Scenarios Tab
 *
 * Displays scenario heatmap and most contested scenarios list.
 */

import { ScenarioHeatmap } from '../ScenarioHeatmap';
import { ContestedScenariosList } from '../ContestedScenariosList';
import type { VisualizationData, ContestedScenario } from '../../../api/operations/analysis';

type ScenariosTabProps = {
  visualizationData: VisualizationData | null | undefined;
  contestedScenarios: ContestedScenario[];
};

export function ScenariosTab({ visualizationData, contestedScenarios }: ScenariosTabProps) {
  return (
    <div className="space-y-8">
      {visualizationData ? (
        <ScenarioHeatmap visualizationData={visualizationData} />
      ) : (
        <div className="text-center py-8 text-gray-500">
          No scenario data available. Re-run analysis to compute visualization data.
        </div>
      )}
      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Most Contested Scenarios</h3>
        <ContestedScenariosList scenarios={contestedScenarios} />
      </div>
    </div>
  );
}

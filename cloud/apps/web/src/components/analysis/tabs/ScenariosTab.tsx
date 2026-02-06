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
  const hasScenarioDimensions = Boolean(
    visualizationData?.scenarioDimensions
    && Object.keys(visualizationData.scenarioDimensions).length > 0
  );
  const hasModelScenarioMatrix = Boolean(
    visualizationData?.modelScenarioMatrix
    && Object.keys(visualizationData.modelScenarioMatrix).length > 0
  );

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
            {hasScenarioDimensions ? (
              <PivotAnalysisTable
                runId={runId}
                visualizationData={visualizationData}
                dimensionLabels={dimensionLabels}
              />
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                Pivot data is missing scenario dimensions for this analysis result.
                Recompute analysis for this run to regenerate full scenario metadata.
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 pt-6">
            {hasModelScenarioMatrix ? (
              <ConditionAnalysisTable
                visualizationData={visualizationData}
                contestedScenarios={contestedScenarios}
              />
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                Condition matrix data is missing for this analysis result.
                Recompute analysis for this run to rebuild condition-level scores.
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Heatmap Overview</h3>
            {hasModelScenarioMatrix ? (
              <ScenarioHeatmap visualizationData={visualizationData} />
            ) : (
              <div className="text-sm text-gray-500">Heatmap unavailable without condition matrix data.</div>
            )}
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

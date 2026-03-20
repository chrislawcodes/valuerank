/**
 * Scenarios Tab
 *
 * Displays condition-focused analysis surfaces.
 */

import { ConditionDecisionsTable } from '../ConditionDecisionsTable';
import { PivotAnalysisTable } from '../PivotAnalysisTable';
import type { VisualizationData, ContestedScenario, PerModelStats } from '../../../api/operations/analysis';
import { ANALYSIS_BASE_PATH, type AnalysisBasePath } from '../../../utils/analysisRouting';
import { getPairedOrientationLabels } from '../../../utils/methodology';

type ScenariosTabProps = {
  runId: string;
  analysisBasePath?: AnalysisBasePath;
  analysisSearchParams?: URLSearchParams | string;
  analysisMode?: 'single' | 'paired';
  visualizationData: VisualizationData | null | undefined;
  perModel: Record<string, PerModelStats>;
  contestedScenarios: ContestedScenario[];
  dimensionLabels?: Record<string, string>;
  expectedAttributes?: string[];
  definitionContent?: unknown;
  companionRunId?: string | null;
};

export function ScenariosTab({
  runId,
  analysisBasePath = ANALYSIS_BASE_PATH,
  analysisSearchParams,
  analysisMode,
  visualizationData,
  perModel,
  dimensionLabels,
  expectedAttributes = [],
  definitionContent,
  companionRunId,
}: ScenariosTabProps) {
  const hasScenarioDimensions = Boolean(
    visualizationData?.scenarioDimensions
    && Object.keys(visualizationData.scenarioDimensions).length > 0
  );
  const hasModelScenarioMatrix = Boolean(
    visualizationData?.modelScenarioMatrix
    && Object.keys(visualizationData.modelScenarioMatrix).length > 0
  );
  const orientationLabels = getPairedOrientationLabels(definitionContent);

  return (
    <div className="space-y-8">
      {visualizationData ? (
        <>
          <div className="space-y-4">
            {hasScenarioDimensions ? (
              <PivotAnalysisTable
                runId={runId}
                analysisBasePath={analysisBasePath}
                analysisSearchParams={analysisSearchParams}
                visualizationData={visualizationData}
                dimensionLabels={dimensionLabels}
                expectedAttributes={expectedAttributes}
              />
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                Pivot data is missing condition dimensions for this analysis result.
                Recompute analysis for this run to regenerate full condition metadata.
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 pt-6">
            {hasModelScenarioMatrix ? (
              <ConditionDecisionsTable
                runId={runId}
                analysisBasePath={analysisBasePath}
                analysisSearchParams={analysisSearchParams}
                companionRunId={analysisMode === 'paired' ? companionRunId ?? null : null}
                orientationLabels={orientationLabels}
                analysisMode={analysisMode}
                perModel={perModel}
                visualizationData={visualizationData}
                expectedAttributes={expectedAttributes}
                title="Condition Decisions"
                description="Detailed breakdown of how each model scored each condition."
              />
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                Condition matrix data is missing for this analysis result.
                Recompute analysis for this run to rebuild condition-level scores.
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-center py-8 text-gray-500">
          No condition data available. Re-run analysis to compute visualization data.
        </div>
      )}
    </div>
  );
}

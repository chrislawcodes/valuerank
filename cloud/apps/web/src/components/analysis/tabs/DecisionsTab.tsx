/**
 * Decisions Tab
 *
 * Displays decision distribution and model consistency charts.
 * For multi-sample runs, also shows scenario variance visualization.
 */

import { DecisionDistributionChart } from '../DecisionDistributionChart';
import { ModelConsistencyChart } from '../ModelConsistencyChart';
import { ScenarioVarianceChart } from '../ScenarioVarianceChart';
import type { VisualizationData, VarianceAnalysis } from '../../../api/operations/analysis';
import type { PerModelStats } from './types';

type DecisionsTabProps = {
  visualizationData: VisualizationData | null | undefined;
  perModel: Record<string, PerModelStats>;
  varianceAnalysis?: VarianceAnalysis | null;
};

export function DecisionsTab({ visualizationData, perModel, varianceAnalysis }: DecisionsTabProps) {
  if (!visualizationData) {
    return (
      <div className="text-center py-8 text-gray-500">
        No decision data available. Re-run analysis to compute visualization data.
      </div>
    );
  }

  const isMultiSample = varianceAnalysis?.isMultiSample ?? false;

  return (
    <div className="space-y-8">
      <DecisionDistributionChart visualizationData={visualizationData} />
      <div className="border-t border-gray-200 pt-6">
        <ModelConsistencyChart perModel={perModel} varianceAnalysis={varianceAnalysis} />
      </div>
      {isMultiSample && varianceAnalysis && (
        <div className="border-t border-gray-200 pt-6">
          <ScenarioVarianceChart varianceAnalysis={varianceAnalysis} />
        </div>
      )}
    </div>
  );
}

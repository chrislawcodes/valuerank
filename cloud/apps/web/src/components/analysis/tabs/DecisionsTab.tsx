/**
 * Decisions Tab
 *
 * Displays decision distribution and model consistency charts.
 */

import { DecisionDistributionChart } from '../DecisionDistributionChart';
import { ModelConsistencyChart } from '../ModelConsistencyChart';
import type { VisualizationData } from '../../../api/operations/analysis';
import type { PerModelStats } from './types';

type DecisionsTabProps = {
  visualizationData: VisualizationData | null | undefined;
  perModel: Record<string, PerModelStats>;
};

export function DecisionsTab({ visualizationData, perModel }: DecisionsTabProps) {
  if (!visualizationData) {
    return (
      <div className="text-center py-8 text-gray-500">
        No decision data available. Re-run analysis to compute visualization data.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <DecisionDistributionChart visualizationData={visualizationData} />
      <div className="border-t border-gray-200 pt-6">
        <ModelConsistencyChart perModel={perModel} />
      </div>
    </div>
  );
}

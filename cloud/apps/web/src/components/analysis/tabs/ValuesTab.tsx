/**
 * Values Tab
 *
 * Displays win rate by value and dimension impact analysis.
 */

import { ScoreDistributionChart } from '../ScoreDistributionChart';
import { VariableImpactChart } from '../VariableImpactChart';
import type { DimensionAnalysis } from '../../../api/operations/analysis';
import type { PerModelStats, FilterState } from './types';

type ValuesTabProps = {
  perModel: Record<string, PerModelStats>;
  dimensionAnalysis: DimensionAnalysis | null | undefined;
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
};

export function ValuesTab({
  perModel,
  dimensionAnalysis,
  filters,
  onFilterChange,
}: ValuesTabProps) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-4">Win Rate by Value</h3>
        <ScoreDistributionChart
          perModel={perModel}
          selectedValue={filters.selectedValue ?? undefined}
          onValueChange={(value) => onFilterChange({ ...filters, selectedValue: value })}
        />
      </div>
      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Dimension Impact Analysis</h3>
        <VariableImpactChart dimensionAnalysis={dimensionAnalysis ?? null} />
      </div>
    </div>
  );
}

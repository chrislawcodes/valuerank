import { formatDisplayLabel } from '../../utils/displayLabels';

export type LegendCounts = {
  low: number;
  neutral: number;
  high: number;
};

type PivotAnalysisLegendProps = {
  lowName: string;
  highName: string;
  counts: LegendCounts;
};

export function PivotAnalysisLegend({ lowName, highName, counts }: PivotAnalysisLegendProps) {
  return (
    <div className="flex items-center gap-4 text-xs text-gray-500">
      <div className="flex items-center gap-1">
        <span className="w-3 h-3 rounded bg-blue-100 border border-blue-200"></span>
        <span className="font-medium text-blue-800">{formatDisplayLabel(lowName)} {counts.low}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-3 h-3 rounded bg-gray-100 border border-gray-200"></span>
        <span>Neutral {counts.neutral}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-3 h-3 rounded bg-orange-100 border border-orange-200"></span>
        <span className="font-medium text-orange-800">{formatDisplayLabel(highName)} {counts.high}</span>
      </div>
    </div>
  );
}

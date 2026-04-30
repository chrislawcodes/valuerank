import { VALUES, VALUE_LABELS } from '../../data/domainAnalysisData';
import { formatFullSchwartzValueName } from '../../utils/schwartz';
import type { ModelsConfidenceModelResult } from '../../api/operations/modelsConfidence';
import { cn } from '../../lib/utils';

function getConfidenceTone(confidence: number | null): string {
  if (confidence == null) return 'bg-gray-50 text-gray-400 border-gray-100';
  if (confidence >= 75) return 'bg-violet-100 text-violet-900 border-violet-200';
  if (confidence >= 60) return 'bg-violet-50 text-violet-800 border-violet-100';
  if (confidence >= 45) return 'bg-gray-50 text-gray-700 border-gray-100';
  return 'bg-slate-50 text-slate-500 border-slate-100';
}

function formatConfidence(confidence: number | null): string {
  if (confidence == null) return '—';
  return `${Math.round(confidence)}%`;
}

function buildTooltip(valueKey: string, result: ModelsConfidenceModelResult['values'][number] | undefined): string {
  if (result == null || result.strongCount + result.leanCount === 0) return 'No data';
  const total = result.strongCount + result.leanCount;
  return `${formatFullSchwartzValueName(valueKey as Parameters<typeof formatFullSchwartzValueName>[0])}\nStrong: ${result.strongCount} · Lean: ${result.leanCount} · Total: ${total}`;
}

type ConfidenceHeatmapProps = {
  models: ModelsConfidenceModelResult[];
  onCellClick?: (modelId: string, modelLabel: string, valueKey: string) => void;
};

export function ConfidenceHeatmap({ models, onCellClick }: ConfidenceHeatmapProps) {
  const sorted = [...models].sort((a, b) => {
    const aConf = a.overallConfidence ?? -1;
    const bConf = b.overallConfidence ?? -1;
    return bConf - aConf;
  });

  if (models.length === 0) {
    return <p className="text-sm text-gray-500">No data</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white pr-4 pl-1 py-2 text-left font-medium text-gray-500 border-b border-gray-200 min-w-[160px] whitespace-nowrap">
              Model
            </th>
            {VALUES.map((key) => (
              <th
                key={key}
                title={formatFullSchwartzValueName(key)}
                className="px-2 py-2 text-center font-medium text-gray-500 border-b border-gray-200 min-w-[74px] whitespace-nowrap"
              >
                {VALUE_LABELS[key]}
              </th>
            ))}
            <th className="px-2 py-2 text-center font-semibold text-gray-700 border-b border-l border-gray-200 min-w-[64px]">
              Avg
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((model) => {
            const byKey = new Map(model.values.map((v) => [v.valueKey, v]));
            return (
              <tr key={model.modelId} className="hover:bg-gray-50/40">
                <td className="sticky left-0 z-10 bg-white pr-4 pl-1 py-2 font-medium text-gray-800 border-b border-gray-100 whitespace-nowrap">
                  {model.label}
                </td>
                {VALUES.map((key) => {
                  const v = byKey.get(key);
                  return (
                    <td
                      key={key}
                      title={buildTooltip(key, v)}
                      onClick={onCellClick != null ? () => onCellClick(model.modelId, model.label, key) : undefined}
                      className={cn(
                        'px-2 py-2 text-center border border-gray-100 tabular-nums',
                        getConfidenceTone(v?.confidence ?? null),
                        onCellClick != null && 'cursor-pointer hover:ring-1 hover:ring-inset hover:ring-violet-400',
                      )}
                    >
                      {formatConfidence(v?.confidence ?? null)}
                    </td>
                  );
                })}
                <td
                  title={`Avg: ${formatConfidence(model.overallConfidence ?? null)} · Strong: ${model.overallStrongCount} · Lean: ${model.overallLeanCount}`}
                  className={cn(
                    'px-2 py-2 text-center font-semibold border-l border-l-gray-200 border-b border-b-gray-100 tabular-nums',
                    getConfidenceTone(model.overallConfidence ?? null),
                  )}
                >
                  {formatConfidence(model.overallConfidence ?? null)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

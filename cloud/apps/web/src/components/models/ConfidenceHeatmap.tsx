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
  /** When provided, only rows whose modelId is in this list are shown. */
  selectedModelIds?: string[];
  onCellClick?: (modelId: string, modelLabel: string, valueKey: string) => void;
};

export function ConfidenceHeatmap({ models, selectedModelIds, onCellClick }: ConfidenceHeatmapProps) {
  const visibleModels =
    selectedModelIds != null
      ? models.filter((m) => selectedModelIds.includes(m.modelId))
      : models;

  const sorted = [...visibleModels].sort((a, b) => {
    const aConf = a.overallConfidence ?? -1;
    const bConf = b.overallConfidence ?? -1;
    return bConf - aConf;
  });

  if (visibleModels.length === 0) {
    return <p className="text-sm text-gray-500">No data</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="sticky left-0 z-10 min-w-[160px] whitespace-nowrap border-b border-r border-gray-200 bg-gray-50 px-3 py-2 text-left font-medium text-gray-500">
              Model
            </th>
            <th className="min-w-[64px] whitespace-nowrap border-b border-r border-gray-200 bg-gray-50 px-2 py-2 text-center font-semibold text-gray-700">
              Avg
            </th>
            {VALUES.map((key) => (
              <th
                key={key}
                title={formatFullSchwartzValueName(key)}
                className="min-w-[74px] whitespace-nowrap border-b border-gray-200 bg-gray-50 px-2 py-2 text-center font-medium text-gray-500"
              >
                {VALUE_LABELS[key]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((model) => {
            const byKey = new Map(model.values.map((v) => [v.valueKey, v]));
            return (
              <tr key={model.modelId} className="hover:bg-gray-50/40">
                <th className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-gray-100 bg-white px-3 py-2 text-left font-medium text-gray-800">
                  {model.label}
                </th>
                <td
                  title={`Avg: ${formatConfidence(model.overallConfidence ?? null)} · Strong: ${model.overallStrongCount} · Lean: ${model.overallLeanCount}`}
                  className={cn(
                    'border-b border-r border-gray-100 px-2 py-2 text-center font-semibold tabular-nums',
                    getConfidenceTone(model.overallConfidence ?? null),
                  )}
                >
                  {formatConfidence(model.overallConfidence ?? null)}
                </td>
                {VALUES.map((key, index) => {
                  const v = byKey.get(key);
                  return (
                    <td
                      key={key}
                      title={buildTooltip(key, v)}
                      onClick={onCellClick != null ? () => onCellClick(model.modelId, model.label, key) : undefined}
                      className={cn(
                        'border-b border-gray-100 px-2 py-2 text-center tabular-nums',
                        index !== VALUES.length - 1 && 'border-r border-gray-100',
                        getConfidenceTone(v?.confidence ?? null),
                        onCellClick != null && 'cursor-pointer hover:ring-1 hover:ring-inset hover:ring-violet-400',
                      )}
                    >
                      {formatConfidence(v?.confidence ?? null)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

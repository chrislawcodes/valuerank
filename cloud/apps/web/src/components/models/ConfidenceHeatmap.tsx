import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { VALUES, VALUE_LABELS, type ValueKey } from '../../data/domainAnalysisData';
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

type ConfidenceSortDirection = 'asc' | 'desc';
type ConfidenceSortKey = 'model' | 'average' | ValueKey;

type SortableHeaderProps = {
  label: string;
  sortKey: ConfidenceSortKey;
  sortState: { key: ConfidenceSortKey; direction: ConfidenceSortDirection };
  onSort: (sortKey: ConfidenceSortKey) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
  title?: string;
};

function getSortDirectionLabel(direction: ConfidenceSortDirection): 'ascending' | 'descending' {
  return direction === 'asc' ? 'ascending' : 'descending';
}

function getNextSortDirectionLabel(
  sortState: { key: ConfidenceSortKey; direction: ConfidenceSortDirection },
  sortKey: ConfidenceSortKey,
): 'ascending' | 'descending' {
  if (sortState.key !== sortKey) return sortKey === 'model' ? 'ascending' : 'descending';
  return sortState.direction === 'asc' ? 'descending' : 'ascending';
}

function SortableHeader({
  label,
  sortKey,
  sortState,
  onSort,
  align = 'center',
  className,
  title,
}: SortableHeaderProps) {
  const isActive = sortState.key === sortKey;
  const nextDirection = getNextSortDirectionLabel(sortState, sortKey);

  return (
    <th
      scope="col"
      aria-sort={isActive ? getSortDirectionLabel(sortState.direction) : 'none'}
      className={cn(
        'border-b border-gray-200 bg-gray-50 px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onSort(sortKey)}
        className={cn(
          'w-full gap-1 rounded-none bg-transparent px-0 py-0 min-h-0 text-[11px] font-semibold uppercase tracking-wide text-gray-500 shadow-none transition-colors hover:bg-transparent hover:text-gray-900 focus:ring-0 focus:ring-offset-0',
          align === 'left' && 'justify-start text-left',
          align === 'center' && 'justify-center text-center',
          align === 'right' && 'justify-end text-right',
          isActive && 'text-teal-700',
        )}
        aria-label={`Sort by ${label} ${nextDirection}`}
        title={title}
      >
        <span className="whitespace-nowrap">{label}</span>
        {isActive && (
          <span aria-hidden="true" className="text-[11px] leading-none text-gray-400">
            {sortState.direction === 'desc' ? '↑' : '↓'}
          </span>
        )}
      </Button>
    </th>
  );
}

export function ConfidenceHeatmap({ models, selectedModelIds, onCellClick }: ConfidenceHeatmapProps) {
  const [sortState, setSortState] = useState<{ key: ConfidenceSortKey; direction: ConfidenceSortDirection }>({
    key: 'average',
    direction: 'desc',
  });

  const visibleModels =
    selectedModelIds != null
      ? models.filter((m) => selectedModelIds.includes(m.modelId))
      : models;

  const sorted = useMemo(() => {
    const next = [...visibleModels];
    next.sort((left, right) => {
      if (sortState.key === 'model') {
        const cmp = left.label.localeCompare(right.label);
        return sortState.direction === 'asc' ? cmp : -cmp;
      }

      const leftValue =
        sortState.key === 'average'
          ? left.overallConfidence ?? null
          : left.values.find((value) => value.valueKey === sortState.key)?.confidence ?? null;
      const rightValue =
        sortState.key === 'average'
          ? right.overallConfidence ?? null
          : right.values.find((value) => value.valueKey === sortState.key)?.confidence ?? null;

      if (leftValue == null && rightValue == null) return left.label.localeCompare(right.label);
      if (leftValue == null) return 1;
      if (rightValue == null) return -1;

      const diff = sortState.direction === 'desc' ? rightValue - leftValue : leftValue - rightValue;
      if (diff !== 0) return diff;

      return left.label.localeCompare(right.label);
    });
    return next;
  }, [sortState, visibleModels]);

  if (visibleModels.length === 0) {
    return <p className="text-sm text-gray-500">No data</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50">
          <tr>
            <SortableHeader
              label="Model"
              sortKey="model"
              sortState={sortState}
              onSort={(key) =>
                setSortState((current) =>
                  current.key === key
                    ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
                    : { key, direction: 'asc' },
                )
              }
              align="left"
              className="sticky left-0 z-10 min-w-[160px] whitespace-nowrap border-r border-gray-200 bg-gray-50 px-3"
            />
            <SortableHeader
              label="Avg"
              sortKey="average"
              sortState={sortState}
              onSort={(key) =>
                setSortState((current) =>
                  current.key === key
                    ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
                    : { key, direction: 'desc' },
                )
              }
              className="min-w-[64px] whitespace-nowrap border-r border-gray-200 bg-gray-50 px-2"
            />
            {VALUES.map((key) => (
              <SortableHeader
                key={key}
                label={VALUE_LABELS[key]}
                sortKey={key}
                sortState={sortState}
                onSort={(nextKey) =>
                  setSortState((current) =>
                    current.key === nextKey
                      ? { key: nextKey, direction: current.direction === 'asc' ? 'desc' : 'asc' }
                      : { key: nextKey, direction: 'desc' },
                  )
                }
                title={formatFullSchwartzValueName(key)}
                className="min-w-[74px] whitespace-nowrap bg-gray-50 px-2"
              />
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

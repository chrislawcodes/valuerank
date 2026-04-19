import { useState, type ReactNode } from 'react';
import { Button } from '../ui/Button';

export type MetricDisclosureProps<T> = {
  title: string;
  summary: ReactNode;
  definition: string;
  formula: string;
  rows: T[];
  emptyLabel?: string;
  rowLabel: (row: T) => string;
  renderRow: (row: T) => ReactNode;
  renderRowDetail: (row: T) => ReactNode;
};

export function MetricDisclosure<T>({
  title,
  summary,
  definition,
  formula,
  rows,
  emptyLabel = 'No breakdown available.',
  rowLabel,
  renderRow,
  renderRowDetail,
}: MetricDisclosureProps<T>) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedRow = rows[Math.min(selectedIndex, Math.max(rows.length - 1, 0))] ?? null;

  return (
    <details className="group rounded-lg border border-gray-200 bg-white p-2">
      <summary
        className="cursor-pointer list-none rounded-md px-1 py-0.5 text-left text-sm font-medium text-gray-700 hover:text-gray-900"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <span>{title}</span>
          <span className="font-normal text-gray-500">{summary}</span>
        </div>
      </summary>
      <div className="space-y-3 px-1 pb-1 pt-3">
        <p className="text-sm text-gray-600">{definition}</p>
        <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">Formula:</span> {formula}</p>
        {rows.length === 0 ? (
          <p className="text-xs text-gray-500">{emptyLabel}</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <div className="divide-y divide-gray-200">
              {rows.map((row, index) => (
                <Button
                  key={`${title}-${rowLabel(row)}-${index}`}
                  variant="ghost"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedIndex(index);
                  }}
                  className={`block w-full justify-start rounded-none px-3 py-2 text-left text-xs ${index === selectedIndex ? 'bg-teal-50 text-teal-900' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  {renderRow(row)}
                </Button>
              ))}
            </div>
          </div>
        )}
        {selectedRow != null && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            <div className="font-medium text-gray-900">{rowLabel(selectedRow)}</div>
            <div className="mt-2">{renderRowDetail(selectedRow)}</div>
          </div>
        )}
      </div>
    </details>
  );
}

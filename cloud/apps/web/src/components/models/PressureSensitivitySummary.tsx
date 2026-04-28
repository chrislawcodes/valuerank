import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import type { PressureSensitivityModel } from '../../api/operations/pressureSensitivity';

type SortKey = 'model' | 'provider' | 'aggregate' | 'measured' | 'excluded';

type Props = {
  models: PressureSensitivityModel[];
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
};

function formatScore(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toFixed(3);
}

function Sparkline({ values, width = 80, height = 18 }: { values: number[]; width?: number; height?: number }) {
  if (values.length === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  const max = Math.max(...values, 0.001);
  const step = values.length === 1 ? width / 2 : width / (values.length - 1);
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : index * step;
      const y = height - (value / max) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      role="img"
      aria-label={`Per-pair sensitivity sparkline (${values.length} values)`}
      width={width}
      height={height}
      className="inline-block align-middle text-blue-500"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function sortValue(model: PressureSensitivityModel, key: SortKey): number | string {
  switch (key) {
    case 'provider':
      return model.providerName;
    case 'aggregate':
      return model.aggregateSensitivity.value ?? -1;
    case 'measured':
      return model.aggregateSensitivity.valuePairsMeasured;
    case 'excluded':
      return model.aggregateSensitivity.valuePairsExcluded;
    case 'model':
    default:
      return model.label;
  }
}

export function PressureSensitivitySummary({ models, selectedModelId, onSelectModel }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('aggregate');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    return [...models].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const delta = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return direction === 'asc' ? delta : -delta;
    });
  }, [models, sortKey, direction]);

  const toggle = (next: SortKey) => {
    if (next === sortKey) {
      setDirection((cur) => (cur === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(next);
    setDirection(next === 'model' || next === 'provider' ? 'asc' : 'desc');
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Cross-model sensitivity</h2>
          <p className="text-sm text-gray-600">
            Aggregate sensitivity is the mean of |netScore Δ| across measured value pairs. Click a row to select a model.
          </p>
        </div>
      </div>

      <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <strong>Heads up:</strong> pressure levels are not calibrated across vignettes. Compare with caution; see the Limitations section below.
      </div>

      <Table variant="bordered">
        <TableHeader variant="bordered">
          <TableRow>
            {[
              ['model', 'Model'],
              ['provider', 'Provider'],
              ['aggregate', 'Aggregate sensitivity'],
              ['measured', 'Pairs measured'],
              ['excluded', 'Pairs excluded'],
            ].map(([key, label]) => (
              <TableHead
                key={key}
                className="cursor-pointer select-none"
                onClick={() => toggle(key as SortKey)}
              >
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {label}
                  {sortKey === key ? (direction === 'asc' ? ' ▲' : ' ▼') : ''}
                </span>
              </TableHead>
            ))}
            <TableHead>
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Per-pair spread</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((model) => {
            const isSelected = model.modelId === selectedModelId;
            const spread = model.valuePairs
              .map((p) => p.netScoreDelta.value)
              .filter((v): v is number => v != null)
              .map((v) => Math.abs(v))
              .sort((a, b) => b - a);
            return (
              <TableRow
                key={model.modelId}
                className={`cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`}
                onClick={() => onSelectModel(model.modelId)}
              >
                <TableCell className="font-medium text-gray-900">{model.label}</TableCell>
                <TableCell className="text-sm text-gray-700">{model.providerName}</TableCell>
                <TableCell className="text-sm font-mono text-gray-900">
                  {formatScore(model.aggregateSensitivity.value)}
                </TableCell>
                <TableCell className="text-sm text-gray-700">
                  {model.aggregateSensitivity.valuePairsMeasured}
                </TableCell>
                <TableCell className="text-sm text-gray-500">
                  {model.aggregateSensitivity.valuePairsExcluded}
                </TableCell>
                <TableCell>
                  <Sparkline values={spread} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import type {
  PressureSensitivityModel,
  PressureSensitivityValuePair,
} from '../../api/operations/pressureSensitivity';
import { PressureGrid } from './PressureGrid';

type Props = {
  model: PressureSensitivityModel;
};

function formatDelta(value: number | null | undefined): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(3)}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function CeilingFloorBadge({ flag }: { flag: string | null | undefined }) {
  if (flag === 'ceiling') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
        ceiling
      </span>
    );
  }
  if (flag === 'floor') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
        floor
      </span>
    );
  }
  return null;
}

function tooltipFor(label: string, lowMean: number | null | undefined, highMean: number | null | undefined): string {
  return `${label}: high band mean ${formatPercent(highMean)} − low band mean ${formatPercent(lowMean)}`;
}

export function PressureSensitivityDetail({ model }: Props) {
  const [selectedPairKey, setSelectedPairKey] = useState<string | null>(null);

  const sortedPairs = useMemo(() => {
    return [...model.valuePairs].sort((a, b) => {
      const av = a.netScoreDelta.value ?? -Infinity;
      const bv = b.netScoreDelta.value ?? -Infinity;
      return Math.abs(bv) - Math.abs(av);
    });
  }, [model.valuePairs]);

  const selectedPair: PressureSensitivityValuePair | null = useMemo(() => {
    if (selectedPairKey == null) return sortedPairs[0] ?? null;
    return sortedPairs.find((p) => p.pairKey === selectedPairKey) ?? sortedPairs[0] ?? null;
  }, [selectedPairKey, sortedPairs]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-gray-900">{model.label} — per-pair sensitivity</h2>
        <p className="text-sm text-gray-600">
          Direction Δ is win-rate change between low- and high-pressure bands. Conviction Δ is mean
          decision strength among picks (model self-report; not a calibrated confidence scale).
          netScore Δ combines both via the existing 2:1 weighting.
        </p>
      </div>

      <Table variant="bordered">
        <TableHeader variant="bordered">
          <TableRow>
            <TableHead>
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Value pair</span>
            </TableHead>
            <TableHead>
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Direction Δ
              </span>
            </TableHead>
            <TableHead>
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500" title="Self-report; not a calibrated confidence scale">
                Conviction Δ
              </span>
            </TableHead>
            <TableHead>
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">netScore Δ</span>
            </TableHead>
            <TableHead>
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Baseline</span>
            </TableHead>
            <TableHead>
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">N</span>
            </TableHead>
            <TableHead>
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Defs</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedPairs.map((pair) => {
            const isSelected = selectedPair?.pairKey === pair.pairKey;
            return (
              <TableRow
                key={pair.pairKey}
                className={`cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedPairKey(pair.pairKey)}
              >
                <TableCell className="font-medium text-gray-900">
                  {pair.ownToken} ↔ {pair.opponentToken}
                </TableCell>
                <TableCell
                  className="text-sm font-mono"
                  title={tooltipFor('Direction Δ', pair.directionDelta.lowBandMean, pair.directionDelta.highBandMean)}
                >
                  {formatDelta(pair.directionDelta.value)}
                </TableCell>
                <TableCell
                  className="text-sm font-mono"
                  title={tooltipFor('Conviction Δ', pair.convictionDelta.lowBandMean, pair.convictionDelta.highBandMean)}
                >
                  {formatDelta(pair.convictionDelta.value)}
                </TableCell>
                <TableCell
                  className="text-sm font-mono"
                  title={tooltipFor('netScore Δ', pair.netScoreDelta.lowBandMean, pair.netScoreDelta.highBandMean)}
                >
                  {formatDelta(pair.netScoreDelta.value)}
                </TableCell>
                <TableCell className="text-sm">
                  <span className="font-mono mr-2">{formatPercent(pair.baselineWinRate.value)}</span>
                  <CeilingFloorBadge flag={pair.baselineWinRate.ceilingFloorFlag} />
                </TableCell>
                <TableCell className="text-sm text-gray-700">
                  {pair.n}
                  {pair.unscoredCount > 0 ? (
                    <span className="ml-1 text-xs text-amber-700">({pair.unscoredCount} unscored)</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm text-gray-500">
                  {pair.definitionsMeasured}
                  {pair.definitionsExcluded > 0 ? ` / ${pair.definitionsMeasured + pair.definitionsExcluded}` : ''}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {selectedPair && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">
            {selectedPair.ownToken} ↔ {selectedPair.opponentToken} — pressure grid
          </h3>
          <PressureGrid pair={selectedPair} />
        </div>
      )}
    </section>
  );
}

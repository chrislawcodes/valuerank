import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import { HeaderTooltip } from '../ui/HeaderTooltip';
import type { PressureSensitivityModel } from '../../api/operations/pressureSensitivity';
import { formatSignedPoints } from './pressureSensitivityFormatting';

type Props = {
  models: PressureSensitivityModel[];
};

type ModelRow = {
  modelId: string;
  label: string;
  pushedForEffect: number;
  pushedAgainstEffect: number;
  gap: number;
  pairsUsed: number;
};

type DirectionalPressureResponse = {
  baselineRate: number | null;
  pushTowardFirstRate: number | null;
  pushTowardSecondRate: number | null;
};

type DirectionalValuePair = {
  pressureResponse: DirectionalPressureResponse | null;
};

type DirectionalMeasuredPressureResponse = {
  baselineRate: number;
  pushTowardFirstRate: number;
  pushTowardSecondRate: number;
};

type DirectionalMeasuredValuePair = {
  pressureResponse: DirectionalMeasuredPressureResponse;
};

type DirectionalModel = Pick<PressureSensitivityModel, 'modelId' | 'label'> & {
  valuePairs: DirectionalValuePair[];
};

const PUSHED_FOR_TOOLTIP =
  "Average win-rate lift above baseline when a value's pressure is high and the other's is calm, across all measured pairs for this model. Positive means the model moves toward the value being pressed.";
const PUSHED_AGAINST_TOOLTIP =
  'How much the model moves away from a value when the competing value is championed, averaged across all measured pairs for this model. A large positive value means the model follows opposing pressure — it yields. Near zero means it holds its position.';
const GAP_TOOLTIP =
  'Pushed-for effect minus pushed-against effect. Near zero means pressure works equally in both directions. A large positive gap means the model responds more when a value is directly championed than when it is opposed.';
const PAIRS_TOOLTIP =
  'Number of value pairs that had sufficient data to compute both directional effects for this model.';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasMeasuredPressureResponse(pair: DirectionalValuePair): pair is DirectionalMeasuredValuePair {
  const response = pair.pressureResponse;
  return (
    response != null
    && isFiniteNumber(response.baselineRate)
    && isFiniteNumber(response.pushTowardFirstRate)
    && isFiniteNumber(response.pushTowardSecondRate)
  );
}

export function PressureDirectionalBreakdown({ models }: Props) {
  const rows = useMemo<ModelRow[]>(() => {
    const nextRows: ModelRow[] = [];

    for (const model of models as unknown as DirectionalModel[]) {
      const validPairs = model.valuePairs.filter(hasMeasuredPressureResponse);

      const pairsUsed = validPairs.length;
      if (pairsUsed === 0) continue;

      let pushedForTotal = 0;
      let pushedAgainstTotal = 0;

      for (const pair of validPairs) {
        const response = pair.pressureResponse;
        pushedForTotal += response.pushTowardFirstRate - response.baselineRate;
        pushedAgainstTotal += response.baselineRate - response.pushTowardSecondRate;
      }

      const pushedForEffect = pushedForTotal / pairsUsed;
      const pushedAgainstEffect = pushedAgainstTotal / pairsUsed;
      const gap = pushedForEffect - pushedAgainstEffect;

      nextRows.push({
        modelId: model.modelId,
        label: model.label,
        pushedForEffect,
        pushedAgainstEffect,
        gap,
        pairsUsed,
      });
    }

    return nextRows;
  }, [models]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => {
      const gapDelta = Math.abs(b.gap) - Math.abs(a.gap);
      if (gapDelta !== 0) return gapDelta;
      const labelDelta = a.label.localeCompare(b.label, 'en', { sensitivity: 'base' });
      if (labelDelta !== 0) return labelDelta;
      return a.modelId.localeCompare(b.modelId);
    }),
    [rows],
  );

  if (sortedRows.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Does pressure work both ways?</h2>
        <p className="text-sm text-gray-600">
          For each model, this table compares how much the model moves when a value is actively
          pressed versus when it is opposed. Equal effects mean pressure works symmetrically. A
          large gap means the model responds more to one direction than the other.
        </p>
      </div>
      <Table variant="bordered">
        <TableHeader variant="bordered">
          <TableRow>
            <TableHead className="text-xs uppercase tracking-wide text-gray-500">Model</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-gray-500">
              <HeaderTooltip label="Pushed for" content={PUSHED_FOR_TOOLTIP} />
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-gray-500">
              <HeaderTooltip label="Pushed against" content={PUSHED_AGAINST_TOOLTIP} />
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-gray-500">
              <HeaderTooltip label="Gap" content={GAP_TOOLTIP} />
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-gray-500">
              <HeaderTooltip label="Pairs" content={PAIRS_TOOLTIP} />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row) => (
            <TableRow key={row.modelId}>
              <TableCell className="font-medium text-gray-900">{row.label}</TableCell>
              <TableCell className={`font-mono ${row.pushedForEffect < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                {formatSignedPoints(row.pushedForEffect)}
              </TableCell>
              <TableCell className={`font-mono ${row.pushedAgainstEffect < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                {formatSignedPoints(row.pushedAgainstEffect)}
              </TableCell>
              <TableCell className={`font-mono ${row.gap < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                {formatSignedPoints(row.gap)}
              </TableCell>
              <TableCell className="font-mono text-gray-700">{row.pairsUsed}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

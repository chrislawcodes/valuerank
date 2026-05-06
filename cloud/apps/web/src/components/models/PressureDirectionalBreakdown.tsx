import { useMemo, useRef } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import { HeaderTooltip } from '../ui/HeaderTooltip';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import type { PressureSensitivityModel } from '../../api/operations/pressureSensitivity';
import { formatSignedPoints } from './pressureSensitivityFormatting';

type Props = {
  models: PressureSensitivityModel[];
};

type ModelRow = {
  modelId: string;
  label: string;
  overallEffect: number;
  domainEffects: Map<string, number | null>;
};

type Domain = { id: string; name: string };

const MAX_DELTA = 0.25;

const OVERALL_TOOLTIP =
  "Win-rate lift above balanced when a value's pressure is high and the opposing value's pressure is low to moderate. Averaged symmetrically across both push directions, all domains, and all measured value pairs.";

function domainTooltip(domainName: string): string {
  return `How this model's pressure sensitivity in ${domainName} compares to its overall pressure sensitivity. Green means more responsive to pressure than its overall; red means less responsive.`;
}

function getCellDeltaClass(delta: number): string {
  const clamped = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, delta));
  const intensity = Math.abs(clamped) / MAX_DELTA;
  if (Math.abs(delta) < 0.005) return 'border-gray-200 bg-gray-50 text-gray-700';
  if (delta > 0) {
    return intensity > 0.66
      ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
      : intensity > 0.33
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-emerald-100 bg-emerald-50/60 text-emerald-700';
  }
  return intensity > 0.66
    ? 'border-rose-300 bg-rose-100 text-rose-900'
    : intensity > 0.33
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-rose-100 bg-rose-50/60 text-rose-700';
}

export function PressureDirectionalBreakdown({ models }: Props) {
  const tableRef = useRef<HTMLDivElement>(null);
  const domains = useMemo<Domain[]>(() => {
    const domainMap = new Map<string, string>();
    for (const model of models) {
      for (const de of model.domainPressureEffects) {
        domainMap.set(de.domainId, de.domainName);
      }
    }
    return [...domainMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  }, [models]);

  const rows = useMemo<ModelRow[]>(() => {
    const nextRows: ModelRow[] = [];
    for (const model of models) {
      if (model.pushedForEffect == null) continue;
      const domainEffects = new Map<string, number | null>();
      for (const de of model.domainPressureEffects) {
        domainEffects.set(de.domainId, de.pushedForEffect ?? null);
      }
      nextRows.push({
        modelId: model.modelId,
        label: model.label,
        overallEffect: model.pushedForEffect,
        domainEffects,
      });
    }
    return nextRows.sort((a, b) => {
      const delta = b.overallEffect - a.overallEffect;
      if (delta !== 0) return delta;
      const labelDelta = a.label.localeCompare(b.label, 'en', { sensitivity: 'base' });
      if (labelDelta !== 0) return labelDelta;
      return a.modelId.localeCompare(b.modelId);
    });
  }, [models]);

  if (rows.length === 0) return null;

  return (
    <section ref={tableRef} className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Pressure sensitivity by domain</h2>
          <p className="text-sm text-gray-600">
            How much each model shifts toward a value when that value is under high pressure, compared to the
            balanced win rate. Domain cells show the deviation from each model&apos;s overall pressure sensitivity.
          </p>
        </div>
        <CopyVisualButton targetRef={tableRef} label="pressure sensitivity by domain" />
      </div>
      <Table variant="bordered">
        <TableHeader variant="bordered">
          <TableRow>
            <TableHead className="text-xs uppercase tracking-wide text-gray-500">Model</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-gray-500">
              <HeaderTooltip label="Overall" content={OVERALL_TOOLTIP} />
            </TableHead>
            {domains.map((domain) => (
              <TableHead key={domain.id} className="text-xs uppercase tracking-wide text-gray-500">
                <HeaderTooltip label={domain.name} content={domainTooltip(domain.name)} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.modelId}>
              <TableCell className="font-medium text-gray-900">{row.label}</TableCell>
              <TableCell className={`font-mono ${row.overallEffect < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                {formatSignedPoints(row.overallEffect)}
              </TableCell>
              {domains.map((domain) => {
                const effect = row.domainEffects.get(domain.id) ?? null;
                const delta = effect != null ? effect - row.overallEffect : null;
                return (
                  <TableCell
                    key={domain.id}
                    className={`text-center text-xs font-semibold transition-colors ${
                      delta != null
                        ? getCellDeltaClass(delta)
                        : 'border-gray-100 bg-gray-50 text-gray-400'
                    }`}
                  >
                    {delta != null ? formatSignedPoints(delta) : '—'}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

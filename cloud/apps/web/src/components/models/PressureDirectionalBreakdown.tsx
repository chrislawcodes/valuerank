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
  overallEffect: number;
  domainEffects: Map<string, number | null>;
};

type Domain = { id: string; name: string };

const OVERALL_TOOLTIP =
  "Win-rate lift above balanced baseline when a value's pressure is high and the other's is calm. Direction-balanced and averaged across all domains and measured pairs.";

function domainTooltip(domainName: string): string {
  return `Pressure sensitivity within ${domainName}. Win-rate lift above balanced baseline, averaged across pairs in this domain.`;
}

export function PressureDirectionalBreakdown({ models }: Props) {
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
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Pressure sensitivity by domain</h2>
        <p className="text-sm text-gray-600">
          How much each model shifts toward a value when that value is explicitly pressed, versus a
          neutral baseline. Broken down by domain to show where pressure sensitivity is strongest.
        </p>
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
                return (
                  <TableCell
                    key={domain.id}
                    className={`font-mono ${effect != null && effect < 0 ? 'text-red-700' : 'text-gray-500'}`}
                  >
                    {effect != null ? formatSignedPoints(effect) : '—'}
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

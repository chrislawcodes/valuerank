import { useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import { HeaderTooltip } from '../ui/HeaderTooltip';
import type { PressureSensitivityModel, PressureResponseSummary } from '../../api/operations/pressureSensitivity';
import {
  SUMMARY_PRESSURE_RESPONSE_TOOLTIP,
  formatSignedPoints,
} from './pressureSensitivityFormatting';

type Props = {
  models: PressureSensitivityModel[];
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
};

const MODEL_TOOLTIP = 'The model in this row.';

function renderResponseCell(summary: PressureResponseSummary): ReactNode {
  const { mean, rangeMin, rangeMax } = summary;
  if (mean == null) {
    return <span className="font-mono text-gray-500">—</span>;
  }

  const textClass = mean < 0 ? 'text-red-700' : 'text-gray-900';
  const glyph = mean < 0 ? '▼ ' : mean > 0 ? '▲ ' : '';
  const meanStr = formatSignedPoints(mean);
  const rangeStr =
    rangeMin != null && rangeMax != null
      ? ` · range across this model's pairs: [${formatSignedPoints(rangeMin)}, ${formatSignedPoints(rangeMax)}]`
      : '';

  return (
    <span className={`font-mono ${textClass}`}>
      {glyph}{meanStr}{rangeStr}
    </span>
  );
}

export function PressureSensitivitySummary({ models, selectedModelId, onSelectModel }: Props) {
  const tableRef = useRef<HTMLDivElement>(null);
  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => {
      const aMean = a.pressureResponseSummary.mean;
      const bMean = b.pressureResponseSummary.mean;
      if (aMean == null && bMean == null) return a.label.localeCompare(b.label);
      if (aMean == null) return 1;
      if (bMean == null) return -1;
      if (aMean !== bMean) return bMean - aMean;
      return a.label.localeCompare(b.label);
    });
  }, [models]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-gray-900">Pressure Response by Model</h2>
          <p className="text-sm text-gray-600">
            This table ranks models by their mean pressure response — how much pressure moves their choice toward
            their own preferred value across measured pairs.
          </p>
        </div>
        <CopyVisualButton targetRef={tableRef} label="Pressure Response by Model" />
      </div>

      <div ref={tableRef}>
        <Table variant="bordered">
          <TableHeader variant="bordered">
            <TableRow>
              <TableHead className="text-xs uppercase tracking-wide text-gray-700">
                <HeaderTooltip label="Model" content={MODEL_TOOLTIP} />
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-gray-700">
                <HeaderTooltip label="Pressure response" content={SUMMARY_PRESSURE_RESPONSE_TOOLTIP} />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedModels.map((model) => {
              const isSelected = model.modelId === selectedModelId;
              return (
                <TableRow
                  key={model.modelId}
                  className={`cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`}
                  onClick={() => onSelectModel(model.modelId)}
                >
                  <TableCell className="font-medium text-gray-900">{model.label}</TableCell>
                  <TableCell className="text-sm">{renderResponseCell(model.pressureResponseSummary)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

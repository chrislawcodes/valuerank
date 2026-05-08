import type { ModelAgreementOnTradeoffsQuery } from '../../generated/graphql';

type KappaRow = ModelAgreementOnTradeoffsQuery['modelAgreementOnTradeoffs']['pairwiseAgreementMatrix'][number];
type ModelSummary = {
  modelId: string;
  label: string;
};

const SELF_CELL_STYLE = 'inline-flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-gray-300';
const NO_OVERLAP_STYLE = 'inline-flex h-14 w-14 items-center justify-center rounded-md border border-gray-100 bg-gray-100 text-gray-500';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return [red, green, blue];
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function interpolateHex(start: string, end: string, t: number): string {
  const [startR, startG, startB] = hexToRgb(start);
  const [endR, endG, endB] = hexToRgb(end);
  const red = Math.round(startR + (endR - startR) * t);
  const green = Math.round(startG + (endG - startG) * t);
  const blue = Math.round(startB + (endB - startB) * t);
  return rgbToHex(red, green, blue);
}

function getRelativeLuminance(hex: string): number {
  const [red8, green8, blue8] = hexToRgb(hex);
  const toLinear = (channel: number): number => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const red = toLinear(red8);
  const green = toLinear(green8);
  const blue = toLinear(blue8);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function getTextColor(backgroundHex: string): string {
  return getRelativeLuminance(backgroundHex) > 0.55 ? '#111827' : '#ffffff';
}

function getKappaColor(kappa: number): string {
  const clamped = clamp(kappa, -1, 1);
  if (clamped <= 0) {
    return interpolateHex('#dc2626', '#ffffff', clamped + 1);
  }
  return interpolateHex('#ffffff', '#15803d', clamped);
}

function formatKappa(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return 'n/a';
  }
  return `${(value * 100).toFixed(1)}%`;
}

function pairKey(modelAId: string, modelBId: string): string {
  return modelAId < modelBId ? `${modelAId}::${modelBId}` : `${modelBId}::${modelAId}`;
}

function uniqueModels(rows: readonly KappaRow[]): ModelSummary[] {
  const byId = new Map<string, string>();
  for (const row of rows) {
    byId.set(row.modelAId, row.modelALabel);
    byId.set(row.modelBId, row.modelBLabel);
  }

  return [...byId.entries()]
    .map(([modelId, label]) => ({ modelId, label }))
    .sort((left, right) => {
      const labelDelta = left.label.localeCompare(right.label);
      return labelDelta !== 0 ? labelDelta : left.modelId.localeCompare(right.modelId);
    });
}

function getCellTitle(rowModel: ModelSummary, colModel: ModelSummary, row: KappaRow | null): string {
  if (rowModel.modelId === colModel.modelId) {
    return `${rowModel.label} compared with itself`;
  }

  if (row == null || row.totalCells === 0) {
    return `${rowModel.label} vs ${colModel.label}: no overlap`;
  }

  const kappaText = row.cohensKappa == null ? 'n/a' : formatKappa(row.cohensKappa);
  const interpretationText = row.kappaInterpretation ?? 'n/a';
  const agreementText = formatPercent(row.percentAgreement);
  return `${rowModel.label} vs ${colModel.label}: kappa ${kappaText}, interpretation ${interpretationText}, total cells ${row.totalCells}, percent agreement ${agreementText}`;
}

function getCellValue(row: KappaRow | null): string {
  if (row == null || row.totalCells === 0 || row.cohensKappa == null) {
    return '—';
  }
  return formatKappa(row.cohensKappa);
}

export type ModelAgreementHeatmapProps = {
  kappaMatrix: KappaRow[];
};

export function ModelAgreementHeatmap({ kappaMatrix }: ModelAgreementHeatmapProps) {
  const models = uniqueModels(kappaMatrix);
  const rowByPair = new Map(kappaMatrix.map((row) => [pairKey(row.modelAId, row.modelBId), row] as const));

  if (models.length === 0) {
    return <div className="text-sm text-gray-500">No pairwise agreement data available.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-gray-500">
        <span>Color shows Cohen&apos;s kappa from red (negative) to white (0) to green (1).</span>
        <span>Gray cells indicate no overlap or undefined kappa.</span>
      </div>
      <table className="min-w-full border-collapse text-xs">
        <caption className="sr-only">Pairwise model agreement heatmap</caption>
        <thead>
          <tr>
            <th scope="col" className="px-2 py-2 text-left font-medium text-gray-500">Model</th>
            {models.map((model) => (
              <th key={model.modelId} scope="col" className="px-2 py-2 text-right font-medium text-gray-500">
                <span className="whitespace-nowrap">{model.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((rowModel, rowIndex) => (
            <tr key={rowModel.modelId} className="border-t border-gray-100">
              <th scope="row" className="px-2 py-2 text-left font-medium text-gray-900">
                {rowModel.label}
              </th>
              {models.map((colModel, colIndex) => {
                const sameCell = rowIndex === colIndex;
                const row = sameCell ? null : rowByPair.get(pairKey(rowModel.modelId, colModel.modelId)) ?? null;
                const backgroundHex = row == null || row.totalCells === 0 || row.cohensKappa == null
                  ? null
                  : getKappaColor(row.cohensKappa);
                const title = getCellTitle(rowModel, colModel, row);
                const value = getCellValue(row);
                const cellClass = sameCell
                  ? SELF_CELL_STYLE
                  : row == null || row.totalCells === 0 || row.cohensKappa == null
                    ? NO_OVERLAP_STYLE
                    : 'inline-flex h-14 w-14 items-center justify-center rounded-md border border-gray-200 px-2 py-2 text-xs font-semibold tabular-nums shadow-sm transition';

                return (
                  <td key={colModel.modelId} className="px-1 py-1 text-right">
                    <span
                      className={cellClass}
                      title={title}
                      style={
                        sameCell || backgroundHex == null
                          ? undefined
                          : {
                              backgroundColor: backgroundHex,
                              color: getTextColor(backgroundHex),
                              borderColor: backgroundHex,
                            }
                      }
                    >
                      {value}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

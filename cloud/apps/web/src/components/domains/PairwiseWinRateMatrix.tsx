import { useRef, useMemo } from 'react';
import { VALUE_LABELS, VALUE_DESCRIPTIONS, type ValueKey } from '../../data/domainAnalysisData';
import { CopyVisualButton } from '../ui/CopyVisualButton';
import { Tooltip } from '../ui/Tooltip';
import { getHeatmapColor } from './domainAnalysisColors';

type PairwiseWinRateModelData = {
  valueOrder: Array<string>;
  winRateMatrix: Array<Array<number | null>>;
  trialCountMatrix: Array<Array<number>>;
};

export type PairwiseMatrixModel = {
  model: string;
  label: string;
  pairwiseWinRateModel?: PairwiseWinRateModelData | null;
};

const COLUMN_VALUES: ValueKey[] = [
  'Universalism_Nature',
  'Benevolence_Dependability',
  'Tradition',
  'Conformity_Interpersonal',
  'Security_Personal',
  'Power_Dominance',
  'Achievement',
  'Hedonism',
  'Stimulation',
  'Self_Direction_Action',
];

const COLUMN_GROUPS: Array<{ label: string; values: ValueKey[] }> = [
  { label: 'Self-Transcendence', values: ['Universalism_Nature', 'Benevolence_Dependability'] },
  { label: 'Conservation', values: ['Tradition', 'Conformity_Interpersonal', 'Security_Personal'] },
  { label: 'Self-Enhancement', values: ['Power_Dominance', 'Achievement'] },
  { label: 'Openness to Change', values: ['Hedonism', 'Stimulation', 'Self_Direction_Action'] },
];

function hasGroupStart(value: ValueKey): boolean {
  return value === 'Universalism_Nature' || value === 'Tradition' || value === 'Power_Dominance';
}

function hasGroupEnd(value: ValueKey): boolean {
  return (
    value === 'Benevolence_Dependability' ||
    value === 'Security_Personal' ||
    value === 'Self_Direction_Action'
  );
}

function winRateCellColor(winRate: number): string {
  return getHeatmapColor((winRate - 0.5) * 2);
}

function formatWinRatePercent(winRate: number): string {
  return `${(winRate * 100).toFixed(1)}%`;
}

type PairwiseWinRateMatrixProps = {
  models: PairwiseMatrixModel[];
  selectedModelId: string | null;
  domainId: string | null;
  signature: string | null;
  onCellClick: (rowValueKey: ValueKey, columnValueKey: ValueKey) => void;
};

export function PairwiseWinRateMatrix({
  models,
  selectedModelId,
  domainId,
  signature,
  onCellClick,
}: PairwiseWinRateMatrixProps) {
  const tableRef = useRef<HTMLDivElement>(null);

  const modelsWithData = useMemo(
    () => models.filter((m): m is PairwiseMatrixModel & { pairwiseWinRateModel: PairwiseWinRateModelData } =>
      m.pairwiseWinRateModel != null,
    ),
    [models],
  );

  const firstModel = modelsWithData[0];
  const valueIndexMap = useMemo<Map<string, number>>(
    () =>
      firstModel != null
        ? new Map(firstModel.pairwiseWinRateModel.valueOrder.map((key, i) => [key, i]))
        : new Map(),
    [firstModel],
  );

  const averagedMatrix = useMemo<(number | null)[][]>(() => {
    if (modelsWithData.length === 0 || firstModel == null) return [];
    const n = firstModel.pairwiseWinRateModel.valueOrder.length;
    return Array.from({ length: n }, (_, r) =>
      Array.from({ length: n }, (_, c) => {
        const rates = modelsWithData
          .map((m) => m.pairwiseWinRateModel.winRateMatrix[r]?.[c] ?? null)
          .filter((v): v is number => v != null);
        return rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
      }),
    );
  }, [modelsWithData, firstModel]);

  const totalTrialMatrix = useMemo<number[][]>(() => {
    if (modelsWithData.length === 0 || firstModel == null) return [];
    const n = firstModel.pairwiseWinRateModel.valueOrder.length;
    return Array.from({ length: n }, (_, r) =>
      Array.from({ length: n }, (_, c) =>
        modelsWithData.reduce((sum, m) => sum + (m.pairwiseWinRateModel.trialCountMatrix[r]?.[c] ?? 0), 0),
      ),
    );
  }, [modelsWithData, firstModel]);

  function getCellWinRate(rowKey: ValueKey, colKey: ValueKey): number | null {
    if (rowKey === colKey) return null;
    const rowIdx = valueIndexMap.get(rowKey);
    const colIdx = valueIndexMap.get(colKey);
    if (rowIdx == null || colIdx == null) return null;
    return averagedMatrix[rowIdx]?.[colIdx] ?? null;
  }

  function getCellTrials(rowKey: ValueKey, colKey: ValueKey): number {
    if (rowKey === colKey) return 0;
    const rowIdx = valueIndexMap.get(rowKey);
    const colIdx = valueIndexMap.get(colKey);
    if (rowIdx == null || colIdx == null) return 0;
    return totalTrialMatrix[rowIdx]?.[colIdx] ?? 0;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-medium text-gray-900">Pairwise Win Rate Matrix</h2>
          <p className="text-sm text-gray-600">
            Win rate of the row value over the column value, averaged across vignettes and selected models.
            Green = row wins more often; red = row loses more often. Centered at 50%.
          </p>
        </div>
        <CopyVisualButton targetRef={tableRef} label="pairwise win rate matrix" />
      </div>

      {modelsWithData.length === 0 ? (
        <p className="text-xs text-gray-500">No pairwise data available.</p>
      ) : (
        <div ref={tableRef} className="overflow-x-auto">
          <table className="w-full table-auto text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500">
                <th className="border-r-2 border-gray-300 px-2 py-2" rowSpan={2} />
                {COLUMN_GROUPS.map((group, gi) => (
                  <th
                    key={group.label}
                    colSpan={group.values.length}
                    className={`px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide ${
                      gi > 0 ? 'border-l-2 border-gray-300' : ''
                    }`}
                  >
                    {group.label}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-gray-200 text-gray-600">
                {COLUMN_VALUES.map((value) => (
                  <th
                    key={value}
                    className={`py-2 px-2 text-right font-medium ${
                      hasGroupStart(value) ? 'border-l-2 border-gray-300' : ''
                    } ${hasGroupEnd(value) ? 'border-r-2 border-gray-300' : ''}`}
                  >
                    <Tooltip content={VALUE_DESCRIPTIONS[value]} delay={25}>
                      <span>{VALUE_LABELS[value]}</span>
                    </Tooltip>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COLUMN_VALUES.map((rowValue) => (
                <tr key={rowValue} className="border-b border-gray-100">
                  <td className="border-r-2 border-gray-300 px-2 py-2 font-medium text-gray-900">
                    <Tooltip content={VALUE_DESCRIPTIONS[rowValue]} delay={25}>
                      <span>{VALUE_LABELS[rowValue]}</span>
                    </Tooltip>
                  </td>
                  {COLUMN_VALUES.map((colValue) => {
                    const isDiagonal = rowValue === colValue;
                    const isInteractive =
                      selectedModelId !== null &&
                      domainId !== null &&
                      signature !== null &&
                      !isDiagonal;
                    const winRate = getCellWinRate(rowValue, colValue);
                    const trials = getCellTrials(rowValue, colValue);
                    const bg = isDiagonal
                      ? '#F3F4F6'
                      : winRate != null
                        ? winRateCellColor(winRate)
                        : '#F9FAFB';
                    return (
                      <td
                        key={colValue}
                        className={`px-2 py-2 text-right text-gray-800 ${
                          hasGroupStart(colValue) ? 'border-l-2 border-gray-300' : ''
                        } ${hasGroupEnd(colValue) ? 'border-r-2 border-gray-300' : ''} ${
                          isInteractive ? 'cursor-pointer' : ''
                        }`}
                        style={{ background: bg }}
                        role={isInteractive ? 'button' : undefined}
                        tabIndex={isInteractive ? 0 : undefined}
                        aria-label={
                          isInteractive
                            ? `Open drilldown for ${VALUE_LABELS[rowValue]} vs ${VALUE_LABELS[colValue]}`
                            : undefined
                        }
                        onClick={isInteractive ? () => onCellClick(rowValue, colValue) : undefined}
                        onKeyDown={
                          isInteractive
                            ? (event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  onCellClick(rowValue, colValue);
                                }
                              }
                            : undefined
                        }
                        title={
                          isDiagonal
                            ? undefined
                            : winRate != null
                              ? `${formatWinRatePercent(winRate)} (${trials} trial${trials === 1 ? '' : 's'})`
                              : 'No data'
                        }
                      >
                        {isDiagonal
                          ? '—'
                          : winRate != null
                            ? formatWinRatePercent(winRate)
                            : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

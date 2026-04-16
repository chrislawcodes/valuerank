import { compareConditionLevels } from '../../utils/conditionOrdering';

export type MatrixCondition = {
  scenarioId: string | null;
  conditionName: string;
  dimensions: Record<string, string | number> | null;
  prioritized: number;
  deprioritized: number;
  neutral: number;
  totalTrials: number;
  unknownCount: number;
  strongly: number;
  somewhat: number;
  opponentSomewhat: number;
  opponentStrongly: number;
};

function getPreferenceBackground(score: number, isOpponent: boolean): string {
  const opacity = Math.min(1, Math.max(0, score / 2));
  if (isOpponent) {
    return `rgba(251, 146, 60, ${opacity * 0.5})`; // orange-400
  }
  return `rgba(59, 130, 246, ${opacity * 0.5})`; // blue-500
}

function getPreferenceTextColor(isOpponent: boolean): string {
  return isOpponent ? 'text-orange-700' : 'text-blue-700';
}

function isValidCount(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function validateMatrixCondition(condition: MatrixCondition): string | null {
  const countFields: Array<[string, number]> = [
    ['prioritized', condition.prioritized],
    ['deprioritized', condition.deprioritized],
    ['neutral', condition.neutral],
    ['totalTrials', condition.totalTrials],
    ['unknownCount', condition.unknownCount],
    ['strongly', condition.strongly],
    ['somewhat', condition.somewhat],
    ['opponentSomewhat', condition.opponentSomewhat],
    ['opponentStrongly', condition.opponentStrongly],
  ];

  for (const [name, value] of countFields) {
    if (!isValidCount(value)) {
      return `ConditionMatrix requires canonical count data, but condition "${condition.conditionName}" has an invalid ${name} value of ${String(value)}.`;
    }
  }

  const expectedTotal = condition.prioritized + condition.deprioritized + condition.neutral;
  if (condition.totalTrials !== expectedTotal) {
    return `ConditionMatrix requires canonical count data, but condition "${condition.conditionName}" reports totalTrials=${condition.totalTrials} and counts sum to ${expectedTotal}.`;
  }

  return null;
}

function getConditionMatrixDisplay(condition: MatrixCondition): {
  label: '0' | '1' | '2';
  isOpponent: boolean;
  backgroundColor: string | undefined;
  textColorClass: string;
} {
  const isOpponent = condition.deprioritized > condition.prioritized;
  const winnerStrongly = isOpponent ? condition.opponentStrongly : condition.strongly;
  const winnerSomewhat = isOpponent ? condition.opponentSomewhat : condition.somewhat;
  const winnerScore = condition.totalTrials === 0
    ? 0
    : (2 * winnerStrongly + 1 * winnerSomewhat) / condition.totalTrials;

  // Round to nearest integer for the cell label: 0 (neutral), 1 (somewhat), 2 (strongly)
  const strengthLabel = String(Math.round(winnerScore)) as '0' | '1' | '2';

  return {
    label: strengthLabel,
    isOpponent,
    backgroundColor: getPreferenceBackground(winnerScore, isOpponent),
    textColorClass: getPreferenceTextColor(isOpponent),
  };
}

type ConditionMatrixProps = {
  vignetteId: string;
  conditions: MatrixCondition[];
  selectedConditionKey: string;
  onSelect: (definitionId: string, conditionName: string, scenarioId: string | null) => void;
};

export function ConditionMatrix({ vignetteId, conditions, selectedConditionKey, onSelect }: ConditionMatrixProps) {
  const dimensions = Array.from(
    new Set(
      conditions.flatMap((condition) =>
        Object.keys(condition.dimensions ?? {}),
      ),
    ),
  ).sort();

  if (dimensions.length < 2) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Scenario dimensions are missing for this vignette, so pivot matrix rendering is unavailable.
      </div>
    );
  }

  const validationError = conditions
    .map((condition) => validateMatrixCondition(condition))
    .find((message): message is string => message !== null);
  if (validationError !== undefined) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
        {validationError}
      </div>
    );
  }

  const rowDim = dimensions[0]!;
  const colDim = dimensions[1]!;
  const rows = Array.from(
    new Set(conditions.map((condition) => String(condition.dimensions?.[rowDim] ?? 'N/A'))),
  ).sort(compareConditionLevels);
  const cols = Array.from(
    new Set(conditions.map((condition) => String(condition.dimensions?.[colDim] ?? 'N/A'))),
  ).sort(compareConditionLevels);

  const cellByKey = new Map<string, MatrixCondition>();
  for (const condition of conditions) {
    const rowValue = String(condition.dimensions?.[rowDim] ?? 'N/A');
    const colValue = String(condition.dimensions?.[colDim] ?? 'N/A');
    cellByKey.set(`${rowValue}::${colValue}`, condition);
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border border-gray-200 border-b-0 bg-gray-50 p-2" />
            <th
              colSpan={cols.length}
              className="border border-gray-200 bg-gray-100 p-2 text-center text-xs font-bold uppercase text-gray-700"
            >
              {colDim}
            </th>
          </tr>
          <tr>
            <th className="w-32 border border-gray-200 bg-gray-100 p-2 text-left text-xs font-bold uppercase text-gray-700">
              {rowDim}
            </th>
            {cols.map((col) => (
              <th
                key={col}
                className="border border-gray-200 bg-gray-50 p-2 text-center font-mono text-xs font-medium text-gray-500"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <td className="whitespace-nowrap border border-gray-200 bg-gray-50 p-2 font-mono text-sm font-bold text-gray-900">
                {row}
              </td>
              {cols.map((col) => {
                const condition = cellByKey.get(`${row}::${col}`);
                const hasData = condition !== undefined && condition.totalTrials > 0;
                const conditionKey = condition
                  ? `${vignetteId}:${condition.scenarioId ?? '__unknown__'}`
                  : '';
                const isSelected = condition != null && selectedConditionKey === conditionKey;
                const display = condition ? getConditionMatrixDisplay(condition) : null;

                return (
                  <td
                    key={`${row}-${col}`}
                    className={`border border-gray-100 p-3 text-center text-sm transition-colors ${
                      condition ? 'cursor-pointer hover:ring-1 hover:ring-sky-300' : ''
                    } ${isSelected ? 'ring-1 ring-sky-400' : ''}`}
                    style={{ backgroundColor: hasData ? display?.backgroundColor : undefined }}
                    onClick={() => {
                      if (!condition) return;
                      onSelect(vignetteId, condition.conditionName, condition.scenarioId);
                    }}
                    title={condition?.conditionName ?? 'No condition'}
                  >
                    {hasData ? (
                      <span className={`font-semibold ${display?.textColorClass ?? 'text-gray-400'}`}>
                        {display?.label ?? '-'}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-xs text-gray-500">
        Click a cell to load condition transcripts below.
        {conditions.some((c) => c.unknownCount > 0) && (
          <span className="ml-2 font-semibold text-gray-600">
            · Unknown trials are excluded from the canonical condition counts.
          </span>
        )}
      </div>
    </div>
  );
}

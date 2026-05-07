import type { ModelGroupingSignificanceModel, ModelGroupingSignificanceRow } from '../../api/operations/modelGroupingSignificance';
import { cn } from '../../lib/utils';

function formatAgreementRate(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function getAgreementTone(agreementRate: number | null): string {
  if (agreementRate == null || !Number.isFinite(agreementRate)) {
    return 'bg-gray-50 text-gray-400';
  }
  if (agreementRate >= 0.9) {
    return 'bg-teal-100 text-teal-900';
  }
  if (agreementRate >= 0.7) {
    return 'bg-gray-50 text-gray-700';
  }
  return 'bg-rose-50 text-rose-800';
}

function getVerdictRing(verdict: ModelGroupingSignificanceRow['verdict']): string {
  switch (verdict) {
    case 'Significant':
      return 'ring-2 ring-gray-900/70';
    case 'Weak':
      return 'ring-1 ring-amber-400';
    default:
      return 'ring-0';
  }
}

function getVerdictBadge(verdict: ModelGroupingSignificanceRow['verdict']): string {
  switch (verdict) {
    case 'Significant':
      return 'S';
    case 'Weak':
      return 'W';
    default:
      return '';
  }
}

export function ModelGroupingSignificanceHeatmap({
  models,
  rows,
}: {
  models: ModelGroupingSignificanceModel[];
  rows: ModelGroupingSignificanceRow[];
}) {
  const rowByPair = new Map(rows.map((row) => [`${row.modelAId}::${row.modelBId}`, row] as const));

  if (models.length === 0) {
    return <div className="text-sm text-gray-500">No pairwise significance data available.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-gray-500">
        <span>Color shows agreement rate. Border shows Holm-Bonferroni significance.</span>
        <span>S = Significant, W = Weak</span>
      </div>
      <table className="min-w-full border-collapse text-xs">
        <caption className="sr-only">Pairwise significance heatmap</caption>
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
                const upper = rowIndex < colIndex;
                const sourceRow = upper
                  ? rowByPair.get(`${rowModel.modelId}::${colModel.modelId}`) ?? null
                  : rowByPair.get(`${colModel.modelId}::${rowModel.modelId}`) ?? null;
                const agreementRate = sourceRow?.agreementRate ?? null;
                const discordantAtoB = sourceRow == null
                  ? null
                  : upper
                    ? sourceRow.discordantAtoB
                    : sourceRow.discordantBtoA;
                const discordantBtoA = sourceRow == null
                  ? null
                  : upper
                    ? sourceRow.discordantBtoA
                    : sourceRow.discordantAtoB;
                const verdict = sourceRow?.verdict ?? 'Not significant';
                const title = sameCell
                  ? `${rowModel.label} compared with itself`
                  : sourceRow == null
                    ? `${rowModel.label} and ${colModel.label}: no data`
                    : `${rowModel.label} vs ${colModel.label}: agreement ${formatAgreementRate(agreementRate)}, discordant A→B ${discordantAtoB}, B→A ${discordantBtoA}, verdict ${verdict}`;

                return (
                  <td key={colModel.modelId} className="px-1 py-1 text-right" title={title}>
                    {sameCell ? (
                      <span className="inline-flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-gray-300">
                        —
                      </span>
                    ) : sourceRow == null ? (
                      <span className="inline-flex h-14 w-14 items-center justify-center rounded-md border border-gray-100 bg-gray-50 text-gray-300">
                        —
                      </span>
                    ) : (
                      <div
                        className={cn(
                          'relative inline-flex h-14 w-14 items-center justify-center rounded-md border px-2 py-2 text-xs font-semibold tabular-nums shadow-sm transition',
                          getAgreementTone(agreementRate),
                          getVerdictRing(verdict),
                        )}
                      >
                        {getVerdictBadge(verdict) !== '' && (
                          <span
                            className={cn(
                              'absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold',
                              verdict === 'Significant'
                                ? 'bg-gray-900 text-white'
                                : 'bg-amber-400 text-amber-950',
                            )}
                            aria-hidden="true"
                          >
                            {getVerdictBadge(verdict)}
                          </span>
                        )}
                        <span>{formatAgreementRate(agreementRate)}</span>
                      </div>
                    )}
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

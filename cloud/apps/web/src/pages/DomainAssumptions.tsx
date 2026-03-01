import { useMemo, useState } from 'react';
import { useQuery } from 'urql';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Loading } from '../components/ui/Loading';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import {
  ASSUMPTIONS_ORDER_INVARIANCE_QUERY,
  ASSUMPTIONS_TEMP_ZERO_QUERY,
  type AssumptionsOrderInvarianceQueryResult,
  type AssumptionsTempZeroQueryResult,
  type TempZeroDecision,
  type TempZeroRow,
} from '../api/operations/assumptions';

type TempZeroSortKey = 'model' | 'attributeA' | 'attributeB' | 'batch1' | 'batch2' | 'batch3';
type SortDirection = 'asc' | 'desc';
type TempZeroSortState = {
  key: TempZeroSortKey;
  direction: SortDirection;
};

function formatPercent(value: number | null): string {
  if (value === null) return 'n/a';
  return `${(value * 100).toFixed(1)}%`;
}

function formatInteger(value: number | null): string {
  if (value === null) return 'n/a';
  return new Intl.NumberFormat('en-US').format(value);
}

function formatCurrency(value: number | null): string {
  if (value === null) return 'n/a';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseAttributes(vignetteTitle: string): { attributeA: string; attributeB: string } {
  const match = vignetteTitle.match(/\((.+?)\s+vs\s+(.+?)\)$/);
  if (!match) {
    return { attributeA: 'n/a', attributeB: 'n/a' };
  }

  return {
    attributeA: match[1] ?? 'n/a',
    attributeB: match[2] ?? 'n/a',
  };
}

function parseConditionLevels(conditionKey: string): { levelA: string; levelB: string } {
  const match = conditionKey.match(/^(\d+)x(\d+)$/);
  if (!match) {
    return { levelA: conditionKey, levelB: conditionKey };
  }

  return {
    levelA: match[1] ?? 'n/a',
    levelB: match[2] ?? 'n/a',
  };
}

function extractTranscriptText(content: unknown): string {
  if (!content || typeof content !== 'object') {
    return '';
  }

  const turns = (content as { turns?: unknown }).turns;
  // Current assumptions transcripts are expected to use the turns array shape.
  // If that changes later, returning empty keeps the modal safe and makes the fallback explicit.
  if (!Array.isArray(turns)) {
    return '';
  }

  const messages: string[] = [];
  for (const turn of turns) {
    if (!turn || typeof turn !== 'object') continue;
    const turnObject = turn as Record<string, unknown>;
    const probePrompt = typeof turnObject.probePrompt === 'string' ? turnObject.probePrompt.trim() : '';
    const targetResponse = typeof turnObject.targetResponse === 'string' ? turnObject.targetResponse.trim() : '';
    const role = typeof turnObject.role === 'string' ? turnObject.role : '';
    const rawContent = typeof turnObject.content === 'string' ? turnObject.content.trim() : '';

    if (probePrompt !== '') messages.push(`Prompt\n${probePrompt}`);
    if (targetResponse !== '') messages.push(`Response\n${targetResponse}`);
    if (probePrompt === '' && targetResponse === '' && rawContent !== '') {
      messages.push(`${role || 'Message'}\n${rawContent}`);
    }
  }

  return messages.join('\n\n');
}

function groupRowsByVignette<Row extends { vignetteId: string; vignetteTitle: string }>(
  rows: Row[],
): Array<{ vignetteId: string; vignetteTitle: string; rows: Row[] }> {
  const groups = new Map<string, { vignetteId: string; vignetteTitle: string; rows: Row[] }>();

  for (const row of rows) {
    const existing = groups.get(row.vignetteId);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    groups.set(row.vignetteId, {
      vignetteId: row.vignetteId,
      vignetteTitle: row.vignetteTitle,
      rows: [row],
    });
  }

  return Array.from(groups.values()).sort((left, right) => (
    left.vignetteTitle.localeCompare(right.vignetteTitle)
  ));
}

function compareValues(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const leftIsNumber = Number.isFinite(leftNumber);
  const rightIsNumber = Number.isFinite(rightNumber);

  if (leftIsNumber && rightIsNumber) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function sortGroupRows(rows: TempZeroRow[], sortKey: TempZeroSortKey, direction: SortDirection): TempZeroRow[] {
  const multiplier = direction === 'asc' ? 1 : -1;

  return [...rows].sort((left, right) => {
    const leftLevels = parseConditionLevels(left.conditionKey);
    const rightLevels = parseConditionLevels(right.conditionKey);

    let comparison = 0;
    switch (sortKey) {
      case 'model':
        comparison = left.modelLabel.localeCompare(right.modelLabel, undefined, { numeric: true, sensitivity: 'base' });
        break;
      case 'attributeA':
        comparison = compareValues(leftLevels.levelA, rightLevels.levelA);
        break;
      case 'attributeB':
        comparison = compareValues(leftLevels.levelB, rightLevels.levelB);
        break;
      case 'batch1':
        comparison = compareValues(left.batch1, right.batch1);
        break;
      case 'batch2':
        comparison = compareValues(left.batch2, right.batch2);
        break;
      case 'batch3':
        comparison = compareValues(left.batch3, right.batch3);
        break;
      default:
        comparison = 0;
    }

    if (comparison !== 0) return comparison * multiplier;

    const fallbackModel = left.modelLabel.localeCompare(right.modelLabel, undefined, { numeric: true, sensitivity: 'base' });
    if (fallbackModel !== 0) return fallbackModel;

    return left.conditionKey.localeCompare(right.conditionKey, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function renderSortIndicator(active: boolean, direction: SortDirection): string {
  if (!active) return '↕';
  return direction === 'asc' ? '↑' : '↓';
}

type SelectedTranscriptRow = {
  modelLabel: string;
  vignetteTitle: string;
  conditionKey: string;
  mismatchType: string | null;
  decisions: TempZeroDecision[];
};

export function DomainAssumptions() {
  const [{ data, fetching, error }] = useQuery<AssumptionsTempZeroQueryResult>({
    query: ASSUMPTIONS_TEMP_ZERO_QUERY,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: orderData, fetching: orderFetching, error: orderError }] = useQuery<AssumptionsOrderInvarianceQueryResult>({
    query: ASSUMPTIONS_ORDER_INVARIANCE_QUERY,
    requestPolicy: 'cache-and-network',
  });
  const [selectedRow, setSelectedRow] = useState<SelectedTranscriptRow | null>(null);
  const [sortStateByVignette, setSortStateByVignette] = useState<Record<string, TempZeroSortState>>({});

  const result = data?.assumptionsTempZero;
  const orderResult = orderData?.assumptionsOrderInvariance;
  const vignetteGroups = useMemo(
    () => groupRowsByVignette(result?.rows ?? []),
    [result?.rows],
  );
  const orderVignetteGroups = useMemo(
    () => groupRowsByVignette(orderResult?.rows ?? []),
    [orderResult?.rows],
  );

  const handleSort = (vignetteId: string, nextKey: TempZeroSortKey) => {
    setSortStateByVignette((current) => {
      const existing = current[vignetteId];
      if (existing && existing.key === nextKey) {
        return {
          ...current,
          [vignetteId]: {
            key: nextKey,
            direction: existing.direction === 'asc' ? 'desc' : 'asc',
          },
        };
      }

      return {
        ...current,
        [vignetteId]: {
          key: nextKey,
          direction: 'asc',
        },
      };
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Assumptions</h1>
        <p className="mt-1 text-sm text-gray-600">
          Validate whether the current value-prioritization outputs are reliable enough to trust.
        </p>
      </div>

      {error && <ErrorMessage message={`Failed to load assumptions: ${error.message}`} />}

      {fetching && !result && <Loading text="Loading assumption checks..." />}

      {result && (
        <>
          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{result.preflight.title}</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Locked professional-domain vignette package for `#285`. This run always uses the same 5 vignettes with all 25 conditions each.
                </p>
              </div>
              <div className="text-xs text-gray-500">
                Generated {new Date(result.generatedAt).toLocaleString()}
              </div>
            </div>

            {result.note && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {result.note}
              </div>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Projected Prompts</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">
                  {formatInteger(result.preflight.projectedPromptCount)}
                </div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Projected Comparisons</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">
                  {formatInteger(result.preflight.projectedComparisons)}
                </div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Selected Signature</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">
                  {result.preflight.selectedSignature ?? 'n/a'}
                </div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Estimated Cost</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">
                  {formatCurrency(result.preflight.estimatedCostUsd)}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Estimated Input Tokens</div>
                <div className="mt-1 text-base font-semibold text-gray-900">
                  {formatInteger(result.preflight.estimatedInputTokens)}
                </div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Estimated Output Tokens</div>
                <div className="mt-1 text-base font-semibold text-gray-900">
                  {formatInteger(result.preflight.estimatedOutputTokens)}
                </div>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Vignette</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Conditions</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {result.preflight.vignettes.map((vignette) => (
                    <tr key={vignette.vignetteId}>
                      <td className="px-3 py-3 font-medium text-gray-900">{vignette.title}</td>
                      <td className="px-3 py-3 text-gray-700">{vignette.conditionCount}</td>
                      <td className="px-3 py-3 text-gray-600">{vignette.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{result.summary.title}</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Exact repeat agreement for each `(model, vignette, condition)` group using the latest three matching temp=0 trials.
                </p>
              </div>
              <div
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                  result.summary.status === 'INSUFFICIENT_DATA'
                    ? 'bg-gray-100 text-gray-700'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {result.summary.status === 'INSUFFICIENT_DATA' ? 'Insufficient Data' : 'Computed'}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Match Rate</div>
                <div className="mt-1 text-base font-semibold text-gray-900">{formatPercent(result.summary.matchRate)}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Difference Rate</div>
                <div className="mt-1 text-base font-semibold text-gray-900">{formatPercent(result.summary.differenceRate)}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Models Tested</div>
                <div className="mt-1 text-base font-semibold text-gray-900">{formatInteger(result.summary.modelsTested)}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Vignettes Tested</div>
                <div className="mt-1 text-base font-semibold text-gray-900">{formatInteger(result.summary.vignettesTested)}</div>
              </div>
            </div>

            {(result.summary.worstModelId || result.summary.worstModelMatchRate !== null) && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Worst model: {result.summary.worstModelLabel ?? result.summary.worstModelId ?? 'n/a'}
                {result.summary.worstModelMatchRate !== null && (
                  <span> ({formatPercent(result.summary.worstModelMatchRate)} match)</span>
                )}
              </div>
            )}

            <div className="mt-5 space-y-6">
              {vignetteGroups.map((group) => {
                const { attributeA, attributeB } = parseAttributes(group.vignetteTitle);
                const sortState = sortStateByVignette[group.vignetteId] ?? { key: 'model', direction: 'asc' };
                const sortedGroupRows = sortGroupRows(group.rows, sortState.key, sortState.direction);

                return (
                  <div key={group.vignetteId} className="rounded-lg border border-gray-200">
                    <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                      <h3 className="text-sm font-semibold text-gray-900">{group.vignetteTitle}</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-white">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto min-h-0 gap-1 px-0 py-0 text-gray-600 hover:bg-transparent hover:text-gray-900"
                                onClick={() => handleSort(group.vignetteId, 'model')}
                              >
                                <span>Model</span>
                                <span className="text-xs text-gray-400">
                                  {renderSortIndicator(sortState.key === 'model', sortState.direction)}
                                </span>
                              </Button>
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto min-h-0 gap-1 px-0 py-0 text-gray-600 hover:bg-transparent hover:text-gray-900"
                                onClick={() => handleSort(group.vignetteId, 'attributeA')}
                              >
                                <span>{attributeA}</span>
                                <span className="text-xs text-gray-400">
                                  {renderSortIndicator(sortState.key === 'attributeA', sortState.direction)}
                                </span>
                              </Button>
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto min-h-0 gap-1 px-0 py-0 text-gray-600 hover:bg-transparent hover:text-gray-900"
                                onClick={() => handleSort(group.vignetteId, 'attributeB')}
                              >
                                <span>{attributeB}</span>
                                <span className="text-xs text-gray-400">
                                  {renderSortIndicator(sortState.key === 'attributeB', sortState.direction)}
                                </span>
                              </Button>
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto min-h-0 gap-1 px-0 py-0 text-gray-600 hover:bg-transparent hover:text-gray-900"
                                onClick={() => handleSort(group.vignetteId, 'batch1')}
                              >
                                <span>Batch 1</span>
                                <span className="text-xs text-gray-400">
                                  {renderSortIndicator(sortState.key === 'batch1', sortState.direction)}
                                </span>
                              </Button>
                              <div className="text-xs font-normal text-gray-500">Decision code</div>
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto min-h-0 gap-1 px-0 py-0 text-gray-600 hover:bg-transparent hover:text-gray-900"
                                onClick={() => handleSort(group.vignetteId, 'batch2')}
                              >
                                <span>Batch 2</span>
                                <span className="text-xs text-gray-400">
                                  {renderSortIndicator(sortState.key === 'batch2', sortState.direction)}
                                </span>
                              </Button>
                              <div className="text-xs font-normal text-gray-500">Decision code</div>
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto min-h-0 gap-1 px-0 py-0 text-gray-600 hover:bg-transparent hover:text-gray-900"
                                onClick={() => handleSort(group.vignetteId, 'batch3')}
                              >
                                <span>Batch 3</span>
                                <span className="text-xs text-gray-400">
                                  {renderSortIndicator(sortState.key === 'batch3', sortState.direction)}
                                </span>
                              </Button>
                              <div className="text-xs font-normal text-gray-500">Decision code</div>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {sortedGroupRows.map((row) => {
                            const { levelA, levelB } = parseConditionLevels(row.conditionKey);

                            return (
                              <tr
                                key={`${row.modelId}-${row.vignetteId}-${row.conditionKey}`}
                                className={`cursor-pointer transition-colors ${
                                  row.mismatchType === 'decision_flip' ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-teal-50'
                                }`}
                                onClick={() => setSelectedRow({
                                  modelLabel: row.modelLabel,
                                  vignetteTitle: row.vignetteTitle,
                                  conditionKey: row.conditionKey,
                                  mismatchType: row.mismatchType,
                                  decisions: row.decisions,
                                })}
                              >
                                <td className="px-3 py-2 text-gray-900">{row.modelLabel}</td>
                                <td className="px-3 py-2 text-gray-700">{levelA}</td>
                                <td className="px-3 py-2 text-gray-700">{levelB}</td>
                                <td className="px-3 py-2 text-gray-700">{row.batch1 ?? 'n/a'}</td>
                                <td className="px-3 py-2 text-gray-700">{row.batch2 ?? 'n/a'}</td>
                                <td className="px-3 py-2 text-gray-700">{row.batch3 ?? 'n/a'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5">
            {orderError && <ErrorMessage message={`Failed to load order invariance: ${orderError.message}`} />}
            {orderFetching && !orderResult && <Loading text="Loading order invariance..." />}

            {orderResult && (
              <>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">{orderResult.summary.title}</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      Compare baseline vs flipped-order runs after normalizing the flipped decision back into baseline semantic orientation.
                    </p>
                  </div>
                  <div
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                      orderResult.summary.status === 'INSUFFICIENT_DATA'
                        ? 'bg-gray-100 text-gray-700'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {orderResult.summary.status === 'INSUFFICIENT_DATA' ? 'Insufficient Data' : 'Computed'}
                  </div>
                </div>

                {orderResult.note && (
                  <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    {orderResult.note}
                  </div>
                )}

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Match Rate</div>
                    <div className="mt-1 text-base font-semibold text-gray-900">{formatPercent(orderResult.summary.matchRate)}</div>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Difference Rate</div>
                    <div className="mt-1 text-base font-semibold text-gray-900">{formatPercent(orderResult.summary.differenceRate)}</div>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Models Tested</div>
                    <div className="mt-1 text-base font-semibold text-gray-900">{formatInteger(orderResult.summary.modelsTested)}</div>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Vignettes Tested</div>
                    <div className="mt-1 text-base font-semibold text-gray-900">{formatInteger(orderResult.summary.vignettesTested)}</div>
                  </div>
                </div>

                {(orderResult.summary.worstModelId || orderResult.summary.worstModelMatchRate !== null) && (
                  <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    Worst model: {orderResult.summary.worstModelLabel ?? orderResult.summary.worstModelId ?? 'n/a'}
                    {orderResult.summary.worstModelMatchRate !== null && (
                      <span> ({formatPercent(orderResult.summary.worstModelMatchRate)} match)</span>
                    )}
                  </div>
                )}

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Projected Prompts</div>
                    <div className="mt-1 text-base font-semibold text-gray-900">
                      {formatInteger(orderResult.preflight.projectedPromptCount)}
                    </div>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Projected Comparisons</div>
                    <div className="mt-1 text-base font-semibold text-gray-900">
                      {formatInteger(orderResult.preflight.projectedComparisons)}
                    </div>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Selected Signature</div>
                    <div className="mt-1 text-base font-semibold text-gray-900">
                      {orderResult.preflight.selectedSignature ?? 'n/a'}
                    </div>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Estimated Cost</div>
                    <div className="mt-1 text-base font-semibold text-gray-900">
                      {formatCurrency(orderResult.preflight.estimatedCostUsd)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Estimated Input Tokens</div>
                    <div className="mt-1 text-base font-semibold text-gray-900">
                      {formatInteger(orderResult.preflight.estimatedInputTokens)}
                    </div>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Estimated Output Tokens</div>
                    <div className="mt-1 text-base font-semibold text-gray-900">
                      {formatInteger(orderResult.preflight.estimatedOutputTokens)}
                    </div>
                  </div>
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Vignette</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Conditions</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Rationale</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {orderResult.preflight.vignettes.map((vignette) => (
                        <tr key={vignette.vignetteId}>
                          <td className="px-3 py-3 font-medium text-gray-900">{vignette.title}</td>
                          <td className="px-3 py-3 text-gray-700">{vignette.conditionCount}</td>
                          <td className="px-3 py-3 text-gray-600">{vignette.rationale}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {orderVignetteGroups.some((group) => group.rows.some((row) => row.baselineDecision !== null || row.flippedDecision !== null)) ? (
                  <div className="mt-5 space-y-6">
                    {orderVignetteGroups.map((group) => {
                      const rowsWithData = group.rows.filter((row) => row.baselineDecision !== null || row.flippedDecision !== null);
                      if (rowsWithData.length === 0) return null;

                      return (
                        <div key={group.vignetteId} className="rounded-lg border border-gray-200">
                          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                            <h3 className="text-sm font-semibold text-gray-900">{group.vignetteTitle}</h3>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                              <thead className="bg-white">
                                <tr>
                                  <th className="px-3 py-2 text-left font-medium text-gray-600">Model</th>
                                  <th className="px-3 py-2 text-left font-medium text-gray-600">Condition</th>
                                  <th className="px-3 py-2 text-left font-medium text-gray-600">Baseline</th>
                                  <th className="px-3 py-2 text-left font-medium text-gray-600">Flipped</th>
                                  <th className="px-3 py-2 text-left font-medium text-gray-600">Normalized Match</th>
                                  <th className="px-3 py-2 text-left font-medium text-gray-600">Reason</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 bg-white">
                                {rowsWithData.map((row) => (
                                  <tr
                                    key={`${row.modelId}-${row.vignetteId}-${row.conditionKey}`}
                                    className={`cursor-pointer transition-colors ${
                                      row.mismatchType === 'decision_flip'
                                        ? 'bg-red-50 hover:bg-red-100'
                                        : row.mismatchType === 'missing_pair'
                                          ? 'bg-amber-50 hover:bg-amber-100'
                                          : 'hover:bg-teal-50'
                                    }`}
                                    onClick={() => setSelectedRow({
                                      modelLabel: row.modelLabel,
                                      vignetteTitle: row.vignetteTitle,
                                      conditionKey: row.conditionKey,
                                      mismatchType: row.mismatchType,
                                      decisions: row.decisions,
                                    })}
                                  >
                                    <td className="px-3 py-2 text-gray-900">{row.modelLabel}</td>
                                    <td className="px-3 py-2 text-gray-700">{row.conditionKey}</td>
                                    <td className="px-3 py-2 text-gray-700">{row.baselineDecision ?? 'n/a'}</td>
                                    <td className="px-3 py-2 text-gray-700">{row.flippedDecision ?? 'n/a'}</td>
                                    <td className="px-3 py-2 text-gray-700">{row.isMatch ? 'Yes' : 'No'}</td>
                                    <td className="px-3 py-2 text-gray-700">
                                      {row.mismatchType === null ? 'Matched' : row.mismatchType === 'decision_flip' ? 'Decision changed after normalization' : 'Missing pair'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-5 rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                    No baseline/flipped comparison rows are available yet. Once tagged order-invariance runs are recorded, the pair-level table will appear here.
                  </div>
                )}
              </>
            )}
          </section>

          <section className="rounded-lg border border-dashed border-gray-300 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-900">`#287` Job-title invariance</h2>
            <p className="mt-2 text-sm text-gray-600">
              Placeholder for the generic-title rewrite comparison. This chunk only implements `#285`.
            </p>
          </section>
        </>
      )}

      <Modal
        isOpen={selectedRow !== null}
        onClose={() => setSelectedRow(null)}
        title={selectedRow ? `${selectedRow.modelLabel} · ${selectedRow.vignetteTitle}` : undefined}
        size="2xl"
      >
        {selectedRow && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              Condition: {selectedRow.conditionKey}
            </div>
            {selectedRow.mismatchType === 'missing_trial' && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                This condition needs more runs before all three batches are available. Existing transcript data is shown below.
              </div>
            )}
            {selectedRow.mismatchType === 'missing_pair' && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                This condition does not have both baseline and flipped runs yet. Any available transcript data is shown below.
              </div>
            )}
            {selectedRow.decisions.map((decision) => (
              <div key={decision.label} className="rounded-lg border border-gray-200">
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="text-sm font-semibold text-gray-900">
                    {decision.label} · Decision code {decision.decision ?? 'n/a'}
                  </div>
                  {decision.transcriptId && (
                    <div className="mt-1 text-xs text-gray-500">{decision.transcriptId}</div>
                  )}
                </div>
                <div className="p-4">
                  <pre className="whitespace-pre-wrap break-words text-sm text-gray-700">
                    {extractTranscriptText(decision.content) || 'Transcript not available for this batch.'}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

import { useState, type SVGProps } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, FileSearch } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { cn } from '../../lib/utils';
import { VALUE_LABELS } from './domainAnalysisData';

type CoverageCellProps = {
  valueA: string;
  valueB: string;
  batchEquivalent: number;
  aFirstBatchEquivalent: number;
  bFirstBatchEquivalent: number;
  aFirstDefinitionName: string | null;
  bFirstDefinitionName: string | null;
  weakestCondition: {
    conditionLabel: string;
    modelCounts: Array<{ modelId: string; label: string; trialCount: number }>;
    otherConditionsCount: number | null;
  } | null;
  contributingDefinitionIds: string[];
  definitionId: string | null;
  aggregateRunId: string | null;
};

function renderBar(count: number, maxCount: number): string {
  if (maxCount <= 0) return '0%';
  return `${Math.max(0, Math.min(100, (count / maxCount) * 100))}%`;
}

export function CoverageCell(props: CoverageCellProps) {
  const {
    valueA,
    valueB,
    batchEquivalent,
    aFirstBatchEquivalent,
    bFirstBatchEquivalent,
    aFirstDefinitionName,
    bFirstDefinitionName,
    weakestCondition,
    contributingDefinitionIds,
    definitionId,
    aggregateRunId,
  } = props;

  const [isOpen, setIsOpen] = useState(false);
  const isDiagonal = valueA === valueB;
  const hasVignette = definitionId !== null;
  const hasImbalance = aFirstBatchEquivalent !== bFirstBatchEquivalent;
  const visibleLabel = isDiagonal || !hasVignette ? '—' : batchEquivalent.toLocaleString();
  const xLabel = VALUE_LABELS[valueB as keyof typeof VALUE_LABELS] ?? valueB;
  const yLabel = VALUE_LABELS[valueA as keyof typeof VALUE_LABELS] ?? valueA;
  const directionALabel = aFirstDefinitionName ?? valueA;
  const directionBLabel = bFirstDefinitionName ?? valueB;
  const maxDirectionCount = Math.max(aFirstBatchEquivalent, bFirstBatchEquivalent, 1);
  const countForColor = batchEquivalent;

  let bgColorClass = 'bg-gray-50';
  if (isDiagonal) {
    bgColorClass =
      'bg-[url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxwYXRoIGQ9Ik0wLDggTDgsMCBMMCw4IFoiIHN0cm9rZT0iI2U1ZTdlYiIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9zdmc+")] bg-gray-100';
  } else if (!hasVignette) {
    bgColorClass = 'bg-gray-50';
  } else if (countForColor < 3) {
    bgColorClass = 'bg-rose-100 hover:bg-rose-200 transition-colors text-rose-900';
  } else if (countForColor < 10) {
    bgColorClass = 'bg-amber-100 hover:bg-amber-200 transition-colors text-amber-900';
  } else {
    bgColorClass = 'bg-emerald-500 hover:bg-emerald-600 transition-colors text-white';
  }

  const weakestDirectionName = aFirstBatchEquivalent < bFirstBatchEquivalent
    ? (aFirstDefinitionName ?? valueA)
    : (bFirstDefinitionName ?? valueB);
  const showWeakestCondition = hasVignette && weakestCondition !== null && aFirstBatchEquivalent !== bFirstBatchEquivalent;
  const batchEquivalentLabel = `${batchEquivalent} batch equivalent${batchEquivalent === 1 ? '' : 's'}`;
  const visibleTitle = isDiagonal
    ? 'Not applicable'
    : !hasVignette
      ? `${xLabel} versus ${yLabel}: no vignette`
      : `${xLabel} versus ${yLabel}: ${batchEquivalentLabel}`;

  const aFirstBarWidth = renderBar(aFirstBatchEquivalent, maxDirectionCount);
  const bFirstBarWidth = renderBar(bFirstBatchEquivalent, maxDirectionCount);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={isDiagonal}
          title={visibleTitle}
          aria-label={
            isDiagonal
              ? 'Not applicable'
              : !hasVignette
                ? `${xLabel} versus ${yLabel}: no vignette`
                : hasImbalance
                  ? `${xLabel} versus ${yLabel}: ${batchEquivalentLabel}; ${directionALabel} ${aFirstBatchEquivalent} batches; ${directionBLabel} ${bFirstBatchEquivalent} batches`
                  : `${xLabel} versus ${yLabel}: ${batchEquivalentLabel}`
          }
          className={cn(
            'relative w-full h-full min-h-[48px] p-2 flex flex-col items-center justify-center text-sm font-medium border rounded-none focus:ring-0 focus:ring-offset-0',
            hasImbalance ? 'border-orange-400 border-2' : 'border-gray-100',
            bgColorClass,
            isDiagonal && 'cursor-not-allowed text-transparent font-normal',
            !isDiagonal && !hasVignette && 'text-gray-500 cursor-pointer hover:bg-gray-100',
            hasVignette && countForColor < 3 && 'text-rose-900',
            hasVignette && countForColor >= 3 && countForColor < 10 && 'text-amber-900',
          )}
        >
          {visibleLabel}
        </button>
      </PopoverTrigger>
      {!isDiagonal && (
        <PopoverContent className="w-80 p-0 shadow-lg border-gray-200" align="center" sideOffset={5}>
          <div className="p-3 border-b border-gray-100 bg-gray-50/50 rounded-t-md">
            {hasVignette ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-xs">
                    ●
                  </span>
                  <span>{batchEquivalentLabel}</span>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_1fr_auto] items-center gap-2 text-xs text-gray-700">
                    <div className="truncate">{directionALabel}</div>
                    <div className="h-2 overflow-hidden rounded bg-gray-200">
                      <div
                        className="h-full rounded bg-teal-500"
                        style={{ width: aFirstBarWidth }}
                      />
                    </div>
                    <div className="font-medium tabular-nums text-gray-900">
                      {aFirstBatchEquivalent}
                    </div>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_1fr_auto] items-center gap-2 text-xs text-gray-700">
                    <div className="truncate">{directionBLabel}</div>
                    <div className="h-2 overflow-hidden rounded bg-gray-200">
                      <div
                        className="h-full rounded bg-teal-500"
                        style={{ width: bFirstBarWidth }}
                      />
                    </div>
                    <div className="font-medium tabular-nums text-gray-900">
                      {bFirstBatchEquivalent}
                    </div>
                  </div>
                </div>

                {showWeakestCondition && (
                  <div className="space-y-2 rounded border border-gray-200 bg-white p-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">Weakest condition</div>
                      <div className="text-xs text-gray-500">({weakestDirectionName})</div>
                    </div>

                    <div className="space-y-2">
                      {weakestCondition.modelCounts.map((model) => {
                        const maxModelCount = Math.max(
                          ...weakestCondition.modelCounts.map((entry) => entry.trialCount),
                          1,
                        );
                        return (
                          <div key={model.modelId} className="grid grid-cols-[minmax(0,1fr)_1fr_auto] items-center gap-2 text-xs text-gray-700">
                            <div className="truncate">{model.label}</div>
                            <div className="h-2 overflow-hidden rounded bg-gray-200">
                              <div
                                className="h-full rounded bg-teal-500"
                                style={{ width: renderBar(model.trialCount, maxModelCount) }}
                              />
                            </div>
                            <div className="font-medium tabular-nums text-gray-900">
                              {model.trialCount}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {weakestCondition.otherConditionsCount !== null && (
                      <div className="text-xs text-gray-500">
                        All other conditions: {weakestCondition.otherConditionsCount} per model
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-500">No batch for this value pair</div>
            )}
          </div>

          <div className="p-1 flex flex-col">
            {hasVignette && aggregateRunId !== null && (
              <Link
                to={`/analysis/${aggregateRunId}?tab=overview&mode=single&coverageBatchCount=${batchEquivalent}&coveragePairedBatchCount=${batchEquivalent}`}
                className="flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-sm w-full text-left"
                onClick={() => setIsOpen(false)}
              >
                <span className="flex items-center">
                  <FileSearch className="w-4 h-4 mr-2 text-gray-400" />
                  View Vignette Analysis
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
            )}

            {hasVignette && hasImbalance && definitionId !== null && (
              <Link
                to={`/definitions/${definitionId}/start-paired-batch`}
                state={{
                  returnLabel: 'Back to Value coverage',
                  returnTo: `${window.location.pathname}${window.location.search}`,
                  matchPairCounts: {
                    pairKey: `${valueA.toLowerCase()}::${valueB.toLowerCase()}`,
                    valueA,
                    valueB,
                    contributingDefinitionIds: contributingDefinitionIds.slice().sort((left, right) => left.localeCompare(right)),
                    launchDefinitionId: definitionId,
                    laggingDirection: aFirstBatchEquivalent <= bFirstBatchEquivalent ? valueA : valueB,
                    before: {
                      directionA: {
                        name: valueA,
                        batches: aFirstBatchEquivalent,
                        conditions: aFirstBatchEquivalent,
                      },
                      directionB: {
                        name: valueB,
                        batches: bFirstBatchEquivalent,
                        conditions: bFirstBatchEquivalent,
                      },
                    },
                  },
                }}
                className="flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-sm w-full text-left"
                onClick={() => setIsOpen(false)}
              >
                <span className="flex items-center">
                  <PlayIcon className="w-4 h-4 mr-2 text-orange-600" />
                  Match Pair Counts
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
            )}

            {hasVignette && definitionId !== null && (
              <Link
                to={`/definitions/${definitionId}/start-paired-batch`}
                state={{
                  returnLabel: 'Back to Value coverage',
                  returnTo: `${window.location.pathname}${window.location.search}`,
                }}
                className="flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-sm w-full text-left"
                onClick={() => setIsOpen(false)}
              >
                <span className="flex items-center">
                  <PlayIcon className="w-4 h-4 mr-2 text-teal-600" />
                  Start Paired Batch
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
            )}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

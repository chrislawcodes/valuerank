import { useState, type SVGProps } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, FileSearch } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { cn } from '../../lib/utils';
import { VALUE_LABELS } from './domainAnalysisData';
import { computeLaggingDirection } from '../../utils/coverageGap';

type CoverageModelBreakdownItem = {
  modelId: string;
  label: string;
  trialCount: number;
};

type CoverageCellProps = {
  valueA: string;
  valueB: string;
  batchCount: number;
  pairedBatchCount: number;
  orphanedBatchCount: number;
  aFirstBatchCount: number;
  bFirstBatchCount: number;
  pairedConditionCount: number;
  orphanedConditionCount: number;
  directionalCoverage: Array<{
    direction: string;
    completeBatches: number;
    filledSlots: number;
    leftoverConditions: number;
    definitionIds: string[];
  }>;
  contributingDefinitionIds: string[];
  incompleteBatchCount?: number | null;
  definitionId: string | null;
  aggregateRunId: string | null;
  modelBreakdown?: CoverageModelBreakdownItem[] | null;
};

function formatDirectionLabel(direction: string): string {
  const label = VALUE_LABELS[direction as keyof typeof VALUE_LABELS] ?? direction;
  return `${label}-first`;
}

function formatCountWord(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function CoverageCell(props: CoverageCellProps) {
  const {
    valueA,
    valueB,
    batchCount,
    pairedBatchCount,
    orphanedBatchCount,
    aFirstBatchCount,
    bFirstBatchCount,
    pairedConditionCount,
    orphanedConditionCount,
    directionalCoverage,
    contributingDefinitionIds,
    incompleteBatchCount,
    definitionId,
    aggregateRunId,
    modelBreakdown,
  } = props;
  const [isOpen, setIsOpen] = useState(false);
  const isDiagonal = valueA === valueB;
  const hasVignette = definitionId !== null;
  const hasIncompleteBatches = (incompleteBatchCount ?? 0) > 0;
  const displayCount = pairedBatchCount > 0 ? pairedBatchCount : batchCount;
  const coverageByDirection = new Map(
    directionalCoverage.map((coverage) => [coverage.direction, coverage] as const),
  );
  const directionA = coverageByDirection.get(valueA);
  const directionB = coverageByDirection.get(valueB);
  const filledSlotsA = directionA?.filledSlots ?? 0;
  const filledSlotsB = directionB?.filledSlots ?? 0;
  const hasImbalance =
    aFirstBatchCount !== bFirstBatchCount ||
    filledSlotsA !== filledSlotsB ||
    orphanedBatchCount > 0 ||
    orphanedConditionCount > 0;
  const laggingDirection = hasImbalance
    ? computeLaggingDirection({
        valueA,
        valueB,
        definitionId,
        directionalCoverage,
      })
    : null;
  const launchDefinitionId = laggingDirection?.definitionId ?? definitionId;
  const directionALabel = formatDirectionLabel(valueA);
  const directionBLabel = formatDirectionLabel(valueB);
  const visibleLabel = isDiagonal || !hasVignette ? '—' : displayCount.toLocaleString();
  const xLabel = VALUE_LABELS[valueB as keyof typeof VALUE_LABELS] ?? valueB;
  const yLabel = VALUE_LABELS[valueA as keyof typeof VALUE_LABELS] ?? valueA;
  const batchLabel = pairedBatchCount > 0
    ? (displayCount === 1 ? 'paired batch' : 'paired batches')
    : (displayCount === 1 ? 'batch' : 'batches');

  const countForColor = displayCount;

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

  let tooltipBreakdown: string | undefined;
  if (hasImbalance) {
    const directionLines = [
      `${directionALabel}: ${formatCountWord(aFirstBatchCount, 'batch', 'batches')}, ${formatCountWord(filledSlotsA, 'condition', 'conditions')}`,
      `${directionBLabel}: ${formatCountWord(bFirstBatchCount, 'batch', 'batches')}, ${formatCountWord(filledSlotsB, 'condition', 'conditions')}`,
    ];
    if (orphanedBatchCount > 0) {
      directionLines.push(formatCountWord(orphanedBatchCount, 'unpaired directional batch', 'unpaired directional batches'));
    }
    if (orphanedConditionCount > 0) {
      directionLines.push(formatCountWord(orphanedConditionCount, 'unpaired condition', 'unpaired conditions'));
    }
    tooltipBreakdown = directionLines.join('\n');
  } else if (modelBreakdown != null && modelBreakdown.length > 0) {
    tooltipBreakdown = modelBreakdown
      .map((b) => `${b.label}: ${b.trialCount} trial${b.trialCount === 1 ? '' : 's'}`)
      .join('\n');
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {/* eslint-disable-next-line react/forbid-elements */}
        <button
          type="button"
          disabled={isDiagonal}
          title={tooltipBreakdown}
          aria-label={
            isDiagonal
              ? 'Not applicable'
              : !hasVignette
                ? `${xLabel} versus ${yLabel}: no vignette`
                : hasImbalance
                  ? `${xLabel} versus ${yLabel}: ${displayCount} ${batchLabel}; ${directionALabel} ${aFirstBatchCount} batches, ${filledSlotsA} conditions; ${directionBLabel} ${bFirstBatchCount} batches, ${filledSlotsB} conditions`
                  : `${xLabel} versus ${yLabel}: ${displayCount} ${batchLabel}`
          }
          className={cn(
            'relative w-full h-full min-h-[48px] p-2 flex flex-col items-center justify-center text-sm font-medium border rounded-none focus:ring-0 focus:ring-offset-0',
            hasImbalance ? 'border-orange-400 border-2' : 'border-gray-100',
            bgColorClass,
            isDiagonal && 'cursor-not-allowed text-transparent font-normal',
            !isDiagonal && !hasVignette && 'text-gray-500 cursor-pointer hover:bg-gray-100',
            hasVignette && countForColor < 3 && 'text-rose-900',
            hasVignette && countForColor >= 3 && countForColor < 10 && 'text-amber-900'
          )}
        >
          {visibleLabel}
          {hasImbalance && (
            <span
              className="text-[10px] text-orange-600 font-normal leading-none mt-0.5"
              aria-label="direction imbalance across batches"
            >
              ⚠
            </span>
          )}
          {hasIncompleteBatches && (
            <span
              className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400"
              aria-label={`${incompleteBatchCount ?? 0} incomplete batch${(incompleteBatchCount ?? 0) === 1 ? '' : 'es'}`}
            />
          )}
        </button>
      </PopoverTrigger>
      {!isDiagonal && (
        <PopoverContent
          className="w-72 p-0 shadow-lg border-gray-200"
          align="center"
          sideOffset={5}
        >
          <div className="p-3 border-b border-gray-100 bg-gray-50/50 rounded-t-md">
            {hasVignette ? (
              <>
                <div className="mt-2 text-xs text-gray-600 flex items-center">
                  <span
                    className={cn(
                      'inline-block w-2 h-2 rounded-full mr-1.5',
                      countForColor < 3
                        ? 'bg-rose-500'
                        : countForColor < 10
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    )}
                  />
                  {displayCount} {batchLabel}
                </div>
                {hasImbalance && (
                  <div className="mt-2 rounded border border-orange-200 bg-orange-50 px-2 py-1.5 text-xs text-orange-900">
                    <div className="font-medium text-orange-800">Direction imbalance</div>
                    <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1">
                      <div />
                      <div className="text-right font-medium text-orange-700">Batches</div>
                      <div className="text-right font-medium text-orange-700">Conditions</div>
                      <div className="font-medium text-orange-900">{directionALabel}</div>
                      <div className="text-right font-medium">{aFirstBatchCount}</div>
                      <div className="text-right font-medium">{filledSlotsA}</div>
                      <div className="font-medium text-orange-900">{directionBLabel}</div>
                      <div className="text-right font-medium">{bFirstBatchCount}</div>
                      <div className="text-right font-medium">{filledSlotsB}</div>
                    </div>
                    {orphanedBatchCount > 0 && (
                      <div className="mt-2 text-[11px] text-orange-700">
                        {orphanedBatchCount} unpaired directional batch{orphanedBatchCount === 1 ? '' : 'es'}
                      </div>
                    )}
                    {orphanedConditionCount > 0 && (
                      <div className="mt-1 text-[11px] text-orange-700">
                        {orphanedConditionCount} unpaired condition{orphanedConditionCount === 1 ? '' : 's'}
                      </div>
                    )}
                  </div>
                )}
                {modelBreakdown != null && modelBreakdown.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      Transcripts
                    </div>
                    {modelBreakdown.map((b) => (
                      <div key={b.modelId} className="flex items-center justify-between text-xs text-gray-600">
                        <span className="truncate mr-2">{b.label}</span>
                        <span className="font-medium">{b.trialCount}</span>
                      </div>
                    ))}
                  </div>
                )}
                {hasIncompleteBatches && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                    {incompleteBatchCount ?? 0} incomplete batch{(incompleteBatchCount ?? 0) === 1 ? '' : 'es'} — not all transcripts generated
                  </div>
                )}
              </>
            ) : (
              <div className="mt-2 text-xs text-gray-500">No batch for this value pair</div>
            )}
          </div>

          <div className="p-1 flex flex-col">
            {hasVignette && aggregateRunId !== null && (
              <Link
                to={`/analysis/${aggregateRunId}?tab=overview&mode=single&coverageBatchCount=${batchCount}&coveragePairedBatchCount=${pairedBatchCount}`}
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

            {hasVignette && hasImbalance && aggregateRunId === null && launchDefinitionId !== null && (
              <Link
                to={`/definitions/${launchDefinitionId}/start-paired-batch`}
                state={{
                  returnLabel: 'Back to Value coverage',
                  returnTo: `${window.location.pathname}${window.location.search}`,
                  matchPairCounts: {
                    pairKey: `${valueA.toLowerCase()}::${valueB.toLowerCase()}`,
                    valueA,
                    valueB,
                    contributingDefinitionIds: contributingDefinitionIds.slice().sort((left, right) => left.localeCompare(right)),
                    launchDefinitionId,
                    laggingDirection: laggingDirection?.direction ?? (filledSlotsA <= filledSlotsB ? valueA : valueB),
                    before: {
                      directionA: {
                        name: valueA,
                        batches: aFirstBatchCount,
                        conditions: filledSlotsA,
                      },
                      directionB: {
                        name: valueB,
                        batches: bFirstBatchCount,
                        conditions: filledSlotsB,
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

            {hasVignette && (
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

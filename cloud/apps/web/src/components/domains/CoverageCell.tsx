import { useState, type SVGProps } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, FileSearch } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { cn } from '../../lib/utils';
import { VALUE_LABELS } from './domainAnalysisData';

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
  incompleteBatchCount?: number | null;
  definitionId: string | null;
  aggregateRunId: string | null;
  minTrialCount?: number | null;
  maxTrialCount?: number | null;
  modelBreakdown?: CoverageModelBreakdownItem[] | null;
};

export function CoverageCell({
  valueA,
  valueB,
  batchCount,
  pairedBatchCount,
  incompleteBatchCount,
  definitionId,
  aggregateRunId,
  minTrialCount,
  maxTrialCount,
  modelBreakdown,
}: CoverageCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isDiagonal = valueA === valueB;
  const hasVignette = definitionId !== null;
  const hasIncompleteBatches = (incompleteBatchCount ?? 0) > 0;
  const hasPerModelData = minTrialCount !== null && minTrialCount !== undefined;
  const displayCount = hasPerModelData ? minTrialCount : (pairedBatchCount > 0 ? pairedBatchCount : batchCount);
  const hasMismatch = hasPerModelData && maxTrialCount !== null && maxTrialCount !== undefined && minTrialCount < maxTrialCount;
  const visibleLabel = isDiagonal || !hasVignette ? '—' : displayCount.toLocaleString();
  const xLabel = VALUE_LABELS[valueB as keyof typeof VALUE_LABELS] ?? valueB;
  const yLabel = VALUE_LABELS[valueA as keyof typeof VALUE_LABELS] ?? valueA;
  const batchLabel = hasPerModelData
    ? (displayCount === 1 ? 'trial (min)' : 'trials (min)')
    : (pairedBatchCount > 0
      ? (displayCount === 1 ? 'paired batch' : 'paired batches')
      : (displayCount === 1 ? 'batch' : 'batches'));

  const countForColor = hasPerModelData ? minTrialCount : batchCount;

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

  const tooltipBreakdown = modelBreakdown != null && modelBreakdown.length > 0
    ? modelBreakdown.map((b) => `${b.label}: ${b.trialCount} trial${b.trialCount === 1 ? '' : 's'}`).join('\n')
    : undefined;

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
                : `${xLabel} versus ${yLabel}: ${displayCount} ${batchLabel}`
          }
          className={cn(
            'relative w-full h-full min-h-[48px] p-2 flex flex-col items-center justify-center text-sm font-medium border rounded-none focus:ring-0 focus:ring-offset-0',
            hasMismatch ? 'border-orange-400 border-2' : 'border-gray-100',
            bgColorClass,
            isDiagonal && 'cursor-not-allowed text-transparent font-normal',
            !isDiagonal && !hasVignette && 'text-gray-500 cursor-pointer hover:bg-gray-100',
            hasVignette && countForColor < 3 && 'text-rose-900',
            hasVignette && countForColor >= 3 && countForColor < 10 && 'text-amber-900'
          )}
        >
          {visibleLabel}
          {hasMismatch && (
            <span className="text-[10px] text-orange-600 font-normal leading-none mt-0.5" aria-label="trial count mismatch across models">
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
          className="w-64 p-0 shadow-lg border-gray-200"
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
                {modelBreakdown != null && modelBreakdown.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {modelBreakdown.map((b) => (
                      <div key={b.modelId} className="flex items-center justify-between text-xs text-gray-600">
                        <span className="truncate mr-2">{b.label}</span>
                        <span className={cn('font-medium', hasMismatch && b.trialCount === minTrialCount ? 'text-orange-600' : '')}>
                          {b.trialCount}
                        </span>
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

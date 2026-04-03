import { useState, type SVGProps } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, FileSearch } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';
import { cn } from '../../lib/utils';
import { VALUE_LABELS } from './domainAnalysisData';
import type { ModelTrialCount } from '../../api/operations/domainCoverage';

type CoverageCellProps = {
  valueA: string;
  valueB: string;
  batchCount: number;
  pairedBatchCount: number;
  definitionId: string | null;
  aggregateRunId: string | null;
  minTrialCount?: number | null;
  maxTrialCount?: number | null;
  modelTrialCounts?: ModelTrialCount[];
};

export function CoverageCell({
  valueA,
  valueB,
  batchCount,
  pairedBatchCount,
  definitionId,
  aggregateRunId,
  minTrialCount,
  maxTrialCount,
  modelTrialCounts = [],
}: CoverageCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isDiagonal = valueA === valueB;
  const hasVignette = definitionId !== null;

  // When per-model tracking is active (minTrialCount is not null), show min trial count
  // Otherwise fall back to legacy batch count display
  const hasPerModelData = minTrialCount !== null && minTrialCount !== undefined;
  const hasMismatch = hasPerModelData && maxTrialCount !== null && maxTrialCount !== undefined && minTrialCount < maxTrialCount;
  const displayCount = hasPerModelData
    ? minTrialCount
    : (pairedBatchCount > 0 ? pairedBatchCount : batchCount);
  const primaryCount = batchCount; // still used for color thresholds
  const visibleLabel = isDiagonal || !hasVignette ? '—' : displayCount.toLocaleString();
  const xLabel = VALUE_LABELS[valueB as keyof typeof VALUE_LABELS] ?? valueB;
  const yLabel = VALUE_LABELS[valueA as keyof typeof VALUE_LABELS] ?? valueA;
  const batchLabel = pairedBatchCount > 0
    ? (displayCount === 1 ? 'paired batch' : 'paired batches')
    : (displayCount === 1 ? 'batch' : 'batches');

  let bgColorClass = 'bg-gray-50';
  if (isDiagonal) {
    bgColorClass =
      'bg-[url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxwYXRoIGQ9Ik0wLDggTDgsMCBMMCw4IFoiIHN0cm9rZT0iI2U1ZTdlYiIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9zdmc+")] bg-gray-100';
  } else if (!hasVignette) {
    bgColorClass = 'bg-gray-50';
  } else if (primaryCount < 3) {
    bgColorClass = 'bg-rose-100 hover:bg-rose-200 transition-colors text-rose-900';
  } else if (primaryCount < 10) {
    bgColorClass = 'bg-amber-100 hover:bg-amber-200 transition-colors text-amber-900';
  } else {
    bgColorClass = 'bg-emerald-500 hover:bg-emerald-600 transition-colors text-white';
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {/* eslint-disable-next-line react/forbid-elements */}
        <button
          type="button"
          disabled={isDiagonal}
          aria-label={
            isDiagonal
              ? 'Not applicable'
              : !hasVignette
                ? `${xLabel} versus ${yLabel}: no vignette`
                : `${xLabel} versus ${yLabel}: ${displayCount} ${batchLabel}${hasMismatch ? ' (mismatch)' : ''}`
          }
          className={cn(
            'w-full h-full min-h-[48px] p-2 flex flex-col items-center justify-center text-sm font-medium border border-gray-100 rounded-none focus:ring-0 focus:ring-offset-0 relative',
            bgColorClass,
            isDiagonal && 'cursor-not-allowed text-transparent font-normal',
            !isDiagonal && !hasVignette && 'text-gray-500 cursor-pointer hover:bg-gray-100',
            hasVignette && primaryCount < 3 && 'text-rose-900',
            hasVignette && primaryCount >= 3 && primaryCount < 10 && 'text-amber-900'
          )}
        >
          {visibleLabel}
          {hasMismatch && !isDiagonal && (
            <AlertTriangle className="w-3 h-3 absolute top-1 right-1 text-amber-500" aria-hidden="true" />
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
                      primaryCount < 3
                        ? 'bg-rose-500'
                        : primaryCount < 10
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    )}
                  />
                  {displayCount} {batchLabel}
                  {hasMismatch && (
                    <span className="ml-1.5 text-amber-600 font-medium">(uneven)</span>
                  )}
                </div>
                {modelTrialCounts.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {modelTrialCounts.map((m) => (
                      <div key={m.modelId} className="flex items-center justify-between text-xs text-gray-600">
                        <span className="truncate mr-2 max-w-[140px]" title={m.label}>{m.label}</span>
                        <span className={cn(
                          'font-medium tabular-nums',
                          hasMismatch && m.trialCount === minTrialCount ? 'text-amber-600' : 'text-gray-700'
                        )}>
                          {m.trialCount}
                        </span>
                      </div>
                    ))}
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

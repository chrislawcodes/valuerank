import { type KeyboardEvent } from 'react';
import { Button } from '../ui/Button';
import { type ModelsAnalysisDomainBreakdown } from '../../api/operations/modelsAnalysis';
import { computeDots, computeWeightedMad, formatStabilityTooltip } from './stabilityDots';

type ModelsMatrixCellProps = {
  modelLabel: string;
  valueLabel: string;
  pooledWinRate: number | null;
  stabilityScore: number | null;
  eligibleDomainCount: number;
  domains: ModelsAnalysisDomainBreakdown[];
  hiddenByFilter?: boolean;
  singleDomainActive?: boolean;
  selected?: boolean;
  onClick: () => void;
};

function formatPercent(value: number): string {
  const rounded = value.toFixed(1);
  return rounded.endsWith('.0') ? `${rounded.slice(0, -2)}%` : `${rounded}%`;
}

function renderDots(score: number | null, muted: boolean): string {
  const states = computeDots(muted ? null : score);
  return states
    .map((state) => {
      switch (state) {
        case 'full':
          return '●';
        case 'half':
          return '◐';
        case 'empty':
          return '○';
        case 'muted':
          return '○';
        default:
          return '○';
      }
    })
    .join('');
}

export function ModelsMatrixCell({
  modelLabel,
  valueLabel,
  pooledWinRate,
  stabilityScore,
  eligibleDomainCount,
  domains,
  hiddenByFilter = false,
  singleDomainActive = false,
  selected = false,
  onClick,
}: ModelsMatrixCellProps) {
  const mad = computeWeightedMad(domains);
  const mutedDots = hiddenByFilter || stabilityScore == null || eligibleDomainCount < 2;
  const tooltip = hiddenByFilter
    ? 'Filtered out by the current stability visibility setting.'
    : formatStabilityTooltip(stabilityScore, eligibleDomainCount, mad, singleDomainActive);
  const primaryLabel = hiddenByFilter || pooledWinRate == null ? 'n/a' : formatPercent(pooledWinRate);
  const domainCountLabel = hiddenByFilter ? '—' : eligibleDomainCount > 0 ? `${eligibleDomainCount}d` : '—';
  const dots = renderDots(stabilityScore, mutedDots);
  const isClickable = !hiddenByFilter;

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isClickable) onClick();
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={isClickable ? onClick : undefined}
      onKeyDown={handleKeyDown}
      disabled={!isClickable}
      title={tooltip}
      aria-label={`${modelLabel} ${valueLabel}: ${tooltip}`}
      className={`flex h-full w-full flex-col items-center justify-center rounded-md border px-2 py-2 text-center transition-colors min-h-0 ${
        selected
          ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-200 hover:bg-teal-50'
          : isClickable
            ? 'border-gray-200 bg-white hover:border-teal-300 hover:bg-teal-50/50'
            : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed hover:bg-gray-50'
      }`}
    >
      <span className={`text-sm font-semibold ${hiddenByFilter || pooledWinRate == null ? 'text-gray-400' : 'text-gray-900'}`}>
        {primaryLabel}
      </span>
      <span className={`mt-1 flex items-center gap-1 font-mono text-[11px] ${mutedDots ? 'text-gray-400' : 'text-gray-700'}`}>
        <span aria-hidden="true">{dots}</span>
        <span>{domainCountLabel}</span>
      </span>
      <span className="sr-only">{tooltip}</span>
    </Button>
  );
}

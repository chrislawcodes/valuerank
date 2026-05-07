import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'urql';
import { X } from 'lucide-react';
import {
  DOMAIN_ANALYSIS_PAIR_DETAIL_QUERY,
  type DomainAnalysisPairDetailQueryResult,
  type DomainAnalysisPairDetailQueryVariables,
  type DomainAnalysisPairVignetteDetail,
} from '../../api/operations/domainAnalysis';
import { type ValueKey } from '../../data/domainAnalysisData';
import { Button } from '../ui/Button';
import { ErrorMessage } from '../ui/ErrorMessage';
import { ForestPlot, type ForestPlotRow, getPairLabel } from './ForestPlot';

type PairwiseCellDrawerProps = {
  open: boolean;
  rowValueKey: ValueKey | null;
  columnValueKey: ValueKey | null;
  modelId: string | null;
  domainId: string | null;
  signature: string | null;
  onClose: () => void;
};

type DeriveForestPlotRowsParams = {
  vignettes: DomainAnalysisPairVignetteDetail[];
  rowValueKey: ValueKey;
  columnValueKey: ValueKey;
  splitByDirection: boolean;
  expandedPairKeys: Set<string>;
};

function isUsableVignette(vignette: DomainAnalysisPairVignetteDetail): boolean {
  return vignette.totalTrials > 0 && vignette.selectedValueWinRate != null;
}

function directionLabel(direction: DomainAnalysisPairVignetteDetail['framingDirection']): string {
  return direction === 'A_TO_B' ? 'A→B' : 'B→A';
}

function buildPairKey(rowValueKey: ValueKey, columnValueKey: ValueKey): string {
  return `${rowValueKey}::${columnValueKey}`;
}

function createSplitRow(
  vignette: DomainAnalysisPairVignetteDetail,
  pairKey: string,
  indented: boolean,
): ForestPlotRow {
  return {
    pairKey,
    label: `${indented ? '- ' : ''}${vignette.definitionName} (${directionLabel(vignette.framingDirection)})`,
    framingDirection: vignette.framingDirection,
    pointEstimate: vignette.selectedValueWinRate ?? 0,
    ciLow: vignette.winRateCI95Low ?? null,
    ciHigh: vignette.winRateCI95High ?? null,
    bracketLow: null,
    bracketHigh: null,
    totalTrials: vignette.totalTrials,
    prioritized: vignette.prioritized,
    refusalRate: vignette.refusalRate ?? 0,
    definitionIds: [vignette.definitionId],
    directionGap: null,
    pairWarn: false,
  };
}

export function deriveForestPlotRows({
  vignettes,
  rowValueKey,
  columnValueKey,
  splitByDirection,
  expandedPairKeys,
}: DeriveForestPlotRowsParams): ForestPlotRow[] {
  const pairKey = buildPairKey(rowValueKey, columnValueKey);
  const usable = vignettes
    .filter(isUsableVignette)
    .sort((left, right) => left.framingDirection.localeCompare(right.framingDirection));

  if (usable.length === 0) {
    return [];
  }

  if (splitByDirection) {
    return usable.map((vignette) => createSplitRow(vignette, pairKey, false));
  }

  const aToB = usable.find((vignette) => vignette.framingDirection === 'A_TO_B') ?? null;
  const bToA = usable.find((vignette) => vignette.framingDirection === 'B_TO_A') ?? null;

  if (aToB == null || bToA == null) {
    const single = aToB ?? bToA;
    if (single == null) return [];

    return [
      {
        pairKey,
        label: `${single.definitionName} (${directionLabel(single.framingDirection)})`,
        framingDirection: 'AVERAGED',
        pointEstimate: single.selectedValueWinRate ?? 0,
        ciLow: single.winRateCI95Low ?? null,
        ciHigh: single.winRateCI95High ?? null,
        bracketLow: null,
        bracketHigh: null,
        totalTrials: single.totalTrials,
        prioritized: single.prioritized,
        refusalRate: single.refusalRate ?? 0,
        definitionIds: [single.definitionId],
        directionGap: null,
        pairWarn: false,
        directionEstimates: {
          aToB: aToB?.selectedValueWinRate ?? null,
          bToA: bToA?.selectedValueWinRate ?? null,
        },
      },
    ];
  }

  const aRate = aToB.selectedValueWinRate ?? 0;
  const bRate = bToA.selectedValueWinRate ?? 0;
  const directionGap = Math.abs(aRate - bRate) * 100;
  const averagedRow: ForestPlotRow = {
    pairKey,
    label: `Average across both directions for ${getPairLabel(rowValueKey, columnValueKey)}`,
    framingDirection: 'AVERAGED',
    pointEstimate: (aRate + bRate) / 2,
    ciLow: null,
    ciHigh: null,
    bracketLow: directionGap > 5 ? Math.min(aRate, bRate) : null,
    bracketHigh: directionGap > 5 ? Math.max(aRate, bRate) : null,
    totalTrials: aToB.totalTrials + bToA.totalTrials,
    prioritized: aToB.prioritized + bToA.prioritized,
    refusalRate: Math.max(aToB.refusalRate ?? 0, bToA.refusalRate ?? 0),
    definitionIds: [aToB.definitionId, bToA.definitionId],
    directionGap,
    pairWarn: directionGap > 15,
    directionEstimates: {
      aToB: aRate,
      bToA: bRate,
    },
  };

  if (!expandedPairKeys.has(pairKey)) {
    return [averagedRow];
  }

  return [
    averagedRow,
    createSplitRow(aToB, pairKey, true),
    createSplitRow(bToA, pairKey, true),
  ];
}

function formatPercent(value: number | null, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

function ForestPlotSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading forest plot">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-4">
          <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-3 flex-1 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

export function PairwiseCellDrawer({
  open,
  rowValueKey,
  columnValueKey,
  modelId,
  domainId,
  signature,
  onClose,
}: PairwiseCellDrawerProps) {
  const navigate = useNavigate();
  const [splitByDirection, setSplitByDirection] = useState(false);
  const [expandedPairKeys, setExpandedPairKeys] = useState<Set<string>>(new Set());
  const canQuery =
    open &&
    rowValueKey != null &&
    columnValueKey != null &&
    modelId != null &&
    domainId != null &&
    signature != null;

  const [{ data, fetching, error }, reexecuteQuery] = useQuery<
    DomainAnalysisPairDetailQueryResult,
    DomainAnalysisPairDetailQueryVariables
  >({
    query: DOMAIN_ANALYSIS_PAIR_DETAIL_QUERY,
    variables: {
      valueA: rowValueKey ?? '',
      valueB: columnValueKey ?? '',
      modelId: modelId ?? '',
      domainId: domainId ?? undefined,
      signature: signature ?? undefined,
    },
    pause: !canQuery,
    requestPolicy: 'cache-and-network',
  });

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setSplitByDirection(false);
    setExpandedPairKeys(new Set());
  }, [open, rowValueKey, columnValueKey, modelId, domainId, signature]);

  if (!open) return null;

  const detail = data?.domainAnalysisPairDetail ?? null;
  const title =
    rowValueKey != null && columnValueKey != null
      ? getPairLabel(rowValueKey, columnValueKey)
      : 'Pairwise detail';
  const rows =
    detail != null && rowValueKey != null && columnValueKey != null
      ? deriveForestPlotRows({
          vignettes: detail.vignettes,
          rowValueKey,
          columnValueKey,
          splitByDirection,
          expandedPairKeys,
        })
      : [];

  const handleToggleSplit = () => {
    setSplitByDirection((current) => !current);
    setExpandedPairKeys(new Set());
  };

  const handleExpandPair = (pairKey: string) => {
    setExpandedPairKeys((current) => {
      const next = new Set(current);
      if (next.has(pairKey)) next.delete(pairKey);
      else next.add(pairKey);
      return next;
    });
  };

  const handleRowClick = () => {
    if (rowValueKey == null || modelId == null || domainId == null) return;

    const params = new URLSearchParams({
      domainId,
      modelId,
      valueKey: rowValueKey,
    });
    if (signature != null && signature !== '') {
      params.set('signature', signature);
    }
    navigate(`/models/win-rate/value-detail?${params.toString()}`);
  };

  const content = (() => {
    if (fetching && detail == null) {
      return <ForestPlotSkeleton />;
    }

    if (error != null) {
      return (
        <div className="space-y-3">
          <ErrorMessage message={`Failed to load pair detail: ${error.message}`} />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => reexecuteQuery({ requestPolicy: 'network-only' })}
          >
            Retry
          </Button>
        </div>
      );
    }

    if (detail == null) {
      return <p className="text-sm text-gray-500">No pair detail returned.</p>;
    }

    if (detail.vignetteCount === 0) {
      return (
        <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          No data available for this pair under the current selection.
        </p>
      );
    }

    if (detail.vignetteCount > 0 && detail.validEstimateCount === 0) {
      return (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No usable scenarios for this pair — all vignettes had zero trials.
        </p>
      );
    }

    return (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mean</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">
              {formatPercent(detail.pooledMean ?? null)}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Range</div>
            <div className="mt-1 text-sm font-medium text-gray-900">
              {`${formatPercent(detail.pooledMin ?? null)} to ${formatPercent(detail.pooledMax ?? null)}`}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Usable scenarios</div>
            <div className="mt-1 text-2xl font-semibold text-gray-900">{detail.validEstimateCount}</div>
          </div>
        </div>

        {detail.validEstimateCount === 1 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            n = 1, treat with caution
          </p>
        )}

        <ForestPlot
          rows={rows}
          pooledMin={detail.pooledMin ?? null}
          pooledMean={detail.pooledMean ?? null}
          pooledMax={detail.pooledMax ?? null}
          pooledStdDev={detail.pooledStdDev ?? null}
          splitByDirection={splitByDirection}
          onToggleSplit={handleToggleSplit}
          onRowClick={handleRowClick}
          onRowExpandPair={handleExpandPair}
          expandedPairKeys={expandedPairKeys}
          validEstimateCount={detail.validEstimateCount}
        />

        <section className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <h3 className="text-sm font-semibold text-gray-900">Method note</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Each row shows how often the row value beat the column value for one vignette direction.</li>
            <li>The dashed line at 50% marks an even split between the two values.</li>
            <li>Confidence intervals are Wilson intervals for each vignette, not a pooled interval across vignettes.</li>
            <li>The summary band shows the min, mean, and max across usable vignettes for this cell.</li>
          </ul>
        </section>
      </div>
    );
  })();

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-4xl flex-col border-l border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-600">
              {detail?.modelLabel ?? modelId ?? 'Selected model'}
              {' · '}
              {detail?.domainName ?? 'Selected domain'}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close pairwise detail drawer"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">{content}</div>
      </aside>
    </div>,
    document.body,
  );
}

export type { PairwiseCellDrawerProps };

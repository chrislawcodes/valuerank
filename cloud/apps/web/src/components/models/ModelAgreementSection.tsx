import { useEffect, useRef, useState } from 'react';
import { ErrorMessage } from '../ui/ErrorMessage';
import { useModelAgreementOnTradeoffsQuery } from '../../generated/graphql';
import { PairwiseAgreementMatrixReport } from './PairwiseAgreementMatrixReport';
import { ModelTrialConsistencyReport } from './ModelTrialConsistencyReport';
import { PairwiseDivergenceDrilldownReport } from './PairwiseDivergenceDrilldownReport';
import type { ModelAgreementOnTradeoffsQuery } from '../../generated/graphql';
import { formatQueryError } from '../../utils/urqlError';

type PairwiseAgreementRow = ModelAgreementOnTradeoffsQuery['modelAgreementOnTradeoffs']['pairwiseAgreementMatrix'][number];

type Props = {
  modelIds: string[];
  scope: 'DOMAIN' | 'ALL_DOMAINS';
  domainId: string | null;
  signature: string;
};

type SelectedPair = {
  modelAId: string;
  modelBId: string;
};

const MIN_DRILLDOWN_DEFAULT_CELLS = 10;
const AGREEMENT_POLL_INTERVAL_MS = 5000;
const EMPTY_PAIRWISE_ROWS: PairwiseAgreementRow[] = [];

function formatSelectedPair(pair: SelectedPair | null): string | null {
  return pair == null ? null : `${pair.modelAId}::${pair.modelBId}`;
}

function pickDefaultPair(rows: readonly PairwiseAgreementRow[]): SelectedPair | null {
  if (rows.length === 0) {
    return null;
  }

  const supportedRows = rows.filter((row) => row.totalCells >= MIN_DRILLDOWN_DEFAULT_CELLS);
  const candidates = supportedRows.length > 0 ? supportedRows : rows;

  const sorted = [...candidates].sort((left, right) => {
    if (supportedRows.length > 0) {
      const divergenceDelta = (right.meanAbsoluteDivergence ?? -Infinity) - (left.meanAbsoluteDivergence ?? -Infinity);
      if (divergenceDelta !== 0) {
        return divergenceDelta;
      }
      const cellsDelta = right.totalCells - left.totalCells;
      if (cellsDelta !== 0) {
        return cellsDelta;
      }
    } else {
      const cellsDelta = right.totalCells - left.totalCells;
      if (cellsDelta !== 0) {
        return cellsDelta;
      }
      const divergenceDelta = (right.meanAbsoluteDivergence ?? -Infinity) - (left.meanAbsoluteDivergence ?? -Infinity);
      if (divergenceDelta !== 0) {
        return divergenceDelta;
      }
    }

    const labelDelta = left.modelALabel.localeCompare(right.modelALabel);
    return labelDelta !== 0 ? labelDelta : left.modelBLabel.localeCompare(right.modelBLabel);
  });

  const next = sorted[0];
  return next == null ? null : { modelAId: next.modelAId, modelBId: next.modelBId };
}

function buildExclusionNote(excludedNonBinaryCells: number, tiedCells: number): string | null {
  const parts: string[] = [];
  if (excludedNonBinaryCells > 0) {
    parts.push(
      `Excluded ${excludedNonBinaryCells} non-binary cell${excludedNonBinaryCells === 1 ? '' : 's'} from the agreement matrix.`,
    );
  }
  if (tiedCells > 0) {
    parts.push(
      `${tiedCells} cell${tiedCells === 1 ? '' : 's'} had at least one model split 50/50 (counted as a third category in kappa, not excluded).`,
    );
  }
  return parts.length === 0 ? null : parts.join(' ');
}

function buildUnavailableModelsNotice(
  unavailableModels: ModelAgreementOnTradeoffsQuery['modelAgreementOnTradeoffs']['unavailableModels'],
): string | null {
  if (unavailableModels.length === 0) {
    return null;
  }

  return `Unavailable models: ${unavailableModels.map((model) => `${model.label} (${model.reason})`).join(', ')}.`;
}

function formatProgressLabel(progress: {
  completedRuns: number;
  totalRuns: number;
  currentRunId?: string | null;
  updatedAt: string;
}): string {
  const totalRuns = progress.totalRuns;
  const completedRuns = Math.min(progress.completedRuns, totalRuns);
  const currentRunNote = progress.currentRunId != null ? ` Currently on ${progress.currentRunId.slice(-8)}.` : '';
  return `${completedRuns.toLocaleString()} of ${totalRuns.toLocaleString()} source runs processed.${currentRunNote}`;
}

function getProgressPercent(progress: {
  completedRuns: number;
  totalRuns: number;
}): number {
  if (progress.totalRuns <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((Math.min(progress.completedRuns, progress.totalRuns) / progress.totalRuns) * 100));
}

function BuildStatusCard({
  title,
  message,
  progress,
}: {
  title: string;
  message: string;
  progress: {
    completedRuns: number;
    totalRuns: number;
    currentRunId?: string | null;
    updatedAt: string;
  } | null;
}): JSX.Element {
  const percent = progress != null ? getProgressPercent(progress) : null;

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 md:p-5">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="space-y-2">
        <p className="text-sm text-gray-700">{message}</p>
        {progress != null ? (
          <>
            <p className="text-sm font-medium text-gray-900">{formatProgressLabel(progress)}</p>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-teal-500 transition-[width] duration-300"
                style={{ width: `${percent ?? 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              Last updated {new Date(progress.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}

export function ModelAgreementSection({ modelIds, scope, domainId, signature }: Props): JSX.Element {
  const [{ data, fetching, error }, reexecuteQuery] = useModelAgreementOnTradeoffsQuery({
    variables: {
      modelIds,
      domainId: domainId ?? undefined,
      scope,
      signature,
    },
    requestPolicy: 'cache-and-network',
    pause: signature.trim() === '' || (scope === 'DOMAIN' && domainId == null),
  });

  const agreement = data?.modelAgreementOnTradeoffs ?? null;
  const rows = agreement?.pairwiseAgreementMatrix ?? EMPTY_PAIRWISE_ROWS;
  const [selectedPair, setSelectedPair] = useState<SelectedPair | null>(null);
  const selectedPairKey = formatSelectedPair(selectedPair);
  const isFetchingRef = useRef(fetching);

  useEffect(() => {
    isFetchingRef.current = fetching;
  }, [fetching]);

  useEffect(() => {
    if (agreement == null || !agreement.pending) {
      return;
    }

    const interval = window.setInterval(() => {
      if (!isFetchingRef.current) {
        reexecuteQuery({ requestPolicy: 'network-only' });
      }
    }, AGREEMENT_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [agreement, reexecuteQuery]);

  useEffect(() => {
    if (rows.length === 0) {
      if (selectedPairKey != null) {
        setSelectedPair(null);
      }
      return;
    }

    const currentStillExists =
      selectedPair != null
      && rows.some((row) => row.modelAId === selectedPair.modelAId && row.modelBId === selectedPair.modelBId);

    if (currentStillExists) {
      return;
    }

    const next = pickDefaultPair(rows);
    const nextKey = formatSelectedPair(next);
    if (selectedPairKey !== nextKey) {
      setSelectedPair(next);
    }
  }, [rows, selectedPair, selectedPairKey]);

  if (error != null) {
    return (
      <ErrorMessage
        message={formatQueryError('Model agreement query', error, {
          scope,
          domainId: domainId ?? 'all',
          signature,
          modelCount: modelIds.length,
        })}
      />
    );
  }

  if (fetching && agreement == null) {
    return (
      <BuildStatusCard
        title="Model Agreement on Value Tradeoffs"
        message="Preparing the model agreement report."
        progress={null}
      />
    );
  }

  if (agreement == null) {
    return (
      <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 md:p-5">
        <h2 className="text-lg font-semibold text-gray-900">Model Agreement on Value Tradeoffs</h2>
        <p className="text-sm text-gray-600">No model agreement data is available for the current selection.</p>
      </section>
    );
  }

  if (agreement.pending) {
    return (
      <BuildStatusCard
        title="Model Agreement on Value Tradeoffs"
        message="The model agreement report is building."
        progress={agreement.buildProgress ?? null}
      />
    );
  }

  const exclusionNote = buildExclusionNote(agreement.excludedNonBinaryCells, agreement.tiedCells);
  const unavailableModelsNotice = buildUnavailableModelsNotice(agreement.unavailableModels);

  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Model Agreement on Value Tradeoffs</h2>
        {unavailableModelsNotice != null ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {unavailableModelsNotice}
          </p>
        ) : null}
      </div>

      <PairwiseAgreementMatrixReport
        rows={rows}
        selectedPair={selectedPair}
        onPairSelect={setSelectedPair}
      />

      {exclusionNote != null ? (
        <p className="text-xs leading-5 text-gray-500">{exclusionNote}</p>
      ) : null}

      <ModelTrialConsistencyReport rows={agreement.trialConsistency} />

      <PairwiseDivergenceDrilldownReport
        selectedPair={selectedPair}
        scope={scope}
        domainId={domainId}
        signature={signature}
      />
    </section>
  );
}

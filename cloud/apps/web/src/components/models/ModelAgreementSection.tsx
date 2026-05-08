import { useEffect, useState } from 'react';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Loading } from '../ui/Loading';
import { useModelAgreementOnTradeoffsQuery } from '../../generated/graphql';
import { PairwiseAgreementMatrixReport } from './PairwiseAgreementMatrixReport';
import { ModelTrialConsistencyReport } from './ModelTrialConsistencyReport';
import { PairwiseDivergenceDrilldownReport } from './PairwiseDivergenceDrilldownReport';
import type { ModelAgreementOnTradeoffsQuery } from '../../generated/graphql';

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

function buildExclusionNote(excludedNonBinaryCells: number, excludedTiedCells: number): string | null {
  const parts: string[] = [];
  if (excludedNonBinaryCells > 0) {
    parts.push(`${excludedNonBinaryCells} non-binary cell${excludedNonBinaryCells === 1 ? '' : 's'}`);
  }
  if (excludedTiedCells > 0) {
    parts.push(`${excludedTiedCells} tied cell${excludedTiedCells === 1 ? '' : 's'}`);
  }
  if (parts.length === 0) {
    return null;
  }
  return `Excluded ${parts.join(' and ')} from the agreement matrix.`;
}

function buildUnavailableModelsNotice(
  unavailableModels: ModelAgreementOnTradeoffsQuery['modelAgreementOnTradeoffs']['unavailableModels'],
): string | null {
  if (unavailableModels.length === 0) {
    return null;
  }

  return `Unavailable models: ${unavailableModels.map((model) => `${model.label} (${model.reason})`).join(', ')}.`;
}

export function ModelAgreementSection({ modelIds, scope, domainId, signature }: Props): JSX.Element {
  const [{ data, fetching, error }] = useModelAgreementOnTradeoffsQuery({
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
    return <ErrorMessage message={error.message} />;
  }

  if (fetching && agreement == null) {
    return <Loading size="lg" text="Loading model agreement report..." />;
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
    return <Loading size="lg" text="Model agreement report is building..." />;
  }

  const exclusionNote = buildExclusionNote(agreement.excludedNonBinaryCells, agreement.excludedTiedCells);
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

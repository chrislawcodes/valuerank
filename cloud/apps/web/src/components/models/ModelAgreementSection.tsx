import { useEffect, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { Button } from '../ui/Button';
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
  const [showHelp, setShowHelp] = useState(false);
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
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="text-lg font-semibold text-gray-900">Model Agreement on Value Tradeoffs</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHelp((value) => !value)}
            className="h-8 w-8 text-gray-500 hover:text-gray-700"
            aria-label={showHelp ? 'Hide model agreement explanation' : 'Show model agreement explanation'}
          >
            {showHelp ? <X className="h-8 w-8" /> : <HelpCircle className="h-8 w-8" />}
          </Button>
        </div>
        {showHelp ? (
          <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-gray-700">
            <p>
              This number, <strong>Cohen&apos;s kappa</strong>, tells you how often two models reach the same conclusion
              on the same vignette cells — adjusted for how often they&apos;d agree by chance alone. It runs from −1 to
              +1. Positive means the two models tend to make the same choices; zero means their agreement is no better
              than coincidence; negative means they actively pick opposite values.
            </p>
            <div>
              <p className="mb-1 font-semibold text-gray-800">What a &quot;cell&quot; is</p>
              <p>
                Every vignette tests a specific value pair — for example, Conformity vs Universalism. Within that
                vignette, the same tradeoff is presented at multiple intensity combinations (one value at a higher
                pressure, the other at a lower pressure, and so on). Each unique intensity combination is a{' '}
                <strong>cell</strong>. Each cell gets sent to the model multiple times across runs, producing a series
                of <strong>trials</strong>. So one cell has multiple trials, one vignette has multiple cells, and one
                value pair has multiple vignettes.
              </p>
            </div>
            <div>
              <p className="mb-1 font-semibold text-gray-800">How a model&apos;s lean on a cell is computed</p>
              <p>
                For each cell, we look at the model&apos;s trials and ask: across those attempts, which side did the
                model lean toward? A neutral trial is treated as halfway between the two values — it counts as half
                a vote for each side. So a model that picked value A on 4 trials, value B on 0 trials, and was
                neutral on 2 trials has a lean score of (4 + 1) / 6 ≈ 83% toward A.
              </p>
              <p className="mt-2">That lean score sorts the cell into one of three categories:</p>
              <ul className="ml-4 mt-1 list-disc space-y-0.5">
                <li><strong>A</strong> — leaned more than halfway toward the alphabetically-first value</li>
                <li><strong>TIED</strong> — landed at exactly 50/50, no preference (covers both all-neutral cells and cells where decisive picks split evenly)</li>
                <li><strong>B</strong> — leaned more than halfway toward the alphabetically-second value</li>
              </ul>
            </div>
            <div>
              <p className="mb-1 font-semibold text-gray-800">How agreement gets scored across cells</p>
              <p>
                Agreement on each cell is rated on a soft scale rather than a binary match/mismatch:
              </p>
              <ul className="ml-4 mt-1 list-disc space-y-0.5">
                <li>Both on the same category → <strong>1.0</strong> (full agreement)</li>
                <li>One A and one TIED, or one TIED and one B → <strong>0.5</strong> (soft disagreement — one leaned, the other was uncommitted)</li>
                <li>One A and one B → <strong>0.0</strong> (hard disagreement — they picked opposite sides)</li>
              </ul>
              <p className="mt-2">
                The reason for the soft middle case: TIED genuinely sits between A and B on a 1-2-3 scale. When one
                model says &quot;lean A&quot; and the other says &quot;no opinion,&quot; that&apos;s a smaller gap than
                when one says &quot;lean A&quot; and the other says &quot;lean B.&quot;
              </p>
            </div>
            <div>
              <p className="mb-1 font-semibold text-gray-800">Chance correction</p>
              <p>
                A naive percent-agreement would inflate scores when models happen to share a preference (if both lean
                A on most cells, they&apos;d &quot;agree&quot; a lot just by luck). Cohen&apos;s kappa subtracts the
                agreement that would be expected from each model&apos;s overall mix of A / TIED / B across all cells.
                The remaining agreement is the part that comes from genuinely making the same choices on the same
                cells.
              </p>
            </div>
            <div>
              <p className="mb-1 font-semibold text-gray-800">How to read the result</p>
              <ul className="ml-4 list-disc space-y-0.5">
                <li><strong>&lt; 0 — Poor</strong>: worse than chance, the models systematically disagree</li>
                <li><strong>0 to 0.2 — Slight</strong>: barely above chance</li>
                <li><strong>0.2 to 0.4 — Fair</strong>: some real signal of agreement</li>
                <li><strong>0.4 to 0.6 — Moderate</strong>: reliable agreement</li>
                <li><strong>0.6 to 0.8 — Substantial</strong>: strong agreement on the same choices</li>
                <li><strong>0.8 to 1.0 — Near-perfect</strong>: the two models almost always make the same call</li>
              </ul>
            </div>
            <div>
              <p className="mb-1 font-semibold text-gray-800">Per-domain spread</p>
              <p>
                We test each value pair across multiple domains (for example, Job Choice and National Priorities).
                Per-domain spread shows the difference between the highest and lowest per-domain kappa for a model
                pair. A small spread (under 0.30) means the agreement is consistent across contexts. A larger spread
                (flagged with ⚠) means the answer depends on which domain you&apos;re looking at.
              </p>
            </div>
            <p>
              Aggregation is equal-weighted at every level: each cell counts the same regardless of trial count, each
              vignette the same regardless of cell count, and each value pair the same regardless of vignette count.
            </p>
          </div>
        ) : null}
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

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'urql';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Loading } from '../ui/Loading';
import { Button } from '../ui/Button';
import { TranscriptList } from '../runs/TranscriptList';
import { TranscriptViewer } from '../runs/TranscriptViewer';
import type { Transcript } from '../../api/operations/runs';
import {
  LAUNCH_ORDER_INVARIANCE_MUTATION,
  ORDER_INVARIANCE_LAUNCH_STATUS_QUERY,
  ORDER_INVARIANCE_QUERY,
  ORDER_INVARIANCE_REVIEW_QUERY,
  ORDER_INVARIANCE_TRANSCRIPTS_QUERY,
  REVIEW_ORDER_INVARIANCE_PAIR_MUTATION,
  type LaunchOrderInvarianceResult,
  type LaunchOrderInvarianceVariables,
  type OrderInvarianceLaunchStatusQueryResult,
  type OrderInvarianceLaunchStatusQueryVariables,
  type OrderInvarianceQueryResult,
  type OrderInvarianceQueryVariables,
  type OrderInvarianceRow,
  type OrderInvarianceReviewVignette,
  type OrderInvarianceReviewQueryResult,
  type OrderInvarianceReviewStatus,
  type OrderInvarianceTranscriptsQueryResult,
  type OrderInvarianceTranscriptsQueryVariables,
  type ReviewOrderInvariancePairResult,
  type ReviewOrderInvariancePairVariables,
} from '../../api/operations/order-invariance';

const ENABLE_2X2_ORDER_EFFECT_UI = true;
const ORDER_INVARIANCE_LAUNCH_STORAGE_KEY = 'valuerank:order-invariance-launch-run-ids';
const ORDER_INVARIANCE_LAUNCH_POLL_MS = 4000;

function formatPercent(value: number | null): string {
  if (value == null) {
    return 'n/a';
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatMAD(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toFixed(2);
}

function formatProgressCount(value: number): string {
  return value.toLocaleString();
}

function getScaleEffectColor(value: number | null | undefined): string {
  if (value == null) return 'text-gray-900';
  if (value > 1.00) return 'text-red-600 font-bold';
  if (value > 0.50) return 'text-amber-600 font-semibold';
  return 'text-green-700';
}

function getVariantAxes(variantType: string | null | undefined): {
  narrativeOrder: 'baseline' | 'flipped';
  scaleOrder: 'baseline' | 'flipped';
} {
  if (variantType === 'fully_flipped') {
    return {
      narrativeOrder: 'flipped',
      scaleOrder: 'flipped',
    };
  }
  if (variantType === 'scale_flipped') {
    return {
      narrativeOrder: 'baseline',
      scaleOrder: 'flipped',
    };
  }
  if (variantType === 'presentation_flipped') {
    return {
      narrativeOrder: 'flipped',
      scaleOrder: 'baseline',
    };
  }
  return {
    narrativeOrder: 'baseline',
    scaleOrder: 'baseline',
  };
}

function getAxisBadgeClass(state: 'baseline' | 'flipped'): string {
  if (state === 'baseline') {
    return 'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700 bg-emerald-100';
  }
  return 'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-indigo-700 bg-indigo-100';
}

function getVariantSideLabel(variantType: string | null | undefined): string {
  if (variantType === 'scale_flipped') return 'Scale Order Flipped';
  if (variantType === 'presentation_flipped') return 'Narrative Order Flipped';
  if (variantType === 'fully_flipped') return 'Narrative + Scale Flipped';
  return 'Flipped';
}

function formatDateTime(value: string | null): string {
  if (value == null) {
    return 'Not reviewed';
  }
  return new Date(value).toLocaleString();
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

function parseAttributeLabels(vignetteTitle: string): { attributeA: string; attributeB: string } {
  const match = vignetteTitle.match(/\((.+?)\s+vs\s+(.+?)\)$/);
  if (!match) {
    return { attributeA: 'A Level', attributeB: 'B Level' };
  }

  return {
    attributeA: match[1]?.trim() ?? 'A Level',
    attributeB: match[2]?.trim() ?? 'B Level',
  };
}

function groupRowsByVignette(rows: OrderInvarianceRow[]): Array<{
  vignetteId: string;
  vignetteTitle: string;
  rows: OrderInvarianceRow[];
}> {
  const groups = new Map<string, { vignetteId: string; vignetteTitle: string; rows: OrderInvarianceRow[] }>();

  for (const row of rows) {
    const existing = groups.get(row.vignetteId);
    if (existing != null) {
      existing.rows.push(row);
      continue;
    }
    groups.set(row.vignetteId, {
      vignetteId: row.vignetteId,
      vignetteTitle: row.vignetteTitle,
      rows: [row],
    });
  }

  return Array.from(groups.values()).sort((left, right) => left.vignetteTitle.localeCompare(right.vignetteTitle));
}

function getReviewStatusBadge(status: OrderInvarianceReviewStatus): string {
  if (status === 'APPROVED') {
    return 'rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700';
  }
  if (status === 'REJECTED') {
    return 'rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700';
  }
  return 'rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700';
}

function getDraftNote(
  noteDrafts: Record<string, string>,
  vignette: OrderInvarianceReviewVignette
): string {
  return noteDrafts[vignette.pairId] ?? vignette.reviewNotes ?? '';
}

type TranscriptDrilldownModalProps = {
  row: OrderInvarianceRow;
  directionOnly: boolean;
  trimOutliers: boolean;
  onClose: () => void;
};

function TranscriptDrilldownModal({
  row,
  directionOnly,
  trimOutliers,
  onClose,
}: TranscriptDrilldownModalProps) {
  const [selectedTranscript, setSelectedTranscript] = useState<Transcript | null>(null);
  const [{ data, fetching, error }] = useQuery<
    OrderInvarianceTranscriptsQueryResult,
    OrderInvarianceTranscriptsQueryVariables
  >({
    query: ORDER_INVARIANCE_TRANSCRIPTS_QUERY,
    variables: {
      vignetteId: row.vignetteId,
      modelId: row.modelId,
      conditionKey: row.conditionKey,
    },
    requestPolicy: 'network-only',
  });

  const transcriptResult = data?.assumptionsOrderInvarianceTranscripts;
  const dimensionLabels = useMemo(() => ({
    attributeALevel: transcriptResult?.attributeALabel ?? 'A Level',
    attributeBLevel: transcriptResult?.attributeBLabel ?? 'B Level',
    orderLabel: 'Prompt Order',
  }), [transcriptResult?.attributeALabel, transcriptResult?.attributeBLabel]);
  const scenarioDimensions = useMemo(() => {
    if (!transcriptResult) {
      return {};
    }

    return transcriptResult.transcripts.reduce<Record<string, Record<string, string | number>>>((acc, transcript) => {
      acc[transcript.scenarioId] = {
        attributeALevel: transcript.attributeALevel ?? 'n/a',
        attributeBLevel: transcript.attributeBLevel ?? 'n/a',
        orderLabel: transcript.orderLabel,
      };
      return acc;
    }, {});
  }, [transcriptResult]);
  const attributeLabels = parseAttributeLabels(row.vignetteTitle);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">{row.vignetteTitle}</h3>
            <p className="mt-1 text-sm text-gray-600">
              {row.modelLabel} · {attributeLabels.attributeA}: {parseConditionLevels(row.conditionKey).levelA} · {attributeLabels.attributeB}: {parseConditionLevels(row.conditionKey).levelB}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {directionOnly ? 'Direction match' : 'Exact match'}: {row.isMatch == null ? 'Insufficient data' : row.isMatch ? 'Yes' : 'No'}
              {' '}· Baseline {trimOutliers ? 'Trimmed 3' : 'All 5'}: {row.majorityVoteBaseline ?? 'n/a'}
              {' '}· Flipped {trimOutliers ? 'Trimmed 3' : 'All 5'}: {row.majorityVoteFlipped ?? 'n/a'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close transcript list">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {fetching && !transcriptResult && (
            <Loading size="sm" text="Loading transcripts..." />
          )}
          {error && (
            <ErrorMessage message={error.message} />
          )}
          {!fetching && !error && transcriptResult && transcriptResult.transcripts.length === 0 && (
            <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
              No transcripts found for this condition and model.
            </div>
          )}
          {!error && transcriptResult && transcriptResult.transcripts.length > 0 && (
            <TranscriptList
              transcripts={transcriptResult.transcripts}
              onSelect={setSelectedTranscript}
              groupByModel={false}
              scenarioDimensions={scenarioDimensions}
              dimensionLabels={dimensionLabels}
            />
          )}
        </div>

        {selectedTranscript && (
          <TranscriptViewer
            transcript={selectedTranscript}
            onClose={() => setSelectedTranscript(null)}
          />
        )}
      </div>
    </div>
  );
}

export function OrderEffectPanel() {
  const [directionOnly, setDirectionOnly] = useState(true);
  const [trimOutliers, setTrimOutliers] = useState(true);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [activeReviewPairId, setActiveReviewPairId] = useState<string | null>(null);
  const [activeRow, setActiveRow] = useState<OrderInvarianceRow | null>(null);
  const [closedReviewPairIds, setClosedReviewPairIds] = useState<Set<string>>(new Set());
  const [trackedLaunchRunIds, setTrackedLaunchRunIds] = useState<string[]>([]);
  const [hasLoadedTrackedRuns, setHasLoadedTrackedRuns] = useState(false);

  const [{ data, fetching, error }, reexecuteResultQuery] = useQuery<OrderInvarianceQueryResult, OrderInvarianceQueryVariables>({
    query: ORDER_INVARIANCE_QUERY,
    variables: {
      directionOnly,
      trimOutliers,
    },
    requestPolicy: 'cache-and-network',
  });
  const [{ data: reviewData, fetching: reviewFetching, error: reviewError }, reexecuteReviewQuery] = useQuery<
    OrderInvarianceReviewQueryResult,
    Record<string, never>
  >({
    query: ORDER_INVARIANCE_REVIEW_QUERY,
    requestPolicy: 'cache-and-network',
  });
  const [reviewMutation, executeReviewPair] = useMutation<
    ReviewOrderInvariancePairResult,
    ReviewOrderInvariancePairVariables
  >(REVIEW_ORDER_INVARIANCE_PAIR_MUTATION);
  const [launchMutation, executeLaunchOrderInvariance] = useMutation<
    LaunchOrderInvarianceResult,
    LaunchOrderInvarianceVariables
  >(LAUNCH_ORDER_INVARIANCE_MUTATION);
  const [{ data: launchStatusData, fetching: launchStatusFetching, error: launchStatusError }, reexecuteLaunchStatusQuery] = useQuery<
    OrderInvarianceLaunchStatusQueryResult,
    OrderInvarianceLaunchStatusQueryVariables
  >({
    query: ORDER_INVARIANCE_LAUNCH_STATUS_QUERY,
    variables: { runIds: trackedLaunchRunIds },
    pause: !hasLoadedTrackedRuns || trackedLaunchRunIds.length === 0,
    requestPolicy: 'network-only',
  });

  const result = data?.assumptionsOrderInvariance;
  const reviewResult = reviewData?.assumptionsOrderInvarianceReview;
  const launchStatus = launchStatusData?.assumptionsOrderInvarianceLaunchStatus;
  const allRows = useMemo(() => result?.rows ?? [], [result?.rows]);
  const sortedReviewVignettes = useMemo(
    () => [...(reviewResult?.vignettes ?? [])].sort((a, b) => {
      const titleCmp = a.vignetteTitle.localeCompare(b.vignetteTitle);
      if (titleCmp !== 0) return titleCmp;
      return (a.variantType ?? '').localeCompare(b.variantType ?? '');
    }),
    [reviewResult?.vignettes],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      setHasLoadedTrackedRuns(true);
      return;
    }

    try {
      const stored = window.localStorage.getItem(ORDER_INVARIANCE_LAUNCH_STORAGE_KEY);
      if (!stored) {
        setHasLoadedTrackedRuns(true);
        return;
      }
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const nextRunIds = parsed.filter((runId): runId is string => typeof runId === 'string' && runId !== '');
        setTrackedLaunchRunIds(Array.from(new Set(nextRunIds)));
      }
    } catch {
      window.localStorage.removeItem(ORDER_INVARIANCE_LAUNCH_STORAGE_KEY);
    }

    setHasLoadedTrackedRuns(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedTrackedRuns || typeof window === 'undefined') {
      return;
    }

    if (trackedLaunchRunIds.length === 0) {
      window.localStorage.removeItem(ORDER_INVARIANCE_LAUNCH_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(ORDER_INVARIANCE_LAUNCH_STORAGE_KEY, JSON.stringify(trackedLaunchRunIds));
  }, [hasLoadedTrackedRuns, trackedLaunchRunIds]);

  useEffect(() => {
    if (!hasLoadedTrackedRuns || trackedLaunchRunIds.length === 0 || launchStatus?.isComplete) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void reexecuteLaunchStatusQuery({ requestPolicy: 'network-only' });
    }, ORDER_INVARIANCE_LAUNCH_POLL_MS);

    return () => window.clearInterval(intervalId);
  }, [hasLoadedTrackedRuns, trackedLaunchRunIds, launchStatus?.isComplete, reexecuteLaunchStatusQuery]);

  useEffect(() => {
    setClosedReviewPairIds((current) => {
      const next = new Set(current);
      let changed = false;
      for (const vignette of sortedReviewVignettes) {
        if (vignette.reviewStatus === 'APPROVED' && !next.has(vignette.pairId)) {
          next.add(vignette.pairId);
          changed = true;
        }
        if (vignette.reviewStatus !== 'APPROVED' && next.delete(vignette.pairId)) {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [sortedReviewVignettes]);

  const modelOptions = useMemo(() => {
    const unique = new Map<string, string>();
    for (const row of allRows) {
      unique.set(row.modelId, row.modelLabel);
    }
    return Array.from(unique.entries())
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([modelId, modelLabel]) => ({ modelId, modelLabel }));
  }, [allRows]);

  useEffect(() => {
    setSelectedModelIds((current) => {
      const availableIds = new Set(modelOptions.map((model) => model.modelId));
      if (availableIds.size === 0) {
        return current.size === 0 ? current : new Set();
      }

      if (current.size === 0) {
        return new Set(availableIds);
      }

      const next = new Set(Array.from(current).filter((modelId) => availableIds.has(modelId)));
      if (next.size === 0) {
        return new Set(availableIds);
      }

      let changed = next.size !== current.size;
      for (const modelId of availableIds) {
        if (!current.has(modelId)) {
          continue;
        }
        if (!next.has(modelId)) {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [modelOptions]);

  const filteredRows = useMemo(() => {
    if (selectedModelIds.size === 0) {
      return allRows;
    }
    return allRows.filter((row) => selectedModelIds.has(row.modelId));
  }, [allRows, selectedModelIds]);

  const groupedRows = useMemo(() => groupRowsByVignette(filteredRows), [filteredRows]);
  const modelLeaderboard = useMemo(() => {
    if (allRows.length === 0) return [];
    const byModel = new Map<string, OrderInvarianceRow[]>();
    for (const row of allRows) {
      const list = byModel.get(row.modelId) ?? [];
      list.push(row);
      byModel.set(row.modelId, list);
    }
    return Array.from(byModel.entries()).map(([modelId, rows]) => {
      const modelLabel = rows[0]?.modelLabel ?? modelId;
      const pRows = rows.filter(
        (r) => r.variantType === 'presentation_flipped' && r.majorityVoteBaseline != null && r.majorityVoteFlipped != null,
      );
      const sRows = rows.filter(
        (r) => r.variantType === 'scale_flipped' && r.majorityVoteBaseline != null && r.majorityVoteFlipped != null,
      );
      const pMAD = pRows.length > 0
        ? pRows.reduce((sum, r) => sum + Math.abs((r.majorityVoteBaseline ?? 0) - (r.majorityVoteFlipped ?? 0)), 0) / pRows.length
        : null;
      const sMAD = sRows.length > 0
        ? sRows.reduce((sum, r) => sum + Math.abs((r.majorityVoteBaseline ?? 0) - (r.majorityVoteFlipped ?? 0)), 0) / sRows.length
        : null;
      const matchRows = rows.filter((r) => r.variantType === 'fully_flipped' && r.isMatch != null);
      const matchRate = matchRows.length > 0 ? matchRows.filter((r) => r.isMatch).length / matchRows.length : null;
      return { modelId, modelLabel, pMAD, sMAD, matchRate, n: matchRows.length };
    }).sort((a, b) => (b.sMAD ?? -1) - (a.sMAD ?? -1));
  }, [allRows]);

  async function submitReview(vignette: OrderInvarianceReviewVignette, reviewStatus: 'APPROVED' | 'REJECTED') {
    setActiveReviewPairId(vignette.pairId);
    const mutationResult = await executeReviewPair({
      pairId: vignette.pairId,
      reviewStatus,
      reviewNotes: getDraftNote(noteDrafts, vignette).trim() || null,
    });
    setActiveReviewPairId(null);

    if (mutationResult.error) {
      return;
    }

    if (reviewStatus === 'APPROVED') {
      setClosedReviewPairIds((current) => new Set(current).add(vignette.pairId));
    } else {
      setClosedReviewPairIds((current) => {
        const next = new Set(current);
        next.delete(vignette.pairId);
        return next;
      });
    }

    void reexecuteReviewQuery({ requestPolicy: 'network-only' });
    void reexecuteResultQuery({ requestPolicy: 'network-only' });
  }

  async function launchRuns() {
    const mutationResult = await executeLaunchOrderInvariance({ force: false });
    if (mutationResult.error) {
      return;
    }

    const runIds = mutationResult.data?.launchOrderInvariance.runIds ?? [];
    setTrackedLaunchRunIds(runIds);
    if (runIds.length > 0) {
      void reexecuteLaunchStatusQuery({ requestPolicy: 'network-only' });
    }

    void reexecuteReviewQuery({ requestPolicy: 'network-only' });
    void reexecuteResultQuery({ requestPolicy: 'network-only' });
  }

  const reviewGateMessage = reviewResult?.summary.launchReady
    ? 'Review complete. Launch is now enabled for the full vignette set.'
    : 'Launch stays blocked until each vignette is explicitly approved.';
  const showLaunchStatus = launchMutation.fetching || trackedLaunchRunIds.length > 0 || launchStatus != null;
  const resolvedTrials = (launchStatus?.completedTrials ?? 0) + (launchStatus?.failedTrials ?? 0);
  const progressPercent = Math.max(0, Math.min(100, launchStatus?.percentComplete ?? 0));

  return (
    <section className="space-y-5 rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Slot-Order Sensitivity</h2>
          <p className="mt-1 text-sm text-gray-600">
            Reviews flipped prompt pairs, then compares the canonical A-first baseline against the B-first variant on the locked 5-vignette sentinel panel.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!reviewResult?.summary.launchReady}
          isLoading={launchMutation.fetching}
          onClick={() => void launchRuns()}
        >
          Launch Order-Effect Runs
        </Button>
      </div>

      {showLaunchStatus && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-sky-950">Launch Status</h3>
                {launchStatus?.isComplete ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Complete
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[11px] font-medium text-sky-700">
                    <Loader2 className={`h-3.5 w-3.5 ${launchMutation.fetching || launchStatusFetching ? 'animate-spin' : ''}`} />
                    {launchMutation.fetching ? 'Starting runs...' : 'Polling live progress'}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-sky-900">
                {launchStatus
                  ? `${formatProgressCount(launchStatus.completedTrials)} completed out of ${formatProgressCount(launchStatus.targetedTrials)} targeted trials.`
                  : 'Preparing live run tracking...'}
              </p>
              {launchStatus && (
                <p className="mt-1 text-xs text-sky-700">
                  {formatProgressCount(launchStatus.totalRuns)} runs total, {formatProgressCount(launchStatus.activeRuns)} active, {formatProgressCount(launchStatus.failedTrials)} failed trials
                  {launchStatus.generatedAt ? ` · Last refresh ${new Date(launchStatus.generatedAt).toLocaleTimeString()}` : ''}.
                </p>
              )}
            </div>
            {trackedLaunchRunIds.length > 0 && launchStatus?.isComplete && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setTrackedLaunchRunIds([])}
              >
                Clear Status
              </Button>
            )}
          </div>

          {launchStatus && (
            <>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-sky-100">
                <div className="flex h-full w-full">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${launchStatus.targetedTrials > 0 ? (launchStatus.completedTrials / launchStatus.targetedTrials) * 100 : 0}%` }}
                  />
                  <div
                    className="h-full bg-rose-500 transition-all"
                    style={{ width: `${launchStatus.targetedTrials > 0 ? (launchStatus.failedTrials / launchStatus.targetedTrials) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-sky-800">
                <span>
                  Resolved {formatProgressCount(resolvedTrials)} / {formatProgressCount(launchStatus.targetedTrials)} trials
                </span>
                <span>{progressPercent.toFixed(0)}%</span>
              </div>
            </>
          )}

          {launchStatusError && (
            <div className="mt-3">
              <ErrorMessage message={launchStatusError.message} />
            </div>
          )}
        </div>
      )}

      <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Preflight Review</h3>
            <p className="mt-1 text-sm text-gray-600">
              Review the narrative pair once per vignette. The decision applies to every generated condition pair in that vignette.
            </p>
          </div>
          {reviewResult && (
            <div className="text-xs text-gray-500">
              Refreshed {new Date(reviewResult.generatedAt).toLocaleString()}
            </div>
          )}
        </div>

        {reviewFetching && !reviewResult && (
          <div className="mt-4">
            <Loading size="sm" text="Loading review pairs..." />
          </div>
        )}

        {reviewError && (
          <div className="mt-4">
            <ErrorMessage message={reviewError.message} />
          </div>
        )}

        {reviewMutation.error && (
          <div className="mt-4">
            <ErrorMessage message={reviewMutation.error.message} />
          </div>
        )}

        {launchMutation.error && (
          <div className="mt-4">
            <ErrorMessage message={launchMutation.error.message} />
          </div>
        )}

        {reviewResult && (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-5">
              <div className="rounded-md border border-gray-200 bg-white p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Vignettes</div>
                <div className="mt-1 text-base font-semibold text-gray-900">{reviewResult.summary.totalVignettes}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-white p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Reviewed</div>
                <div className="mt-1 text-base font-semibold text-gray-900">{reviewResult.summary.reviewedVignettes}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-white p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Approved</div>
                <div className="mt-1 text-base font-semibold text-teal-700">{reviewResult.summary.approvedVignettes}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-white p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Rejected</div>
                <div className="mt-1 text-base font-semibold text-orange-700">{reviewResult.summary.rejectedVignettes}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-white p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Pending</div>
                <div className="mt-1 text-base font-semibold text-gray-900">{reviewResult.summary.pendingVignettes}</div>
              </div>
            </div>

            <div className="mt-4 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700">
              {reviewGateMessage}
            </div>

            {launchMutation.data?.launchOrderInvariance && (
              <div className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
                Started {launchMutation.data.launchOrderInvariance.startedRuns} runs
                {' '}({Object.entries(launchMutation.data.launchOrderInvariance.runsByVariantType).map(([type, count]) => `${count} ${type}`).join(', ')}).
              </div>
            )}

            <div className="mt-4 space-y-4">
              {sortedReviewVignettes.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600">
                  No generated order-flip pairs are available yet.
                </div>
              ) : sortedReviewVignettes.map((vignette) => {
                const axes = getVariantAxes(vignette.variantType);
                const isClosed = closedReviewPairIds.has(vignette.pairId);

                return (
                  <div key={vignette.pairId} className="rounded-lg border border-gray-200 bg-white">
                    <div className="flex flex-col gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {vignette.vignetteTitle}
                          <span className={`ml-2 ${getAxisBadgeClass(axes.narrativeOrder)}`}>
                            Narrative Order {axes.narrativeOrder}
                          </span>
                          <span className={`ml-2 ${getAxisBadgeClass(axes.scaleOrder)}`}>
                            Scale Order {axes.scaleOrder}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Showing representative condition {vignette.conditionKey}. Approval covers all {vignette.conditionPairCount} generated condition pair{vignette.conditionPairCount === 1 ? '' : 's'}.
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Reviewed {formatDateTime(vignette.reviewedAt)}
                          {vignette.reviewedBy ? ` by ${vignette.reviewedBy}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={getReviewStatusBadge(vignette.reviewStatus)}>
                          {isClosed ? 'CLOSED' : vignette.reviewStatus}
                        </span>
                        {vignette.reviewStatus === 'APPROVED' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setClosedReviewPairIds((current) => {
                              const next = new Set(current);
                              if (next.has(vignette.pairId)) {
                                next.delete(vignette.pairId);
                              } else {
                                next.add(vignette.pairId);
                              }
                              return next;
                            })}
                          >
                            {isClosed ? 'Open Vignette' : 'Close Vignette'}
                          </Button>
                        )}
                      </div>
                    </div>

                    {!isClosed && (
                      <>
                        <div className="grid gap-4 p-4 lg:grid-cols-2">
                          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Narrative Order Baseline</div>
                            <div className="mt-1 text-xs text-gray-500">{vignette.baselineName}</div>
                            <pre className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{vignette.baselineText}</pre>
                          </div>
                          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                              {getVariantSideLabel(vignette.variantType)}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">{vignette.flippedName}</div>
                            <pre className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{vignette.flippedText}</pre>
                          </div>
                        </div>

                        <div className="border-t border-gray-200 p-4">
                          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500" htmlFor={`review-note-${vignette.pairId}`}>
                            Reviewer Notes
                          </label>
                          <textarea
                            id={`review-note-${vignette.pairId}`}
                            className="mt-2 min-h-[96px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200"
                            value={getDraftNote(noteDrafts, vignette)}
                            onChange={(event) => setNoteDrafts((current) => ({
                              ...current,
                              [vignette.pairId]: event.target.value,
                            }))}
                            placeholder="Capture approval rationale or why the vignette was rejected."
                          />

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              isLoading={reviewMutation.fetching && activeReviewPairId === vignette.pairId}
                              onClick={() => void submitReview(vignette, 'APPROVED')}
                            >
                              Approve Vignette
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="danger"
                              isLoading={reviewMutation.fetching && activeReviewPairId === vignette.pairId}
                              onClick={() => void submitReview(vignette, 'REJECTED')}
                            >
                              Reject Vignette
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Readback</h3>
            <p className="mt-1 text-sm text-gray-600">
              Approved pairs are normalized against the canonical baseline and scored under the active toggle settings.
            </p>
            {result && (
              <div className="mt-2 text-xs text-gray-500">
                Generated {new Date(result.generatedAt).toLocaleString()}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDirectionOnly((current) => !current)}
              className={directionOnly ? 'border-teal-600 bg-teal-50 text-teal-800' : ''}
            >
              Direction Only
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setTrimOutliers((current) => !current)}
              className={trimOutliers ? 'border-teal-600 bg-teal-50 text-teal-800' : ''}
            >
              Trim Outliers
            </Button>
          </div>
        </div>

        {fetching && !result && (
          <div className="mt-4">
            <Loading size="sm" text="Loading slot-order results..." />
          </div>
        )}

        {error && (
          <div className="mt-4">
            <ErrorMessage message={error.message} />
          </div>
        )}

        {result && (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">% Unchanged</div>
                <div className="mt-1 text-base font-semibold text-gray-900">
                  {formatPercent(result.summary.matchRate)}
                </div>
              </div>
              {ENABLE_2X2_ORDER_EFFECT_UI && result?.summary?.presentationEffectMAD !== undefined && (
                <>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Presentation Effect (Δ_P)
                    </div>
                    <div className="mt-1 text-lg font-semibold text-gray-900">
                      {formatMAD(result.summary.presentationEffectMAD)}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-400">Mean Abs Diff — order bias</div>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Scale Effect (Δ_S)
                    </div>
                    <div className={`mt-1 text-lg font-semibold ${getScaleEffectColor(result.summary.scaleEffectMAD)}`}>
                      {formatMAD(result.summary.scaleEffectMAD)}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      {(result.summary.scaleEffectMAD ?? 0) > 1.0 ? '⚠ Severe anchoring' :
                       (result.summary.scaleEffectMAD ?? 0) > 0.5 ? '⚠ Possible anchoring' :
                       'Mean Abs Diff — scale bias'}
                    </div>
                  </div>
                </>
              )}
            </div>

            {ENABLE_2X2_ORDER_EFFECT_UI && modelLeaderboard.length > 0 && (
              <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Model</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">N</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Match Rate</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Presentation (Δ_P)</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Scale (Δ_S)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {modelLeaderboard.map((ms) => (
                      <tr key={ms.modelId} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-900">{ms.modelLabel}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{ms.n}</td>
                        <td className="px-4 py-2 text-right text-gray-700">
                          {ms.matchRate != null ? `${(ms.matchRate * 100).toFixed(0)}%` : '—'}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-700">{formatMAD(ms.pMAD)}</td>
                        <td className={`px-4 py-2 text-right ${getScaleEffectColor(ms.sMAD)}`}>
                          {formatMAD(ms.sMAD)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {modelOptions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {modelOptions.map((model) => (
                  <Button
                    key={model.modelId}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedModelIds((current) => {
                      const next = new Set(current);
                      if (next.has(model.modelId)) {
                        next.delete(model.modelId);
                      } else {
                        next.add(model.modelId);
                      }
                      return next;
                    })}
                    className={selectedModelIds.has(model.modelId) ? 'border-teal-600 bg-teal-50 text-teal-800' : ''}
                  >
                    {model.modelLabel}
                  </Button>
                ))}
              </div>
            )}

            <div className="mt-5 space-y-4">
              {groupedRows.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                  No approved slot-order pairs are available yet.
                </div>
              ) : groupedRows.map((group) => {
                const attributeLabels = parseAttributeLabels(group.vignetteTitle);
                return (
                <details key={group.vignetteId} className="rounded-lg border border-gray-200">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-gray-50 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{group.vignetteTitle}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {group.rows.length} condition row{group.rows.length === 1 ? '' : 's'}
                      </div>
                    </div>
                  </summary>
                  <div className="overflow-x-auto border-t border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Model</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">{attributeLabels.attributeA}</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">{attributeLabels.attributeB}</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            Baseline ({trimOutliers ? 'Trimmed 3' : 'All 5'})
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            Flipped ({trimOutliers ? 'Trimmed 3' : 'All 5'})
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            {directionOnly ? 'Direction Match?' : 'Exact Match?'}
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Distance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {group.rows.map((row) => {
                          const { levelA, levelB } = parseConditionLevels(row.conditionKey);
                          const isMissing = row.mismatchType === 'missing_pair';
                          return (
                            <tr
                              key={`${row.modelId}-${row.conditionKey}`}
                              className={`cursor-pointer transition-colors hover:bg-gray-50 ${row.isMatch === false ? 'bg-amber-50' : ''}`}
                              onClick={() => setActiveRow(row)}
                            >
                              <td className="px-3 py-2 text-gray-900">{row.modelLabel}</td>
                              <td className="px-3 py-2 text-gray-700">{levelA}</td>
                              <td className="px-3 py-2 text-gray-700">{levelB}</td>
                              <td className="px-3 py-2 text-gray-700">{row.majorityVoteBaseline ?? 'n/a'}</td>
                              <td className="px-3 py-2 text-gray-700">{row.majorityVoteFlipped ?? 'n/a'}</td>
                              <td className="px-3 py-2 text-gray-700">
                                {isMissing ? 'Insufficient data' : row.isMatch ? 'Yes' : 'No'}
                              </td>
                              <td className="px-3 py-2 text-gray-700">{row.ordinalDistance ?? 'n/a'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              )})}
            </div>
          </>
        )}
      </div>
      {activeRow && (
        <TranscriptDrilldownModal
          row={activeRow}
          directionOnly={directionOnly}
          trimOutliers={trimOutliers}
          onClose={() => setActiveRow(null)}
        />
      )}
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'urql';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
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

const DIAGNOSTIC_MIN_N = 15;

function getDiagnosticLabel(pMAD: number | null, sMAD: number | null, nP: number, nS: number): string {
  const hasEnoughP = nP >= DIAGNOSTIC_MIN_N;
  const hasEnoughS = nS >= DIAGNOSTIC_MIN_N;
  if (!hasEnoughP && !hasEnoughS) return 'Insufficient Evidence';
  if (hasEnoughS && (sMAD ?? 0) > 1.0) return 'Evidence consistent with Severe Anchoring';
  if (hasEnoughS && (sMAD ?? 0) > 0.5) return 'Evidence consistent with Possible Anchoring';
  if (hasEnoughP && (pMAD ?? 0) > 0.5 && (sMAD == null || sMAD <= 0.5)) return 'Evidence consistent with Narrative-Order Sensitivity';
  if ((pMAD ?? 0) <= 0.5 && (sMAD == null || sMAD <= 0.5)) return 'Robust';
  return 'Mixed Sensitivity';
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

function getVariantLabel(variantType: string | null | undefined): string {
  if (variantType === 'baseline') return 'Baseline';
  if (variantType === 'presentation_flipped') return 'Narrative Flipped';
  if (variantType === 'scale_flipped') return 'Scale Flipped';
  if (variantType === 'fully_flipped') return 'Fully Flipped';
  return '—';
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

type MatrixBlock = {
  modelId: string;
  modelLabel: string;
  conditionKey: string;
  cells: Map<string, OrderInvarianceRow>;
};

type VignetteMatrix = {
  vignetteId: string;
  vignetteTitle: string;
  blocks: MatrixBlock[];
};

function groupRowsIntoMatrix(rows: OrderInvarianceRow[]): VignetteMatrix[] {
  const vignetteMap = new Map<string, {
    vignetteId: string;
    vignetteTitle: string;
    blockMap: Map<string, MatrixBlock>;
  }>();

  for (const row of rows) {
    let vignette = vignetteMap.get(row.vignetteId);
    if (!vignette) {
      vignette = {
        vignetteId: row.vignetteId,
        vignetteTitle: row.vignetteTitle,
        blockMap: new Map(),
      };
      vignetteMap.set(row.vignetteId, vignette);
    }

    const blockKey = `${row.modelId}::${row.conditionKey}`;
    let block = vignette.blockMap.get(blockKey);
    if (!block) {
      block = {
        modelId: row.modelId,
        modelLabel: row.modelLabel,
        conditionKey: row.conditionKey,
        cells: new Map(),
      };
      vignette.blockMap.set(blockKey, block);
    }

    if (row.variantType != null) {
      block.cells.set(row.variantType, row);
    }
  }

  return Array.from(vignetteMap.values())
    .sort((a, b) => a.vignetteTitle.localeCompare(b.vignetteTitle))
    .map(({ vignetteId, vignetteTitle, blockMap }) => ({
      vignetteId,
      vignetteTitle,
      blocks: Array.from(blockMap.values()).sort((a, b) => {
        const modelCmp = a.modelLabel.localeCompare(b.modelLabel);
        return modelCmp !== 0 ? modelCmp : a.conditionKey.localeCompare(b.conditionKey, undefined, { numeric: true });
      }),
    }));
}

const VARIANT_ORDER = ['baseline', 'presentation_flipped', 'scale_flipped', 'fully_flipped'] as const;
const VARIANT_SHORT_LABELS: Record<string, string> = {
  baseline: 'P_A+S_A',
  presentation_flipped: 'P_B+S_A',
  scale_flipped: 'P_A+S_B',
  fully_flipped: 'P_B+S_B',
};

function renderMatrixCellScore(row: OrderInvarianceRow | undefined) {
  if (!row) {
    return <span className="text-[11px] italic text-gray-400">Missing</span>;
  }
  if (row.mismatchType === 'missing_pair' || row.majorityVoteFlipped == null) {
    return <span className="text-[11px] italic text-amber-500">Insufficient</span>;
  }
  if (row.rawScore != null && row.rawScore !== row.majorityVoteFlipped) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-gray-400">Raw: {row.rawScore}</span>
        <span className="text-sm font-semibold text-gray-900">→ {row.majorityVoteFlipped}</span>
      </div>
    );
  }
  return <span className="text-sm font-semibold text-gray-900">{row.majorityVoteFlipped}</span>;
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
            <div className="mt-1 space-y-1">
              <p className="text-xs text-gray-500">
                {directionOnly ? 'Direction match' : 'Exact match'}:{' '}
                <span className="font-medium text-gray-900">
                  {row.isMatch == null ? 'Insufficient data' : row.isMatch ? 'Yes' : 'No'}
                </span>
                {' '}· Baseline Score:{' '}
                <span className="font-medium text-gray-900">{row.majorityVoteBaseline ?? 'n/a'}</span>
                {' '}· Variant Score:{' '}
                {row.rawScore != null && row.rawScore !== row.majorityVoteFlipped ? (
                  <span className="font-medium text-gray-900">
                    Raw {row.rawScore} → Canonical {row.majorityVoteFlipped ?? 'n/a'}
                  </span>
                ) : (
                  <span className="font-medium text-gray-900">{row.majorityVoteFlipped ?? 'n/a'}</span>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase text-gray-400">Variant:</span>
                <span className="text-xs font-medium text-gray-700">{getVariantLabel(row.variantType)}</span>
                {row.variantType != null && (
                  <>
                    <span className={getAxisBadgeClass(getVariantAxes(row.variantType).narrativeOrder)}>
                      Narrative: {getVariantAxes(row.variantType).narrativeOrder}
                    </span>
                    <span className={getAxisBadgeClass(getVariantAxes(row.variantType).scaleOrder)}>
                      Scale: {getVariantAxes(row.variantType).scaleOrder}
                    </span>
                  </>
                )}
              </div>
            </div>
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
  const [isPreflightReviewOpen, setIsPreflightReviewOpen] = useState(false);
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

  const matrixGroups = useMemo(() => groupRowsIntoMatrix(filteredRows), [filteredRows]);
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
      return { modelId, modelLabel, pMAD, sMAD, matchRate, n: matchRows.length, nP: pRows.length, nS: sRows.length, nMatch: matchRows.length };
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

              {launchStatus.failureSummaries.length > 0 && (
                <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-600" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-rose-800">
                        Probe failures detected — check xAI billing or API credentials
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {launchStatus.failureSummaries.map((summary, i) => (
                          <li key={i} className="truncate text-xs text-rose-700">{summary}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {launchStatus.stalledModels.length > 0 && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-amber-800">
                        Stalled runs — no progress for 15+ min
                      </p>
                      <p className="mt-0.5 text-xs text-amber-700">
                        Models: {launchStatus.stalledModels.join(', ')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
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
          <div className="flex items-center gap-3 self-start">
            {reviewResult && (
              <div className="text-xs text-gray-500">
                Refreshed {new Date(reviewResult.generatedAt).toLocaleString()}
              </div>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setIsPreflightReviewOpen((current) => !current)}
              aria-expanded={isPreflightReviewOpen}
            >
              {isPreflightReviewOpen ? (
                <>
                  <ChevronUp className="mr-1 h-4 w-4" />
                  Hide Review
                </>
              ) : (
                <>
                  <ChevronDown className="mr-1 h-4 w-4" />
                  Show Review
                </>
              )}
            </Button>
          </div>
        </div>

        {!isPreflightReviewOpen && reviewResult && (
          <div className="mt-4 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700">
            {reviewGateMessage}
          </div>
        )}

        {isPreflightReviewOpen && reviewFetching && !reviewResult && (
          <div className="mt-4">
            <Loading size="sm" text="Loading review pairs..." />
          </div>
        )}

        {isPreflightReviewOpen && reviewError && (
          <div className="mt-4">
            <ErrorMessage message={reviewError.message} />
          </div>
        )}

        {isPreflightReviewOpen && reviewMutation.error && (
          <div className="mt-4">
            <ErrorMessage message={reviewMutation.error.message} />
          </div>
        )}

        {launchMutation.error && (
          <div className="mt-4">
            <ErrorMessage message={launchMutation.error.message} />
          </div>
        )}

        {isPreflightReviewOpen && reviewResult && (
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

            <div className="mt-3 rounded-md border border-gray-100 bg-white p-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Approval by Variant Type</div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                {(['presentation_flipped', 'scale_flipped', 'fully_flipped'] as const).map((vt) => {
                  const vignettesByVariant = sortedReviewVignettes.filter((v) => v.variantType === vt);
                  const approvedCount = vignettesByVariant.filter((v) => v.reviewStatus === 'APPROVED').length;
                  const label = vt === 'presentation_flipped'
                    ? 'Narrative Flipped'
                    : vt === 'scale_flipped'
                      ? 'Scale Flipped'
                      : 'Fully Flipped';
                  const notation = vt === 'presentation_flipped'
                    ? 'P_B+S_A'
                    : vt === 'scale_flipped'
                      ? 'P_A+S_B'
                      : 'P_B+S_B';
                  const allApproved = vignettesByVariant.length > 0 && approvedCount === vignettesByVariant.length;
                  return (
                    <div key={vt} className={`rounded-md border p-2 ${allApproved ? 'border-teal-200 bg-teal-50' : 'border-gray-200'}`}>
                      <div className="text-[10px] font-bold uppercase text-gray-400">{notation}</div>
                      <div className="text-xs font-medium text-gray-700">{label}</div>
                      <div className={`mt-1 text-base font-semibold ${allApproved ? 'text-teal-700' : 'text-gray-900'}`}>
                        {approvedCount}/{vignettesByVariant.length}
                      </div>
                      <div className="text-[10px] text-gray-400">approved</div>
                    </div>
                  );
                })}
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
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-400">
              <span className="text-[10px] font-semibold uppercase text-gray-400">Variants:</span>
              <span><span className="font-medium text-gray-600">Baseline</span> = P_A + S_A</span>
              <span><span className="font-medium text-gray-600">Narrative Flipped</span> = P_B + S_A</span>
              <span><span className="font-medium text-gray-600">Scale Flipped</span> = P_A + S_B</span>
              <span><span className="font-medium text-gray-600">Fully Flipped</span> = P_B + S_B</span>
            </div>
            <div className="mt-2 text-[11px] text-gray-400">
              Reporting context: Strictness={directionOnly ? 'Directional' : 'Exact'} · Trimming={trimOutliers ? 'Active (3 middle)' : 'Off (all 5)'} · Scale=5-pt (1–5)
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Legacy: Baseline vs Fully-Flipped</div>
                <div className="mt-1 text-sm font-medium text-gray-700">
                  {formatPercent(result.summary.matchRate)}
                </div>
                <div className="mt-0.5 text-[11px] text-gray-400">N={result.summary.matchComparablePairs}</div>
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
                    <div className="mt-0.5 text-[11px] text-gray-400">
                      N={result.summary.presentationComparablePairs} · Mean Abs Diff — narrative-order bias
                    </div>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Scale Effect (Δ_S)
                    </div>
                    <div className={`mt-1 text-lg font-semibold ${getScaleEffectColor(result.summary.scaleEffectMAD)}`}>
                      {formatMAD(result.summary.scaleEffectMAD)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-400">
                      N={result.summary.scaleComparablePairs} ·{' '}
                      {(result.summary.scaleEffectMAD ?? 0) > 1.0 ? '⚠ Severe anchoring' :
                       (result.summary.scaleEffectMAD ?? 0) > 0.5 ? '⚠ Possible anchoring' :
                       'Mean Abs Diff — scale-endpoint bias'}
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
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Match</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">N_match</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Δ_P</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">N_ΔP</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">Δ_S</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">N_ΔS</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">Diagnostic</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {modelLeaderboard.map((ms) => (
                      <tr key={ms.modelId} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-900">{ms.modelLabel}</td>
                        <td className="px-4 py-2 text-right text-gray-700">
                          {ms.matchRate != null ? `${(ms.matchRate * 100).toFixed(0)}%` : '—'}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-500 text-xs">{ms.nMatch}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{formatMAD(ms.pMAD)}</td>
                        <td className="px-4 py-2 text-right text-gray-500 text-xs">{ms.nP}</td>
                        <td className={`px-4 py-2 text-right ${getScaleEffectColor(ms.sMAD)}`}>
                          {formatMAD(ms.sMAD)}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-500 text-xs">{ms.nS}</td>
                        <td className="px-4 py-2 text-left text-gray-600 text-xs">
                          {getDiagnosticLabel(ms.pMAD, ms.sMAD, ms.nP, ms.nS)}
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
              {matrixGroups.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
                  No approved slot-order pairs are available yet.
                </div>
              ) : matrixGroups.map((vignette) => {
                const attributeLabels = parseAttributeLabels(vignette.vignetteTitle);
                return (
                  <details key={vignette.vignetteId} className="rounded-lg border border-gray-200">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-gray-50 px-4 py-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{vignette.vignetteTitle}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {vignette.blocks.length} condition block{vignette.blocks.length === 1 ? '' : 's'}
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
                            {VARIANT_ORDER.map((vt) => (
                              <th key={vt} className="px-3 py-2 text-center font-medium text-gray-600">
                                <div>{getVariantLabel(vt)}</div>
                                <div className="text-[10px] font-normal text-gray-400">{VARIANT_SHORT_LABELS[vt]}</div>
                              </th>
                            ))}
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Match?</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {vignette.blocks.map((block) => {
                            const { levelA, levelB } = parseConditionLevels(block.conditionKey);
                            const matchRow = block.cells.get('fully_flipped');
                            const isMatch = matchRow?.isMatch;
                            return (
                              <tr
                                key={`${block.modelId}::${block.conditionKey}`}
                                className={`hover:bg-gray-50 ${isMatch === false ? 'bg-amber-50' : ''}`}
                              >
                                <td className="px-3 py-2 font-medium text-gray-900">{block.modelLabel}</td>
                                <td className="px-3 py-2 text-gray-700">{levelA}</td>
                                <td className="px-3 py-2 text-gray-700">{levelB}</td>
                                {VARIANT_ORDER.map((vt) => {
                                  const cellRow = block.cells.get(vt);
                                  return (
                                    <td
                                      key={vt}
                                      className="cursor-pointer px-3 py-2 text-center"
                                      onClick={() => cellRow && setActiveRow(cellRow)}
                                    >
                                      {renderMatrixCellScore(cellRow)}
                                    </td>
                                  );
                                })}
                                <td className="px-3 py-2 text-xs text-gray-700">
                                  {isMatch == null ? '—' : isMatch ? 'Yes' : 'No'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                );
              })}
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

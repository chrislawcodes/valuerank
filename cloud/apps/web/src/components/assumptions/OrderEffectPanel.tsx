import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'urql';
import { X } from 'lucide-react';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Loading } from '../ui/Loading';
import { Button } from '../ui/Button';
import { TranscriptList } from '../runs/TranscriptList';
import { TranscriptViewer } from '../runs/TranscriptViewer';
import type { Transcript } from '../../api/operations/runs';
import {
  LAUNCH_ORDER_INVARIANCE_MUTATION,
  ORDER_INVARIANCE_QUERY,
  ORDER_INVARIANCE_REVIEW_QUERY,
  ORDER_INVARIANCE_TRANSCRIPTS_QUERY,
  REVIEW_ORDER_INVARIANCE_PAIR_MUTATION,
  type LaunchOrderInvarianceResult,
  type LaunchOrderInvarianceVariables,
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

function formatPercent(value: number | null): string {
  if (value == null) {
    return 'n/a';
  }
  return `${(value * 100).toFixed(1)}%`;
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

  const result = data?.assumptionsOrderInvariance;
  const reviewResult = reviewData?.assumptionsOrderInvarianceReview;
  const reviewVignettes = useMemo(
    () => [...(reviewResult?.vignettes ?? [])].sort((left, right) => left.vignetteTitle.localeCompare(right.vignetteTitle)),
    [reviewResult?.vignettes],
  );

  const modelOptions = useMemo(() => {
    const unique = new Map<string, string>();
    for (const row of result?.rows ?? []) {
      unique.set(row.modelId, row.modelLabel);
    }
    return Array.from(unique.entries())
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([modelId, modelLabel]) => ({ modelId, modelLabel }));
  }, [result?.rows]);

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
    const rows = result?.rows ?? [];
    if (selectedModelIds.size === 0) {
      return rows;
    }
    return rows.filter((row) => selectedModelIds.has(row.modelId));
  }, [result?.rows, selectedModelIds]);

  const groupedRows = useMemo(() => groupRowsByVignette(filteredRows), [filteredRows]);

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

    void reexecuteReviewQuery({ requestPolicy: 'network-only' });
    void reexecuteResultQuery({ requestPolicy: 'network-only' });
  }

  async function launchRuns() {
    const mutationResult = await executeLaunchOrderInvariance({ force: false });
    if (mutationResult.error) {
      return;
    }

    void reexecuteReviewQuery({ requestPolicy: 'network-only' });
    void reexecuteResultQuery({ requestPolicy: 'network-only' });
  }

  const reviewGateMessage = reviewResult?.summary.launchReady
    ? 'Review complete. Launch is now enabled for the full vignette set.'
    : 'Launch stays blocked until each vignette is explicitly approved.';

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
                {' '}({launchMutation.data.launchOrderInvariance.baselineRunsStarted} baseline, {launchMutation.data.launchOrderInvariance.flippedRunsStarted} flipped).
              </div>
            )}

            <div className="mt-4 space-y-4">
              {reviewVignettes.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600">
                  No generated order-flip pairs are available yet.
                </div>
              ) : reviewVignettes.map((vignette) => (
                <div key={vignette.vignetteId} className="rounded-lg border border-gray-200 bg-white">
                  <div className="flex flex-col gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{vignette.vignetteTitle}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        Showing representative condition {vignette.conditionKey}. Approval covers all {vignette.conditionPairCount} generated condition pair{vignette.conditionPairCount === 1 ? '' : 's'}.
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        Reviewed {formatDateTime(vignette.reviewedAt)}
                        {vignette.reviewedBy ? ` by ${vignette.reviewedBy}` : ''}
                      </div>
                    </div>
                    <span className={getReviewStatusBadge(vignette.reviewStatus)}>
                      {vignette.reviewStatus}
                    </span>
                  </div>

                  <div className="grid gap-4 p-4 lg:grid-cols-2">
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Baseline (A First)</div>
                      <div className="mt-1 text-xs text-gray-500">{vignette.baselineName}</div>
                      <pre className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{vignette.baselineText}</pre>
                    </div>
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Flipped (B First)</div>
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
                </div>
              ))}
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
            <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">% Unchanged</div>
              <div className="mt-1 text-base font-semibold text-gray-900">
                {formatPercent(result.summary.matchRate)}
              </div>
            </div>

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

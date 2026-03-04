import { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'urql';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Loading } from '../ui/Loading';
import { Button } from '../ui/Button';
import {
  LAUNCH_ORDER_INVARIANCE_MUTATION,
  ORDER_INVARIANCE_QUERY,
  ORDER_INVARIANCE_REVIEW_QUERY,
  REVIEW_ORDER_INVARIANCE_PAIR_MUTATION,
  type LaunchOrderInvarianceResult,
  type LaunchOrderInvarianceVariables,
  type OrderInvarianceQueryResult,
  type OrderInvarianceQueryVariables,
  type OrderInvarianceReviewPair,
  type OrderInvarianceReviewQueryResult,
  type OrderInvarianceReviewStatus,
  type OrderInvarianceRow,
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

function groupReviewPairsByVignette(pairs: OrderInvarianceReviewPair[]): Array<{
  vignetteId: string;
  vignetteTitle: string;
  pairs: OrderInvarianceReviewPair[];
}> {
  const groups = new Map<string, { vignetteId: string; vignetteTitle: string; pairs: OrderInvarianceReviewPair[] }>();

  for (const pair of pairs) {
    const existing = groups.get(pair.vignetteId);
    if (existing != null) {
      existing.pairs.push(pair);
      continue;
    }
    groups.set(pair.vignetteId, {
      vignetteId: pair.vignetteId,
      vignetteTitle: pair.vignetteTitle,
      pairs: [pair],
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
  pair: OrderInvarianceReviewPair
): string {
  return noteDrafts[pair.pairId] ?? pair.reviewNotes ?? '';
}

export function OrderEffectPanel() {
  const [directionOnly, setDirectionOnly] = useState(true);
  const [trimOutliers, setTrimOutliers] = useState(true);
  const [selectedModelId, setSelectedModelId] = useState<string>('ALL');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [activeReviewPairId, setActiveReviewPairId] = useState<string | null>(null);

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
  const reviewGroups = useMemo(
    () => groupReviewPairsByVignette(reviewResult?.pairs ?? []),
    [reviewResult?.pairs],
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

  const filteredRows = useMemo(() => {
    const rows = result?.rows ?? [];
    if (selectedModelId === 'ALL') {
      return rows;
    }
    return rows.filter((row) => row.modelId === selectedModelId);
  }, [result?.rows, selectedModelId]);

  const groupedRows = useMemo(() => groupRowsByVignette(filteredRows), [filteredRows]);

  async function submitReview(pair: OrderInvarianceReviewPair, reviewStatus: 'APPROVED' | 'REJECTED') {
    setActiveReviewPairId(pair.pairId);
    const mutationResult = await executeReviewPair({
      pairId: pair.pairId,
      reviewStatus,
      reviewNotes: getDraftNote(noteDrafts, pair).trim() || null,
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
    ? 'Review complete. Launch wiring lands in Phase 3.'
    : 'Launch stays blocked until every pair is explicitly approved.';

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
              Every flipped pair needs a human approval before launch is allowed.
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
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Pairs</div>
                <div className="mt-1 text-base font-semibold text-gray-900">{reviewResult.summary.totalPairs}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-white p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Reviewed</div>
                <div className="mt-1 text-base font-semibold text-gray-900">{reviewResult.summary.reviewedPairs}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-white p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Approved</div>
                <div className="mt-1 text-base font-semibold text-teal-700">{reviewResult.summary.approvedPairs}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-white p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Rejected</div>
                <div className="mt-1 text-base font-semibold text-orange-700">{reviewResult.summary.rejectedPairs}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-white p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Pending</div>
                <div className="mt-1 text-base font-semibold text-gray-900">{reviewResult.summary.pendingPairs}</div>
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
              {reviewGroups.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-600">
                  No generated order-flip pairs are available yet.
                </div>
              ) : reviewGroups.map((group) => (
                <details key={group.vignetteId} className="rounded-lg border border-gray-200 bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-gray-50 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{group.vignetteTitle}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {group.pairs.length} condition pair{group.pairs.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {group.pairs.filter((pair) => pair.reviewStatus === 'APPROVED').length}/{group.pairs.length} approved
                    </div>
                  </summary>
                  <div className="space-y-4 border-t border-gray-200 p-4">
                    {group.pairs.map((pair) => (
                      <div key={pair.pairId} className="rounded-lg border border-gray-200">
                        <div className="flex flex-col gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{pair.conditionKey}</div>
                            <div className="mt-1 text-xs text-gray-500">
                              Reviewed {formatDateTime(pair.reviewedAt)}
                              {pair.reviewedBy ? ` by ${pair.reviewedBy}` : ''}
                            </div>
                          </div>
                          <span className={getReviewStatusBadge(pair.reviewStatus)}>
                            {pair.reviewStatus}
                          </span>
                        </div>

                        <div className="grid gap-4 p-4 lg:grid-cols-2">
                          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Baseline (A First)</div>
                            <div className="mt-1 text-xs text-gray-500">{pair.baselineName}</div>
                            <pre className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{pair.baselineText}</pre>
                          </div>
                          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Flipped (B First)</div>
                            <div className="mt-1 text-xs text-gray-500">{pair.flippedName}</div>
                            <pre className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{pair.flippedText}</pre>
                          </div>
                        </div>

                        <div className="border-t border-gray-200 p-4">
                          <label className="block text-xs font-medium uppercase tracking-wide text-gray-500" htmlFor={`review-note-${pair.pairId}`}>
                            Reviewer Notes
                          </label>
                          <textarea
                            id={`review-note-${pair.pairId}`}
                            className="mt-2 min-h-[96px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-200"
                            value={getDraftNote(noteDrafts, pair)}
                            onChange={(event) => setNoteDrafts((current) => ({
                              ...current,
                              [pair.pairId]: event.target.value,
                            }))}
                            placeholder="Capture approval rationale or why the pair was rejected."
                          />

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              isLoading={reviewMutation.fetching && activeReviewPairId === pair.pairId}
                              onClick={() => void submitReview(pair, 'APPROVED')}
                            >
                              Approve Pair
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="danger"
                              isLoading={reviewMutation.fetching && activeReviewPairId === pair.pairId}
                              onClick={() => void submitReview(pair, 'REJECTED')}
                            >
                              Reject Pair
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
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
            <div className="mt-4 grid gap-3 md:grid-cols-5">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">% Unchanged</div>
                <div className="mt-1 text-base font-semibold text-gray-900">
                  {formatPercent(result.summary.matchRate)}
                </div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Comparable Pairs</div>
                <div className="mt-1 text-base font-semibold text-gray-900">
                  {result.summary.comparablePairs}
                </div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Missing Pairs</div>
                <div className="mt-1 text-base font-semibold text-gray-900">
                  {result.summary.missingPairs}
                </div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Sensitive Models</div>
                <div className="mt-1 text-base font-semibold text-gray-900">
                  {result.summary.sensitiveModelCount}
                </div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Sensitive Vignettes</div>
                <div className="mt-1 text-base font-semibold text-gray-900">
                  {result.summary.sensitiveVignetteCount}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              <div>
                Candidate pairs: {result.summary.totalCandidatePairs} · Qualifying: {result.summary.qualifyingPairs} · Comparable: {result.summary.comparablePairs}
              </div>
              {result.summary.excludedPairs.length > 0 && (
                <div className="mt-1">
                  Excluded: {result.summary.excludedPairs.map((entry) => `${entry.reason} (${entry.count})`).join(', ')}
                </div>
              )}
              <div className="mt-1">
                Mode: {directionOnly ? 'Direction-only' : 'Exact'} · {trimOutliers ? 'Trimmed 3' : 'All 5'}
              </div>
            </div>

            {modelOptions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedModelId('ALL')}
                  className={selectedModelId === 'ALL' ? 'border-teal-600 bg-teal-50 text-teal-800' : ''}
                >
                  All Models
                </Button>
                {modelOptions.map((model) => (
                  <Button
                    key={model.modelId}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedModelId(model.modelId)}
                    className={selectedModelId === model.modelId ? 'border-teal-600 bg-teal-50 text-teal-800' : ''}
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
              ) : groupedRows.map((group) => (
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
                          <th className="px-3 py-2 text-left font-medium text-gray-600">A Level</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">B Level</th>
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
                            <tr key={`${row.modelId}-${row.conditionKey}`} className={row.isMatch === false ? 'bg-amber-50' : ''}>
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
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from 'urql';
import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ErrorMessage } from '../ui/ErrorMessage';
import {
  DomainEvaluationStatusDrawer,
} from '../domains/domainTrials/DomainEvaluationStatusDrawer';
import {
  DomainEvaluationStatusPanel,
} from '../domains/domainTrials/DomainEvaluationStatusPanel';
import {
  formatTimestamp,
} from '../domains/domainTrials/DomainEvaluationStatusPanel.helpers';
import {
  ACTIVE_EVALUATIONS_QUERY,
  type ActiveEvaluation,
  type ActiveEvaluationsQueryResult,
  type ActiveEvaluationsQueryVariables,
} from '../../api/operations/active-evaluation';
import {
  DOMAIN_TRIAL_RUNS_STATUS_QUERY,
  type DomainTrialRunsStatusQueryResult,
  type DomainTrialRunsStatusQueryVariables,
} from '../../api/operations/domains';

type ActiveEvaluationsSectionProps = {
  domainId?: string | null;
  pollIntervalMs?: number;
};

type DomainEvaluationGroup = {
  domainId: string;
  domainName: string;
  evaluations: ActiveEvaluation[];
};

type RunStatusRow = DomainTrialRunsStatusQueryResult['domainTrialRunsStatus'][number];

function formatSectionError(message: string): string {
  return `Failed to load active evaluations: ${message}`;
}

function groupEvaluationsByDomain(evaluations: ActiveEvaluation[]): DomainEvaluationGroup[] {
  const groups = new Map<string, DomainEvaluationGroup>();
  const orderedGroups: DomainEvaluationGroup[] = [];

  for (const evaluation of evaluations) {
    const existing = groups.get(evaluation.domainId);
    if (existing != null) {
      existing.evaluations.push(evaluation);
      continue;
    }

    const group = {
      domainId: evaluation.domainId,
      domainName: evaluation.domainNameAtLaunch,
      evaluations: [evaluation],
    };
    groups.set(evaluation.domainId, group);
    orderedGroups.push(group);
  }

  return orderedGroups;
}

function formatEvaluationSummary(evaluation: ActiveEvaluation): string {
  const parts = [
    evaluation.scopeCategory,
    `${evaluation.memberCount} run${evaluation.memberCount === 1 ? '' : 's'}`,
  ];

  if (evaluation.startedAt != null) {
    parts.push(`started ${formatTimestamp(evaluation.startedAt)}`);
  }

  if (evaluation.completedAt != null) {
    parts.push(`completed ${formatTimestamp(evaluation.completedAt)}`);
  }

  return parts.join(' · ');
}

export function ActiveEvaluationsSection({
  domainId,
  pollIntervalMs = 5000,
}: ActiveEvaluationsSectionProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const normalizedDomainId = domainId != null && domainId.trim() !== '' ? domainId : null;
  const rawSelectedRunId = searchParams.get('runId');
  const selectedRunId = rawSelectedRunId != null && rawSelectedRunId.trim() !== '' ? rawSelectedRunId : null;

  const [evaluationsResult, reexecuteEvaluations] = useQuery<
    ActiveEvaluationsQueryResult,
    ActiveEvaluationsQueryVariables
  >({
    query: ACTIVE_EVALUATIONS_QUERY,
    variables: { domainId: normalizedDomainId },
    requestPolicy: 'network-only',
  });

  const activeEvaluations = useMemo(
    () => evaluationsResult.data?.activeEvaluations ?? [],
    [evaluationsResult.data?.activeEvaluations],
  );

  const activeRunIds = useMemo(() => {
    const ids = new Set<string>();
    for (const evaluation of activeEvaluations) {
      for (const member of evaluation.members) {
        ids.add(member.runId);
      }
    }
    return Array.from(ids).sort();
  }, [activeEvaluations]);

  const [statusResult, reexecuteStatuses] = useQuery<
    DomainTrialRunsStatusQueryResult,
    DomainTrialRunsStatusQueryVariables
  >({
    query: DOMAIN_TRIAL_RUNS_STATUS_QUERY,
    variables: { runIds: activeRunIds },
    pause: activeRunIds.length === 0,
    requestPolicy: 'network-only',
  });

  const queryError = evaluationsResult.error ?? statusResult.error ?? null;
  const isInitialLoading = evaluationsResult.fetching && evaluationsResult.data == null;
  const isRefreshing = (evaluationsResult.fetching || statusResult.fetching) && evaluationsResult.data != null;

  const isFetchingRef = useRef(false);
  useEffect(() => {
    isFetchingRef.current = evaluationsResult.fetching || statusResult.fetching;
  }, [evaluationsResult.fetching, statusResult.fetching]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (isFetchingRef.current) {
        return;
      }

      reexecuteEvaluations({ requestPolicy: 'network-only' });
      if (activeRunIds.length > 0) {
        reexecuteStatuses({ requestPolicy: 'network-only' });
      }
    }, pollIntervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeRunIds, pollIntervalMs, reexecuteEvaluations, reexecuteStatuses]);

  const evaluationStatuses = useMemo(
    () => statusResult.data?.domainTrialRunsStatus ?? [],
    [statusResult.data?.domainTrialRunsStatus],
  );

  const evaluationStatusesByRunId = useMemo(() => {
    return new Map<string, RunStatusRow>(evaluationStatuses.map((status) => [status.runId, status]));
  }, [evaluationStatuses]);

  const groupedEvaluations = useMemo(
    () => groupEvaluationsByDomain(activeEvaluations),
    [activeEvaluations],
  );

  const handleRunSelect = (runId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('runId', runId);
    setSearchParams(next, { replace: true });
  };

  const handleDrawerClose = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('runId');
    setSearchParams(next, { replace: true });
  };

  if (isInitialLoading) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="px-6 py-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="h-5 w-44 rounded bg-gray-200 animate-pulse" />
              <div className="h-4 w-64 rounded bg-gray-100 animate-pulse" />
            </div>
            <div className="h-9 w-24 rounded-md bg-gray-100 animate-pulse" />
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border border-gray-200 bg-white p-4 animate-pulse">
              <div className="h-4 w-56 rounded bg-gray-200" />
              <div className="mt-3 grid gap-2">
                <div className="h-4 rounded bg-gray-100" />
                <div className="h-4 rounded bg-gray-100" />
                <div className="h-4 rounded bg-gray-100" />
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const showEmptyState = queryError == null && groupedEvaluations.length === 0;

  return (
    <>
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="px-6 py-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-medium text-gray-900">
                  Active Evaluations
                </h2>
                <Badge variant="neutral" size="count">
                  {activeEvaluations.length}
                </Badge>
              </div>
              <p className="text-sm text-gray-500">
                Live evaluation launches currently pending, running, paused, or summarizing.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isRefreshing && (
                <span className="text-xs font-medium text-gray-500">Refreshing…</span>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  reexecuteEvaluations({ requestPolicy: 'network-only' });
                  if (activeRunIds.length > 0) {
                    reexecuteStatuses({ requestPolicy: 'network-only' });
                  }
                }}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          {queryError != null && (
            <ErrorMessage
              message={formatSectionError(queryError.message)}
              onRetry={() => {
                reexecuteEvaluations({ requestPolicy: 'network-only' });
                if (activeRunIds.length > 0) {
                  reexecuteStatuses({ requestPolicy: 'network-only' });
                }
              }}
            />
          )}

          {showEmptyState ? (
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
              <p className="text-sm font-medium text-gray-900">No active evaluations.</p>
              <p className="mt-1 text-sm text-gray-500">
                Nothing is currently pending, running, paused, or summarizing.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedEvaluations.map((group) => (
                <section key={group.domainId} className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-gray-900">
                        {group.domainName}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {group.evaluations.length} active evaluation{group.evaluations.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <Badge variant="neutral" size="count">
                      {group.domainId.slice(-8)}
                    </Badge>
                  </div>

                  <div className="space-y-4">
                    {group.evaluations.map((evaluation) => {
                      const runStatuses = evaluation.members
                        .map((member) => evaluationStatusesByRunId.get(member.runId))
                        .filter((status): status is RunStatusRow => status != null);

                      return (
                        <div key={evaluation.id} className="space-y-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-sm font-semibold text-gray-900">
                                  Launch {evaluation.id.slice(-8)}
                                </h4>
                                <Badge variant="info" size="count">
                                  {evaluation.status.toLowerCase()}
                                </Badge>
                              </div>
                              <p className="text-xs text-gray-600">
                                {formatEvaluationSummary(evaluation)}
                              </p>
                            </div>
                          </div>

                          <DomainEvaluationStatusPanel
                            domainName={group.domainName}
                            evaluation={evaluation}
                            evaluationStatus={null}
                            runStatuses={runStatuses}
                            fetching={evaluationsResult.fetching || statusResult.fetching}
                            lastUpdatedAt={null}
                            selectedRunId={selectedRunId}
                            onSelectRun={handleRunSelect}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </section>

      <DomainEvaluationStatusDrawer
        runId={selectedRunId}
        open={selectedRunId != null}
        onClose={handleDrawerClose}
      />
    </>
  );
}

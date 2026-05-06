import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'urql';
import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge, getStatusVariant } from '../ui/Badge';
import { ErrorMessage } from '../ui/ErrorMessage';
import { formatTimestamp } from '../domains/domainTrials/DomainEvaluationStatusPanel.helpers';
import {
  STANDALONE_ACTIVE_RUNS_QUERY,
  type StandaloneActiveRun,
  type StandaloneActiveRunsQueryResult,
  type StandaloneActiveRunsQueryVariables,
} from '../../api/operations/standalone-active-runs';

type StandaloneActiveRunsSectionProps = {
  pollIntervalMs?: number;
};

type RunConfig = {
  models?: string[];
};

function getModels(run: StandaloneActiveRun): string[] {
  const config = run.config as RunConfig | null;
  return config?.models ?? [];
}

function formatSectionError(message: string): string {
  return `Failed to load standalone runs: ${message}`;
}

export function StandaloneActiveRunsSection({
  pollIntervalMs = 5000,
}: StandaloneActiveRunsSectionProps) {
  const [result, reexecute] = useQuery<
    StandaloneActiveRunsQueryResult,
    StandaloneActiveRunsQueryVariables
  >({
    query: STANDALONE_ACTIVE_RUNS_QUERY,
    requestPolicy: 'network-only',
  });

  const isFetchingRef = useRef(false);
  useEffect(() => {
    isFetchingRef.current = result.fetching;
  }, [result.fetching]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!isFetchingRef.current) {
        reexecute({ requestPolicy: 'network-only' });
      }
    }, pollIntervalMs);
    return () => window.clearInterval(interval);
  }, [pollIntervalMs, reexecute]);

  const runs = result.data?.standaloneActiveRuns ?? [];
  const isInitialLoading = result.fetching && result.data == null;
  const isRefreshing = result.fetching && result.data != null;

  if (isInitialLoading) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="px-6 py-5 space-y-4">
          <div className="h-5 w-44 rounded bg-gray-200 animate-pulse" />
          <div className="space-y-3">
            <div className="h-12 rounded bg-gray-100 animate-pulse" />
          </div>
        </div>
      </section>
    );
  }

  if (runs.length === 0 && result.error == null) {
    return null;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="px-6 py-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-medium text-gray-900">
                Ad-hoc Runs
              </h2>
              <Badge variant="neutral" size="count">
                {runs.length}
              </Badge>
            </div>
            <p className="text-sm text-gray-500">
              Active runs not part of a domain launch.
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
              onClick={() => reexecute({ requestPolicy: 'network-only' })}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {result.error != null && (
          <ErrorMessage
            message={formatSectionError(result.error.message)}
            onRetry={() => reexecute({ requestPolicy: 'network-only' })}
          />
        )}

        <div className="divide-y divide-gray-100">
          {runs.map((run) => {
            const models = getModels(run);
            return (
              <div key={run.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/runs/${run.id}`}
                      className="text-sm font-medium text-gray-900 hover:underline truncate"
                    >
                      {run.definition?.name ?? run.id}
                    </Link>
                    <Badge variant={getStatusVariant(run.status)} size="md">
                      {run.status.toLowerCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    {run.startedAt != null
                      ? `Started ${formatTimestamp(run.startedAt)}`
                      : `Created ${formatTimestamp(run.createdAt)}`}
                    {models.length > 0 && ` · ${models.length} model${models.length === 1 ? '' : 's'}`}
                  </p>
                  {models.length > 0 && (
                    <p className="text-xs text-gray-400">{models.join(', ')}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 font-mono">{run.id.slice(-8)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

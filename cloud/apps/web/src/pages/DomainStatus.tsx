import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from 'urql';
import { Plus } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { DomainSwitcher } from '../components/domains/DomainSwitcher';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { DomainEvaluationStatusPanel } from '../components/domains/domainTrials/DomainEvaluationStatusPanel';
import { DomainEvaluationStatusDrawer } from '../components/domains/domainTrials/DomainEvaluationStatusDrawer';
import { getBatchRuntimeState } from '../components/domains/domainTrials/launch-state';
import {
  DOMAIN_EVALUATION_QUERY,
  DOMAIN_EVALUATION_STATUS_QUERY,
  DOMAIN_EVALUATIONS_QUERY,
  DOMAIN_TRIAL_RUNS_STATUS_QUERY,
  type DomainEvaluationQueryResult,
  type DomainEvaluationQueryVariables,
  type DomainEvaluationStatusQueryResult,
  type DomainEvaluationStatusQueryVariables,
  type DomainEvaluationsQueryResult,
  type DomainEvaluationsQueryVariables,
  type DomainTrialRunsStatusQueryResult,
  type DomainTrialRunsStatusQueryVariables,
} from '../api/operations/domains';
import { LLM_MODELS_QUERY, type LlmModelsQueryResult } from '../api/operations/llm';

const POLL_MS = 5000;

export function DomainStatus() {
  const { domainId } = useParams<{ domainId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [definitionRunIds, setDefinitionRunIds] = useState<Record<string, string>>({});
  const [currentEvaluationId, setCurrentEvaluationId] = useState<string | null>(searchParams.get('evaluationId'));
  const [lastStatusUpdatedAt, setLastStatusUpdatedAt] = useState<number | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [statusNoContentRetries, setStatusNoContentRetries] = useState(0);

  // --- Queries ---

  const [launchesResult] = useQuery<DomainEvaluationsQueryResult, DomainEvaluationsQueryVariables>({
    query: DOMAIN_EVALUATIONS_QUERY,
    variables: { domainId: domainId ?? '', limit: 1 },
    pause: !domainId,
    requestPolicy: 'cache-and-network',
  });

  const [currentEvaluationResult, refetchCurrentEvaluation] = useQuery<DomainEvaluationQueryResult, DomainEvaluationQueryVariables>({
    query: DOMAIN_EVALUATION_QUERY,
    variables: { id: currentEvaluationId ?? '' },
    pause: !currentEvaluationId,
    requestPolicy: 'cache-and-network',
  });

  const [currentEvaluationStatusResult, refetchCurrentEvaluationStatus] = useQuery<
    DomainEvaluationStatusQueryResult,
    DomainEvaluationStatusQueryVariables
  >({
    query: DOMAIN_EVALUATION_STATUS_QUERY,
    variables: { id: currentEvaluationId ?? '' },
    pause: !currentEvaluationId,
    requestPolicy: 'network-only',
  });

  const [statusResult, refetchStatus] = useQuery<DomainTrialRunsStatusQueryResult, DomainTrialRunsStatusQueryVariables>({
    query: DOMAIN_TRIAL_RUNS_STATUS_QUERY,
    variables: { runIds: Array.from(new Set(Object.values(definitionRunIds))) },
    pause: Object.keys(definitionRunIds).length === 0,
    requestPolicy: 'network-only',
  });

  const [llmModelsResult] = useQuery<LlmModelsQueryResult, { providerId?: string; status?: string }>({
    query: LLM_MODELS_QUERY,
    variables: { status: 'ACTIVE' },
    pause: !domainId,
    requestPolicy: 'cache-and-network',
  });

  // --- Derived state ---

  const launches = launchesResult.data?.domainEvaluations ?? [];
  const latestLaunch = launches[0] ?? null;
  const currentEvaluation = currentEvaluationResult.data?.domainEvaluation ?? null;
  const currentEvaluationStatus = currentEvaluationStatusResult.data?.domainEvaluationStatus ?? null;
  const runStatuses = useMemo(() => statusResult.data?.domainTrialRunsStatus ?? [], [statusResult.data?.domainTrialRunsStatus]);
  const domainName = currentEvaluation?.domainNameAtLaunch ?? latestLaunch?.domainNameAtLaunch ?? 'selected domain';
  const hasLiveRows = runStatuses.some((status) => getBatchRuntimeState(status) === 'LIVE');
  const modelCatalog = useMemo(() => llmModelsResult.data?.llmModels ?? [], [llmModelsResult.data?.llmModels]);
  const activeModelCatalogById = useMemo(
    () => new Map(modelCatalog.map((model) => [model.modelId, model])),
    [modelCatalog],
  );

  const hasLaunchSnapshot = currentEvaluation != null || currentEvaluationId != null;
  const statusHeader = hasLaunchSnapshot
    ? `Current launch: ${currentEvaluation?.id ?? currentEvaluationId?.slice(-8) ?? 'unknown'}`
    : null;

  // --- Fill-gap link computation (FR-010) ---

  const modelGaps = useMemo(() => {
    if (!currentEvaluation) return [];
    const target = currentEvaluation.targetBatchCount ?? 0;
    if (target === 0) return [];

    const coverageCounts = new Map<string, number>();
    for (const member of currentEvaluation.members) {
      for (const modelId of member.modelIds) {
        const key = `${member.definitionIdAtLaunch}::${modelId}`;
        coverageCounts.set(key, (coverageCounts.get(key) ?? 0) + 1);
      }
    }

    return currentEvaluation.models
      .map((modelId) => {
        const minCoverage = (currentEvaluation.launchableDefinitions ?? []).reduce((min, def) => {
          const count = coverageCounts.get(`${def.definitionId}::${modelId}`) ?? 0;
          return Math.min(min, count);
        }, Number.POSITIVE_INFINITY);
        const coverage = Number.isFinite(minCoverage) ? minCoverage : 0;
        const missing = Math.max(0, target - coverage);
        const catalogEntry = activeModelCatalogById.get(modelId);
        return {
          modelId,
          modelName: catalogEntry?.displayName ?? modelId,
          isActive: catalogEntry != null,
          missing,
        };
      })
      .filter((gap) => gap.missing > 0 && gap.isActive);
  }, [activeModelCatalogById, currentEvaluation]);

  // --- Effects ---

  useEffect(() => {
    const existingEvaluationId = searchParams.get('evaluationId');
    if (existingEvaluationId === currentEvaluationId) return;
    const next = new URLSearchParams(searchParams);
    if (currentEvaluationId != null) next.set('evaluationId', currentEvaluationId);
    else next.delete('evaluationId');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [currentEvaluationId, searchParams, setSearchParams]);

  useEffect(() => {
    if (currentEvaluationId == null && latestLaunch != null) {
      setCurrentEvaluationId(latestLaunch.id);
    }
  }, [currentEvaluationId, latestLaunch]);

  useEffect(() => {
    if (!currentEvaluation) return;
    const byRunId: Record<string, string> = {};
    for (const member of currentEvaluation.members) {
      byRunId[member.runId] = member.runId;
    }
    setDefinitionRunIds((prev) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(byRunId);
      if (prevKeys.length === nextKeys.length && nextKeys.every((key) => prev[key] === byRunId[key])) return prev;
      return byRunId;
    });
  }, [currentEvaluation]);

  useEffect(() => {
    if (!selectedRunId) return;
    if (!runStatuses.some((status) => status.runId === selectedRunId)) {
      setSelectedRunId(null);
    }
  }, [runStatuses, selectedRunId]);

  useEffect(() => {
    const message = statusResult.error?.message ?? '';
    if (!message.includes('No Content') || statusNoContentRetries >= 2) return;
    const timer = window.setTimeout(() => {
      setStatusNoContentRetries((prev) => prev + 1);
      refetchStatus({ requestPolicy: 'network-only' });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [refetchStatus, statusNoContentRetries, statusResult.error?.message]);

  useEffect(() => {
    if (!currentEvaluationId || runStatuses.length === 0 || !hasLiveRows) return;
    const interval = window.setInterval(() => {
      refetchStatus({ requestPolicy: 'network-only' });
      refetchCurrentEvaluationStatus({ requestPolicy: 'network-only' });
      refetchCurrentEvaluation({ requestPolicy: 'network-only' });
      setLastStatusUpdatedAt(Date.now());
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, [currentEvaluationId, hasLiveRows, refetchCurrentEvaluation, refetchCurrentEvaluationStatus, refetchStatus, runStatuses.length]);

  // --- Render ---

  if (!domainId) return <ErrorMessage message="Missing domain id." />;

  const suppressStatusNoContentError = (statusResult.error?.message ?? '').includes('No Content') && statusNoContentRetries < 2;
  const displayError = (currentEvaluationId != null ? currentEvaluationResult.error ?? currentEvaluationStatusResult.error ?? undefined : undefined)
    ?? (suppressStatusNoContentError ? undefined : statusResult.error);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Domain Status</div>
          <div className="flex flex-wrap items-center gap-2">
            <DomainSwitcher currentDomainId={domainId} basePath="/domains/status" />
            {statusHeader != null && (
              <Badge variant={hasLiveRows ? 'warning' : 'success'} size="count">
                {statusHeader}
              </Badge>
            )}
          </div>
        </div>
        <Link
          to={`/domains/start/${domainId}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          <Plus className="h-4 w-4" />
          Start new batch
        </Link>
      </div>

      {displayError != null && <ErrorMessage message={`Failed to load status: ${displayError.message ?? 'Unknown error'}`} />}

      {modelGaps.length > 0 && currentEvaluation != null && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <div className="text-sm font-medium text-amber-900">Models with incomplete coverage</div>
          <div className="flex flex-wrap gap-2">
            {modelGaps.map((gap) => (
              <Link
                key={gap.modelId}
                to={`/domains/start/${domainId}?evaluationId=${currentEvaluation.id}&models=${encodeURIComponent(gap.modelId)}&depth=${currentEvaluation.targetBatchCount ?? 1}`}
                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
              >
                {gap.modelName}: {gap.missing} missing
                <span aria-hidden="true">&rarr;</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <DomainEvaluationStatusPanel
        domainName={domainName}
        evaluation={currentEvaluation}
        evaluationStatus={currentEvaluationStatus}
        runStatuses={runStatuses}
        fetching={statusResult.fetching || currentEvaluationStatusResult.fetching || currentEvaluationResult.fetching}
        lastUpdatedAt={lastStatusUpdatedAt}
        selectedRunId={selectedRunId}
        onSelectRun={(runId) => setSelectedRunId(runId)}
      />

      <DomainEvaluationStatusDrawer
        runId={selectedRunId}
        open={selectedRunId != null}
        onClose={() => setSelectedRunId(null)}
      />
    </div>
  );
}

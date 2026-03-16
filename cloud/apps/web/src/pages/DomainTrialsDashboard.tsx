import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Badge } from '../components/ui/Badge';
import { LaunchConfirmModal } from '../components/domains/domainTrials/LaunchConfirmModal';
import { LaunchStatusPanel } from '../components/domains/domainTrials/LaunchStatusPanel';
import { LaunchControlsPanel } from '../components/domains/domainTrials/LaunchControlsPanel';
import { TrialGridTable } from '../components/domains/domainTrials/TrialGridTable';
import {
  cellKey,
  downloadCsv,
  formatCost,
  type DomainTrialLaunchSummary,
  type DomainTrialCellStatus,
} from '../components/domains/domainTrials/helpers';
import {
  DOMAIN_EVALUATIONS_QUERY,
  DOMAIN_EVALUATION_QUERY,
  DOMAIN_EVALUATION_STATUS_QUERY,
  DOMAIN_RUN_SUMMARY_QUERY,
  DOMAIN_TRIAL_RUNS_STATUS_QUERY,
  DOMAIN_TRIALS_PLAN_QUERY,
  ESTIMATE_DOMAIN_EVALUATION_COST_QUERY,
  START_DOMAIN_EVALUATION_MUTATION,
  type DomainEvaluationQueryResult,
  type DomainEvaluationQueryVariables,
  type DomainEvaluationsQueryResult,
  type DomainEvaluationsQueryVariables,
  type DomainEvaluationStatusQueryResult,
  type DomainEvaluationStatusQueryVariables,
  type DomainRunSummaryQueryResult,
  type DomainRunSummaryQueryVariables,
  type DomainTrialRunsStatusQueryResult,
  type DomainTrialRunsStatusQueryVariables,
  type DomainTrialsPlanQueryResult,
  type DomainTrialsPlanQueryVariables,
  type EstimateDomainEvaluationCostQueryResult,
  type EstimateDomainEvaluationCostQueryVariables,
  type StartDomainEvaluationMutationResult,
  type StartDomainEvaluationMutationVariables,
} from '../api/operations/domains';

const POLL_MS = 3000;
const EVALUATION_SCOPE_VALUES = ['PILOT', 'PRODUCTION', 'REPLICATION', 'VALIDATION'] as const;
type EvaluationScopeCategory = (typeof EVALUATION_SCOPE_VALUES)[number];

function isEvaluationScopeCategory(value: string | null): value is EvaluationScopeCategory {
  return value != null && EVALUATION_SCOPE_VALUES.includes(value as EvaluationScopeCategory);
}

function formatTimestamp(value: string | number | null | undefined): string {
  if (value == null) return 'Unknown';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

export function DomainTrialsDashboard() {
  const { domainId } = useParams<{ domainId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTemperatureParam = searchParams.get('temperature');
  const initialParsedTemperature = initialTemperatureParam == null ? Number.NaN : Number.parseFloat(initialTemperatureParam);
  const hasInitialTemperature = Number.isFinite(initialParsedTemperature) && initialParsedTemperature >= 0 && initialParsedTemperature <= 2;
  const initialScope = isEvaluationScopeCategory(searchParams.get('scopeCategory'))
    ? (searchParams.get('scopeCategory') as EvaluationScopeCategory)
    : 'PRODUCTION';
  const [scopeCategory, setScopeCategory] = useState<EvaluationScopeCategory>(initialScope);
  const [useDefaultTemperature, setUseDefaultTemperature] = useState(!hasInitialTemperature);
  const [temperatureInput, setTemperatureInput] = useState(hasInitialTemperature ? String(initialParsedTemperature) : '0.7');
  const [started, setStarted] = useState(false);
  const [definitionRunIds, setDefinitionRunIds] = useState<Record<string, string>>({});
  const [runError, setRunError] = useState<string | null>(null);
  const [launchSummary, setLaunchSummary] = useState<DomainTrialLaunchSummary | null>(null);
  const [lastStatusUpdatedAt, setLastStatusUpdatedAt] = useState<number | null>(null);
  const [planNoContentRetries, setPlanNoContentRetries] = useState(0);
  const [statusNoContentRetries, setStatusNoContentRetries] = useState(0);
  const [showLaunchConfirm, setShowLaunchConfirm] = useState(false);
  const [maxBudgetEnabled, setMaxBudgetEnabled] = useState(false);
  const [maxBudgetInput, setMaxBudgetInput] = useState('');
  const [currentEvaluationId, setCurrentEvaluationId] = useState<string | null>(searchParams.get('evaluationId'));

  const parsedTemperature = Number.parseFloat(temperatureInput);
  const hasValidTemperature = Number.isFinite(parsedTemperature) && parsedTemperature >= 0 && parsedTemperature <= 2;
  const selectedTemperature = !useDefaultTemperature && hasValidTemperature ? parsedTemperature : undefined;
  const parsedBudget = Number.parseFloat(maxBudgetInput);
  const hasValidBudget = Number.isFinite(parsedBudget) && parsedBudget > 0;
  const filteredDefinitionIds = useMemo(() => {
    const raw = searchParams.get('definitionIds');
    if (!raw) return [];
    return raw
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== '');
  }, [searchParams]);
  const filteredDefinitionIdCount = useMemo(() => new Set(filteredDefinitionIds).size, [filteredDefinitionIds]);

  const [planResult, refetchPlan] = useQuery<DomainTrialsPlanQueryResult, DomainTrialsPlanQueryVariables>({
    query: DOMAIN_TRIALS_PLAN_QUERY,
    variables: { domainId: domainId ?? '', temperature: selectedTemperature, definitionIds: filteredDefinitionIds },
    pause: !domainId,
    requestPolicy: 'cache-and-network',
  });
  const [estimateResult, refetchEstimate] = useQuery<EstimateDomainEvaluationCostQueryResult, EstimateDomainEvaluationCostQueryVariables>({
    query: ESTIMATE_DOMAIN_EVALUATION_COST_QUERY,
    variables: {
      domainId: domainId ?? '',
      definitionIds: filteredDefinitionIds.length > 0 ? filteredDefinitionIds : undefined,
      temperature: selectedTemperature,
      samplePercentage: 100,
      samplesPerScenario: 1,
      scopeCategory,
    },
    pause: !domainId,
    requestPolicy: 'cache-and-network',
  });
  const [summaryResult, refetchSummary] = useQuery<DomainRunSummaryQueryResult, DomainRunSummaryQueryVariables>({
    query: DOMAIN_RUN_SUMMARY_QUERY,
    variables: { domainId: domainId ?? '' },
    pause: !domainId,
    requestPolicy: 'cache-and-network',
  });
  const [evaluationsResult, refetchEvaluations] = useQuery<DomainEvaluationsQueryResult, DomainEvaluationsQueryVariables>({
    query: DOMAIN_EVALUATIONS_QUERY,
    variables: { domainId: domainId ?? '', limit: 8 },
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
  const [startDomainEvaluationResult, startDomainEvaluation] = useMutation<
    StartDomainEvaluationMutationResult,
    StartDomainEvaluationMutationVariables
  >(START_DOMAIN_EVALUATION_MUTATION);
  useEffect(() => {
    const existingScope = searchParams.get('scopeCategory');
    const existingEvaluationId = searchParams.get('evaluationId');
    if (existingScope === scopeCategory && existingEvaluationId === currentEvaluationId) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('scopeCategory', scopeCategory);
    if (currentEvaluationId) next.set('evaluationId', currentEvaluationId);
    else next.delete('evaluationId');
    setSearchParams(next, { replace: true });
  }, [scopeCategory, currentEvaluationId, searchParams, setSearchParams]);

  const currentEvaluation = currentEvaluationResult.data?.domainEvaluation ?? null;
  const recentEvaluations = evaluationsResult.data?.domainEvaluations ?? [];
  const selectedEvaluation = currentEvaluation ?? recentEvaluations[0] ?? null;

  useEffect(() => {
    if (!currentEvaluationId && recentEvaluations.length > 0) {
      setCurrentEvaluationId(recentEvaluations[0]?.id ?? null);
    }
  }, [currentEvaluationId, recentEvaluations]);

  useEffect(() => {
    if (!currentEvaluation) return;
    const byDefinition: Record<string, string> = {};
    for (const member of currentEvaluation.members) {
      byDefinition[member.definitionIdAtLaunch] = member.runId;
    }
    setDefinitionRunIds((prev) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(byDefinition);
      if (prevKeys.length === nextKeys.length && nextKeys.every((key) => prev[key] === byDefinition[key])) {
        return prev;
      }
      return byDefinition;
    });
    setStarted((prev) => prev || true);
  }, [currentEvaluation]);

  const runIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(definitionRunIds).forEach((id) => ids.add(id));
    return Array.from(ids);
  }, [definitionRunIds]);

  const [statusResult, refetchStatus] = useQuery<DomainTrialRunsStatusQueryResult, DomainTrialRunsStatusQueryVariables>({
    query: DOMAIN_TRIAL_RUNS_STATUS_QUERY,
    variables: { runIds },
    pause: runIds.length === 0,
    requestPolicy: 'network-only',
  });

  const computedStatusSummary = useMemo(() => {
    const runStatuses = statusResult.data?.domainTrialRunsStatus ?? [];
    const total = runIds.length;
    const known = runStatuses.length;
    const completed = runStatuses.filter((run) => run.status === 'COMPLETED').length;
    const failed = runStatuses.filter((run) => run.status === 'FAILED' || run.status === 'CANCELLED').length;
    const active = runStatuses.filter((run) => ['PENDING', 'RUNNING', 'SUMMARIZING', 'PAUSED'].includes(run.status)).length;
    return { total, known, completed, failed, active };
  }, [runIds.length, statusResult.data?.domainTrialRunsStatus]);

  const domainEvaluationStatus = currentEvaluationStatusResult.data?.domainEvaluationStatus;
  const statusSummary = domainEvaluationStatus
    ? {
      total: domainEvaluationStatus.totalRuns,
      known: domainEvaluationStatus.totalRuns,
      completed: domainEvaluationStatus.completedRuns,
      failed: domainEvaluationStatus.failedRuns + domainEvaluationStatus.cancelledRuns,
      active: domainEvaluationStatus.pendingRuns + domainEvaluationStatus.runningRuns,
    }
    : computedStatusSummary;

  const allRunsTerminal = statusSummary.total > 0 && statusSummary.active === 0 && statusSummary.known === statusSummary.total;
  const completionWithFailures = allRunsTerminal && statusSummary.failed > 0;
  const completionClean = allRunsTerminal && statusSummary.failed === 0;

  useEffect(() => {
    if (!started || runIds.length === 0 || allRunsTerminal) return;
    const interval = window.setInterval(() => {
      refetchStatus({ requestPolicy: 'network-only' });
      if (currentEvaluationId) {
        refetchCurrentEvaluationStatus({ requestPolicy: 'network-only' });
        refetchCurrentEvaluation({ requestPolicy: 'network-only' });
      }
      refetchSummary({ requestPolicy: 'network-only' });
      refetchEvaluations({ requestPolicy: 'network-only' });
      setLastStatusUpdatedAt(Date.now());
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, [
    started,
    runIds.length,
    allRunsTerminal,
    currentEvaluationId,
    refetchCurrentEvaluation,
    refetchCurrentEvaluationStatus,
    refetchEvaluations,
    refetchStatus,
    refetchSummary,
  ]);

  useEffect(() => {
    const message = planResult.error?.message ?? '';
    if (!message.includes('No Content')) return;
    if (planNoContentRetries >= 2) return;

    const timer = window.setTimeout(() => {
      setPlanNoContentRetries((prev) => prev + 1);
      refetchPlan({ requestPolicy: 'network-only' });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [planResult.error?.message, planNoContentRetries, refetchPlan]);

  useEffect(() => {
    const message = statusResult.error?.message ?? '';
    if (!message.includes('No Content')) return;
    if (statusNoContentRetries >= 2) return;
    if (!started) return;

    const timer = window.setTimeout(() => {
      setStatusNoContentRetries((prev) => prev + 1);
      refetchStatus({ requestPolicy: 'network-only' });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [statusResult.error?.message, statusNoContentRetries, started, refetchStatus]);

  const plan = planResult.data?.domainTrialsPlan;
  const estimate = estimateResult.data?.estimateDomainEvaluationCost;
  const models = plan?.models ?? [];
  const vignettes = plan?.vignettes ?? [];
  const excludedRequestedDefinitionCount = filteredDefinitionIdCount - vignettes.length;
  const hasNonTemperatureModels = models.some((model) => !model.supportsTemperature);
  const disableTemperatureInput = hasNonTemperatureModels;
  const cellEstimates = useMemo(() => {
    const next = new Map<string, number>();
    for (const cell of plan?.cellEstimates ?? []) {
      next.set(cellKey(cell.definitionId, cell.modelId), cell.estimatedCost);
    }
    return next;
  }, [plan?.cellEstimates]);
  const runStatusById = useMemo(() => {
    const map = new Map<string, DomainTrialRunsStatusQueryResult['domainTrialRunsStatus'][number]>();
    for (const status of statusResult.data?.domainTrialRunsStatus ?? []) {
      map.set(status.runId, status);
    }
    return map;
  }, [statusResult.data?.domainTrialRunsStatus]);

  useEffect(() => {
    if (!disableTemperatureInput) return;
    setUseDefaultTemperature(true);
  }, [disableTemperatureInput]);

  const isStarting = startDomainEvaluationResult.fetching;

  const handleStart = async () => {
    if (!domainId) return;
    setRunError(null);
    if (!useDefaultTemperature && !hasValidTemperature) {
      setRunError('Temperature must be between 0 and 2.');
      return;
    }
    if (maxBudgetEnabled && !hasValidBudget) {
      setRunError('Budget cap must be a number greater than 0.');
      return;
    }

    const result = await startDomainEvaluation({
      domainId,
      scopeCategory,
      temperature: useDefaultTemperature || disableTemperatureInput ? undefined : parsedTemperature,
      maxBudgetUsd: maxBudgetEnabled ? parsedBudget : undefined,
      definitionIds: filteredDefinitionIds.length > 0 ? filteredDefinitionIds : undefined,
      samplePercentage: 100,
      samplesPerScenario: 1,
    });
    if (result.error) {
      setRunError(result.error.message);
      return;
    }
    const payload = result.data?.startDomainEvaluation;
    if (!payload) {
      setRunError('Failed to start domain evaluation.');
      return;
    }
    if (payload.blockedByActiveLaunch) {
      setRunError('An equivalent active domain evaluation is already running for this domain.');
      return;
    }

    setLaunchSummary({
      targetedDefinitions: payload.targetedDefinitions,
      startedRuns: payload.startedRuns,
      failedDefinitions: payload.failedDefinitions,
      skippedForBudget: payload.skippedForBudget,
      projectedCostUsd: payload.projectedCostUsd,
      startedAt: Date.now(),
    });

    const byDefinition: Record<string, string> = {};
    for (const run of payload.runs) {
      byDefinition[run.definitionId] = run.runId;
    }
    setDefinitionRunIds(byDefinition);
    setStarted(true);
    setShowLaunchConfirm(false);
    setCurrentEvaluationId(payload.domainEvaluationId);
    refetchCurrentEvaluation({ requestPolicy: 'network-only' });
    refetchCurrentEvaluationStatus({ requestPolicy: 'network-only' });
    refetchEvaluations({ requestPolicy: 'network-only' });
    refetchSummary({ requestPolicy: 'network-only' });
    refetchStatus({ requestPolicy: 'network-only' });
    setLastStatusUpdatedAt(Date.now());
    if (payload.startedRuns === 0) {
      setRunError('No runs were started. Check launch status below for failed starts.');
    }
  };

  const getCellStatus = (definitionId: string, modelId: string): DomainTrialCellStatus => {
    const baseRunId = definitionRunIds[definitionId];
    const runId = baseRunId;
    if (!runId) return { runId: null, runStatus: null, modelStatus: null };

    const runStatus = runStatusById.get(runId) ?? null;
    const modelStatus = runStatus?.modelStatuses.find((status) => status.modelId === modelId) ?? null;
    return { runId, runStatus, modelStatus };
  };

  const handleExportLedger = () => {
    const rows: string[][] = [[
      'domainId', 'definitionId', 'definitionName', 'modelId', 'runId', 'runStatus',
      'generation', 'summarization', 'estimatedCostUsd', 'latestError',
    ]];

    for (const vignette of vignettes) {
      for (const model of models) {
        const status = getCellStatus(vignette.definitionId, model.modelId);
        const modelStatus = status.modelStatus;
        const generation = modelStatus
          ? `${modelStatus.generationCompleted + modelStatus.generationFailed}/${modelStatus.generationTotal}`
          : '';
        const summarization = modelStatus
          ? `${modelStatus.summarizationCompleted + modelStatus.summarizationFailed}/${modelStatus.summarizationTotal}`
          : '';
        rows.push([
          domainId ?? '',
          vignette.definitionId,
          vignette.definitionName,
          model.modelId,
          status.runId ?? '',
          status.runStatus?.status ?? '',
          generation,
          summarization,
          String(cellEstimates.get(cellKey(vignette.definitionId, model.modelId)) ?? 0),
          modelStatus?.latestErrorMessage ?? '',
        ]);
      }
    }

    const stamp = new Date().toISOString().split(':').join('-');
    downloadCsv(`domain-trials-ledger-${stamp}.csv`, rows);
  };

  if (!domainId) return <ErrorMessage message="Missing domain id." />;

  const planErrorMessage = planResult.error?.message ?? '';
  const statusErrorMessage = statusResult.error?.message ?? '';
  const suppressPlanNoContentError = planErrorMessage.includes('No Content') && planNoContentRetries < 2;
  const suppressStatusNoContentError = statusErrorMessage.includes('No Content') && statusNoContentRetries < 2;
  const planDisplayError = suppressPlanNoContentError ? undefined : planResult.error;
  const statusDisplayError = suppressStatusNoContentError ? undefined : statusResult.error;
  const displayError = planDisplayError ?? (started ? statusDisplayError : undefined);
  const summary = summaryResult.data?.domainRunSummary;
  const reviewSetupHref = `/domains?domainId=${domainId}&tab=setup&setupTab=contexts`;
  const reviewVignettesHref = `/domains?domainId=${domainId}&tab=vignettes`;
  const temperatureLabel = useDefaultTemperature || disableTemperatureInput
    ? 'Provider default'
    : String(parsedTemperature);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Domain Evaluation Summary</h1>
          <p className="text-sm text-gray-600">
            Launch domain evaluations, monitor cohort-level status, and drill down into vignette-scoped runs for{' '}
            <span className="font-medium">{plan?.domainName ?? 'selected domain'}</span>.
          </p>
          <p className="text-xs text-gray-500">
            Domain Evaluation Summary is the cohort-level view. Use individual run pages for run-scoped diagnostics.
          </p>
          {filteredDefinitionIds.length > 0 && (
            <p className="text-xs text-amber-700">
              Scoped to {filteredDefinitionIds.length} selected vignette{filteredDefinitionIds.length === 1 ? '' : 's'}.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => {
            refetchPlan({ requestPolicy: 'network-only' });
            refetchEstimate({ requestPolicy: 'network-only' });
            refetchSummary({ requestPolicy: 'network-only' });
            refetchEvaluations({ requestPolicy: 'network-only' });
            if (currentEvaluationId) {
              refetchCurrentEvaluation({ requestPolicy: 'network-only' });
              refetchCurrentEvaluationStatus({ requestPolicy: 'network-only' });
            }
          }}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleExportLedger} disabled={vignettes.length === 0 || models.length === 0}>
            Export Ledger CSV
          </Button>
          <Link to="/domains" className="inline-flex h-9 items-center rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Back to Domains
          </Link>
        </div>
      </div>

      {displayError && <ErrorMessage message={`Failed to load domain evaluation data: ${displayError.message ?? 'Unknown error'}`} />}
      {runError && <ErrorMessage message={runError} />}
      {filteredDefinitionIdCount > 0 && excludedRequestedDefinitionCount > 0 && (
        <ErrorMessage message={`Requested ${filteredDefinitionIdCount} scoped vignette IDs but ${excludedRequestedDefinitionCount} were invalid, stale, or not latest definitions in this domain.`} />
      )}

      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info" size="count">Evaluations: {summary?.totalEvaluations ?? 0}</Badge>
            <Badge variant="warning" size="count">Active member runs: {summary?.runningMemberRuns ?? 0}</Badge>
            <Badge variant="success" size="count">Completed member runs: {summary?.completedMemberRuns ?? 0}</Badge>
            <Badge variant={(summary?.failedMemberRuns ?? 0) > 0 ? 'error' : 'neutral'} size="count">
              Failed member runs: {summary?.failedMemberRuns ?? 0}
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Latest evaluation</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {summary?.latestEvaluationId ? summary.latestEvaluationId.slice(-8) : 'No evaluation yet'}
              </div>
              <div className="text-xs text-gray-600">
                {summary?.latestScopeCategory ? `${summary.latestScopeCategory.toLowerCase()} · ${summary.latestEvaluationStatus?.toLowerCase()}` : 'Start a pilot or production evaluation.'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">History mix</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {summary?.productionEvaluations ?? 0} production · {summary?.replicationEvaluations ?? 0} replication
              </div>
              <div className="text-xs text-gray-600">
                {summary?.pilotEvaluations ?? 0} pilot · {summary?.validationEvaluations ?? 0} validation
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Current estimate</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{formatCost(estimate?.totalEstimatedCost ?? 0)}</div>
              <div className="text-xs text-gray-600">
                {estimate?.estimateConfidence ? `Confidence: ${estimate.estimateConfidence.toLowerCase()}` : 'Estimate unavailable'}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div>
            <h2 className="text-lg font-medium text-[#1A1A1A]">Recent evaluations</h2>
            <p className="text-sm text-gray-600">Select a cohort summary or launch a new scoped evaluation.</p>
          </div>
          {recentEvaluations.length === 0 ? (
            <p className="text-sm text-gray-600">No domain evaluations yet.</p>
          ) : (
            <div className="space-y-2">
                  {recentEvaluations.map((evaluation) => (
                    <Button
                      key={evaluation.id}
                      type="button"
                      variant="secondary"
                      onClick={() => setCurrentEvaluationId(evaluation.id)}
                      className={`w-full rounded-lg px-3 py-3 text-left justify-start ${currentEvaluationId === evaluation.id ? 'border-teal-400 bg-teal-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                    >
                      <div className="flex w-full items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            {evaluation.scopeCategory.toLowerCase()} · {evaluation.status.toLowerCase()}
                          </div>
                          <div className="text-xs text-gray-600">
                            {evaluation.memberCount} runs · {formatCost(evaluation.projectedCostUsd)} projected
                          </div>
                        </div>
                        <div className="text-right text-xs text-gray-500">
                          <div>{formatTimestamp(evaluation.createdAt)}</div>
                          <div>{evaluation.id.slice(-8)}</div>
                        </div>
                      </div>
                    </Button>
                  ))}
            </div>
          )}
        </div>
      </section>

      <LaunchControlsPanel
        scopeCategory={scopeCategory}
        vignetteCount={vignettes.length}
        modelCount={models.length}
        totalEstimatedCost={estimate?.totalEstimatedCost ?? plan?.totalEstimatedCost ?? 0}
        estimateConfidence={estimate?.estimateConfidence}
        fallbackReason={estimate?.fallbackReason}
        knownExclusions={estimate?.knownExclusions}
        useDefaultTemperature={useDefaultTemperature}
        disableTemperatureInput={disableTemperatureInput}
        temperatureInput={temperatureInput}
        maxBudgetEnabled={maxBudgetEnabled}
        maxBudgetInput={maxBudgetInput}
        hasValidBudget={hasValidBudget}
        isStarting={isStarting}
        planFetching={planResult.fetching || estimateResult.fetching}
        temperatureWarning={estimate?.temperatureWarning ?? plan?.temperatureWarning}
        reviewSetupHref={reviewSetupHref}
        reviewVignettesHref={reviewVignettesHref}
        excludedRequestedDefinitionCount={Math.max(0, excludedRequestedDefinitionCount)}
        onSetScopeCategory={setScopeCategory}
        onSetUseDefaultTemperature={setUseDefaultTemperature}
        onSetTemperatureInput={setTemperatureInput}
        onSetMaxBudgetEnabled={setMaxBudgetEnabled}
        onSetMaxBudgetInput={setMaxBudgetInput}
        onOpenConfirm={() => setShowLaunchConfirm(true)}
      />

      <LaunchStatusPanel
        evaluationId={currentEvaluationId}
        scopeCategory={selectedEvaluation?.scopeCategory ?? null}
        launchSummary={launchSummary}
        started={started}
        statusSummary={statusSummary}
        statusFetching={statusResult.fetching || currentEvaluationStatusResult.fetching}
        lastStatusUpdatedAt={lastStatusUpdatedAt}
        completionClean={completionClean}
        completionWithFailures={completionWithFailures}
      />

      {selectedEvaluation && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-[#1A1A1A]">Current cohort summary</h2>
              <p className="text-sm text-gray-600">
                Domain evaluation {selectedEvaluation.id.slice(-8)} · {selectedEvaluation.scopeCategory.toLowerCase()} · created {formatTimestamp(selectedEvaluation.createdAt)}
              </p>
              <p className="text-xs text-gray-500">
                Member runs below are run-scoped evidence for this one domain evaluation cohort.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="neutral" size="count">Members: {selectedEvaluation.memberCount}</Badge>
              <Badge variant="success" size="count">Projected: {formatCost(selectedEvaluation.projectedCostUsd)}</Badge>
            </div>
          </div>

          {currentEvaluation && currentEvaluation.members.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-600">
                    <th className="py-2 pr-3">Vignette</th>
                    <th className="py-2 pr-3">Run</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3">Started</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {currentEvaluation.members.map((member) => (
                    <tr key={member.runId} className="border-b border-gray-100">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-gray-900">{member.definitionNameAtLaunch}</div>
                        <div className="text-xs text-gray-500">{member.definitionIdAtLaunch.slice(-8)}</div>
                      </td>
                      <td className="py-2 pr-3 text-gray-700">{member.runId.slice(-8)}</td>
                      <td className="py-2 pr-3 text-gray-700">{member.runStatus.toLowerCase()}</td>
                      <td className="py-2 pr-3 text-gray-700">{member.runCategory.toLowerCase()}</td>
                      <td className="py-2 pr-3 text-gray-500">{formatTimestamp(member.runStartedAt)}</td>
                      <td className="py-2 pr-3">
                        <Link
                          to={`/runs/${member.runId}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-800"
                        >
                          Open run diagnostics
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div>
          <h2 className="text-lg font-medium text-[#1A1A1A]">Planned batches</h2>
          <p className="text-sm text-gray-600">
            Each batch runs every configured condition for a vignette across the selected models.
          </p>
        </div>
        <TrialGridTable
          loading={planResult.fetching}
          models={models.map((model) => ({ modelId: model.modelId, label: model.label }))}
          vignettes={vignettes.map((v) => ({
            definitionId: v.definitionId,
            definitionName: v.definitionName,
            definitionVersion: v.definitionVersion,
            signature: v.signature,
            scenarioCount: v.scenarioCount,
          }))}
          cellEstimates={cellEstimates}
          getCellStatus={getCellStatus}
        />
      </section>

      <LaunchConfirmModal
        open={showLaunchConfirm}
        domainName={plan?.domainName ?? domainId}
        scopeCategory={scopeCategory}
        vignetteCount={vignettes.length}
        modelCount={models.length}
        estimatedTotalCost={estimate?.totalEstimatedCost ?? plan?.totalEstimatedCost ?? 0}
        estimateConfidence={estimate?.estimateConfidence}
        fallbackReason={estimate?.fallbackReason}
        knownExclusions={estimate?.knownExclusions}
        temperatureLabel={temperatureLabel}
        budgetCap={maxBudgetEnabled && hasValidBudget ? parsedBudget : null}
        reviewSetupHref={reviewSetupHref}
        reviewVignettesHref={reviewVignettesHref}
        isStarting={isStarting}
        onCancel={() => setShowLaunchConfirm(false)}
        onConfirm={() => void handleStart()}
      />
    </div>
  );
}

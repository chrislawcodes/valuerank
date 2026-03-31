import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';
import { RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { LaunchConfirmModal } from '../components/domains/domainTrials/LaunchConfirmModal';
import { LaunchControlsPanel } from '../components/domains/domainTrials/LaunchControlsPanel';
import { DomainEvaluationStatusPanel } from '../components/domains/domainTrials/DomainEvaluationStatusPanel';
import { DomainEvaluationStatusDrawer } from '../components/domains/domainTrials/DomainEvaluationStatusDrawer';
import { buildProviderBudgetReadiness, getBatchRuntimeState } from '../components/domains/domainTrials/launch-state';
import {
  DOMAIN_EVALUATION_QUERY,
  DOMAIN_EVALUATION_STATUS_QUERY,
  DOMAIN_EVALUATIONS_QUERY,
  DOMAIN_TRIAL_RUNS_STATUS_QUERY,
  DOMAIN_TRIALS_PLAN_QUERY,
  ESTIMATE_DOMAIN_EVALUATION_COST_QUERY,
  START_DOMAIN_EVALUATION_MUTATION,
  type DomainEvaluationQueryResult,
  type DomainEvaluationQueryVariables,
  type DomainEvaluationStatusQueryResult,
  type DomainEvaluationStatusQueryVariables,
  type DomainEvaluationsQueryResult,
  type DomainEvaluationsQueryVariables,
  type DomainTrialRunsStatusQueryResult,
  type DomainTrialRunsStatusQueryVariables,
  type DomainTrialsPlanQueryResult,
  type DomainTrialsPlanQueryVariables,
  type EstimateDomainEvaluationCostQueryResult,
  type EstimateDomainEvaluationCostQueryVariables,
  type StartDomainEvaluationMutationResult,
  type StartDomainEvaluationMutationVariables,
} from '../api/operations/domains';
import { PROVIDER_HEALTH_QUERY, type ProviderHealthQueryResult, type ProviderHealthQueryVariables } from '../api/operations/health';
import { LLM_MODELS_QUERY, type LlmModelsQueryResult } from '../api/operations/llm';

const POLL_MS = 5000;
const EVALUATION_SCOPE_VALUES = ['PILOT', 'PRODUCTION', 'REPLICATION', 'VALIDATION'] as const;
type EvaluationScopeCategory = (typeof EVALUATION_SCOPE_VALUES)[number];

function isEvaluationScopeCategory(value: string | null): value is EvaluationScopeCategory {
  return value != null && EVALUATION_SCOPE_VALUES.includes(value as EvaluationScopeCategory);
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
  const [maxBudgetEnabled, setMaxBudgetEnabled] = useState(false);
  const [maxBudgetInput, setMaxBudgetInput] = useState('');
  const [targetBatchCountInput, setTargetBatchCountInput] = useState('1');
  const [runError, setRunError] = useState<string | null>(null);
  const [showLaunchConfirm, setShowLaunchConfirm] = useState(false);
  const [definitionRunIds, setDefinitionRunIds] = useState<Record<string, string>>({});
  const [currentEvaluationId, setCurrentEvaluationId] = useState<string | null>(searchParams.get('evaluationId'));
  const [lastStatusUpdatedAt, setLastStatusUpdatedAt] = useState<number | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [planNoContentRetries, setPlanNoContentRetries] = useState(0);
  const [statusNoContentRetries, setStatusNoContentRetries] = useState(0);

  const parsedTemperature = Number.parseFloat(temperatureInput);
  const hasValidTemperature = Number.isFinite(parsedTemperature) && parsedTemperature >= 0 && parsedTemperature <= 2;
  const selectedTemperature = !useDefaultTemperature && hasValidTemperature ? parsedTemperature : undefined;
  const parsedBudget = Number.parseFloat(maxBudgetInput);
  const hasValidBudget = Number.isFinite(parsedBudget) && parsedBudget > 0;
  const parsedTargetBatchCount = Number.parseInt(targetBatchCountInput, 10);
  const hasValidTargetBatchCount = Number.isFinite(parsedTargetBatchCount) && parsedTargetBatchCount >= 1 && parsedTargetBatchCount <= 100;
  const selectedTargetBatchCount = hasValidTargetBatchCount ? parsedTargetBatchCount : 1;

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
    variables: { domainId: domainId ?? '', temperature: selectedTemperature, definitionIds: filteredDefinitionIds, scopeCategory },
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
        samplesPerScenario: selectedTargetBatchCount,
        scopeCategory,
      },
    pause: !domainId,
    requestPolicy: 'cache-and-network',
  });
  const [providerHealthResult, refetchProviderHealth] = useQuery<ProviderHealthQueryResult, ProviderHealthQueryVariables>({
    query: PROVIDER_HEALTH_QUERY,
    variables: { refresh: true },
    pause: !domainId,
    requestPolicy: 'cache-and-network',
  });
  const [llmModelsResult, refetchLlmModels] = useQuery<LlmModelsQueryResult, { providerId?: string; status?: string }>({
    query: LLM_MODELS_QUERY,
    variables: { status: 'ACTIVE' },
    pause: !domainId,
    requestPolicy: 'cache-and-network',
  });
  const [launchesResult, refetchLaunches] = useQuery<DomainEvaluationsQueryResult, DomainEvaluationsQueryVariables>({
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
  }, [currentEvaluationId, scopeCategory, searchParams, setSearchParams]);

  const plan = planResult.data?.domainTrialsPlan ?? null;
  const estimate = estimateResult.data?.estimateDomainEvaluationCost ?? null;
  const providerHealth = providerHealthResult.data?.providerHealth ?? null;
  const modelCatalog = llmModelsResult.data?.llmModels ?? [];
  const currentEvaluation = currentEvaluationResult.data?.domainEvaluation ?? null;
  const currentEvaluationStatus = currentEvaluationStatusResult.data?.domainEvaluationStatus ?? null;
  const runStatuses = statusResult.data?.domainTrialRunsStatus ?? [];
  const launches = launchesResult.data?.domainEvaluations ?? [];
  const latestLaunch = launches[0] ?? null;
  const domainName = plan?.domainName ?? latestLaunch?.domainNameAtLaunch ?? 'selected domain';
  const planModels = plan?.models ?? [];
  const planModelIds = useMemo(() => new Set(planModels.map((model) => model.modelId)), [planModels]);
  const selectedModels = useMemo(
    () => modelCatalog.filter((model) => planModelIds.has(model.modelId)),
    [modelCatalog, planModelIds],
  );
  const estimatedSpendByModelId = useMemo(() => {
    const next = new Map<string, number>();
    for (const model of estimate?.models ?? []) {
      next.set(model.modelId, model.estimatedCost);
    }
    return next;
  }, [estimate?.models]);
  const providerReadiness = useMemo(
    () => buildProviderBudgetReadiness({
      providerHealth,
      selectedModels,
      estimatedSpendByModelId,
    }),
    [estimatedSpendByModelId, providerHealth, selectedModels],
  );
  const launchProviderBlocker = providerReadiness.find((provider) => provider.status !== 'READY') ?? null;

  const vignetteCount = plan?.vignettes.length ?? 0;
  const modelCount = planModels.length;
  const totalPairedBatches = hasValidTargetBatchCount ? vignetteCount * parsedTargetBatchCount : null;
  const totalTrialRuns = totalPairedBatches == null ? null : totalPairedBatches * 2;

  const hasPendingLaunchSnapshot = currentEvaluationId != null && (currentEvaluationStatusResult.fetching || statusResult.fetching);
  const hasLiveRows = runStatuses.some((status) => getBatchRuntimeState(status) === 'LIVE');
  const providerLaunchPending = selectedModels.length > 0 && providerReadiness.length === 0;
  const providerLaunchReady = selectedModels.length === 0
    ? true
    : providerReadiness.length > 0 && providerReadiness.every((provider) => provider.status === 'READY');
  const launchDisabled = hasPendingLaunchSnapshot || hasLiveRows || providerLaunchPending || !providerLaunchReady;
  const launchDisabledReason = hasPendingLaunchSnapshot
    ? 'Refreshing the current launch snapshot.'
    : hasLiveRows
      ? 'A launch is already active for this domain.'
      : providerLaunchPending
        ? 'Provider budget readiness is still loading.'
      : !providerLaunchReady
        ? `${launchProviderBlocker?.providerDisplayName ?? 'A provider'} needs attention before launch.`
      : null;

  useEffect(() => {
    if (!currentEvaluationId && latestLaunch) {
      setCurrentEvaluationId(latestLaunch.id);
    }
  }, [currentEvaluationId, latestLaunch]);

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
  }, [currentEvaluation]);

  useEffect(() => {
    if (!selectedRunId) return;
    if (!runStatuses.some((status) => status.runId === selectedRunId)) {
      setSelectedRunId(null);
    }
  }, [runStatuses, selectedRunId]);

  useEffect(() => {
    const message = planResult.error?.message ?? '';
    if (!message.includes('No Content')) return;
    if (planNoContentRetries >= 2) return;

    const timer = window.setTimeout(() => {
      setPlanNoContentRetries((prev) => prev + 1);
      refetchPlan({ requestPolicy: 'network-only' });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [planNoContentRetries, planResult.error?.message, refetchPlan]);

  useEffect(() => {
    const message = statusResult.error?.message ?? '';
    if (!message.includes('No Content')) return;
    if (statusNoContentRetries >= 2) return;

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
  }, [
    currentEvaluationId,
    hasLiveRows,
    refetchCurrentEvaluation,
    refetchCurrentEvaluationStatus,
    refetchStatus,
    runStatuses.length,
  ]);

  if (!domainId) return <ErrorMessage message="Missing domain id." />;

  const planErrorMessage = planResult.error?.message ?? '';
  const providerHealthErrorMessage = providerHealthResult.error?.message ?? '';
  const statusErrorMessage = statusResult.error?.message ?? '';
  const suppressPlanNoContentError = planErrorMessage.includes('No Content') && planNoContentRetries < 2;
  const suppressStatusNoContentError = statusErrorMessage.includes('No Content') && statusNoContentRetries < 2;
  const displayError = (suppressPlanNoContentError ? undefined : planResult.error)
    ?? (estimateResult.error ?? undefined)
    ?? providerHealthResult.error
    ?? (currentEvaluationId ? currentEvaluationResult.error ?? currentEvaluationStatusResult.error ?? undefined : undefined)
    ?? (suppressStatusNoContentError ? undefined : statusResult.error);

  const hasLaunchSnapshot = currentEvaluation != null || currentEvaluationId != null;
  const temperatureLabel = useDefaultTemperature || !hasInitialTemperature || !hasValidTemperature
    ? 'Provider default'
    : String(parsedTemperature);

  const handleRefresh = () => {
    refetchPlan({ requestPolicy: 'network-only' });
    refetchEstimate({ requestPolicy: 'network-only' });
    refetchProviderHealth({ requestPolicy: 'network-only' });
    refetchLlmModels({ requestPolicy: 'network-only' });
    refetchLaunches({ requestPolicy: 'network-only' });
    if (currentEvaluationId) {
      refetchCurrentEvaluation({ requestPolicy: 'network-only' });
      refetchCurrentEvaluationStatus({ requestPolicy: 'network-only' });
    }
    if (Object.keys(definitionRunIds).length > 0) {
      refetchStatus({ requestPolicy: 'network-only' });
    }
    setLastStatusUpdatedAt(Date.now());
  };

  const handleStart = async () => {
    if (!domainId) return;
    setRunError(null);

    if (!hasValidTargetBatchCount) {
      setRunError('Enter a paired-batch depth between 1 and 100.');
      return;
    }
    if (!useDefaultTemperature && !hasValidTemperature) {
      setRunError('Temperature must be between 0 and 2.');
      return;
    }
    if (maxBudgetEnabled && !hasValidBudget) {
      setRunError('Budget cap must be a number greater than 0.');
      return;
    }
    if (launchDisabled) {
      setRunError(launchDisabledReason ?? 'A launch is already active for this domain.');
      return;
    }

    const result = await startDomainEvaluation({
      domainId,
      scopeCategory,
      temperature: useDefaultTemperature || !hasValidTemperature ? undefined : parsedTemperature,
      maxBudgetUsd: maxBudgetEnabled ? parsedBudget : undefined,
      definitionIds: filteredDefinitionIds.length > 0 ? filteredDefinitionIds : undefined,
      samplePercentage: 100,
      samplesPerScenario: selectedTargetBatchCount,
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

    const byDefinition: Record<string, string> = {};
    for (const run of payload.runs) {
      byDefinition[run.definitionId] = run.runId;
    }
    setDefinitionRunIds(byDefinition);
    setCurrentEvaluationId(payload.domainEvaluationId);
    setShowLaunchConfirm(false);
    setSelectedRunId(null);

    refetchCurrentEvaluation({ requestPolicy: 'network-only' });
    refetchCurrentEvaluationStatus({ requestPolicy: 'network-only' });
    refetchLaunches({ requestPolicy: 'network-only' });
    refetchStatus({ requestPolicy: 'network-only' });
    setLastStatusUpdatedAt(Date.now());

    if (payload.startedRuns === 0) {
      setRunError('No runs were started. Check launch status below for failed starts.');
    }
  };

  const statusHeader = hasLaunchSnapshot
    ? `Current launch: ${currentEvaluation?.id ?? currentEvaluationId?.slice(-8) ?? 'unknown'}`
    : 'No active launch snapshot';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div>
            <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Domain Evaluation Setup</h1>
            <p className="text-sm text-gray-600">
              Set the paired-batch depth for the selected domain, confirm provider budget readiness, and watch the current launch move.
            </p>
            {filteredDefinitionIds.length > 0 && (
              <p className="text-xs text-amber-700">
                Scoped to {filteredDefinitionIds.length} selected vignette{filteredDefinitionIds.length === 1 ? '' : 's'}.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral" size="count">{domainName}</Badge>
            <Badge variant={launchDisabled ? 'warning' : 'success'} size="count">
              {statusHeader}
            </Badge>
            {modelCount > 0 && <Badge variant="info" size="count">Models: {modelCount}</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          <Link
            to="/domains"
            className="inline-flex h-9 items-center rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to Domains
          </Link>
        </div>
      </div>

      {displayError && <ErrorMessage message={`Failed to load domain evaluation data: ${displayError.message ?? 'Unknown error'}`} />}
      {runError && <ErrorMessage message={runError} />}
      {providerHealthErrorMessage && <ErrorMessage message={`Provider budget data could not be loaded: ${providerHealthErrorMessage}`} />}
      {filteredDefinitionIdCount > 0 && plan && filteredDefinitionIdCount > plan.vignettes.length && (
        <ErrorMessage message={`Requested ${filteredDefinitionIdCount} scoped vignette IDs but ${filteredDefinitionIdCount - plan.vignettes.length} were invalid, stale, or not latest definitions in this domain.`} />
      )}

      <section className="space-y-4">
        <LaunchControlsPanel
          scopeCategory={scopeCategory}
          vignetteCount={vignetteCount}
          modelCount={modelCount}
          totalPairedBatches={totalPairedBatches}
          totalTrialRuns={totalTrialRuns}
          totalEstimatedCost={estimate?.totalEstimatedCost ?? plan?.totalEstimatedCost ?? 0}
          estimateConfidence={estimate?.estimateConfidence}
          fallbackReason={estimate?.fallbackReason}
          knownExclusions={estimate?.knownExclusions}
          useDefaultTemperature={useDefaultTemperature}
          disableTemperatureInput={plan?.models.some((model) => !model.supportsTemperature) ?? false}
          temperatureInput={temperatureInput}
          maxBudgetEnabled={maxBudgetEnabled}
          maxBudgetInput={maxBudgetInput}
          hasValidBudget={hasValidBudget}
          targetBatchCountInput={targetBatchCountInput}
          hasValidTargetBatchCount={hasValidTargetBatchCount}
          isStarting={startDomainEvaluationResult.fetching}
          planFetching={planResult.fetching || estimateResult.fetching}
          temperatureWarning={estimate?.temperatureWarning ?? plan?.temperatureWarning}
          reviewSetupHref={`/domains?domainId=${domainId}&tab=setup&setupTab=contexts`}
          reviewVignettesHref={`/domains?domainId=${domainId}&tab=vignettes`}
          excludedRequestedDefinitionCount={Math.max(0, filteredDefinitionIdCount - (plan?.vignettes.length ?? 0))}
          providerReadiness={providerReadiness}
          launchDisabled={launchDisabled}
          launchDisabledReason={launchDisabledReason}
          onSetScopeCategory={setScopeCategory}
          onSetUseDefaultTemperature={setUseDefaultTemperature}
          onSetTemperatureInput={setTemperatureInput}
          onSetMaxBudgetEnabled={setMaxBudgetEnabled}
          onSetMaxBudgetInput={setMaxBudgetInput}
          onSetTargetBatchCountInput={setTargetBatchCountInput}
          onOpenConfirm={() => setShowLaunchConfirm(true)}
        />
      </section>

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

      <LaunchConfirmModal
        open={showLaunchConfirm}
        domainName={domainName}
        scopeCategory={scopeCategory}
        vignetteCount={vignetteCount}
        modelCount={modelCount}
        totalPairedBatches={totalPairedBatches}
        totalTrialRuns={totalTrialRuns}
        estimatedTotalCost={estimate?.totalEstimatedCost ?? plan?.totalEstimatedCost ?? 0}
        estimateConfidence={estimate?.estimateConfidence}
        fallbackReason={estimate?.fallbackReason}
        knownExclusions={estimate?.knownExclusions}
        temperatureLabel={temperatureLabel}
        budgetCap={maxBudgetEnabled && hasValidBudget ? parsedBudget : null}
        targetBatchCount={hasValidTargetBatchCount ? parsedTargetBatchCount : 1}
        reviewSetupHref={`/domains?domainId=${domainId}&tab=setup&setupTab=contexts`}
        reviewVignettesHref={`/domains?domainId=${domainId}&tab=vignettes`}
        isStarting={startDomainEvaluationResult.fetching}
        onCancel={() => setShowLaunchConfirm(false)}
        onConfirm={() => void handleStart()}
      />

      <DomainEvaluationStatusDrawer
        runId={selectedRunId}
        open={selectedRunId != null}
        onClose={() => setSelectedRunId(null)}
      />
    </div>
  );
}

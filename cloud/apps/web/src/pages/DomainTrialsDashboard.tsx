import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';
import { RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { LaunchConfirmModal } from '../components/domains/domainTrials/LaunchConfirmModal';
import { LaunchStatusPanel } from '../components/domains/domainTrials/LaunchStatusPanel';
import { LaunchControlsPanel } from '../components/domains/domainTrials/LaunchControlsPanel';
import { TrialGridTable } from '../components/domains/domainTrials/TrialGridTable';
import {
  cellKey,
  downloadCsv,
  type DomainTrialLaunchSummary,
  type DomainTrialCellStatus,
} from '../components/domains/domainTrials/helpers';
import {
  DOMAIN_TRIALS_PLAN_QUERY,
  DOMAIN_TRIAL_RUNS_STATUS_QUERY,
  RETRY_DOMAIN_TRIAL_CELL_MUTATION,
  RUN_TRIALS_FOR_DOMAIN_MUTATION,
  type DomainTrialRunsStatusQueryResult,
  type DomainTrialRunsStatusQueryVariables,
  type DomainTrialsPlanQueryResult,
  type DomainTrialsPlanQueryVariables,
  type RetryDomainTrialCellMutationResult,
  type RetryDomainTrialCellMutationVariables,
  type RunTrialsForDomainMutationResult,
  type RunTrialsForDomainMutationVariables,
} from '../api/operations/domains';

const POLL_MS = 3000;

type CellRunMap = Record<string, string>;
export function DomainTrialsDashboard() {
  const { domainId } = useParams<{ domainId: string }>();
  const [searchParams] = useSearchParams();
  const initialTemperatureParam = searchParams.get('temperature');
  const initialParsedTemperature = initialTemperatureParam == null ? Number.NaN : Number.parseFloat(initialTemperatureParam);
  const hasInitialTemperature = Number.isFinite(initialParsedTemperature) && initialParsedTemperature >= 0 && initialParsedTemperature <= 2;
  const [useDefaultTemperature, setUseDefaultTemperature] = useState(!hasInitialTemperature);
  const [temperatureInput, setTemperatureInput] = useState(hasInitialTemperature ? String(initialParsedTemperature) : '0.7');
  const [started, setStarted] = useState(false);
  const [definitionRunIds, setDefinitionRunIds] = useState<Record<string, string>>({});
  const [cellOverrideRunIds, setCellOverrideRunIds] = useState<CellRunMap>({});
  const [pendingRetryCell, setPendingRetryCell] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [launchSummary, setLaunchSummary] = useState<DomainTrialLaunchSummary | null>(null);
  const [lastStatusUpdatedAt, setLastStatusUpdatedAt] = useState<number | null>(null);
  const [planNoContentRetries, setPlanNoContentRetries] = useState(0);
  const [statusNoContentRetries, setStatusNoContentRetries] = useState(0);
  const [showLaunchConfirm, setShowLaunchConfirm] = useState(false);
  const [safeMode, setSafeMode] = useState(false);
  const [maxBudgetEnabled, setMaxBudgetEnabled] = useState(false);
  const [maxBudgetInput, setMaxBudgetInput] = useState('');

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
  const [startRunResult, runTrialsForDomain] = useMutation<RunTrialsForDomainMutationResult, RunTrialsForDomainMutationVariables>(
    RUN_TRIALS_FOR_DOMAIN_MUTATION
  );
  const [retryResult, retryCell] = useMutation<RetryDomainTrialCellMutationResult, RetryDomainTrialCellMutationVariables>(
    RETRY_DOMAIN_TRIAL_CELL_MUTATION
  );

  const runIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(definitionRunIds).forEach((id) => ids.add(id));
    Object.values(cellOverrideRunIds).forEach((id) => ids.add(id));
    return Array.from(ids);
  }, [definitionRunIds, cellOverrideRunIds]);

  const [statusResult, refetchStatus] = useQuery<DomainTrialRunsStatusQueryResult, DomainTrialRunsStatusQueryVariables>({
    query: DOMAIN_TRIAL_RUNS_STATUS_QUERY,
    variables: { runIds },
    pause: runIds.length === 0,
    requestPolicy: 'network-only',
  });

  const statusSummary = useMemo(() => {
    const runStatuses = statusResult.data?.domainTrialRunsStatus ?? [];
    const total = runIds.length;
    const known = runStatuses.length;
    const completed = runStatuses.filter((run) => run.status === 'COMPLETED').length;
    const failed = runStatuses.filter((run) => run.status === 'FAILED' || run.status === 'CANCELLED').length;
    const active = runStatuses.filter((run) => ['PENDING', 'RUNNING', 'SUMMARIZING', 'PAUSED'].includes(run.status)).length;
    return { total, known, completed, failed, active };
  }, [runIds.length, statusResult.data?.domainTrialRunsStatus]);

  const allRunsTerminal = statusSummary.total > 0 && statusSummary.active === 0 && statusSummary.known === statusSummary.total;
  const completionWithFailures = allRunsTerminal && statusSummary.failed > 0;
  const completionClean = allRunsTerminal && statusSummary.failed === 0;
  const failureRate = statusSummary.total > 0 ? statusSummary.failed / statusSummary.total : 0;
  const retryAutoPaused = started && statusSummary.total >= 3 && failureRate >= 0.3;

  useEffect(() => {
    if (!started || runIds.length === 0 || allRunsTerminal) return;
    const interval = window.setInterval(() => {
      refetchStatus({ requestPolicy: 'network-only' });
      setLastStatusUpdatedAt(Date.now());
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, [started, runIds.length, allRunsTerminal, refetchStatus]);

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
  const models = plan?.models ?? [];
  const vignettes = plan?.vignettes ?? [];
  const excludedRequestedDefinitionCount = filteredDefinitionIdCount - vignettes.length;
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

  const hasNonTemperatureModels = models.some((model) => !model.supportsTemperature);
  const disableTemperatureInput = hasNonTemperatureModels;

  useEffect(() => {
    if (!disableTemperatureInput) return;
    setUseDefaultTemperature(true);
  }, [disableTemperatureInput]);

  const isStarting = startRunResult.fetching;
  const isRetrying = retryResult.fetching;

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

    const result = await runTrialsForDomain({
      domainId,
      temperature: useDefaultTemperature || disableTemperatureInput ? undefined : parsedTemperature,
      maxBudgetUsd: maxBudgetEnabled ? parsedBudget : undefined,
      definitionIds: filteredDefinitionIds.length > 0 ? filteredDefinitionIds : undefined,
    });
    if (result.error) {
      setRunError(result.error.message);
      return;
    }
    const payload = result.data?.runTrialsForDomain;
    if (!payload) {
      setRunError('Failed to start domain trials.');
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
    setCellOverrideRunIds({});
    setStarted(true);
    setShowLaunchConfirm(false);
    refetchStatus({ requestPolicy: 'network-only' });
    setLastStatusUpdatedAt(Date.now());
    if (payload.startedRuns === 0) {
      setRunError('No runs were started. Check launch status below for failed starts.');
    }
  };

  const handleRetryCell = async (definitionId: string, modelId: string) => {
    if (!domainId) return;
    const key = cellKey(definitionId, modelId);
    setPendingRetryCell(key);
    setRunError(null);
    const result = await retryCell({
      domainId,
      definitionId,
      modelId,
      temperature: useDefaultTemperature || disableTemperatureInput ? undefined : parsedTemperature,
    });
    setPendingRetryCell(null);
    if (result.error) {
      setRunError(result.error.message);
      return;
    }
    const payload = result.data?.retryDomainTrialCell;
    if (!payload?.success || !payload.runId) {
      setRunError(payload?.message ?? 'Failed to retry this model/vignette cell.');
      return;
    }
    setCellOverrideRunIds((prev) => ({ ...prev, [key]: payload.runId! }));
    setStarted(true);
    refetchStatus({ requestPolicy: 'network-only' });
  };

  const getCellStatus = (definitionId: string, modelId: string): DomainTrialCellStatus => {
    const overridden = cellOverrideRunIds[cellKey(definitionId, modelId)];
    const baseRunId = definitionRunIds[definitionId];
    const runId = overridden ?? baseRunId;
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Domain Trial Dashboard</h1>
          <p className="text-sm text-gray-600">
            Review and run latest vignettes for <span className="font-medium">{plan?.domainName ?? 'selected domain'}</span>.
          </p>
          {filteredDefinitionIds.length > 0 && (
            <p className="text-xs text-amber-700">
              Scoped to {filteredDefinitionIds.length} selected missing vignette{filteredDefinitionIds.length === 1 ? '' : 's'}.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => refetchPlan({ requestPolicy: 'network-only' })}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh Plan
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleExportLedger} disabled={vignettes.length === 0 || models.length === 0}>
            Export Ledger CSV
          </Button>
          <Link to="/domains" className="inline-flex h-9 items-center rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Back to Domains
          </Link>
        </div>
      </div>

      {displayError && <ErrorMessage message={`Failed to load domain trial data: ${displayError.message ?? 'Unknown error'}`} />}
      {runError && <ErrorMessage message={runError} />}
      {filteredDefinitionIdCount > 0 && excludedRequestedDefinitionCount > 0 && (
        <ErrorMessage message={`Requested ${filteredDefinitionIdCount} scoped vignette IDs but ${excludedRequestedDefinitionCount} were invalid, stale, or not latest definitions in this domain.`} />
      )}

      <LaunchControlsPanel
        vignetteCount={vignettes.length}
        modelCount={models.length}
        totalEstimatedCost={plan?.totalEstimatedCost ?? 0}
        useDefaultTemperature={useDefaultTemperature}
        disableTemperatureInput={disableTemperatureInput}
        temperatureInput={temperatureInput}
        maxBudgetEnabled={maxBudgetEnabled}
        maxBudgetInput={maxBudgetInput}
        safeMode={safeMode}
        hasValidBudget={hasValidBudget}
        retryAutoPaused={retryAutoPaused}
        failureRate={failureRate}
        isStarting={isStarting}
        planFetching={planResult.fetching}
        temperatureWarning={plan?.temperatureWarning}
        onSetUseDefaultTemperature={setUseDefaultTemperature}
        onSetTemperatureInput={setTemperatureInput}
        onSetMaxBudgetEnabled={setMaxBudgetEnabled}
        onSetMaxBudgetInput={setMaxBudgetInput}
        onSetSafeMode={setSafeMode}
        onOpenConfirm={() => setShowLaunchConfirm(true)}
      />

      <LaunchStatusPanel
        launchSummary={launchSummary}
        started={started}
        statusSummary={statusSummary}
        statusFetching={statusResult.fetching}
        lastStatusUpdatedAt={lastStatusUpdatedAt}
        completionClean={completionClean}
        completionWithFailures={completionWithFailures}
      />

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
        started={started}
        pendingRetryCell={pendingRetryCell}
        isRetrying={isRetrying}
        safeMode={safeMode}
        retryAutoPaused={retryAutoPaused}
        getCellStatus={getCellStatus}
        onRetryCell={(definitionId, modelId) => void handleRetryCell(definitionId, modelId)}
      />

      <LaunchConfirmModal
        open={showLaunchConfirm}
        domainName={plan?.domainName ?? domainId}
        vignetteCount={vignettes.length}
        modelCount={models.length}
        estimatedTotalCost={plan?.totalEstimatedCost ?? 0}
        temperatureLabel={useDefaultTemperature || disableTemperatureInput ? 'Provider default' : String(parsedTemperature)}
        budgetCap={maxBudgetEnabled && hasValidBudget ? parsedBudget : null}
        isStarting={isStarting}
        onCancel={() => setShowLaunchConfirm(false)}
        onConfirm={() => void handleStart()}
      />
    </div>
  );
}

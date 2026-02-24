import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Badge } from '../components/ui/Badge';
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

function formatCost(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

type CellRunMap = Record<string, string>;
type LaunchSummary = {
  targetedDefinitions: number;
  startedRuns: number;
  failedDefinitions: number;
  skippedForBudget: number;
  projectedCostUsd: number;
  startedAt: number;
};

function cellKey(definitionId: string, modelId: string): string {
  return `${definitionId}::${modelId}`;
}

function downloadCsv(filename: string, rows: string[][]): void {
  const escaped = rows.map((row) =>
    row
      .map((cell) => `"${cell.split('"').join('""')}"`)
      .join(',')
  );
  const csv = `${escaped.join('\n')}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getCellTone(status: {
  runId: string | null;
  runStatus: { status: string } | null;
  modelStatus: {
    generationCompleted: number;
    generationFailed: number;
    generationTotal: number;
    summarizationCompleted: number;
    summarizationFailed: number;
    summarizationTotal: number;
  } | null;
}): { container: string; text: string } {
  if (!status.runId) {
    return { container: 'bg-gray-50 border-gray-200', text: 'text-gray-700' };
  }

  const model = status.modelStatus;
  const runStatus = status.runStatus?.status ?? 'PENDING';
  const hasFailure = runStatus === 'FAILED'
    || runStatus === 'CANCELLED'
    || (model !== null && (model.generationFailed > 0 || model.summarizationFailed > 0));

  if (hasFailure) {
    return { container: 'bg-red-100 border-red-300', text: 'text-red-900' };
  }

  if (runStatus === 'COMPLETED') {
    return { container: 'bg-green-700 border-green-800', text: 'text-white' };
  }

  return { container: 'bg-green-100 border-green-300', text: 'text-green-900' };
}

export function DomainTrialsDashboard() {
  const { domainId } = useParams<{ domainId: string }>();
  const [useDefaultTemperature, setUseDefaultTemperature] = useState(true);
  const [temperatureInput, setTemperatureInput] = useState('0.7');
  const [started, setStarted] = useState(false);
  const [definitionRunIds, setDefinitionRunIds] = useState<Record<string, string>>({});
  const [cellOverrideRunIds, setCellOverrideRunIds] = useState<CellRunMap>({});
  const [pendingRetryCell, setPendingRetryCell] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [launchSummary, setLaunchSummary] = useState<LaunchSummary | null>(null);
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

  const [planResult, refetchPlan] = useQuery<DomainTrialsPlanQueryResult, DomainTrialsPlanQueryVariables>({
    query: DOMAIN_TRIALS_PLAN_QUERY,
    variables: { domainId: domainId ?? '', temperature: selectedTemperature },
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

  useEffect(() => {
    if (!started || runIds.length === 0) return;
    const interval = window.setInterval(() => {
      refetchStatus({ requestPolicy: 'network-only' });
      setLastStatusUpdatedAt(Date.now());
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, [started, runIds.length, refetchStatus]);

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

  const getCellStatus = (definitionId: string, modelId: string) => {
    const overridden = cellOverrideRunIds[cellKey(definitionId, modelId)];
    const baseRunId = definitionRunIds[definitionId];
    const runId = overridden ?? baseRunId;
    if (!runId) {
      return { runId: null, runStatus: null, modelStatus: null };
    }
    const runStatus = runStatusById.get(runId) ?? null;
    const modelStatus = runStatus?.modelStatuses.find((status) => status.modelId === modelId) ?? null;
    return { runId, runStatus, modelStatus };
  };

  const getStageText = (status: ReturnType<typeof getCellStatus>) => {
    if (!status.runId) return 'Waiting to start';
    if (!status.runStatus || !status.modelStatus) return 'Updating...';

    const run = status.runStatus;
    const model = status.modelStatus;
    const generation = `${model.generationCompleted + model.generationFailed}/${model.generationTotal}`;
    const summarization = `${model.summarizationCompleted + model.summarizationFailed}/${model.summarizationTotal}`;

    if (run.status === 'FAILED' || run.status === 'CANCELLED') {
      return `Failed (gen ${generation})`;
    }
    if (run.status === 'SUMMARIZING') {
      return `Summarizing ${summarization}`;
    }
    if (run.status === 'COMPLETED') {
      return `Complete (sum ${summarization})`;
    }
    return `Generating ${generation}`;
  };

  const handleExportLedger = () => {
    const rows: string[][] = [
      [
        'domainId',
        'definitionId',
        'definitionName',
        'modelId',
        'runId',
        'runStatus',
        'generation',
        'summarization',
        'estimatedCostUsd',
        'latestError',
      ],
    ];

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

  if (!domainId) {
    return <ErrorMessage message="Missing domain id." />;
  }

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

      {displayError && (
        <ErrorMessage
          message={`Failed to load domain trial data: ${displayError.message ?? 'Unknown error'}`}
        />
      )}
      {runError && <ErrorMessage message={runError} />}

      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="info" size="count">Latest Vignettes: {vignettes.length}</Badge>
          <Badge variant="info" size="count">Models: {models.length}</Badge>
          <Badge variant="success" size="count">Total Estimate: {formatCost(plan?.totalEstimatedCost ?? 0)}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              checked={useDefaultTemperature}
              onChange={() => setUseDefaultTemperature(true)}
              disabled={disableTemperatureInput}
            />
            Use provider default temperature
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              checked={!useDefaultTemperature}
              onChange={() => setUseDefaultTemperature(false)}
              disabled={disableTemperatureInput}
            />
            Set global temperature
          </label>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={temperatureInput}
            onChange={(event) => setTemperatureInput(event.target.value)}
            disabled={useDefaultTemperature || disableTemperatureInput}
            className="w-24 px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100"
          />
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={maxBudgetEnabled}
              onChange={(event) => setMaxBudgetEnabled(event.target.checked)}
            />
            Max budget cap (USD)
          </label>
          <input
            type="number"
            min={0.01}
            step={0.01}
            placeholder="e.g. 10.00"
            value={maxBudgetInput}
            onChange={(event) => setMaxBudgetInput(event.target.value)}
            disabled={!maxBudgetEnabled}
            className="w-28 px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100"
          />
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={safeMode}
              onChange={(event) => setSafeMode(event.target.checked)}
            />
            Safe mode (disable retries)
          </label>
        </div>

        {disableTemperatureInput && (
          <p className="text-xs text-amber-700">
            Some default models do not support custom temperature, so domain trials will use provider defaults.
          </p>
        )}
        {plan?.temperatureWarning && (
          <p className="text-xs text-amber-700">{plan.temperatureWarning}</p>
        )}
        {maxBudgetEnabled && !hasValidBudget && (
          <p className="text-xs text-amber-700">
            Enter a budget cap above $0 to enforce launch spend limits.
          </p>
        )}
        {retryAutoPaused && (
          <p className="text-xs text-red-700">
            Retry controls auto-paused: failure rate is {(failureRate * 100).toFixed(0)}% (threshold 30%).
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button
            onClick={() => setShowLaunchConfirm(true)}
            disabled={isStarting || planResult.fetching || models.length === 0 || vignettes.length === 0 || (maxBudgetEnabled && !hasValidBudget)}
          >
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Starting...
              </>
            ) : (
              'Review & Run Domain Trials'
            )}
          </Button>
          <span className="text-xs text-gray-500">
            Runs start only after this second confirmation action.
          </span>
        </div>
      </div>

      {(launchSummary || started) && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success" size="count">
              Started: {launchSummary?.startedRuns ?? statusSummary.total}
            </Badge>
            <Badge variant="warning" size="count">
              In Progress: {statusSummary.active}
            </Badge>
            <Badge variant="info" size="count">
              Completed: {statusSummary.completed}
            </Badge>
            <Badge variant={statusSummary.failed > 0 ? 'error' : 'neutral'} size="count">
              Failed: {statusSummary.failed}
            </Badge>
            {statusResult.fetching && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                Refreshing live status...
              </span>
            )}
          </div>
          <div className="text-xs text-gray-600">
            {launchSummary
              ? `Launch result: started ${launchSummary.startedRuns}/${launchSummary.targetedDefinitions} vignette runs (${launchSummary.failedDefinitions} failed starts, ${launchSummary.skippedForBudget} budget-skipped) at ${new Date(launchSummary.startedAt).toLocaleTimeString()} · projected spend ${formatCost(launchSummary.projectedCostUsd)}.`
              : 'Launch status is active.'}
          </div>
          <div className="text-xs text-gray-500">
            Live tracking: {statusSummary.known}/{statusSummary.total} runs resolved
            {lastStatusUpdatedAt ? ` · Last refresh ${new Date(lastStatusUpdatedAt).toLocaleTimeString()}` : ''}.
          </div>
          {completionClean && (
            <div className="inline-flex items-center gap-2 rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900">
              <CheckCircle2 className="w-4 h-4" />
              All domain trials completed successfully.
            </div>
          )}
          {completionWithFailures && (
            <div className="inline-flex items-center gap-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
              <AlertTriangle className="w-4 h-4" />
              Domain trials completed with failures. Review red cells before retrying.
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-4 overflow-auto">
        {planResult.fetching ? (
          <div className="text-sm text-gray-600">Loading trial plan...</div>
        ) : (
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-600 border-b border-gray-200">
                <th className="sticky left-0 bg-white py-2 pr-3 z-10">Model \ Vignette</th>
                {vignettes.map((vignette) => (
                  <th key={vignette.definitionId} className="py-2 px-3 min-w-[220px]">
                    <div className="font-medium text-gray-900">{vignette.definitionName}</div>
                    <div className="text-xs text-gray-500">v{vignette.definitionVersion} · {vignette.scenarioCount} conditions</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.modelId} className="border-b border-gray-100 align-top">
                  <td className="sticky left-0 bg-white py-3 pr-3 z-10">
                    <div className="font-medium text-gray-900">{model.label}</div>
                    <div className="text-xs text-gray-500">{model.modelId}</div>
                  </td>
                  {vignettes.map((vignette) => {
                    const key = cellKey(vignette.definitionId, model.modelId);
                    const status = getCellStatus(vignette.definitionId, model.modelId);
                    const modelStatus = status.modelStatus;
                    const retryBusy = pendingRetryCell === key && isRetrying;
                    const tone = getCellTone(status);
                    return (
                      <td key={key} className="py-3 px-3">
                        <div className={`border rounded-md p-2 space-y-1 ${tone.container}`}>
                          <div className={`text-xs ${tone.text}`}>
                            Estimated cost: <span className="font-semibold">{formatCost(cellEstimates.get(key) ?? 0)}</span>
                          </div>
                          <div className={`text-xs ${tone.text}`}>{getStageText(status)}</div>
                          <div className={`text-[11px] ${tone.text}`}>
                            Gen: {modelStatus ? `${modelStatus.generationCompleted + modelStatus.generationFailed}/${modelStatus.generationTotal}` : '-'}
                          </div>
                          <div className={`text-[11px] ${tone.text}`}>
                            Sum: {modelStatus ? `${modelStatus.summarizationCompleted + modelStatus.summarizationFailed}/${modelStatus.summarizationTotal}` : '-'}
                          </div>
                          {modelStatus?.latestErrorMessage && (
                            <div className="text-[11px] text-red-800" title={modelStatus.latestErrorMessage}>
                              Error: {modelStatus.latestErrorMessage}
                            </div>
                          )}
                          {started && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="!h-7 !px-2 text-xs"
                              onClick={() => void handleRetryCell(vignette.definitionId, model.modelId)}
                              disabled={retryBusy || safeMode || retryAutoPaused}
                              title={safeMode ? 'Safe mode is enabled.' : retryAutoPaused ? 'Auto-paused due to high failure rate.' : undefined}
                            >
                              {retryBusy ? 'Retrying...' : 'Retry Cell'}
                            </Button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showLaunchConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-lg border border-gray-200 bg-white p-5 shadow-xl space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Confirm Domain Trial Launch</h2>
            <div className="space-y-1 text-sm text-gray-700">
              <div>Domain: <span className="font-medium">{plan?.domainName ?? domainId}</span></div>
              <div>Latest vignettes: <span className="font-medium">{vignettes.length}</span></div>
              <div>Models: <span className="font-medium">{models.length}</span></div>
              <div>Estimated total cost: <span className="font-medium">{formatCost(plan?.totalEstimatedCost ?? 0)}</span></div>
              <div>
                Temperature: <span className="font-medium">
                  {useDefaultTemperature || disableTemperatureInput ? 'Provider default' : parsedTemperature}
                </span>
              </div>
              <div>
                Budget cap: <span className="font-medium">
                  {maxBudgetEnabled && hasValidBudget ? formatCost(parsedBudget) : 'None'}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              This starts domain runs and incurs model costs. A duplicate active launch is blocked server-side.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowLaunchConfirm(false)} disabled={isStarting}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleStart()} disabled={isStarting}>
                {isStarting ? 'Starting...' : 'Run All Domain Trials'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';
import { Loader2, RefreshCw } from 'lucide-react';
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

function cellKey(definitionId: string, modelId: string): string {
  return `${definitionId}::${modelId}`;
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

  const parsedTemperature = Number.parseFloat(temperatureInput);
  const hasValidTemperature = Number.isFinite(parsedTemperature) && parsedTemperature >= 0 && parsedTemperature <= 2;
  const selectedTemperature = !useDefaultTemperature && hasValidTemperature ? parsedTemperature : undefined;

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
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, [started, runIds.length, refetchStatus]);

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
    const result = await runTrialsForDomain({
      domainId,
      temperature: useDefaultTemperature || disableTemperatureInput ? undefined : parsedTemperature,
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

    const byDefinition: Record<string, string> = {};
    for (const run of payload.runs) {
      byDefinition[run.definitionId] = run.runId;
    }
    setDefinitionRunIds(byDefinition);
    setCellOverrideRunIds({});
    setStarted(true);
    refetchStatus({ requestPolicy: 'network-only' });
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

  if (!domainId) {
    return <ErrorMessage message="Missing domain id." />;
  }

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
          <Link to="/domains" className="inline-flex h-9 items-center rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Back to Domains
          </Link>
        </div>
      </div>

      {(planResult.error || statusResult.error) && (
        <ErrorMessage
          message={`Failed to load domain trial data: ${(planResult.error ?? statusResult.error)?.message ?? 'Unknown error'}`}
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
        </div>

        {disableTemperatureInput && (
          <p className="text-xs text-amber-700">
            Some default models do not support custom temperature, so domain trials will use provider defaults.
          </p>
        )}
        {plan?.temperatureWarning && (
          <p className="text-xs text-amber-700">{plan.temperatureWarning}</p>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={() => void handleStart()} disabled={isStarting || planResult.fetching || models.length === 0 || vignettes.length === 0}>
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Starting...
              </>
            ) : (
              'Run All Domain Trials'
            )}
          </Button>
          <span className="text-xs text-gray-500">
            Runs start only after this second confirmation action.
          </span>
        </div>
      </div>

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
                    <div className="text-xs text-gray-500">{vignette.signature} · {vignette.scenarioCount} conditions</div>
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
                    return (
                      <td key={key} className="py-3 px-3">
                        <div className="border border-gray-200 rounded-md p-2 space-y-1 bg-gray-50">
                          <div className="text-xs text-gray-600">Estimated cost: <span className="font-medium text-gray-900">{formatCost(cellEstimates.get(key) ?? 0)}</span></div>
                          <div className="text-xs text-gray-700">{getStageText(status)}</div>
                          <div className="text-[11px] text-gray-500">
                            Gen: {modelStatus ? `${modelStatus.generationCompleted + modelStatus.generationFailed}/${modelStatus.generationTotal}` : '-'}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            Sum: {modelStatus ? `${modelStatus.summarizationCompleted + modelStatus.summarizationFailed}/${modelStatus.summarizationTotal}` : '-'}
                          </div>
                          {started && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="!h-7 !px-2 text-xs"
                              onClick={() => void handleRetryCell(vignette.definitionId, model.modelId)}
                              disabled={retryBusy}
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
    </div>
  );
}

import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { formatCost } from './helpers';
import { formatBudgetSnapshotAge, getBudgetFreshnessLabel } from './launch-state';
import type { ProviderBudgetReadiness } from './launch-state';

type LaunchControlsPanelProps = {
  scopeCategory: 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION';
  vignetteCount: number;
  modelCount: number;
  totalPairedBatches: number | null;
  totalTrialRuns: number | null;
  totalEstimatedCost: number;
  estimateConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  fallbackReason?: string | null;
  knownExclusions?: string[];
  useDefaultTemperature: boolean;
  disableTemperatureInput: boolean;
  temperatureInput: string;
  maxBudgetEnabled: boolean;
  maxBudgetInput: string;
  hasValidBudget: boolean;
  targetBatchCountInput: string;
  hasValidTargetBatchCount: boolean;
  isStarting: boolean;
  planFetching: boolean;
  temperatureWarning?: string | null;
  reviewSetupHref: string;
  reviewVignettesHref: string;
  excludedRequestedDefinitionCount?: number;
  providerReadiness: ProviderBudgetReadiness[];
  launchDisabled?: boolean;
  launchDisabledReason?: string | null;
  onSetScopeCategory: (value: 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION') => void;
  onSetUseDefaultTemperature: (value: boolean) => void;
  onSetTemperatureInput: (value: string) => void;
  onSetMaxBudgetEnabled: (value: boolean) => void;
  onSetMaxBudgetInput: (value: string) => void;
  onSetTargetBatchCountInput: (value: string) => void;
  onOpenConfirm: () => void;
};

export function LaunchControlsPanel({
  scopeCategory,
  vignetteCount,
  modelCount,
  totalPairedBatches,
  totalTrialRuns,
  totalEstimatedCost,
  estimateConfidence,
  fallbackReason,
  knownExclusions = [],
  useDefaultTemperature,
  disableTemperatureInput,
  temperatureInput,
  maxBudgetEnabled,
  maxBudgetInput,
  hasValidBudget,
  targetBatchCountInput,
  hasValidTargetBatchCount,
  isStarting,
  planFetching,
  temperatureWarning,
  reviewSetupHref,
  reviewVignettesHref,
  excludedRequestedDefinitionCount = 0,
  providerReadiness,
  launchDisabled = false,
  launchDisabledReason,
  onSetScopeCategory,
  onSetUseDefaultTemperature,
  onSetTemperatureInput,
  onSetMaxBudgetEnabled,
  onSetMaxBudgetInput,
  onSetTargetBatchCountInput,
  onOpenConfirm,
}: LaunchControlsPanelProps) {
  const confidenceTone = estimateConfidence === 'HIGH'
    ? 'success'
    : estimateConfidence === 'MEDIUM'
      ? 'warning'
      : 'error';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      <div className="space-y-2">
        <div className="text-sm font-medium text-gray-900">Setup</div>
        <p className="text-sm text-gray-600">
          Set the paired-batch depth for each vignette, check provider budgets, and confirm the current launch signature.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="neutral" size="count">Scope: {scopeCategory.toLowerCase()}</Badge>
        <Badge variant="info" size="count">Vignettes: {vignetteCount}</Badge>
        <Badge variant="info" size="count">Models: {modelCount}</Badge>
        <Badge variant="success" size="count">Expected cost: {formatCost(totalEstimatedCost)}</Badge>
        {totalPairedBatches != null && <Badge variant="info" size="count">Paired batches: {totalPairedBatches}</Badge>}
        {totalTrialRuns != null && <Badge variant="info" size="count">Trial runs: {totalTrialRuns}</Badge>}
        {estimateConfidence && <Badge variant={confidenceTone} size="count">Confidence: {estimateConfidence.toLowerCase()}</Badge>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          Evaluation scope
          <select
            value={scopeCategory}
            onChange={(event) => onSetScopeCategory(event.target.value as 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION')}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            <option value="PILOT">Pilot</option>
            <option value="PRODUCTION">Production</option>
            <option value="REPLICATION">Replication</option>
            <option value="VALIDATION">Validation</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={maxBudgetEnabled} onChange={(event) => onSetMaxBudgetEnabled(event.target.checked)} />
          Max budget cap (USD)
        </label>
        <input
          type="number"
          min={0.01}
          step={0.01}
          placeholder="e.g. 10.00"
          value={maxBudgetInput}
          onChange={(event) => onSetMaxBudgetInput(event.target.value)}
          disabled={!maxBudgetEnabled}
          className="w-28 px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          Paired-batch depth per vignette
          <input
            aria-label="Paired-batch depth per vignette"
            type="number"
            min={1}
            max={100}
            step={1}
            placeholder="1"
            value={targetBatchCountInput}
            onChange={(event) => onSetTargetBatchCountInput(event.target.value)}
            className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
          />
        </label>
        <p className="text-xs text-gray-500">
          This applies to the current launch signature only.
        </p>
      </div>

      {!hasValidTargetBatchCount && (
        <p className="text-xs text-amber-700">Enter a paired-batch depth between 1 and 100.</p>
      )}

      <details className="rounded border border-gray-200 bg-gray-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-gray-900">Advanced controls</summary>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                checked={useDefaultTemperature}
                onChange={() => onSetUseDefaultTemperature(true)}
                disabled={disableTemperatureInput}
              />
              Use provider default temperature
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                checked={!useDefaultTemperature}
                onChange={() => onSetUseDefaultTemperature(false)}
                disabled={disableTemperatureInput}
              />
              Set evaluation temperature
            </label>
            <input
              aria-label="Evaluation temperature"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperatureInput}
              onChange={(event) => onSetTemperatureInput(event.target.value)}
              disabled={useDefaultTemperature || disableTemperatureInput}
              className="w-24 px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100"
            />
          </div>
          {disableTemperatureInput && (
            <p className="text-xs text-amber-700">
              Some selected models do not support custom temperature, so this launch must use provider defaults.
            </p>
          )}
          {temperatureWarning && <p className="text-xs text-amber-700">{temperatureWarning}</p>}
        </div>
      </details>

      {fallbackReason && <p className="text-xs text-amber-700">Estimate fallback: {fallbackReason}</p>}
      {knownExclusions.length > 0 && (
        <p className="text-xs text-gray-500">
          Estimate notes: {knownExclusions.join(' ')}
        </p>
      )}
      {excludedRequestedDefinitionCount > 0 && (
        <p className="text-xs text-amber-700">
          {excludedRequestedDefinitionCount} requested vignette{excludedRequestedDefinitionCount === 1 ? '' : 's'} are excluded because they are stale, invalid, or no longer the latest version.
        </p>
      )}
      {maxBudgetEnabled && !hasValidBudget && (
        <p className="text-xs text-amber-700">Enter a budget cap above $0 to enforce launch spend limits.</p>
      )}

      {providerReadiness.length > 0 && (
        <div className="rounded border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900">
            Provider budget readiness
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="px-3 py-2 font-medium">Provider</th>
                <th className="px-3 py-2 font-medium">Expected spend</th>
                <th className="px-3 py-2 font-medium">Available budget</th>
                <th className="px-3 py-2 font-medium">Snapshot</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {providerReadiness.map((provider) => (
                <tr key={provider.providerId} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{provider.providerDisplayName}</div>
                    <div className="text-xs text-gray-500">{provider.reason}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{formatCost(provider.expectedSpendUsd)}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {provider.remainingBudgetUsd == null ? 'Unknown' : formatCost(provider.remainingBudgetUsd)}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    <div className="space-y-1">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        provider.freshness === 'FRESH'
                          ? 'bg-green-100 text-green-700'
                          : provider.freshness === 'STALE'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}>
                        {getBudgetFreshnessLabel(provider.freshness)}
                      </span>
                      <div className="text-xs text-gray-500">
                        {provider.lastChecked ? `Checked ${formatBudgetSnapshotAge(provider.lastChecked)}` : 'No snapshot'}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      provider.status === 'READY'
                        ? 'bg-green-100 text-green-700'
                        : provider.status === 'TOP_UP_REQUIRED'
                          ? 'bg-amber-100 text-amber-700'
                          : provider.status === 'DISABLED'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-600'
                    }`}>
                      {provider.status.toLowerCase().replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {launchDisabledReason && (
        <p className="text-xs text-amber-700">{launchDisabledReason}</p>
      )}

      <div className="flex items-center gap-3">
        <Button
          onClick={onOpenConfirm}
          disabled={
            isStarting
            || planFetching
            || launchDisabled
            || modelCount === 0
            || vignetteCount === 0
            || (maxBudgetEnabled && !hasValidBudget)
            || !hasValidTargetBatchCount
          }
        >
          {isStarting ? 'Starting...' : 'Review & Start Domain Evaluation'}
        </Button>
        <span className="text-xs text-gray-500">Member runs start only after this second confirmation action.</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          to={reviewSetupHref}
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Review setup coverage
        </Link>
        <Link
          to={reviewVignettesHref}
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Review vignette overrides
        </Link>
      </div>
    </div>
  );
}

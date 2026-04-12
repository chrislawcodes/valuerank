import { Button } from '../../ui/Button';
import { Tooltip } from '../../ui/Tooltip';
import { formatCost } from './helpers';
import type { ProviderBudgetEstimate } from './launch-state';

type LaunchControlsPanelProps = {
  useDefaultTemperature: boolean;
  disableTemperatureInput: boolean;
  temperatureInput: string;
  maxBudgetEnabled: boolean;
  maxBudgetInput: string;
  hasValidBudget: boolean;
  targetBatchCountInput: string;
  hasValidTargetBatchCount: boolean;
  isStarting: boolean;
  temperatureWarning?: string | null;
  providerBudgetEstimates: ProviderBudgetEstimate[];
  launchDisabled?: boolean;
  launchDisabledReason?: string | null;
  onSetUseDefaultTemperature: (value: boolean) => void;
  onSetTemperatureInput: (value: string) => void;
  onSetMaxBudgetEnabled: (value: boolean) => void;
  onSetMaxBudgetInput: (value: string) => void;
  onSetTargetBatchCountInput: (value: string) => void;
  onOpenConfirm: () => void;
  hideAdvancedControls?: boolean;
};

export function LaunchControlsPanel({
  useDefaultTemperature,
  disableTemperatureInput,
  temperatureInput,
  maxBudgetEnabled,
  maxBudgetInput,
  hasValidBudget,
  targetBatchCountInput,
  hasValidTargetBatchCount,
  isStarting,
  temperatureWarning,
  providerBudgetEstimates,
  launchDisabled = false,
  launchDisabledReason,
  onSetUseDefaultTemperature,
  onSetTemperatureInput,
  onSetMaxBudgetEnabled,
  onSetMaxBudgetInput,
  onSetTargetBatchCountInput,
  onOpenConfirm,
  hideAdvancedControls = false,
}: LaunchControlsPanelProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-gray-600">
          Target the number of paired batches per vignette, set the total budget cap, and use provider budget estimates to spot anything that needs attention.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          Target Number of Paired Batches per vignette
          <input
            aria-label="Target Number of Paired Batches per vignette"
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
        {!hideAdvancedControls && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={maxBudgetEnabled} onChange={(event) => onSetMaxBudgetEnabled(event.target.checked)} />
              Total budget cap (USD)
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
        )}
      </div>

      {!hasValidTargetBatchCount && (
        <p className="text-xs text-amber-700">Enter a paired-batch depth between 1 and 100.</p>
      )}

      {!hideAdvancedControls && <details className="rounded border border-gray-200 bg-gray-50 p-3">
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
      </details>}

      {!hideAdvancedControls && maxBudgetEnabled && !hasValidBudget && (
        <p className="text-xs text-amber-700">Enter a budget cap above $0 to enforce launch spend limits.</p>
      )}

      {providerBudgetEstimates.length > 0 && (
        <div className="rounded border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900">
            Provider Budget Estimates
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="px-3 py-2 font-medium">Provider</th>
                <th className="px-3 py-2 font-medium">
                  <div className="flex items-center gap-1">
                    <span>Expected spend</span>
                    <Tooltip
                      delay={0}
                      content={(
                        <div className="max-w-xs space-y-2 text-xs leading-5">
                          <p>This is a launch estimate for the remaining work needed to reach the target, not a live spend meter.</p>
                          <p>
                            For each vignette, it starts from the per-model cost estimate for the current target,
                            then scales it by the number of batches still needed after subtracting batches already completed
                            for the current launch signature.
                          </p>
                          <p>
                            It does not account for retries, provider routing changes, or judge/summarization overhead.
                          </p>
                        </div>
                      )}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label="Expected spend assumptions"
                        className="!min-h-0 h-5 w-5 rounded-full !p-0 text-[11px] font-semibold text-gray-500 hover:text-gray-900"
                      >
                        ?
                      </Button>
                    </Tooltip>
                  </div>
                </th>
                <th className="px-3 py-2 font-medium">Budget balance</th>
              </tr>
            </thead>
            <tbody>
              {providerBudgetEstimates.map((provider) => (
                <tr key={provider.providerId} className="border-b border-gray-100 last:border-b-0">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{provider.providerDisplayName}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{formatCost(provider.expectedSpendUsd)}</td>
                  <td className={`px-3 py-2 font-medium ${
                    provider.budgetBalanceUsd == null
                      ? 'text-gray-500'
                      : provider.budgetReady
                        ? 'text-green-700'
                        : 'text-amber-700'
                  }`}>
                    {provider.budgetBalanceUsd == null ? 'Not set' : formatCost(provider.budgetBalanceUsd)}
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
            || launchDisabled
            || (maxBudgetEnabled && !hasValidBudget)
            || !hasValidTargetBatchCount
          }
        >
          {isStarting ? 'Starting...' : 'Review & Start Paired Batches'}
        </Button>
      </div>
    </div>
  );
}

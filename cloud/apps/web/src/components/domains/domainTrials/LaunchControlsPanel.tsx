import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { formatCost } from './helpers';

type LaunchControlsPanelProps = {
  vignetteCount: number;
  modelCount: number;
  totalEstimatedCost: number;
  useDefaultTemperature: boolean;
  disableTemperatureInput: boolean;
  temperatureInput: string;
  maxBudgetEnabled: boolean;
  maxBudgetInput: string;
  safeMode: boolean;
  hasValidBudget: boolean;
  retryAutoPaused: boolean;
  failureRate: number;
  isStarting: boolean;
  planFetching: boolean;
  temperatureWarning?: string | null;
  onSetUseDefaultTemperature: (value: boolean) => void;
  onSetTemperatureInput: (value: string) => void;
  onSetMaxBudgetEnabled: (value: boolean) => void;
  onSetMaxBudgetInput: (value: string) => void;
  onSetSafeMode: (value: boolean) => void;
  onOpenConfirm: () => void;
};

export function LaunchControlsPanel({
  vignetteCount,
  modelCount,
  totalEstimatedCost,
  useDefaultTemperature,
  disableTemperatureInput,
  temperatureInput,
  maxBudgetEnabled,
  maxBudgetInput,
  safeMode,
  hasValidBudget,
  retryAutoPaused,
  failureRate,
  isStarting,
  planFetching,
  temperatureWarning,
  onSetUseDefaultTemperature,
  onSetTemperatureInput,
  onSetMaxBudgetEnabled,
  onSetMaxBudgetInput,
  onSetSafeMode,
  onOpenConfirm,
}: LaunchControlsPanelProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="info" size="count">Latest Vignettes: {vignetteCount}</Badge>
        <Badge variant="info" size="count">Models: {modelCount}</Badge>
        <Badge variant="success" size="count">Total Estimate: {formatCost(totalEstimatedCost)}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="radio" checked={useDefaultTemperature} onChange={() => onSetUseDefaultTemperature(true)} disabled={disableTemperatureInput} />
          Use provider default temperature
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="radio" checked={!useDefaultTemperature} onChange={() => onSetUseDefaultTemperature(false)} disabled={disableTemperatureInput} />
          Set global temperature
        </label>
        <input
          type="number"
          min={0}
          max={2}
          step={0.1}
          value={temperatureInput}
          onChange={(event) => onSetTemperatureInput(event.target.value)}
          disabled={useDefaultTemperature || disableTemperatureInput}
          className="w-24 px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100"
        />
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
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={safeMode} onChange={(event) => onSetSafeMode(event.target.checked)} />
          Safe mode (disable retries)
        </label>
      </div>

      {disableTemperatureInput && <p className="text-xs text-amber-700">Some default models do not support custom temperature, so domain trials will use provider defaults.</p>}
      {temperatureWarning && <p className="text-xs text-amber-700">{temperatureWarning}</p>}
      {maxBudgetEnabled && !hasValidBudget && <p className="text-xs text-amber-700">Enter a budget cap above $0 to enforce launch spend limits.</p>}
      {retryAutoPaused && <p className="text-xs text-red-700">Retry controls auto-paused: failure rate is {(failureRate * 100).toFixed(0)}% (threshold 30%).</p>}

      <div className="flex items-center gap-3">
        <Button
          onClick={onOpenConfirm}
          disabled={isStarting || planFetching || modelCount === 0 || vignetteCount === 0 || (maxBudgetEnabled && !hasValidBudget)}
        >
          {isStarting ? 'Starting...' : 'Review & Run Domain Trials'}
        </Button>
        <span className="text-xs text-gray-500">Runs start only after this second confirmation action.</span>
      </div>
    </div>
  );
}

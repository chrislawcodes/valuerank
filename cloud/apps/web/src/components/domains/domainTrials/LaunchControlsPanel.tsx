import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { formatCost } from './helpers';

type LaunchControlsPanelProps = {
  scopeCategory: 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION';
  vignetteCount: number;
  modelCount: number;
  totalEstimatedCost: number;
  estimateConfidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  fallbackReason?: string | null;
  knownExclusions?: string[];
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
  reviewSetupHref: string;
  reviewVignettesHref: string;
  selectedDefinitionCount?: number;
  excludedRequestedDefinitionCount?: number;
  onSetScopeCategory: (value: 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION') => void;
  onSetUseDefaultTemperature: (value: boolean) => void;
  onSetTemperatureInput: (value: string) => void;
  onSetMaxBudgetEnabled: (value: boolean) => void;
  onSetMaxBudgetInput: (value: string) => void;
  onSetSafeMode: (value: boolean) => void;
  onOpenConfirm: () => void;
};

export function LaunchControlsPanel({
  scopeCategory,
  vignetteCount,
  modelCount,
  totalEstimatedCost,
  estimateConfidence,
  fallbackReason,
  knownExclusions = [],
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
  reviewSetupHref,
  reviewVignettesHref,
  selectedDefinitionCount,
  excludedRequestedDefinitionCount = 0,
  onSetScopeCategory,
  onSetUseDefaultTemperature,
  onSetTemperatureInput,
  onSetMaxBudgetEnabled,
  onSetMaxBudgetInput,
  onSetSafeMode,
  onOpenConfirm,
}: LaunchControlsPanelProps) {
  const confidenceTone = estimateConfidence === 'HIGH'
    ? 'success'
    : estimateConfidence === 'MEDIUM'
      ? 'warning'
      : 'error';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="neutral" size="count">Domain evaluation scope: {scopeCategory.toLowerCase()}</Badge>
        <Badge variant="info" size="count">Selected latest vignettes: {vignetteCount}</Badge>
        <Badge variant="info" size="count">Models: {modelCount}</Badge>
        <Badge variant="success" size="count">Projected evaluation cost: {formatCost(totalEstimatedCost)}</Badge>
        {estimateConfidence && <Badge variant={confidenceTone} size="count">Estimate confidence: {estimateConfidence.toLowerCase()}</Badge>}
      </div>

      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 space-y-2">
        <p className="font-medium text-gray-900">Configuration review before launch</p>
        <p>
          This launch starts one domain evaluation cohort, then creates vignette-scoped runs underneath it. Review domain defaults and vignette overrides before you confirm.
        </p>
        <div className="grid gap-2 md:grid-cols-3 text-xs text-gray-600">
          <div>
            <span className="font-medium text-gray-900">Launch scope:</span> {selectedDefinitionCount ?? vignetteCount} selected latest vignette{(selectedDefinitionCount ?? vignetteCount) === 1 ? '' : 's'}
          </div>
          <div>
            <span className="font-medium text-gray-900">Review defaults:</span> Setup coverage and domain-wide presets
          </div>
          <div>
            <span className="font-medium text-gray-900">Review overrides:</span> Vignette inventory and per-vignette reruns
          </div>
        </div>
        {excludedRequestedDefinitionCount > 0 && (
          <p className="text-xs text-amber-700">
            {excludedRequestedDefinitionCount} requested vignette{excludedRequestedDefinitionCount === 1 ? '' : 's'} are excluded because they are stale, invalid, or no longer the latest version.
          </p>
        )}
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
      {fallbackReason && <p className="text-xs text-amber-700">Estimate fallback: {fallbackReason}</p>}
      {knownExclusions.length > 0 && (
        <p className="text-xs text-gray-500">
          Estimate notes: {knownExclusions.join(' ')}
        </p>
      )}
      {maxBudgetEnabled && !hasValidBudget && <p className="text-xs text-amber-700">Enter a budget cap above $0 to enforce launch spend limits.</p>}
      {retryAutoPaused && <p className="text-xs text-red-700">Retry controls auto-paused: failure rate is {(failureRate * 100).toFixed(0)}% (threshold 30%).</p>}

      <div className="flex items-center gap-3">
        <Button
          onClick={onOpenConfirm}
          disabled={isStarting || planFetching || modelCount === 0 || vignetteCount === 0 || (maxBudgetEnabled && !hasValidBudget)}
        >
          {isStarting ? 'Starting...' : 'Review & Start Domain Evaluation'}
        </Button>
        <span className="text-xs text-gray-500">Member runs start only after this second confirmation action.</span>
      </div>
    </div>
  );
}

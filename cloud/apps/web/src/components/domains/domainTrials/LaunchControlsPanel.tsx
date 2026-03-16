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
  hasValidBudget: boolean;
  isStarting: boolean;
  planFetching: boolean;
  temperatureWarning?: string | null;
  reviewSetupHref: string;
  reviewVignettesHref: string;
  excludedRequestedDefinitionCount?: number;
  onSetScopeCategory: (value: 'PILOT' | 'PRODUCTION' | 'REPLICATION' | 'VALIDATION') => void;
  onSetUseDefaultTemperature: (value: boolean) => void;
  onSetTemperatureInput: (value: string) => void;
  onSetMaxBudgetEnabled: (value: boolean) => void;
  onSetMaxBudgetInput: (value: string) => void;
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
  hasValidBudget,
  isStarting,
  planFetching,
  temperatureWarning,
  reviewSetupHref,
  reviewVignettesHref,
  excludedRequestedDefinitionCount = 0,
  onSetScopeCategory,
  onSetUseDefaultTemperature,
  onSetTemperatureInput,
  onSetMaxBudgetEnabled,
  onSetMaxBudgetInput,
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
      {maxBudgetEnabled && !hasValidBudget && <p className="text-xs text-amber-700">Enter a budget cap above $0 to enforce launch spend limits.</p>}

      <div className="flex items-center gap-3">
        <Button
          onClick={onOpenConfirm}
          disabled={isStarting || planFetching || modelCount === 0 || vignetteCount === 0 || (maxBudgetEnabled && !hasValidBudget)}
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

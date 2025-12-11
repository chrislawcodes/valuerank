/**
 * CostBreakdown Component
 *
 * Displays cost estimation breakdown for a run, including:
 * - Total cost across all models
 * - Per-model cost details
 * - Token predictions
 * - Fallback indicators
 */

import { AlertTriangle, Info, Loader2, DollarSign } from 'lucide-react';
import type { CostEstimate, ModelCostEstimate } from '../../api/operations/costs';

type CostBreakdownProps = {
  costEstimate: CostEstimate | null;
  loading?: boolean;
  error?: Error | null;
  compact?: boolean;
};

/**
 * Formats a cost value for display with dynamic precision.
 * Uses 4 decimals for sub-cent amounts, 2 for larger amounts.
 */
function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Formats large numbers with commas and optional abbreviation.
 */
function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toLocaleString();
}

function ModelCostRow({ model, expanded = false }: { model: ModelCostEstimate; expanded?: boolean }) {
  return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{model.displayName}</span>
          {model.isUsingFallback && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700"
              title="Using estimated token counts (no historical data)"
            >
              <AlertTriangle className="w-3 h-3" />
              Est.
            </span>
          )}
        </div>
        <span className="font-medium text-gray-900">{formatCost(model.totalCost)}</span>
      </div>

      {expanded && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
          <div className="flex justify-between">
            <span>Input tokens:</span>
            <span>{formatTokenCount(model.inputTokens)}</span>
          </div>
          <div className="flex justify-between">
            <span>Input cost:</span>
            <span>{formatCost(model.inputCost)}</span>
          </div>
          <div className="flex justify-between">
            <span>Output tokens:</span>
            <span>{formatTokenCount(model.outputTokens)}</span>
          </div>
          <div className="flex justify-between">
            <span>Output cost:</span>
            <span>{formatCost(model.outputCost)}</span>
          </div>
          <div className="flex justify-between">
            <span>Avg input/probe:</span>
            <span>{Math.round(model.avgInputPerProbe)}</span>
          </div>
          <div className="flex justify-between">
            <span>Avg output/probe:</span>
            <span>{Math.round(model.avgOutputPerProbe)}</span>
          </div>
          {!model.isUsingFallback && (
            <div className="col-span-2 flex justify-between">
              <span>Based on samples:</span>
              <span>{model.sampleCount.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CostBreakdown({
  costEstimate,
  loading = false,
  error = null,
  compact = false,
}: CostBreakdownProps) {
  if (loading) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Calculating cost estimate...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 rounded-lg">
        <div className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">Failed to estimate cost: {error.message}</span>
        </div>
      </div>
    );
  }

  if (!costEstimate) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2 text-gray-500">
          <Info className="w-4 h-4" />
          <span className="text-sm">Select models to see cost estimate</span>
        </div>
      </div>
    );
  }

  // Compact mode - just show total
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <DollarSign className="w-4 h-4 text-gray-400" />
        <span className="text-gray-600">Estimated cost:</span>
        <span className="font-medium text-gray-900">{formatCost(costEstimate.total)}</span>
        {costEstimate.isUsingFallback && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700"
            title={costEstimate.fallbackReason || 'Using estimated token counts'}
          >
            <AlertTriangle className="w-3 h-3" />
          </span>
        )}
      </div>
    );
  }

  // Full breakdown
  return (
    <div className="p-4 bg-teal-50 rounded-lg space-y-4">
      {/* Header with total */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-teal-900 flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Estimated Cost
        </h4>
        <div className="text-right">
          <div className="text-lg font-semibold text-teal-900">{formatCost(costEstimate.total)}</div>
          <div className="text-xs text-teal-700">
            {costEstimate.scenarioCount} scenario{costEstimate.scenarioCount !== 1 ? 's' : ''} x{' '}
            {costEstimate.perModel.length} model{costEstimate.perModel.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Fallback warning */}
      {costEstimate.isUsingFallback && costEstimate.fallbackReason && (
        <div className="flex items-start gap-2 p-2 bg-amber-50 rounded border border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">{costEstimate.fallbackReason}</p>
        </div>
      )}

      {/* Per-model breakdown */}
      {costEstimate.perModel.length > 0 && (
        <div className="bg-white rounded border border-teal-100 divide-y divide-teal-100">
          <div className="px-3 py-2 bg-teal-100/50">
            <span className="text-xs font-medium text-teal-800">Cost by Model</span>
          </div>
          <div className="px-3">
            {costEstimate.perModel.map((model) => (
              <ModelCostRow key={model.modelId} model={model} expanded={costEstimate.perModel.length <= 3} />
            ))}
          </div>
        </div>
      )}

      {/* Estimate quality indicator */}
      {costEstimate.basedOnSampleCount > 0 && (
        <p className="text-xs text-teal-600">
          Estimate based on {costEstimate.basedOnSampleCount.toLocaleString()} historical probe
          {costEstimate.basedOnSampleCount !== 1 ? 's' : ''}.
        </p>
      )}
    </div>
  );
}

// Export formatCost for use in other components
export { formatCost };

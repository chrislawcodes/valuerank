/**
 * ContestedScenariosList Component
 *
 * Displays scenarios with highest disagreement across models.
 * Shows variance and per-model scores with navigation to transcripts.
 */

import { useState } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { ContestedScenario } from '../../api/operations/analysis';

type ContestedScenariosListProps = {
  scenarios: ContestedScenario[];
  onScenarioClick?: (scenarioId: string) => void;
  defaultLimit?: number;
};

const LIMIT_OPTIONS = [5, 10, 20];

/**
 * Format variance for display.
 */
function formatVariance(variance: number): string {
  return variance.toFixed(3);
}

/**
 * Get color for score value (0-1 range).
 */
function getScoreColor(score: number): string {
  if (score >= 0.8) return 'text-green-600';
  if (score >= 0.6) return 'text-green-500';
  if (score >= 0.4) return 'text-amber-500';
  if (score >= 0.2) return 'text-orange-500';
  return 'text-red-500';
}

/**
 * Format model name for display.
 */
function formatModelName(name: string, maxLen: number = 15): string {
  if (name.length <= maxLen) return name;
  return `${name.slice(0, maxLen - 3)}...`;
}

export function ContestedScenariosList({
  scenarios,
  onScenarioClick,
  defaultLimit = 5,
}: ContestedScenariosListProps) {
  const [limit, setLimit] = useState(defaultLimit);

  const displayedScenarios = scenarios.slice(0, limit);

  if (scenarios.length === 0) {
    return (
      <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
        <AlertTriangle className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-gray-700">No Contested Scenarios</p>
          <p className="text-xs text-gray-500 mt-1">
            All scenarios showed consistent responses across models, or there was insufficient data
            to compute variance.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with limit control */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Showing top {Math.min(limit, scenarios.length)} of {scenarios.length} scenarios by disagreement
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor="limit-select" className="text-xs text-gray-500">
            Show:
          </label>
          <select
            id="limit-select"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                Top {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Scenarios list */}
      <div className="space-y-2">
        {displayedScenarios.map((scenario, index) => (
          <div
            key={scenario.scenarioId}
            className={`border rounded-lg overflow-hidden ${
              onScenarioClick ? 'cursor-pointer hover:border-teal-500 transition-colors' : ''
            }`}
            onClick={() => onScenarioClick?.(scenario.scenarioId)}
            role={onScenarioClick ? 'button' : undefined}
            tabIndex={onScenarioClick ? 0 : undefined}
            onKeyPress={(e) => {
              if (onScenarioClick && (e.key === 'Enter' || e.key === ' ')) {
                onScenarioClick(scenario.scenarioId);
              }
            }}
          >
            {/* Scenario header */}
            <div className="flex items-center justify-between p-3 bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-medium flex items-center justify-center">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-900" title={scenario.scenarioName}>
                    {scenario.scenarioName.length > 50
                      ? `${scenario.scenarioName.slice(0, 47)}...`
                      : scenario.scenarioName}
                  </p>
                  <p className="text-xs text-gray-500">
                    Variance: <span className="font-medium">{formatVariance(scenario.variance)}</span>
                  </p>
                </div>
              </div>
              {onScenarioClick && (
                <ChevronRight className="w-5 h-5 text-gray-400" />
              )}
            </div>

            {/* Model scores */}
            <div className="p-3 bg-white">
              <div className="flex flex-wrap gap-3">
                {Object.entries(scenario.modelScores)
                  .sort(([, a], [, b]) => b - a)
                  .map(([modelId, score]) => (
                    <div
                      key={modelId}
                      className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded text-xs"
                      title={`${modelId}: ${(score * 100).toFixed(1)}%`}
                    >
                      <span className="text-gray-600">{formatModelName(modelId)}</span>
                      <span className={`font-medium ${getScoreColor(score)}`}>
                        {(score * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* View more indicator */}
      {scenarios.length > limit && (
        <p className="text-xs text-gray-500 text-center">
          {scenarios.length - limit} more scenarios not shown.{' '}
          <button
            type="button"
            onClick={() => setLimit(Math.min(limit + 5, scenarios.length))}
            className="text-teal-600 hover:text-teal-700"
          >
            Show more
          </button>
        </p>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t border-gray-100">
        <span>Score color:</span>
        <span className="text-green-600">High (80%+)</span>
        <span className="text-amber-500">Medium (40-60%)</span>
        <span className="text-red-500">Low (&lt;20%)</span>
      </div>
    </div>
  );
}

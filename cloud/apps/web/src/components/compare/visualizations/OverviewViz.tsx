/**
 * Overview Visualization for Cross-Run Comparison
 *
 * Shows high-level comparison statistics:
 * - Summary table with run stats
 * - Effect sizes between run pairs
 * - Common vs unique models
 */

import { Info, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { ComparisonVisualizationProps, EffectSizeInterpretation } from '../types';
import { formatRunNameShort } from '../../../lib/format';

/**
 * Get color class for effect size interpretation
 */
function getEffectSizeColor(interpretation: EffectSizeInterpretation): string {
  switch (interpretation) {
    case 'large':
      return 'text-red-600';
    case 'medium':
      return 'text-yellow-600';
    case 'small':
      return 'text-blue-600';
    case 'negligible':
    default:
      return 'text-gray-500';
  }
}

/**
 * Get icon for mean difference direction
 */
function getDifferenceIcon(difference: number) {
  if (Math.abs(difference) < 0.1) {
    return <Minus className="w-4 h-4 text-gray-500" />;
  }
  if (difference > 0) {
    return <TrendingUp className="w-4 h-4 text-green-600" />;
  }
  return <TrendingDown className="w-4 h-4 text-red-600" />;
}

/**
 * Format a number to 2 decimal places
 */
function formatNumber(n: number): string {
  return n.toFixed(2);
}

/**
 * Overview visualization component
 */
export function OverviewViz({ runs, statistics }: ComparisonVisualizationProps) {
  if (!statistics) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <p>Computing statistics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Summary Section */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          Run Summary
          <span className="text-sm font-normal text-gray-500">
            ({runs.length} runs, {statistics.summary.totalSamples} total samples)
          </span>
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 text-gray-600 font-medium">Run</th>
                <th className="text-left py-2 px-3 text-gray-600 font-medium">Definition</th>
                <th className="text-left py-2 px-3 text-gray-600 font-medium">Models</th>
                <th className="text-right py-2 px-3 text-gray-600 font-medium">Samples</th>
                <th className="text-right py-2 px-3 text-gray-600 font-medium">Mean</th>
                <th className="text-right py-2 px-3 text-gray-600 font-medium">Std Dev</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3">
                    <span className="text-gray-900 text-xs" title={formatRunNameShort(run)}>
                      {formatRunNameShort(run, 25)}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-gray-900">
                    {run.definition.name}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex flex-wrap gap-1">
                      {(run.config.models).map((model) => (
                        <span
                          key={model}
                          className="px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-600"
                        >
                          {model.split(':').pop() || model}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right text-gray-900">
                    {run.aggregateStats?.sampleCount ?? '-'}
                  </td>
                  <td className="py-2 px-3 text-right text-gray-900 font-mono">
                    {run.aggregateStats ? formatNumber(run.aggregateStats.overallMean) : '-'}
                  </td>
                  <td className="py-2 px-3 text-right text-gray-500 font-mono">
                    {run.aggregateStats ? formatNumber(run.aggregateStats.overallStdDev) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Effect Sizes Section */}
      {statistics.runPairs.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            Effect Sizes (Cohen&apos;s d)
            <button
              className="text-gray-400 hover:text-gray-600"
              title="Cohen's d measures the standardized difference between two means. |d| < 0.2 is negligible, 0.2-0.5 is small, 0.5-0.8 is medium, > 0.8 is large."
            >
              <Info className="w-4 h-4" />
            </button>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-gray-600 font-medium">Comparison</th>
                  <th className="text-right py-2 px-3 text-gray-600 font-medium">Mean Δ</th>
                  <th className="text-right py-2 px-3 text-gray-600 font-medium">Effect Size</th>
                  <th className="text-left py-2 px-3 text-gray-600 font-medium">Interpretation</th>
                  <th className="text-left py-2 px-3 text-gray-600 font-medium">Value Changes</th>
                </tr>
              </thead>
              <tbody>
                {statistics.runPairs.map((pair) => {
                  const run1 = runs.find((r) => r.id === pair.run1Id);
                  const run2 = runs.find((r) => r.id === pair.run2Id);
                  const run1Name = run1 ? formatRunNameShort(run1, 20) : pair.run1Id.slice(0, 8);
                  const run2Name = run2 ? formatRunNameShort(run2, 20) : pair.run2Id.slice(0, 8);
                  return (
                    <tr key={`${pair.run1Id}-${pair.run2Id}`} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3">
                        <span className="text-gray-900">
                          {run1Name}
                        </span>
                        <span className="text-gray-400 mx-2">vs</span>
                        <span className="text-gray-900">
                          {run2Name}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span className="flex items-center justify-end gap-1">
                          {getDifferenceIcon(pair.meanDifference)}
                          <span className="text-gray-900 font-mono">
                            {pair.meanDifference > 0 ? '+' : ''}{formatNumber(pair.meanDifference)}
                          </span>
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span className={`font-mono ${getEffectSizeColor(pair.effectInterpretation)}`}>
                          {formatNumber(pair.effectSize)}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`capitalize ${getEffectSizeColor(pair.effectInterpretation)}`}>
                          {pair.effectInterpretation}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        {pair.significantValueChanges.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {pair.significantValueChanges.slice(0, 3).map((value) => (
                              <span
                                key={value}
                                className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs"
                              >
                                {value}
                              </span>
                            ))}
                            {pair.significantValueChanges.length > 3 && (
                              <span className="text-gray-500 text-xs">
                                +{pair.significantValueChanges.length - 3} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-500 text-xs">None</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Model Overlap Section */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Model Coverage</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Common Models */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h4 className="text-sm font-medium text-gray-600 mb-2">
              Common Models ({statistics.commonModels.length})
            </h4>
            {statistics.commonModels.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {statistics.commonModels.map((model) => (
                  <span
                    key={model}
                    className="px-2 py-1 bg-teal-100 text-teal-700 rounded text-sm"
                  >
                    {model.split(':').pop() || model}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No common models across all runs</p>
            )}
          </div>

          {/* Unique Models per Run */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h4 className="text-sm font-medium text-gray-600 mb-2">Unique Models</h4>
            <div className="space-y-2">
              {runs.map((run) => {
                const uniqueModels = statistics.uniqueModels[run.id] || [];
                if (uniqueModels.length === 0) return null;
                return (
                  <div key={run.id} className="flex items-start gap-2">
                    <span className="text-gray-500 text-xs min-w-[80px]" title={formatRunNameShort(run)}>
                      {formatRunNameShort(run, 12)}:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {uniqueModels.map((model) => (
                        <span
                          key={model}
                          className="px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded text-xs"
                        >
                          {model.split(':').pop() || model}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
              {Object.values(statistics.uniqueModels).every((models) => models.length === 0) && (
                <p className="text-gray-500 text-sm">All models are common across runs</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Mean Decision Range */}
      <section className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <h4 className="text-sm font-medium text-gray-600 mb-2">Decision Range</h4>
        <div className="flex items-center gap-4">
          <div>
            <span className="text-gray-500 text-sm">Min Mean:</span>
            <span className="ml-2 text-gray-900 font-mono">
              {formatNumber(statistics.summary.meanDecisionRange[0])}
            </span>
          </div>
          <div className="flex-1 h-2 bg-gray-200 rounded-full relative">
            <div
              className="absolute h-full bg-gradient-to-r from-teal-500 to-teal-400 rounded-full"
              style={{
                left: `${((statistics.summary.meanDecisionRange[0] - 1) / 4) * 100}%`,
                right: `${100 - ((statistics.summary.meanDecisionRange[1] - 1) / 4) * 100}%`,
              }}
            />
          </div>
          <div>
            <span className="text-gray-500 text-sm">Max Mean:</span>
            <span className="ml-2 text-gray-900 font-mono">
              {formatNumber(statistics.summary.meanDecisionRange[1])}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}

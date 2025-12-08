/**
 * AnalysisPanel Component
 *
 * Main container for displaying run analysis results.
 * Shows per-model statistics, win rates, and warnings.
 */

import { BarChart2, AlertCircle, Clock, RefreshCw, Loader2, Info } from 'lucide-react';
import { Button } from '../ui/Button';
import { Loading } from '../ui/Loading';
import { ErrorMessage } from '../ui/ErrorMessage';
import { StatCard } from './StatCard';
import { ScoreDistributionChart } from './ScoreDistributionChart';
import { VariableImpactChart } from './VariableImpactChart';
import { useAnalysis } from '../../hooks/useAnalysis';
import type { AnalysisResult, PerModelStats, AnalysisWarning } from '../../api/operations/analysis';

type AnalysisPanelProps = {
  runId: string;
  analysisStatus?: string | null;
};

/**
 * Format a percentage value.
 */
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Format a timestamp for display.
 */
function formatTimestamp(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format duration in ms to human-readable.
 */
function formatDuration(ms: number | null): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

/**
 * Get count of models from perModel data.
 */
function getModelCount(perModel: Record<string, PerModelStats>): number {
  return Object.keys(perModel).length;
}

/**
 * Calculate total sample size across all models.
 */
function getTotalSampleSize(perModel: Record<string, PerModelStats>): number {
  return Object.values(perModel).reduce((sum, model) => sum + model.sampleSize, 0);
}

/**
 * Warning display component.
 */
function WarningBanner({ warning }: { warning: AnalysisWarning }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-800">{warning.message}</p>
        <p className="text-xs text-amber-600 mt-1">{warning.recommendation}</p>
      </div>
    </div>
  );
}

/**
 * Model stats row component.
 */
function ModelStatsRow({ modelId, stats }: { modelId: string; stats: PerModelStats }) {
  // Get top 3 values by win rate
  const sortedValues = Object.entries(stats.values)
    .sort(([, a], [, b]) => b.winRate - a.winRate)
    .slice(0, 3);

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-gray-900 truncate" title={modelId}>
          {modelId}
        </h4>
        <span className="text-sm text-gray-500">
          n={stats.sampleSize}
        </span>
      </div>

      {/* Overall stats */}
      <div className="grid grid-cols-4 gap-2 mb-3 text-sm">
        <div>
          <span className="text-gray-500">Mean:</span>
          <span className="ml-1 font-medium">{stats.overall.mean.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-500">StdDev:</span>
          <span className="ml-1 font-medium">{stats.overall.stdDev.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-500">Min:</span>
          <span className="ml-1 font-medium">{stats.overall.min.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-500">Max:</span>
          <span className="ml-1 font-medium">{stats.overall.max.toFixed(2)}</span>
        </div>
      </div>

      {/* Top values */}
      {sortedValues.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500 mb-2">Top Values by Win Rate</p>
          <div className="flex flex-wrap gap-2">
            {sortedValues.map(([valueId, valueStats]) => (
              <span
                key={valueId}
                className="inline-flex items-center px-2 py-1 rounded-full bg-teal-50 text-teal-700 text-xs"
                title={`${formatPercent(valueStats.winRate)} (${valueStats.count.prioritized}/${valueStats.count.prioritized + valueStats.count.deprioritized})`}
              >
                {valueId}: {formatPercent(valueStats.winRate)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Pending analysis display.
 */
function AnalysisPending({ status }: { status: string | null | undefined }) {
  const isComputing = status === 'computing';

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {isComputing ? (
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin mb-4" />
      ) : (
        <Clock className="w-8 h-8 text-gray-400 mb-4" />
      )}
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {isComputing ? 'Computing Analysis...' : 'Analysis Pending'}
      </h3>
      <p className="text-sm text-gray-500 max-w-md">
        {isComputing
          ? 'Statistical analysis is being computed. This usually takes a few seconds.'
          : 'Analysis will begin automatically once the run completes.'}
      </p>
    </div>
  );
}

/**
 * Empty analysis display (for runs without enough data).
 */
function AnalysisEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Info className="w-8 h-8 text-gray-400 mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        Analysis Unavailable
      </h3>
      <p className="text-sm text-gray-500 max-w-md">
        Not enough successful transcripts to compute analysis.
        Analysis requires at least one summarized transcript with a decision code.
      </p>
    </div>
  );
}

export function AnalysisPanel({ runId, analysisStatus }: AnalysisPanelProps) {
  const { analysis, loading, error, recompute, recomputing } = useAnalysis({
    runId,
    analysisStatus,
  });

  // Loading state
  if (loading && !analysis) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Loading text="Loading analysis..." />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <ErrorMessage message={`Failed to load analysis: ${error.message}`} />
      </div>
    );
  }

  // Pending/computing state
  if (!analysis && (analysisStatus === 'pending' || analysisStatus === 'computing')) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <AnalysisPending status={analysisStatus} />
      </div>
    );
  }

  // No analysis available
  if (!analysis) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <AnalysisEmpty />
      </div>
    );
  }

  const modelCount = getModelCount(analysis.perModel);
  const totalSamples = getTotalSampleSize(analysis.perModel);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900">Analysis</h2>
            <p className="text-sm text-gray-500">
              Computed {formatTimestamp(analysis.computedAt)} • {formatDuration(analysis.durationMs)}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void recompute()}
          disabled={recomputing}
        >
          {recomputing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Recompute
        </Button>
      </div>

      {/* Warnings */}
      {analysis.warnings.length > 0 && (
        <div className="space-y-2 mb-6">
          {analysis.warnings.map((warning, index) => (
            <WarningBanner key={`${warning.code}-${index}`} warning={warning} />
          ))}
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Models"
          value={modelCount}
          detail={`${modelCount} model${modelCount !== 1 ? 's' : ''} analyzed`}
        />
        <StatCard
          label="Total Samples"
          value={totalSamples}
          detail={`${Math.round(totalSamples / modelCount)} per model avg`}
        />
        <StatCard
          label="Analysis Type"
          value={analysis.analysisType}
          detail={`v${analysis.codeVersion}`}
        />
        <StatCard
          label="Status"
          value={analysis.status}
          variant={analysis.status === 'CURRENT' ? 'success' : 'default'}
        />
      </div>

      {/* Score Distribution Chart */}
      <div className="border-t border-gray-200 pt-6 mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Win Rate by Value</h3>
        <ScoreDistributionChart perModel={analysis.perModel} />
      </div>

      {/* Variable Impact Chart */}
      <div className="border-t border-gray-200 pt-6 mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Dimension Impact Analysis</h3>
        <VariableImpactChart dimensionAnalysis={analysis.dimensionAnalysis} />
      </div>

      {/* Per-model statistics */}
      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Per-Model Statistics</h3>
        <div className="space-y-4">
          {Object.entries(analysis.perModel).map(([modelId, stats]) => (
            <ModelStatsRow key={modelId} modelId={modelId} stats={stats} />
          ))}
        </div>
      </div>

      {/* Methods documentation - collapsible */}
      <details className="border-t border-gray-200 pt-6 mt-6">
        <summary className="text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900">
          Statistical Methods Used
        </summary>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Win Rate CI:</span>
            <span className="ml-2 text-gray-900">{analysis.methodsUsed.winRateCI}</span>
          </div>
          <div>
            <span className="text-gray-500">Model Comparison:</span>
            <span className="ml-2 text-gray-900">{analysis.methodsUsed.modelComparison}</span>
          </div>
          <div>
            <span className="text-gray-500">P-Value Correction:</span>
            <span className="ml-2 text-gray-900">{analysis.methodsUsed.pValueCorrection}</span>
          </div>
          <div>
            <span className="text-gray-500">Effect Size:</span>
            <span className="ml-2 text-gray-900">{analysis.methodsUsed.effectSize}</span>
          </div>
          <div>
            <span className="text-gray-500">Dimension Test:</span>
            <span className="ml-2 text-gray-900">{analysis.methodsUsed.dimensionTest}</span>
          </div>
          <div>
            <span className="text-gray-500">Alpha Level:</span>
            <span className="ml-2 text-gray-900">{analysis.methodsUsed.alpha}</span>
          </div>
        </div>
      </details>
    </div>
  );
}

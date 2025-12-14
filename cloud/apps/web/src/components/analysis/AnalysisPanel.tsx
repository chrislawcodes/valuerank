/**
 * AnalysisPanel Component
 *
 * Main container for displaying run analysis results.
 * Shows per-model statistics, win rates, and warnings.
 */

import { useMemo, useState } from 'react';
import { BarChart2, AlertCircle, Clock, RefreshCw, Loader2, Info } from 'lucide-react';
import { Button } from '../ui/Button';
import { Loading } from '../ui/Loading';
import { ErrorMessage } from '../ui/ErrorMessage';
import { StatCard } from './StatCard';
import { AnalysisFilters, filterByModels } from './AnalysisFilters';
import type { FilterState } from './AnalysisFilters';
import {
  OverviewTab,
  DecisionsTab,
  ScenariosTab,
  ValuesTab,
  AgreementTab,
  MethodsTab,
  TABS,
  type AnalysisTab,
} from './tabs';
import { useAnalysis } from '../../hooks/useAnalysis';
import type { PerModelStats, AnalysisWarning } from '../../api/operations/analysis';

type AnalysisPanelProps = {
  runId: string;
  analysisStatus?: string | null;
};

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
 * Pending analysis display.
 */
function AnalysisPending({
  status,
  onRunAnalysis,
  isRunning,
}: {
  status: string | null | undefined;
  onRunAnalysis?: () => void;
  isRunning?: boolean;
}) {
  const isComputing = status === 'computing';

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {isComputing || isRunning ? (
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin mb-4" />
      ) : (
        <Clock className="w-8 h-8 text-gray-400 mb-4" />
      )}
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {isComputing || isRunning ? 'Computing Analysis...' : 'Analysis Pending'}
      </h3>
      <p className="text-sm text-gray-500 max-w-md">
        {isComputing || isRunning
          ? 'Statistical analysis is being computed. This usually takes a few seconds.'
          : 'Analysis has not been computed yet for this run.'}
      </p>
      {!isComputing && !isRunning && onRunAnalysis && (
        <Button variant="primary" size="sm" onClick={onRunAnalysis} className="mt-4">
          <BarChart2 className="w-4 h-4 mr-2" />
          Run Analysis
        </Button>
      )}
    </div>
  );
}

/**
 * Empty analysis display.
 */
function AnalysisEmpty({
  onRunAnalysis,
  isRunning,
}: {
  onRunAnalysis?: () => void;
  isRunning?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Info className="w-8 h-8 text-gray-400 mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">Analysis Not Available</h3>
      <p className="text-sm text-gray-500 max-w-md mb-4">
        Analysis has not been computed for this run yet, or there were not enough successful
        transcripts with decision codes.
      </p>
      {onRunAnalysis && (
        <Button variant="primary" size="sm" onClick={onRunAnalysis} disabled={isRunning}>
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Running Analysis...
            </>
          ) : (
            <>
              <BarChart2 className="w-4 h-4 mr-2" />
              Run Analysis
            </>
          )}
        </Button>
      )}
    </div>
  );
}

export function AnalysisPanel({ runId, analysisStatus }: AnalysisPanelProps) {
  const { analysis, loading, error, recompute, recomputing } = useAnalysis({
    runId,
    analysisStatus,
  });

  const [activeTab, setActiveTab] = useState<AnalysisTab>('overview');
  const [filters, setFilters] = useState<FilterState>({
    selectedModels: [],
    selectedValue: null,
  });

  const availableModels = useMemo(
    () => (analysis ? Object.keys(analysis.perModel).sort() : []),
    [analysis]
  );

  const availableValues = useMemo(() => {
    if (!analysis) return [];
    const valueSet = new Set<string>();
    Object.values(analysis.perModel).forEach((modelStats) => {
      Object.keys(modelStats.values).forEach((v) => valueSet.add(v));
    });
    return Array.from(valueSet).sort();
  }, [analysis]);

  const filteredPerModel = useMemo(
    () => (analysis ? filterByModels(analysis.perModel, filters.selectedModels) : {}),
    [analysis, filters.selectedModels]
  );

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
        <AnalysisPending
          status={analysisStatus}
          onRunAnalysis={() => void recompute()}
          isRunning={recomputing}
        />
      </div>
    );
  }

  // No analysis available
  if (!analysis) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <AnalysisEmpty onRunAnalysis={() => void recompute()} isRunning={recomputing} />
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
        <Button variant="secondary" size="sm" onClick={() => void recompute()} disabled={recomputing}>
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
        <StatCard label="Analysis Type" value={analysis.analysisType} detail={`v${analysis.codeVersion}`} />
        <StatCard
          label="Status"
          value={analysis.status}
          variant={analysis.status === 'CURRENT' ? 'success' : 'default'}
        />
      </div>

      {/* Filters */}
      <div className="mb-6">
        <AnalysisFilters
          availableModels={availableModels}
          availableValues={availableValues}
          filters={filters}
          onFilterChange={setFilters}
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4 -mb-px">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'overview' && <OverviewTab perModel={filteredPerModel} />}
        {activeTab === 'decisions' && (
          <DecisionsTab visualizationData={analysis.visualizationData} perModel={filteredPerModel} />
        )}
        {activeTab === 'scenarios' && (
          <ScenariosTab
            visualizationData={analysis.visualizationData}
            contestedScenarios={analysis.mostContestedScenarios}
          />
        )}
        {activeTab === 'values' && (
          <ValuesTab
            perModel={filteredPerModel}
            dimensionAnalysis={analysis.dimensionAnalysis}
            filters={filters}
            onFilterChange={setFilters}
          />
        )}
        {activeTab === 'agreement' && (
          <AgreementTab modelAgreement={analysis.modelAgreement} perModel={filteredPerModel} />
        )}
        {activeTab === 'methods' && (
          <MethodsTab methodsUsed={analysis.methodsUsed} warnings={analysis.warnings} />
        )}
      </div>
    </div>
  );
}

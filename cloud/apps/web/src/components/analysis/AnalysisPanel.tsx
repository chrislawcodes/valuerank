/**
 * AnalysisPanel Component
 *
 * Main container for displaying run analysis results.
 * Shows per-model statistics, win rates, and warnings.
 */

import { useMemo, useState, useCallback, useEffect } from 'react';
import { BarChart2, BarChart3, AlertCircle, Clock, RefreshCw, Loader2, FileSpreadsheet, Link2, Check } from 'lucide-react';
import { Button } from '../ui/Button';
import { Loading } from '../ui/Loading';
import { ErrorMessage } from '../ui/ErrorMessage';
import { StatCard } from './StatCard';
import {
  OverviewTab,
  DecisionsTab,
  ScenariosTab,
  StabilityTab,
  TABS,
  type AnalysisTab,
} from './tabs';
import { useAnalysis } from '../../hooks/useAnalysis';
import { exportRunAsXLSX, getODataFeedUrl, getCSVFeedUrl } from '../../api/export';
import type { PerModelStats, AnalysisWarning } from '../../api/operations/analysis';
import {
  deriveDecisionDimensionLabels,
  deriveScenarioAttributesFromDefinition,
} from '../../utils/decisionLabels';

type AnalysisPanelProps = {
  runId: string;
  analysisStatus?: string | null;
  definitionContent?: unknown;
  isOldVersion?: boolean;
  isAggregate?: boolean;
  pendingSince?: string | null;
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
  pendingSince,
}: {
  status: string | null | undefined;
  onRunAnalysis?: () => void;
  isRunning?: boolean;
  pendingSince?: string | null;
}) {
  const isComputing = status === 'computing';
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!pendingSince) {
      setElapsedMs(0);
      return;
    }

    const baseTime = new Date(pendingSince).getTime();
    if (!Number.isFinite(baseTime)) {
      setElapsedMs(0);
      return;
    }

    const tick = () => {
      setElapsedMs(Math.max(0, Date.now() - baseTime));
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [pendingSince]);

  const elapsedText = elapsedMs > 0
    ? `${Math.floor(elapsedMs / 60000)}m ${Math.floor((elapsedMs % 60000) / 1000)}s`
    : null;

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
      {elapsedText && (
        <p className="text-xs text-gray-500 mt-2">
          Elapsed: {elapsedText} (auto-refresh every 5s)
        </p>
      )}
      {!isComputing && !isRunning && onRunAnalysis && (
        <Button variant="primary" size="sm" onClick={onRunAnalysis} className="mt-4">
          <BarChart2 className="w-4 h-4 mr-2" />
          Analyze Trial
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
  status,
}: {
  onRunAnalysis?: () => void;
  isRunning?: boolean;
  status: string | null | undefined;
}) {
  const isFailed = status === 'failed';

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mx-auto h-12 w-12 text-gray-400 flex items-center justify-center">
        {isFailed ? (
          <AlertCircle className="w-12 h-12 text-amber-500" />
        ) : (
          <BarChart3 className="w-12 h-12 text-gray-300" />
        )}
      </div>
      <h3 className="mt-4 text-lg font-medium text-gray-900">
        {isFailed ? 'Analysis Failed' : 'Analysis Not Available'}
      </h3>
      <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
        {isFailed
          ? 'The analysis computation failed. This may be due to insufficient valid transcript data or a system error.'
          : 'Analysis has not been computed for this run yet, or there were not enough successful transcripts with decision codes.'}
      </p>
      {onRunAnalysis && (
        <div className="mt-6">
          <Button variant="primary" size="sm" onClick={onRunAnalysis} disabled={isRunning}>
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running Analysis...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                {isFailed ? 'Retry Analysis' : 'Analyze Trial'}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export function AnalysisPanel({
  runId,
  analysisStatus,
  definitionContent,
  isOldVersion = false,
  isAggregate,
  pendingSince,
}: AnalysisPanelProps) {
  const { analysis, loading, error, recompute, recomputing } = useAnalysis({
    runId,
    analysisStatus,
  });

  const dimensionLabels = useMemo(
    () => deriveDecisionDimensionLabels(definitionContent),
    [definitionContent]
  );
  const expectedScenarioAttributes = useMemo(
    () => deriveScenarioAttributesFromDefinition(definitionContent),
    [definitionContent]
  );

  const [activeTab, setActiveTab] = useState<AnalysisTab>('overview');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [odataLinkCopied, setOdataLinkCopied] = useState(false);
  const [csvLinkCopied, setCsvLinkCopied] = useState(false);

  const handleExportExcel = useCallback(async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      await exportRunAsXLSX(runId);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [runId]);

  const handleCopyODataLink = useCallback(async () => {
    const url = getODataFeedUrl(runId);
    try {
      await navigator.clipboard.writeText(url);
      setOdataLinkCopied(true);
      setTimeout(() => setOdataLinkCopied(false), 2000);
    } catch {
      // Fallback: show the URL in an alert if clipboard fails
      window.prompt('Copy this OData URL for Excel:', url);
    }
  }, [runId]);

  const handleCopyCSVLink = useCallback(async () => {
    const url = getCSVFeedUrl(runId) + '?apiKey=YOUR_API_KEY_HERE';
    try {
      await navigator.clipboard.writeText(url);
      setCsvLinkCopied(true);
      setTimeout(() => setCsvLinkCopied(false), 2000);
      // Optional: Could toast here to remind user to replace key
    } catch {
      window.prompt('Copy this CSV URL for Google Sheets IMPORTDATA (Replace YOUR_API_KEY_HERE):', url);
    }
  }, [runId]);

  const perModel = useMemo(
    () => analysis?.perModel ?? {},
    [analysis]
  );

  const displayWarnings = useMemo<AnalysisWarning[]>(() => {
    if (!analysis) return [];

    // Hide "low sample size" warnings in the UI; users are expected to infer this from the tables.
    const isLowSampleWarning = (code: string) => code.includes('SMALL_SAMPLE') || code.includes('MODERATE_SAMPLE');

    return analysis.warnings.filter(w => !isLowSampleWarning(w.code));
  }, [analysis]);

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
          pendingSince={pendingSince}
        />
      </div>
    );
  }

  // Loading state
  if (loading && !analysis) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Loading text="Loading analysis..." />
      </div>
    );
  }

  // No analysis available
  if (!analysis) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <AnalysisEmpty
          onRunAnalysis={() => void recompute()}
          isRunning={recomputing}
          status={analysisStatus}
        />
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
        <div className="flex items-center gap-2">
          {!isAggregate && (
            <>
              <Button variant="secondary" size="sm" onClick={() => void handleExportExcel()} disabled={isExporting}>
                {isExporting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                )}
                Export Excel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleCopyODataLink()}
                title="Copy OData URL for Excel's 'From OData Feed' feature"
              >
                {odataLinkCopied ? (
                  <Check className="w-4 h-4 mr-2 text-green-600" />
                ) : (
                  <Link2 className="w-4 h-4 mr-2" />
                )}
                {odataLinkCopied ? 'Copied!' : 'OData Link'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleCopyCSVLink()}
                title="Copy CSV URL for Google Sheets IMPORTDATA"
              >
                {csvLinkCopied ? (
                  <Check className="w-4 h-4 mr-2 text-green-600" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                )}
                {csvLinkCopied ? 'Copied!' : 'CSV Feed'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void recompute()} disabled={recomputing}>
                {recomputing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Recompute
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Export Error */}
      {exportError && (
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg mb-6">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">Export failed</p>
            <p className="text-xs text-red-600 mt-1">{exportError}</p>
          </div>
        </div>
      )}

      {/* Warnings */}
      {displayWarnings.length > 0 && (
        <div className="space-y-2 mb-6">
          {displayWarnings.map((warning, index) => (
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
          value={isOldVersion && analysis.status === 'CURRENT' ? 'OLD VERSION' : analysis.status}
          variant={
            isOldVersion && analysis.status === 'CURRENT'
              ? 'error'
              : analysis.status === 'CURRENT'
                ? 'success'
                : 'default'
          }
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4 -mb-px">
          {TABS.map((tab) => (
            // eslint-disable-next-line react/forbid-elements -- Tab button requires custom semantic styling
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 text-sm font-medium transition-colors ${activeTab === tab.id
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
        {activeTab === 'overview' && (
          <OverviewTab
            runId={runId}
            perModel={perModel}
            visualizationData={analysis.visualizationData}
            dimensionLabels={dimensionLabels}
            expectedAttributes={expectedScenarioAttributes}
          />
        )}
        {activeTab === 'decisions' && (
          <DecisionsTab
            visualizationData={analysis.visualizationData}
            perModel={perModel}
            varianceAnalysis={analysis.varianceAnalysis}
            dimensionLabels={dimensionLabels}
          />
        )}
        {activeTab === 'scenarios' && (
          <ScenariosTab
            runId={runId}
            visualizationData={analysis.visualizationData}
            contestedScenarios={analysis.mostContestedScenarios}
            dimensionLabels={dimensionLabels}
            expectedAttributes={expectedScenarioAttributes}
          />
        )}
        {activeTab === 'stability' && (
          <StabilityTab
            runId={runId}
            perModel={perModel}
            visualizationData={loading ? null : analysis.visualizationData}
            varianceAnalysis={analysis.varianceAnalysis}
          />
        )}
      </div>
    </div>
  );
}

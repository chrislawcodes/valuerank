/**
 * AnalysisPanel Component
 *
 * Main container for displaying run analysis results.
 * Shows per-model statistics, win rates, and warnings.
 */

import { useMemo, useState, useEffect } from 'react';
import { BarChart2, BarChart3, AlertCircle, Clock, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Loading } from '../ui/Loading';
import { ErrorMessage } from '../ui/ErrorMessage';
import { StatCard } from './StatCard';
import { DecisionCoverageBanner } from './DecisionCoverageBanner';
import { AnalysisScopeBanner } from './AnalysisScopeBanner';
import {
  OverviewTab,
  DecisionsTab,
  ScenariosTab,
  StabilityTab,
  TABS,
  type AnalysisTab,
} from './tabs';
import { useAnalysis } from '../../hooks/useAnalysis';
import type { PerModelStats, AnalysisWarning } from '../../api/operations/analysis';
import type { Transcript } from '../../api/operations/runs';
import {
  deriveDecisionDimensionLabels,
  deriveScenarioAttributesFromDefinition,
} from '../../utils/decisionLabels';
import { ANALYSIS_BASE_PATH, type AnalysisBasePath } from '../../utils/analysisRouting';
import {
  buildAnalysisSemanticsView,
} from '../analysis-v2/analysisSemantics';
import {
  summarizeDecisionCoverage,
  shouldShowDecisionCoverage,
} from '../../utils/analysisCoverage';
import {
  buildPairedScopeContext,
  type PairedScopeContext,
} from '../../utils/pairedScopeAdapter';

type AnalysisPanelProps = {
  runId: string;
  analysisBasePath?: AnalysisBasePath;
  analysisStatus?: string | null;
  definitionContent?: unknown;
  transcripts?: Transcript[];
  isOldVersion?: boolean;
  isAggregate?: boolean;
  pendingSince?: string | null;
  initialTab?: AnalysisTab;
  analysisSearchParams?: URLSearchParams | string;
  analysisMode?: 'single' | 'paired';
  onAnalysisModeChange?: (mode: 'single' | 'paired') => void;
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
 * Calculate total trial count across all models.
 */
function getTotalTrialCount(perModel: Record<string, PerModelStats>): number {
  return Object.values(perModel).reduce((sum, model) => sum + model.sampleSize, 0);
}

/**
 * Compute completed full batches across all models.
 * A batch is one full set of trials over all analyzed conditions.
 */
function getBatchStats(
  perModel: Record<string, PerModelStats>,
  modelScenarioMatrix: Record<string, Record<string, number>> | null | undefined,
): { batches: number | '-'; detail: string } {
  const conditionCount = Object.values(modelScenarioMatrix ?? {}).reduce(
    (max, scenarios) => Math.max(max, Object.keys(scenarios ?? {}).length),
    0,
  );

  if (conditionCount === 0) {
    return { batches: '-', detail: 'Condition coverage unavailable' };
  }

  const modelBatches = Object.values(perModel).map((model) => model.sampleSize / conditionCount);
  if (modelBatches.length === 0) {
    return { batches: '-', detail: `${conditionCount} conditions per batch` };
  }

  const minBatches = Math.min(...modelBatches);
  const maxBatches = Math.max(...modelBatches);
  const completedBatches = Math.max(0, Math.floor(minBatches));

  if (Math.abs(maxBatches - minBatches) < 1e-9) {
    return { batches: completedBatches, detail: `${conditionCount} conditions per batch` };
  }

  return {
    batches: completedBatches,
    detail: `${conditionCount} conditions per batch • uneven model coverage`,
  };
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
  analysisBasePath = ANALYSIS_BASE_PATH,
  analysisStatus,
  definitionContent,
  transcripts = [],
  isOldVersion = false,
  isAggregate,
  pendingSince,
  initialTab = 'overview',
  analysisSearchParams,
  analysisMode,
  onAnalysisModeChange,
}: AnalysisPanelProps) {
  const { analysis, loading, error, recompute, recomputing } = useAnalysis({
    runId,
    analysisStatus,
  });
  const isAggregateAnalysis = isAggregate === true || analysis?.analysisType === 'AGGREGATE';

  const dimensionLabels = useMemo(
    () => deriveDecisionDimensionLabels(definitionContent),
    [definitionContent]
  );
  const expectedScenarioAttributes = useMemo(
    () => deriveScenarioAttributesFromDefinition(definitionContent),
    [definitionContent]
  );

  const pairedScopeContext = useMemo<PairedScopeContext>(
    () => buildPairedScopeContext(analysisMode, analysis?.varianceAnalysis),
    [analysisMode, analysis?.varianceAnalysis],
  );

  const [activeTab, setActiveTab] = useState<AnalysisTab>(initialTab);
  const semantics = useMemo(() => {
    if (!analysis) {
      return null;
    }

    return buildAnalysisSemanticsView(analysis, isAggregateAnalysis);
  }, [analysis, isAggregateAnalysis]);
  const decisionCoverage = useMemo(
    () => summarizeDecisionCoverage(transcripts),
    [transcripts],
  );
  const showDecisionCoverage = shouldShowDecisionCoverage(decisionCoverage);

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
  const totalTrials = getTotalTrialCount(analysis.perModel);
  const { batches, detail: batchDetail } = getBatchStats(
    analysis.perModel,
    analysis.visualizationData?.modelScenarioMatrix,
  );
  const aggregateSourceRunCount = analysis.aggregateMetadata?.sourceRunCount ?? null;
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
          {analysisMode && onAnalysisModeChange ? (
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1">
              <Button
                type="button"
                variant={analysisMode === 'single' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => onAnalysisModeChange('single')}
                aria-pressed={analysisMode === 'single'}
              >
                Single vignette
              </Button>
              <Button
                type="button"
                variant={analysisMode === 'paired' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => onAnalysisModeChange('paired')}
                aria-pressed={analysisMode === 'paired'}
              >
                Paired vignettes
              </Button>
            </div>
          ) : null}
          {!isAggregateAnalysis && (
            <>
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

      {analysisMode ? (
        <div className="mb-6">
          <AnalysisScopeBanner
            analysisMode={analysisMode}
            orientationCorrectedCount={pairedScopeContext.orientationCorrectedCount}
            compact
          />
        </div>
      ) : null}

      {/* Warnings */}
      {displayWarnings.length > 0 && (
        <div className="space-y-2 mb-6">
          {displayWarnings.map((warning, index) => (
            <WarningBanner key={`${warning.code}-${index}`} warning={warning} />
          ))}
        </div>
      )}

      {showDecisionCoverage && (
        <div className="mb-6">
          <DecisionCoverageBanner
            coverage={decisionCoverage}
            contextLabel={analysisMode === 'paired' ? 'paired vignette summaries' : 'numeric summaries'}
          />
        </div>
      )}

      {/* Summary stats */}
      <div className={`grid grid-cols-2 gap-4 mb-6 ${pairedScopeContext.hasOrientationPairing ? 'md:grid-cols-6' : 'md:grid-cols-5'}`}>
        <StatCard
          label="Models"
          value={modelCount}
          detail={`${modelCount} model${modelCount !== 1 ? 's' : ''} analyzed`}
        />
        <StatCard
          label={isAggregateAnalysis ? 'Source Runs' : 'Batches'}
          value={isAggregateAnalysis ? (aggregateSourceRunCount ?? '-') : batches}
          detail={isAggregateAnalysis
            ? aggregateSourceRunCount === null
              ? 'Contributing source-run count unavailable'
              : `${aggregateSourceRunCount} contributing source run${aggregateSourceRunCount === 1 ? '' : 's'} pooled`
            : batchDetail}
        />
        <StatCard
          label="Total Trials"
          value={totalTrials}
          detail={modelCount > 0 ? `${Math.round(totalTrials / modelCount)} per model avg` : 'No models'}
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
        {pairedScopeContext.hasOrientationPairing && (
          <StatCard
            label="Orientation Pairs"
            value={pairedScopeContext.orientationCorrectedCount}
            detail={`${pairedScopeContext.orientationCorrectedCount} scenario${pairedScopeContext.orientationCorrectedCount === 1 ? '' : 's'} orientation-normalized`}
          />
        )}
      </div>

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

      <div className="min-h-[400px]">
        {activeTab === 'overview' && semantics && (
          <OverviewTab
            runId={runId}
            analysisBasePath={analysisBasePath}
            analysisSearchParams={analysisSearchParams}
            perModel={perModel}
            visualizationData={analysis.visualizationData}
            varianceAnalysis={analysis.varianceAnalysis}
            dimensionLabels={dimensionLabels}
            expectedAttributes={expectedScenarioAttributes}
            semantics={semantics}
            completedBatches={batches}
            aggregateSourceRunCount={aggregateSourceRunCount}
            isAggregate={isAggregateAnalysis}
            analysisMode={analysisMode}
          />
        )}
        {activeTab === 'decisions' && semantics && (
          <DecisionsTab
            visualizationData={analysis.visualizationData}
            dimensionLabels={dimensionLabels}
            semantics={semantics}
            analysisMode={analysisMode}
          />
        )}
        {activeTab === 'scenarios' && (
          <ScenariosTab
            runId={runId}
            analysisBasePath={analysisBasePath}
            analysisSearchParams={analysisSearchParams}
            analysisMode={analysisMode}
            visualizationData={analysis.visualizationData}
            contestedScenarios={analysis.mostContestedScenarios}
            dimensionLabels={dimensionLabels}
            expectedAttributes={expectedScenarioAttributes}
          />
        )}
        {activeTab === 'stability' && (
          <StabilityTab
            runId={runId}
            analysisBasePath={analysisBasePath}
            analysisSearchParams={analysisSearchParams}
            analysisMode={analysisMode}
            pairedScopeContext={pairedScopeContext}
            perModel={perModel}
            visualizationData={loading ? null : analysis.visualizationData}
            varianceAnalysis={analysis.varianceAnalysis}
            decisionCoverage={showDecisionCoverage ? decisionCoverage : null}
          />
        )}
      </div>
    </div>
  );
}

/**
 * AnalysisPanel Component
 *
 * Main container for displaying run analysis results.
 * Shows per-model statistics, win rates, and warnings.
 */

import { useMemo, useState, useEffect } from 'react';
import { BarChart2, BarChart3, AlertCircle, ChevronDown, ChevronUp, Clock, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Loading } from '../ui/Loading';
import { ErrorMessage } from '../ui/ErrorMessage';
import {
  OverviewTab,
  DecisionsTab,
  ScenariosTab,
  TABS,
  type AnalysisTab,
} from './tabs';
import { useAnalysis } from '../../hooks/useAnalysis';
import type { PerModelStats, AnalysisResult, AnalysisWarning } from '../../api/operations/analysis';
import type { Run, Transcript } from '../../api/operations/runs';
import { ModelFilter } from './ModelFilter';
import {
  deriveDecisionDimensionLabels,
  deriveScenarioAttributesFromDefinition,
} from '../../utils/decisionLabels';
import { ANALYSIS_BASE_PATH, type AnalysisBasePath } from '../../utils/analysisRouting';
import {
  buildAnalysisSemanticsView,
  buildPairedAnalysisSemanticsView,
} from '../analysis-v2/analysisSemantics';
import {
  summarizeDecisionCoverage,
} from '../../utils/analysisCoverage';
import {
  mergePairedVisualizationData,
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
  activeTab: AnalysisTab;
  onTabChange: (tab: AnalysisTab) => void;
  analysisSearchParams?: URLSearchParams | string;
  analysisMode?: 'single' | 'paired';
  coverageBatchCount?: number | null;
  coveragePairedBatchCount?: number | null;
  onAnalysisModeChange?: (mode: 'single' | 'paired') => void;
  onSingleVignetteChange?: (runId: string) => void;
  companionAnalysis?: AnalysisResult | null;
  currentRun?: Run | null;
  companionRun?: Run | null;
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

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function prefixTranscriptScenarioIds(transcripts: Transcript[], prefix: 'canonical' | 'flipped'): Transcript[] {
  return transcripts.map((transcript) => {
    if (transcript.scenarioId == null || transcript.scenarioId === '') {
      return transcript;
    }

    return {
      ...transcript,
      scenarioId: `${prefix}:${transcript.scenarioId}`,
    };
  });
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

const EMPTY_TRANSCRIPTS: Transcript[] = [];

export function AnalysisPanel({
  runId,
  analysisBasePath = ANALYSIS_BASE_PATH,
  analysisStatus,
  definitionContent,
  transcripts = EMPTY_TRANSCRIPTS,
  isOldVersion: _isOldVersion = false,
  isAggregate,
  pendingSince,
  activeTab = 'overview',
  onTabChange,
  analysisSearchParams,
  analysisMode,
  coverageBatchCount,
  coveragePairedBatchCount,
  onAnalysisModeChange,
  onSingleVignetteChange,
  companionAnalysis,
  currentRun,
  companionRun,
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

  const [showDetails, setShowDetails] = useState(false);
  const decisionsVisualizationData = useMemo(() => {
    if (!analysis) {
      return null;
    }

    if (analysisMode !== 'paired' || !companionAnalysis) {
      return analysis.visualizationData;
    }

    return mergePairedVisualizationData(analysis, companionAnalysis);
  }, [analysis, analysisMode, companionAnalysis]);
  const decisionCoverage = useMemo(
    () => summarizeDecisionCoverage(transcripts),
    [transcripts],
  );

  const perModel = useMemo(
    () => analysis?.perModel ?? {},
    [analysis]
  );

  // Model filter state
  const transcriptModelIds = useMemo(
    () => [...new Set((transcripts ?? []).map((t) => t.modelId))].sort(),
    [transcripts],
  );
  const noTranscriptModelIds = useMemo(
    () => Object.keys(perModel).filter((id) => !transcriptModelIds.includes(id)).sort(),
    [perModel, transcriptModelIds],
  );
  const [selectedModels, setSelectedModels] = useState<string[]>([...transcriptModelIds]);

  // When the run changes, reset filter to the new default
  useEffect(() => {
    setSelectedModels([...transcriptModelIds]);
  }, [runId, transcriptModelIds]);

  const effectiveModels = useMemo(
    () => (selectedModels.length > 0 ? selectedModels : transcriptModelIds),
    [selectedModels, transcriptModelIds],
  );
  const filteredPerModel = useMemo<Record<string, PerModelStats>>(
    () => Object.fromEntries(
      Object.entries(perModel).filter(([k]) => effectiveModels.includes(k)),
    ),
    [effectiveModels, perModel],
  );

  const filteredSemantics = useMemo(() => {
    if (!analysis) return null;
    return buildAnalysisSemanticsView(analysis, isAggregateAnalysis, effectiveModels);
  }, [analysis, isAggregateAnalysis, effectiveModels]);

  const filteredOverviewSemantics = useMemo(() => {
    if (!analysis) return null;
    if (analysisMode === 'paired' && companionAnalysis) {
      return buildPairedAnalysisSemanticsView(analysis, companionAnalysis, isAggregateAnalysis, effectiveModels);
    }
    return buildAnalysisSemanticsView(analysis, isAggregateAnalysis, effectiveModels);
  }, [analysis, analysisMode, companionAnalysis, isAggregateAnalysis, effectiveModels]);

  const scenariosTranscripts = useMemo(() => {
    const currentTranscripts = transcripts ?? currentRun?.transcripts ?? [];

    if (analysisMode !== 'paired' || companionRun == null) {
      return currentTranscripts;
    }

    return [
      ...prefixTranscriptScenarioIds(currentTranscripts, 'canonical'),
      ...prefixTranscriptScenarioIds(companionRun.transcripts ?? [], 'flipped'),
    ];
  }, [analysisMode, companionRun, currentRun?.transcripts, transcripts]);
  const singleVignetteOptions = useMemo(() => {
    const runs = [currentRun, companionRun].filter((candidate): candidate is Run => candidate != null);
    const seen = new Set<string>();

    return runs.filter((candidate) => {
      if (seen.has(candidate.id)) {
        return false;
      }
      seen.add(candidate.id);
      return true;
    }).map((candidate) => ({
      id: candidate.id,
      label: candidate.definition?.name?.trim() || `Trial ${candidate.id.slice(0, 8)}...`,
    }));
  }, [companionRun, currentRun]);

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

  const { batches, detail: batchDetail } = getBatchStats(
    analysis.perModel,
    analysis.visualizationData?.modelScenarioMatrix,
  );
  const aggregateSourceRunCount = analysis.aggregateMetadata?.sourceRunCount ?? null;
  const coverageContextLabel = analysisMode === 'paired' ? 'Paired vignette summaries' : 'Numeric summaries';
  const decisionCoverageMessage = decisionCoverage.totalTranscripts > 0
    ? `${coverageContextLabel} include ${decisionCoverage.scoredTranscripts} of ${decisionCoverage.totalTranscripts} transcripts.${decisionCoverage.unresolvedTranscripts > 0
      ? ` ${pluralize(decisionCoverage.unresolvedTranscripts, 'unresolved transcript')} ${decisionCoverage.unresolvedTranscripts === 1 ? 'is' : 'are'} currently excluded until manually adjudicated.`
      : ' All transcripts are represented in the current numeric summary.'
    }`
    : `${coverageContextLabel} do not have transcript coverage available yet.`;
  const coverageEvidenceMessage = coverageBatchCount !== null && coverageBatchCount !== undefined
    ? coveragePairedBatchCount !== null && coveragePairedBatchCount !== undefined
      ? `Evidence: ${coverageBatchCount} batches from coverage cell • ${coveragePairedBatchCount} paired batches`
      : `Evidence: ${coverageBatchCount} batches from coverage cell`
    : isAggregateAnalysis
    ? aggregateSourceRunCount === null
      ? 'Evidence: contributing source-run count unavailable'
      : `Evidence: ${aggregateSourceRunCount} contributing source run${aggregateSourceRunCount === 1 ? '' : 's'} pooled`
    : batches === '-'
      ? `Evidence: ${batchDetail}`
      : `Evidence: ${batches} completed batch${batches === 1 ? '' : 'es'} • ${batchDetail}`;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-medium text-gray-900">Analysis</h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails((current) => !current)}
                aria-expanded={showDetails}
                aria-controls="analysis-details-panel"
                className="px-2 py-0.5 text-sm"
              >
                {showDetails ? 'Hide details' : 'Details'}
                {showDetails ? (
                  <ChevronUp className="ml-1 h-4 w-4" />
                ) : (
                  <ChevronDown className="ml-1 h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {analysisMode && onAnalysisModeChange ? (
            <div className="flex flex-col items-end gap-2">
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
              {analysisMode === 'single' && singleVignetteOptions.length > 1 && onSingleVignetteChange ? (
                <label className="flex items-center gap-2 text-xs font-medium uppercase text-gray-500">
                  <span>Vignette</span>
                  <select
                    aria-label="Vignette"
                    value={runId}
                    onChange={(event) => onSingleVignetteChange(event.target.value)}
                    className="block max-w-[20rem] rounded-md border-gray-300 bg-white text-sm font-normal normal-case text-gray-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  >
                    {singleVignetteOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Warnings */}
      {displayWarnings.length > 0 && (
        <div className="space-y-2 mb-6">
          {displayWarnings.map((warning, index) => (
            <WarningBanner key={`${warning.code}-${index}`} warning={warning} />
          ))}
        </div>
      )}

      {showDetails && (
        <div
          id="analysis-details-panel"
          className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4"
        >
          <p className="text-sm text-gray-700">
            Computed {formatTimestamp(analysis.computedAt)} • {formatDuration(analysis.durationMs)}
          </p>
          <p className="mt-3 text-sm font-medium text-gray-900">Decision Coverage</p>
          <p className="mt-2 text-sm text-gray-700">{decisionCoverageMessage}</p>
          <p className="mt-1 text-xs text-gray-600">
            Parser-scored: {decisionCoverage.parserScoredTranscripts} ({decisionCoverage.exactMatchTranscripts} exact, {decisionCoverage.fallbackResolvedTranscripts} fallback)
            {' • '}
            Manually adjudicated: {decisionCoverage.manuallyAdjudicatedTranscripts}
            {' • '}
            Legacy numeric: {decisionCoverage.legacyNumericTranscripts}
          </p>
          <p className="mt-1 text-xs text-gray-600">{coverageEvidenceMessage}</p>
          {!isAggregateAnalysis && (
            <div className="mt-4">
              <Button variant="secondary" size="sm" onClick={() => void recompute()} disabled={recomputing}>
                {recomputing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Recompute
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Model filter — above tab bar */}
      {transcriptModelIds.length > 0 && (
        <ModelFilter
          transcriptModelIds={transcriptModelIds}
          noTranscriptModelIds={noTranscriptModelIds}
          selectedModels={selectedModels}
          onSelectedModelsChange={setSelectedModels}
        />
      )}

      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4 -mb-px">
          {TABS.map((tab) => (
            // eslint-disable-next-line react/forbid-elements -- Tab button requires custom semantic styling
              <button
                key={tab.id}
              onClick={() => onTabChange(tab.id)}
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
        {activeTab === 'overview' && filteredSemantics && (
          <OverviewTab
            runId={runId}
            analysisBasePath={analysisBasePath}
            analysisSearchParams={analysisSearchParams}
            definitionContent={definitionContent}
            perModel={filteredPerModel}
            visualizationData={analysis.visualizationData}
            varianceAnalysis={analysis.varianceAnalysis}
            expectedAttributes={expectedScenarioAttributes}
            semantics={filteredOverviewSemantics ?? filteredSemantics}
            completedBatches={batches}
            aggregateSourceRunCount={aggregateSourceRunCount}
            isAggregate={isAggregateAnalysis}
            analysisMode={analysisMode}
            coverageBatchCount={coverageBatchCount}
            coveragePairedBatchCount={coveragePairedBatchCount}
            companionAnalysis={companionAnalysis}
            currentRun={currentRun}
            currentAnalysis={analysis}
            companionRun={companionRun}
          />
        )}
        {activeTab === 'decisions' && filteredSemantics && (
          <DecisionsTab
            visualizationData={decisionsVisualizationData}
            dimensionLabels={dimensionLabels}
            semantics={filteredOverviewSemantics ?? filteredSemantics}
            analysisMode={analysisMode}
            isPooledAcrossCompanionRuns={analysisMode === 'paired' && companionAnalysis != null}
          />
        )}
        {activeTab === 'scenarios' && (
          <ScenariosTab
            runId={runId}
            analysisBasePath={analysisBasePath}
            analysisSearchParams={analysisSearchParams}
            analysisMode={analysisMode}
            visualizationData={decisionsVisualizationData}
            perModel={filteredPerModel}
            transcripts={scenariosTranscripts}
            expectedAttributes={expectedScenarioAttributes}
            companionRunId={analysisMode === 'paired' ? companionRun?.id ?? null : null}
            currentVignetteName={currentRun?.definition?.name ?? null}
            companionVignetteName={companionRun?.definition?.name ?? null}
            selectedModels={effectiveModels}
          />
        )}
      </div>
    </div>
  );
}

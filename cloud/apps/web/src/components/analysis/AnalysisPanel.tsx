/**
 * AnalysisPanel Component
 *
 * Main container for displaying run analysis results.
 * Shows per-model statistics, win rates, and warnings.
 */

import { useState } from 'react';
import { BarChart2, ChevronDown, ChevronUp, RefreshCw, Loader2 } from 'lucide-react';
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
import type { AnalysisResult } from '../../api/operations/analysis';
import type { Run, Transcript } from '../../api/operations/runs';
import { ModelFilter } from './ModelFilter';
import { ANALYSIS_BASE_PATH, type AnalysisBasePath } from '../../utils/analysisRouting';
import { WarningBanner, AnalysisPending, AnalysisEmpty } from './AnalysisStates';
import { EMPTY_TRANSCRIPTS, formatTimestamp, formatDuration } from '../../utils/analysisPanelUtils';
import { useAnalysisState } from './useAnalysisState';

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
  /**
   * Model IDs with isDefault=true from the global LLM model list (Settings → Models).
   * `null` means the list is still loading — defer model filtering until it resolves.
   */
  globalDefaultModelIds?: string[] | null;
};

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
  globalDefaultModelIds,
}: AnalysisPanelProps) {
  const { analysis, loading, error, recompute, recomputing } = useAnalysis({
    runId,
    analysisStatus,
  });
  const isAggregateAnalysis = isAggregate === true || analysis?.analysisType === 'AGGREGATE';

  const {
    dimensionLabels,
    expectedScenarioAttributes,
    filteredDecisionsVisualizationData,
    transcriptModelIds,
    noTranscriptModelIds,
    defaultSelectedModels,
    selectedModels,
    setSelectedModels,
    effectiveModels,
    filteredPerModel,
    filteredSemantics,
    filteredOverviewSemantics,
    scenariosTranscripts,
    singleVignetteOptions,
    displayWarnings,
    batches,
    aggregateSourceRunCount,
    decisionCoverage,
    decisionCoverageMessage,
    coverageEvidenceMessage,
  } = useAnalysisState({
    runId,
    analysis,
    isAggregateAnalysis,
    definitionContent,
    transcripts,
    analysisMode,
    companionAnalysis,
    currentRun,
    companionRun,
    globalDefaultModelIds,
    coverageBatchCount,
    coveragePairedBatchCount,
  });

  const [showDetails, setShowDetails] = useState(false);

  // Error state
  if (error != null) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <ErrorMessage message={`Failed to load analysis: ${error.message}`} />
      </div>
    );
  }

  // Pending/computing state
  if (analysis == null && (analysisStatus === 'pending' || analysisStatus === 'computing')) {
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
  if (loading && analysis == null) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <Loading text="Loading analysis..." />
      </div>
    );
  }

  // No analysis available
  if (analysis == null) {
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
          {analysisMode != null && onAnalysisModeChange != null ? (
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
              {analysisMode === 'single' && singleVignetteOptions.length > 1 && onSingleVignetteChange != null ? (
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

      {/* Model filter — above tab bar.
          selectedModels is null while globalDefaultModelIds is still loading;
          skip rendering the filter (and the tabs below it guard on filteredSemantics != null). */}
      {transcriptModelIds.length > 0 && selectedModels !== null && (
        <ModelFilter
          transcriptModelIds={transcriptModelIds}
          noTranscriptModelIds={noTranscriptModelIds}
          defaultModelIds={defaultSelectedModels ?? undefined}
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
        {activeTab === 'overview' && filteredSemantics != null && (
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
          />
        )}
        {activeTab === 'decisions' && filteredSemantics != null && (
          <DecisionsTab
            visualizationData={filteredDecisionsVisualizationData}
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
            visualizationData={filteredDecisionsVisualizationData}
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

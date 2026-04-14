import { useMemo, useState, useEffect } from 'react';
import type { PerModelStats, AnalysisResult, AnalysisWarning } from '../../api/operations/analysis';
import type { Run, Transcript } from '../../api/operations/runs';
import {
  deriveDecisionDimensionLabels,
  deriveScenarioAttributesFromDefinition,
} from '../../utils/decisionLabels';
import {
  buildAnalysisSemanticsView,
  buildPairedAnalysisSemanticsView,
} from '../analysis-v2/analysisSemantics';
import { summarizeDecisionCoverage } from '../../utils/analysisCoverage';
import { mergePairedVisualizationData } from '../../utils/pairedScopeAdapter';
import {
  getBatchStats,
  pluralize,
  prefixTranscriptScenarioIds,
} from '../../utils/analysisPanelUtils';

type UseAnalysisStateParams = {
  runId: string;
  analysis: AnalysisResult | null | undefined;
  isAggregateAnalysis: boolean;
  definitionContent: unknown;
  transcripts: Transcript[];
  analysisMode: 'single' | 'paired' | undefined;
  companionAnalysis: AnalysisResult | null | undefined;
  currentRun: Run | null | undefined;
  companionRun: Run | null | undefined;
  /**
   * `undefined` = caller doesn't manage defaults (e.g. tests / embedded usage).
   * `null`      = caller is still fetching — defer model filtering.
   * `string[]`  = resolved list (may be empty if no defaults configured).
   */
  globalDefaultModelIds: string[] | null | undefined;
  coverageBatchCount: number | null | undefined;
  coveragePairedBatchCount: number | null | undefined;
};

export function useAnalysisState({
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
}: UseAnalysisStateParams) {
  const dimensionLabels = useMemo(
    () => deriveDecisionDimensionLabels(definitionContent),
    [definitionContent],
  );
  const expectedScenarioAttributes = useMemo(
    () => deriveScenarioAttributesFromDefinition(definitionContent),
    [definitionContent],
  );

  const decisionsVisualizationData = useMemo(() => {
    if (analysis == null) return null;
    if (analysisMode !== 'paired' || companionAnalysis == null) {
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
    [analysis],
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

  const defaultSelectedModels = useMemo(() => {
    // null = still fetching; signal the filter to defer rather than fall back to all models
    if (globalDefaultModelIds === null) return null;
    const defaults = globalDefaultModelIds ?? [];
    if (defaults.length === 0) return [...transcriptModelIds];
    const intersection = transcriptModelIds.filter((id) => defaults.includes(id));
    return intersection.length > 0 ? intersection : [...transcriptModelIds];
  }, [globalDefaultModelIds, transcriptModelIds]);

  const [selectedModels, setSelectedModels] = useState<string[] | null>(defaultSelectedModels);

  // When the run changes (or defaults finish loading), reset filter to the new default.
  // Skip when defaultSelectedModels is null — the llmModels query hasn't resolved yet.
  useEffect(() => {
    if (defaultSelectedModels === null) return;
    setSelectedModels(defaultSelectedModels);
  }, [runId, defaultSelectedModels]);

  const effectiveModels = useMemo(
    () => (selectedModels != null && selectedModels.length > 0 ? selectedModels : transcriptModelIds),
    [selectedModels, transcriptModelIds],
  );

  const filteredPerModel = useMemo<Record<string, PerModelStats>>(
    () => Object.fromEntries(
      Object.entries(perModel).filter(([k]) => effectiveModels.includes(k)),
    ),
    [effectiveModels, perModel],
  );

  // Must be defined AFTER effectiveModels.
  // Only filter when there are transcript-based models to filter by; if effectiveModels
  // is empty (no transcripts for this run), show all models rather than nothing.
  // If selectedModels is null, the llmModels query is still loading — return null so the
  // chart doesn't flash with non-default models before defaults are known.
  const filteredDecisionsVisualizationData = useMemo(() => {
    if (decisionsVisualizationData == null) return null;
    if (selectedModels === null) return null;
    if (effectiveModels.length === 0) return decisionsVisualizationData;
    return {
      ...decisionsVisualizationData,
      decisionDistribution: Object.fromEntries(
        Object.entries(decisionsVisualizationData.decisionDistribution)
          .filter(([modelId]) => effectiveModels.includes(modelId)),
      ),
      modelScenarioMatrix: Object.fromEntries(
        Object.entries(decisionsVisualizationData.modelScenarioMatrix)
          .filter(([modelId]) => effectiveModels.includes(modelId)),
      ),
    };
  }, [decisionsVisualizationData, effectiveModels, selectedModels]);

  const filteredSemantics = useMemo(() => {
    if (analysis == null) return null;
    if (selectedModels === null) return null; // llmModels still loading
    const modelFilter = effectiveModels.length > 0 ? effectiveModels : undefined;
    return buildAnalysisSemanticsView(analysis, isAggregateAnalysis, modelFilter);
  }, [analysis, isAggregateAnalysis, effectiveModels, selectedModels]);

  const filteredOverviewSemantics = useMemo(() => {
    if (analysis == null) return null;
    if (selectedModels === null) return null; // llmModels still loading
    const modelFilter = effectiveModels.length > 0 ? effectiveModels : undefined;
    if (analysisMode === 'paired' && companionAnalysis != null) {
      return buildPairedAnalysisSemanticsView(analysis, companionAnalysis, isAggregateAnalysis, modelFilter);
    }
    return buildAnalysisSemanticsView(analysis, isAggregateAnalysis, modelFilter);
  }, [analysis, analysisMode, companionAnalysis, isAggregateAnalysis, effectiveModels, selectedModels]);

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
    const runs = [currentRun, companionRun].filter((c): c is Run => c != null);
    const seen = new Set<string>();
    return runs
      .filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      })
      .map((c) => ({
        id: c.id,
        label: c.definition?.name?.trim() || `Trial ${c.id.slice(0, 8)}...`,
      }));
  }, [companionRun, currentRun]);

  const displayWarnings = useMemo<AnalysisWarning[]>(() => {
    if (analysis == null) return [];
    const isLowSampleWarning = (code: string) =>
      code.includes('SMALL_SAMPLE') || code.includes('MODERATE_SAMPLE');
    return analysis.warnings.filter((w) => !isLowSampleWarning(w.code));
  }, [analysis]);

  const { batches, detail: batchDetail } = getBatchStats(
    perModel,
    analysis?.visualizationData?.modelScenarioMatrix,
  );

  const aggregateSourceRunCount = analysis?.aggregateMetadata?.sourceRunCount ?? null;
  const coverageContextLabel = analysisMode === 'paired' ? 'Paired vignette summaries' : 'Numeric summaries';
  const decisionCoverageMessage = decisionCoverage.totalTranscripts > 0
    ? `${coverageContextLabel} include ${decisionCoverage.scoredTranscripts} of ${decisionCoverage.totalTranscripts} transcripts.${
        decisionCoverage.unresolvedTranscripts > 0
          ? ` ${pluralize(decisionCoverage.unresolvedTranscripts, 'unresolved transcript')} ${decisionCoverage.unresolvedTranscripts === 1 ? 'is' : 'are'} currently excluded until manually adjudicated.`
          : ' All transcripts are represented in the current numeric summary.'
      }`
    : `${coverageContextLabel} do not have transcript coverage available yet.`;

  const coverageEvidenceMessage = coverageBatchCount != null
    ? coveragePairedBatchCount != null
      ? `Evidence: ${coverageBatchCount} batches from coverage cell • ${coveragePairedBatchCount} paired batches`
      : `Evidence: ${coverageBatchCount} batches from coverage cell`
    : isAggregateAnalysis
      ? aggregateSourceRunCount === null
        ? 'Evidence: contributing source-run count unavailable'
        : `Evidence: ${aggregateSourceRunCount} contributing source run${aggregateSourceRunCount === 1 ? '' : 's'} pooled`
      : batches === '-'
        ? `Evidence: ${batchDetail}`
        : `Evidence: ${batches} completed batch${batches === 1 ? '' : 'es'} • ${batchDetail}`;

  return {
    dimensionLabels,
    expectedScenarioAttributes,
    decisionsVisualizationData,
    filteredDecisionsVisualizationData,
    decisionCoverage,
    perModel,
    batches,
    batchDetail,
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
    aggregateSourceRunCount,
    decisionCoverageMessage,
    coverageEvidenceMessage,
  };
}

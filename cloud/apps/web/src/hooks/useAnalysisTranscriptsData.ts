/**
 * useAnalysisTranscriptsData
 *
 * Consolidates all data fetching, URL param parsing, and transcript filtering
 * for the AnalysisTranscripts page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRun } from './useRun';
import { useRuns } from './useRuns';
import { useAnalysis } from './useAnalysis';
import { useRunMutations } from './useRunMutations';
import { useAnalysisTranscriptParams } from './useAnalysisTranscriptParams';
import type { Transcript } from '../api/operations/runs';
import { toManualDecisionInput } from '../utils/manualDecisionOverrideInput';
import {
  deriveDecisionDimensionLabels,
  getDecisionSideNames,
  mapDecisionSidesToScenarioAttributes,
  resolveScenarioAttributes,
  resolveScenarioAxisDimensions,
  deriveScenarioAttributesFromDefinition,
} from '../utils/decisionLabels';
import { getRunDefinitionContent, deriveRunTrialMeta } from '../utils/runDefinitionContent';
import {
  assertRenderableReportTranscriptSummary,
  summarizeReportTranscriptDecisions,
} from '../utils/reportDecisionDisplay';
import { isAggregateAnalysis } from '../utils/analysisRouting';
import {
  filterTranscriptsForConditionIds,
  buildAggregateRuns,
  resolveDecisionBucketForValue,
  computeFilterModeFlags,
} from '../utils/analysisTranscriptParams';
import { computeFilteredTranscripts } from '../utils/analysisTranscriptFilters';

export function useAnalysisTranscriptsData(runId: string | undefined) {
  const { updateTranscriptDecision } = useRunMutations();
  const [updatingTranscriptIds, setUpdatingTranscriptIds] = useState<Set<string>>(new Set());

  // --- URL params ---
  const {
    searchParams,
    setSearchParams,
    rowDim,
    colDim,
    row,
    col,
    selectedModel,
    normalizedFavoredValueKey,
    normalizedDecisionStrength,
    decisionBucket,
    repeatPattern,
    selectedTranscriptId,
    companionRunId,
    pairedValueKey,
    pairedDecisionBucketParam,
    pairedValueLabel,
    pairView,
    hasLegacyOrientationBucket,
    pairedConditionSource,
    analysisMode,
    conditionIds,
    primaryConditionIds,
    companionConditionIds,
    isPairedStabilityDrilldown,
  } = useAnalysisTranscriptParams();

  // --- Data fetching ---
  const { run, loading, error, refetch } = useRun({
    id: runId || '',
    pause: !runId,
    enablePolling: false,
  });

  const { analysis } = useAnalysis({
    runId: runId || '',
    pause: !runId,
    enablePolling: false,
    analysisStatus: run?.analysisStatus ?? null,
  });

  const { run: companionRun } = useRun({
    id: companionRunId,
    pause: companionRunId === '',
    enablePolling: false,
  });

  const { analysis: companionAnalysis } = useAnalysis({
    runId: companionRunId,
    pause: companionRunId === '' || !companionRun?.analysisStatus,
    enablePolling: false,
    analysisStatus: companionRun?.analysisStatus ?? null,
  });

  const isAggregate = isAggregateAnalysis(
    run?.tags?.some((tag) => tag.name === 'Aggregate') ?? false,
    analysis?.analysisType,
  );

  const { trialSignature } = deriveRunTrialMeta(run);

  const { runs } = useRuns({
    definitionId: isAggregate ? (run?.definition?.id || undefined) : undefined,
    status: 'COMPLETED',
    limit: 1000,
    pause: !isAggregate || !run?.definition?.id,
  });

  const aggregateRuns = useMemo(
    () => buildAggregateRuns(runs, run?.id),
    [run?.id, runs],
  );

  const selectedAggregateSignature = aggregateRuns.find((candidate) => candidate.id === run?.id)?.signature
    ?? trialSignature;

  // --- Derived scenario data ---
  const scenarioDimensions = analysis?.visualizationData?.scenarioDimensions;
  const modelScenarioMatrix = analysis?.visualizationData?.modelScenarioMatrix;
  const companionScenarioDimensions = companionAnalysis?.visualizationData?.scenarioDimensions;
  const companionModelScenarioMatrix = companionAnalysis?.visualizationData?.modelScenarioMatrix;
  const definitionContent = useMemo(() => getRunDefinitionContent(run), [run]);
  const companionDefinitionContent = useMemo(() => getRunDefinitionContent(companionRun), [companionRun]);
  const preferredAttributes = useMemo(
    () => deriveScenarioAttributesFromDefinition(definitionContent),
    [definitionContent]
  );
  const availableAttributes = useMemo(() => {
    return resolveScenarioAttributes(scenarioDimensions, preferredAttributes, modelScenarioMatrix);
  }, [scenarioDimensions, preferredAttributes, modelScenarioMatrix]);
  const mergedScenarioDimensions = useMemo(
    () => ({
      ...(scenarioDimensions ?? {}),
      ...(companionScenarioDimensions ?? {}),
    }),
    [scenarioDimensions, companionScenarioDimensions],
  );
  const resolvedAxes = useMemo(
    () => resolveScenarioAxisDimensions(availableAttributes, rowDim, colDim),
    [availableAttributes, colDim, rowDim]
  );
  const activeRowDim = resolvedAxes.rowDim;
  const activeColDim = resolvedAxes.colDim;

  // --- Filter mode flags ---
  const {
    hasCellFilterParams,
    hasRepeatPatternParams,
    hasDirectTranscriptParam,
    hasBucketFilterParams,
    hasPairedValueFilterParams,
    hasPairedConditionFilterParams,
  } = computeFilterModeFlags({
    activeRowDim,
    activeColDim,
    row,
    col,
    selectedModel,
    repeatPattern,
    conditionIdsInParams: searchParams.has('conditionIds'),
    selectedTranscriptId,
    decisionBucket,
    analysisMode: analysisMode ?? '',
    companionRunId,
    pairedValueKey,
    pairedDecisionBucketParam,
    pairView,
  });

  // --- Error states ---
  const pairedConditionStateError = useMemo(() => {
    if (hasLegacyOrientationBucket && analysisMode === 'paired') {
      return new Error('Legacy orientationBucket URLs are no longer supported. Use sourceRun=current, sourceRun=companion, or sourceRun=pooled.');
    }
    if (!hasPairedConditionFilterParams) return null;
    if (pairView !== 'condition-split') return null;
    if (pairedConditionSource === 'current' || pairedConditionSource === 'companion') return null;
    return new Error('Split paired condition inspection requires sourceRun=current or sourceRun=companion.');
  }, [analysisMode, hasLegacyOrientationBucket, hasPairedConditionFilterParams, pairView, pairedConditionSource]);

  // --- Decision bucket labels ---
  const dimensionLabels = useMemo(
    () => deriveDecisionDimensionLabels(definitionContent),
    [definitionContent]
  );
  const decisionSideNames = useMemo(() => getDecisionSideNames(dimensionLabels), [dimensionLabels]);
  const bucketAttributes = useMemo(
    () => mapDecisionSidesToScenarioAttributes(
      decisionSideNames.aName,
      decisionSideNames.bName,
      [activeRowDim, activeColDim].filter((d) => d !== ''),
    ),
    [activeColDim, activeRowDim, decisionSideNames.aName, decisionSideNames.bName]
  );
  const decisionBucketLabel = useMemo(() => {
    if (decisionBucket === 'a') return bucketAttributes.lowAttribute;
    if (decisionBucket === 'b') return bucketAttributes.highAttribute;
    if (decisionBucket === 'neutral') return 'Neutral';
    return '';
  }, [bucketAttributes.highAttribute, bucketAttributes.lowAttribute, decisionBucket]);

  // --- Auto-correct URL axes ---
  useEffect(() => {
    if (!scenarioDimensions) return;
    if (hasRepeatPatternParams) return;
    if (isPairedStabilityDrilldown) return;

    const rowChanged = rowDim !== activeRowDim;
    const colChanged = colDim !== activeColDim;
    if (!rowChanged && !colChanged) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('rowDim', activeRowDim);
    nextParams.set('colDim', activeColDim);
    if (rowChanged) nextParams.delete('row');
    if (colChanged) nextParams.delete('col');

    setSearchParams(nextParams, { replace: true });
  }, [
    scenarioDimensions,
    searchParams,
    setSearchParams,
    rowDim,
    colDim,
    activeRowDim,
    activeColDim,
    hasRepeatPatternParams,
    isPairedStabilityDrilldown,
  ]);

  // --- Transcript mutation ---
  const handleDecisionChange = useCallback(async (transcript: Transcript, nextDecisionCode: string) => {
    const definitionSnapshot = (transcript as { definitionSnapshot?: unknown }).definitionSnapshot ?? null;
    const orientationFlipped =
      ((transcript as { scenario?: { orientationFlipped?: boolean | null } }).scenario?.orientationFlipped) ?? null;
    const input = toManualDecisionInput(nextDecisionCode, definitionSnapshot, orientationFlipped);
    if (input == null) {
      // Could not build a canonical input — surface this as a no-op rather
      // than corrupting the canonical. Caller should log or toast.
      return;
    }
    setUpdatingTranscriptIds((prev) => new Set(prev).add(transcript.id));
    try {
      await updateTranscriptDecision(transcript.id, input);
      refetch();
    } finally {
      setUpdatingTranscriptIds((prev) => {
        const next = new Set(prev);
        next.delete(transcript.id);
        return next;
      });
    }
  }, [updateTranscriptDecision, refetch]);

  // --- Filtered transcripts ---
  const filteredTranscripts = useMemo(() => computeFilteredTranscripts({
    run,
    companionRun,
    definitionContent,
    companionDefinitionContent,
    scenarioDimensions,
    companionScenarioDimensions,
    modelScenarioMatrix,
    companionModelScenarioMatrix,
    selectedModel,
    selectedTranscriptId,
    conditionIds,
    activeRowDim,
    activeColDim,
    row,
    col,
    decisionBucket,
    pairedValueKey,
    pairedDecisionBucketParam,
    pairedConditionSource,
    normalizedFavoredValueKey,
    normalizedDecisionStrength,
    hasDirectTranscriptParam,
    hasRepeatPatternParams,
    hasPairedConditionFilterParams,
    hasPairedValueFilterParams,
    hasBucketFilterParams,
    resolveDecisionBucketForValue,
  }), [
    scenarioDimensions,
    modelScenarioMatrix,
    activeRowDim,
    activeColDim,
    row,
    col,
    selectedModel,
    normalizedFavoredValueKey,
    normalizedDecisionStrength,
    conditionIds,
    decisionBucket,
    hasRepeatPatternParams,
    hasPairedConditionFilterParams,
    hasPairedValueFilterParams,
    hasBucketFilterParams,
    hasDirectTranscriptParam,
    pairedConditionSource,
    selectedTranscriptId,
    companionRun,
    run,
    companionDefinitionContent,
    companionScenarioDimensions,
    companionModelScenarioMatrix,
    definitionContent,
    pairedValueKey,
    pairedDecisionBucketParam,
  ]);

  const primaryStabilityTranscripts = useMemo(() => {
    if (!isPairedStabilityDrilldown) return [];
    return filterTranscriptsForConditionIds(
      run?.transcripts ?? [],
      selectedModel,
      primaryConditionIds,
      scenarioDimensions,
      activeRowDim,
      activeColDim,
    );
  }, [isPairedStabilityDrilldown, run, selectedModel, primaryConditionIds, scenarioDimensions, activeRowDim, activeColDim]);

  const companionStabilityTranscripts = useMemo(() => {
    if (!isPairedStabilityDrilldown) return [];
    return filterTranscriptsForConditionIds(
      companionRun?.transcripts ?? [],
      selectedModel,
      companionConditionIds,
      companionScenarioDimensions,
      activeRowDim,
      activeColDim,
    );
  }, [isPairedStabilityDrilldown, companionRun, selectedModel, companionConditionIds, companionScenarioDimensions, activeRowDim, activeColDim]);

  const decisionSummary = useMemo(
    () => summarizeReportTranscriptDecisions(filteredTranscripts),
    [filteredTranscripts],
  );

  const reportStateError = useMemo(() => {
    try {
      assertRenderableReportTranscriptSummary(decisionSummary);
      return null;
    } catch (err) {
      return err instanceof Error
        ? err
        : new Error('AnalysisTranscripts requires canonical decisionModelV2 data for every visible transcript.');
    }
  }, [decisionSummary]);

  return {
    // loading / error
    loading,
    error,
    run,
    companionRun,
    // aggregate
    isAggregate,
    trialSignature,
    selectedAggregateSignature,
    aggregateRuns,
    searchParams,
    // URL params (raw)
    row,
    col,
    selectedModel,
    repeatPattern,
    selectedTranscriptId,
    pairedValueLabel,
    pairView,
    pairedConditionSource,
    analysisMode,
    conditionIds,
    // filter flags
    activeRowDim,
    activeColDim,
    hasCellFilterParams,
    hasRepeatPatternParams,
    hasDirectTranscriptParam,
    hasBucketFilterParams,
    hasPairedValueFilterParams,
    hasPairedConditionFilterParams,
    isPairedStabilityDrilldown,
    // derived
    scenarioDimensions,
    companionScenarioDimensions,
    mergedScenarioDimensions,
    decisionBucketLabel,
    // transcripts
    filteredTranscripts,
    primaryStabilityTranscripts,
    companionStabilityTranscripts,
    decisionSummary,
    // errors
    pairedConditionStateError,
    reportStateError,
    // actions
    handleDecisionChange,
    updatingTranscriptIds,
  };
}

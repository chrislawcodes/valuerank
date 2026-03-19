/**
 * AnalysisTranscripts Page
 *
 * Shows filtered transcripts for a pivot cell in a full page view.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { formatTrialSignature } from '@valuerank/shared/trial-signature';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { TranscriptList } from '../components/runs/TranscriptList';
import { TranscriptViewer } from '../components/runs/TranscriptViewer';
import { AnalysisScopeBanner } from '../components/analysis/AnalysisScopeBanner';
import { useRun } from '../hooks/useRun';
import { useRuns } from '../hooks/useRuns';
import { useAnalysis } from '../hooks/useAnalysis';
import { useRunMutations } from '../hooks/useRunMutations';
import type { Transcript } from '../api/operations/runs';
import {
  filterTranscriptsForPivotCell,
  getScenarioDimensionsForId,
  normalizeModelId,
  normalizeScenarioId,
} from '../utils/scenarioUtils';
import { collectScenarioIdsForDecisionBucket } from '../utils/decisionBuckets';
import {
  deriveScenarioAttributesFromDefinition,
  deriveDecisionDimensionLabels,
  getDecisionSideNames,
  mapDecisionSidesToScenarioAttributes,
  resolveScenarioAttributes,
  resolveScenarioAxisDimensions,
} from '../utils/decisionLabels';
import { getRunDefinitionContent } from '../utils/runDefinitionContent';
import {
  ANALYSIS_BASE_PATH,
  buildAnalysisTranscriptsPath,
  isAggregateAnalysis,
} from '../utils/analysisRouting';
import { getDecisionMetadata, getPairedOrientationLabels } from '../utils/methodology';
import {
  getOrientationBucketLabel,
  getOrientationCorrectedScenarioIds,
  type OrientationBucket,
} from '../utils/pairedScopeAdapter';

function getDisplaySignature(signature: string | null | undefined): string {
  return signature && signature !== 'v?td' ? signature : 'Unknown Signature';
}

function parseConditionIds(value: string): string[] {
  return value
    .split(',')
    .map((conditionId) => conditionId.trim())
    .filter((conditionId) => conditionId.length > 0);
}

function formatRepeatPatternLabel(value: string): string {
  switch (value) {
    case 'stable':
      return 'Stable';
    case 'softLean':
      return 'Soft Lean';
    case 'torn':
      return 'Torn';
    case 'noisy':
      return 'Unstable';
    default:
      return value;
  }
}

function normalizePairedValueKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

type JobChoicePresentationOrder = 'A_first' | 'B_first';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getPresentationOrderForContent(content: unknown): JobChoicePresentationOrder | null {
  if (!isRecord(content) || !isRecord(content.methodology)) {
    return null;
  }

  const value = content.methodology.presentation_order;
  return value === 'A_first' || value === 'B_first' ? value : null;
}

function getOrientationBucketForContent(content: unknown): OrientationBucket | null {
  const presentationOrder = getPresentationOrderForContent(content);
  if (presentationOrder === 'A_first') return 'canonical';
  if (presentationOrder === 'B_first') return 'flipped';
  return null;
}

function filterTranscriptsForConditionIds(
  transcripts: Transcript[],
  modelId: string,
  conditionIds: string[],
  scenarioDimensions: Record<string, Record<string, string | number>> | null | undefined,
  rowDim: string,
  colDim: string,
): Transcript[] {
  if (!modelId) {
    return [];
  }

  const selectedModelNormalized = normalizeModelId(modelId);
  const canonicalIds = new Set(conditionIds);
  const normalizedIds = new Set(conditionIds.map((conditionId) => normalizeScenarioId(conditionId)));

  return transcripts.filter((transcript) => {
    const transcriptModelNormalized = normalizeModelId(transcript.modelId);
    const modelMatches = transcript.modelId === modelId
      || transcriptModelNormalized === selectedModelNormalized
      || transcript.modelId.includes(modelId)
      || modelId.includes(transcript.modelId);

    if (!modelMatches) {
      return false;
    }
    if (!transcript.scenarioId) {
      return false;
    }

    const transcriptScenarioId = String(transcript.scenarioId);
    const transcriptScenarioNormalized = normalizeScenarioId(transcriptScenarioId);

    if (canonicalIds.has(transcriptScenarioId) || normalizedIds.has(transcriptScenarioNormalized)) {
      return true;
    }

    if (!scenarioDimensions || !rowDim || !colDim) {
      return false;
    }

    const dimensions = getScenarioDimensionsForId(transcript.scenarioId, scenarioDimensions);
    if (!dimensions) {
      return false;
    }

    const conditionId = `${String(dimensions[rowDim] ?? 'N/A')}||${String(dimensions[colDim] ?? 'N/A')}`;
    return canonicalIds.has(conditionId);
  });
}

export function AnalysisTranscripts() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedTranscript, setSelectedTranscript] = useState<Transcript | null>(null);
  const [updatingTranscriptIds, setUpdatingTranscriptIds] = useState<Set<string>>(new Set());

  const rowDim = searchParams.get('rowDim') ?? '';
  const colDim = searchParams.get('colDim') ?? '';
  const row = searchParams.get('row') ?? '';
  const col = searchParams.get('col') ?? '';
  const selectedModel = searchParams.get('modelId') ?? searchParams.get('model') ?? '';
  const decisionCode = searchParams.get('decisionCode') ?? '';
  const decisionBucket = searchParams.get('decisionBucket') ?? '';
  const repeatPattern = searchParams.get('repeatPattern') ?? '';
  const selectedTranscriptId = searchParams.get('transcriptId') ?? '';
  const companionRunId = searchParams.get('companionRunId') ?? '';
  const pairedValueKey = searchParams.get('pairedValueKey') ?? '';
  const pairedDecisionBucketParam = searchParams.get('pairedDecisionBucket') ?? '';
  const pairedValueLabel = searchParams.get('pairedValueLabel') ?? '';
  const pairView = searchParams.get('pairView') ?? '';
  const orientationBucketParam = searchParams.get('orientationBucket');
  const orientationBucket: OrientationBucket | null = orientationBucketParam === 'canonical' || orientationBucketParam === 'flipped'
    ? orientationBucketParam
    : null;
  const analysisMode = searchParams.get('mode') === 'paired'
    ? 'paired'
    : searchParams.get('mode') === 'single'
      ? 'single'
      : null;
  const conditionIds = useMemo(
    () => parseConditionIds(searchParams.get('conditionIds') ?? ''),
    [searchParams]
  );

  const { run, loading, error, refetch } = useRun({
    id: id || '',
    pause: !id,
    enablePolling: false,
  });

  const { updateTranscriptDecision } = useRunMutations();

  const { analysis } = useAnalysis({
    runId: id || '',
    pause: !id,
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

  const config = run?.config as {
    definitionSnapshot?: { _meta?: { definitionVersion?: unknown }, version?: unknown };
    temperature?: unknown;
  } | null;

  const runDefinitionVersion = typeof config?.definitionSnapshot?._meta?.definitionVersion === 'number'
    ? config.definitionSnapshot._meta.definitionVersion
    : typeof config?.definitionSnapshot?.version === 'number'
      ? config.definitionSnapshot.version
      : typeof run?.definitionVersion === 'number'
        ? run.definitionVersion
        : null;

  const runTemperature = typeof config?.temperature === 'number' ? config.temperature : null;
  const trialSignature = formatTrialSignature(runDefinitionVersion, runTemperature);

  const { runs } = useRuns({
    definitionId: isAggregate ? (run?.definition?.id || undefined) : undefined,
    status: 'COMPLETED',
    limit: 1000,
    pause: !isAggregate || !run?.definition?.id,
  });

  const aggregateRuns = useMemo(() => {
    return runs
      .filter((candidate) => candidate.tags.some((tag) => tag.name === 'Aggregate'))
      .map((candidate) => {
        const candidateConfig = candidate.config as {
          definitionSnapshot?: { _meta?: { definitionVersion?: unknown }, version?: unknown };
          temperature?: unknown;
        } | null;
        const candidateVersion = typeof candidateConfig?.definitionSnapshot?._meta?.definitionVersion === 'number'
          ? candidateConfig.definitionSnapshot._meta.definitionVersion
          : typeof candidateConfig?.definitionSnapshot?.version === 'number'
            ? candidateConfig.definitionSnapshot.version
            : typeof candidate.definitionVersion === 'number'
              ? candidate.definitionVersion
              : null;
        const candidateTemp = typeof candidateConfig?.temperature === 'number'
          ? candidateConfig.temperature
          : null;

        return {
          id: candidate.id,
          signature: formatTrialSignature(candidateVersion, candidateTemp),
        };
      })
      .reduce<Array<{ id: string; signature: string; count: number }>>((acc, candidate) => {
        const existing = acc.find((item) => item.signature === candidate.signature);
        if (existing) {
          existing.count += 1;
          if (candidate.id === run?.id) {
            existing.id = candidate.id;
          }
          return acc;
        }
        acc.push({ ...candidate, count: 1 });
        return acc;
      }, []);
  }, [run?.id, runs]);

  const selectedAggregateSignature = aggregateRuns.find((candidate) => candidate.id === run?.id)?.signature
    ?? trialSignature;

  const scenarioDimensions = analysis?.visualizationData?.scenarioDimensions;
  const modelScenarioMatrix = analysis?.visualizationData?.modelScenarioMatrix;
  const companionScenarioDimensions = companionAnalysis?.visualizationData?.scenarioDimensions;
  const companionModelScenarioMatrix = companionAnalysis?.visualizationData?.modelScenarioMatrix;
  const correctedScenarioIds = useMemo(
    () => getOrientationCorrectedScenarioIds(analysis?.varianceAnalysis),
    [analysis?.varianceAnalysis]
  );
  const definitionContent = useMemo(() => getRunDefinitionContent(run), [run]);
  const companionDefinitionContent = useMemo(() => getRunDefinitionContent(companionRun), [companionRun]);
  const orientationLabels = useMemo(
    () => getPairedOrientationLabels(definitionContent),
    [definitionContent],
  );
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
  const hasCellFilterParams = Boolean(activeRowDim && activeColDim && row && col);
  const hasRepeatPatternParams = Boolean(selectedModel && repeatPattern && searchParams.has('conditionIds'));
  const hasDirectTranscriptParam = selectedTranscriptId.length > 0;
  const hasBucketFilterParams = Boolean(
    activeRowDim
    && activeColDim
    && selectedModel
    && (decisionBucket === 'a' || decisionBucket === 'neutral' || decisionBucket === 'b')
  );
  const hasPairedValueFilterParams = Boolean(
    analysisMode === 'paired'
    && companionRunId
    && selectedModel
    && (pairedValueKey || pairedDecisionBucketParam === 'a' || pairedDecisionBucketParam === 'neutral' || pairedDecisionBucketParam === 'b')
    && pairView === 'blended'
  );
  const hasPairedConditionFilterParams = Boolean(
    analysisMode === 'paired'
    && companionRunId
    && selectedModel
    && activeRowDim
    && activeColDim
    && row
    && col
    && (pairView === 'condition-blended' || pairView === 'condition-split')
  );
  const dimensionLabels = useMemo(
    () => deriveDecisionDimensionLabels(definitionContent),
    [definitionContent]
  );

  const decisionSideNames = useMemo(
    () => getDecisionSideNames(dimensionLabels),
    [dimensionLabels]
  );
  const bucketAttributes = useMemo(
    () => mapDecisionSidesToScenarioAttributes(decisionSideNames.aName, decisionSideNames.bName, [activeRowDim, activeColDim].filter((d) => d !== '')),
    [activeColDim, activeRowDim, decisionSideNames.aName, decisionSideNames.bName]
  );

  const decisionBucketLabel = useMemo(() => {
    if (decisionBucket === 'a') return bucketAttributes.lowAttribute;
    if (decisionBucket === 'b') return bucketAttributes.highAttribute;
    if (decisionBucket === 'neutral') return 'Neutral';
    return '';
  }, [bucketAttributes.highAttribute, bucketAttributes.lowAttribute, decisionBucket]);

  const matchesOrientationBucket = useCallback((scenarioId: string | null | undefined) => {
    if (!orientationBucket || !scenarioId) {
      return true;
    }

    const isFlipped = correctedScenarioIds.has(String(scenarioId));
    return orientationBucket === 'flipped' ? isFlipped : !isFlipped;
  }, [correctedScenarioIds, orientationBucket]);

  const resolveDecisionBucketForValue = useCallback((
    content: unknown,
    rowDimension: string,
    colDimension: string,
    targetValueKey: string,
  ): 'a' | 'b' | null => {
    const labels = deriveDecisionDimensionLabels(content);
    const sideNames = getDecisionSideNames(labels);
    const mapped = mapDecisionSidesToScenarioAttributes(
      sideNames.aName,
      sideNames.bName,
      [rowDimension, colDimension].filter((value) => value !== ''),
    );
    const normalizedTarget = normalizePairedValueKey(targetValueKey);
    if (normalizePairedValueKey(mapped.lowAttribute) === normalizedTarget) return 'a';
    if (normalizePairedValueKey(mapped.highAttribute) === normalizedTarget) return 'b';
    return null;
  }, []);

  useEffect(() => {
    if (!scenarioDimensions) return;
    if (hasRepeatPatternParams) return;

    const rowChanged = rowDim !== activeRowDim;
    const colChanged = colDim !== activeColDim;
    if (!rowChanged && !colChanged) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('rowDim', activeRowDim);
    nextParams.set('colDim', activeColDim);

    // Existing row/col cell coordinates may not be valid once axes change.
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
  ]);

  const handleDecisionChange = useCallback(async (transcript: Transcript, nextDecisionCode: string) => {
    setUpdatingTranscriptIds((prev) => new Set(prev).add(transcript.id));
    try {
      await updateTranscriptDecision(transcript.id, nextDecisionCode);
      setSelectedTranscript((current) => {
        if (!current || current.id !== transcript.id) return current;
        return { ...current, decisionCode: nextDecisionCode };
      });
      refetch();
    } finally {
      setUpdatingTranscriptIds((prev) => {
        const next = new Set(prev);
        next.delete(transcript.id);
        return next;
      });
    }
  }, [updateTranscriptDecision, refetch]);

  const filteredTranscripts = useMemo(() => {
    if (hasDirectTranscriptParam) {
      const matched = (run?.transcripts ?? []).find((transcript) => transcript.id === selectedTranscriptId);
      return matched && matchesOrientationBucket(matched.scenarioId) ? [matched] : [];
    }

    if (hasRepeatPatternParams) {
      return filterTranscriptsForConditionIds(
        run?.transcripts ?? [],
        selectedModel,
        conditionIds,
        scenarioDimensions,
        activeRowDim,
        activeColDim,
      ).filter((transcript) => matchesOrientationBucket(transcript.scenarioId));
    }

    if (hasPairedConditionFilterParams) {
      const runEntries = [
        {
          run,
          content: definitionContent,
          scenarioDims: scenarioDimensions,
        },
        {
          run: companionRun,
          content: companionDefinitionContent,
          scenarioDims: companionScenarioDimensions,
        },
      ];

      return runEntries.flatMap((entry) => {
        const entryOrientation = getOrientationBucketForContent(entry.content);
        if (pairView === 'condition-split' && orientationBucket && entryOrientation !== orientationBucket) {
          return [];
        }

        return filterTranscriptsForPivotCell({
          transcripts: entry.run?.transcripts ?? [],
          scenarioDimensions: entry.scenarioDims,
          rowDim: activeRowDim,
          colDim: activeColDim,
          row,
          col,
          selectedModel,
        });
      });
    }

    if (hasPairedValueFilterParams) {
      const runEntries = [
        {
          run,
          content: definitionContent,
          scenarioDims: scenarioDimensions,
          modelMatrix: modelScenarioMatrix,
        },
        {
          run: companionRun,
          content: companionDefinitionContent,
          scenarioDims: companionScenarioDimensions,
          modelMatrix: companionModelScenarioMatrix,
        },
      ];

      return runEntries.flatMap((entry) => {
        const transcripts = entry.run?.transcripts ?? [];
        const attributes = deriveScenarioAttributesFromDefinition(entry.content);
        const rowDimension = attributes[0] ?? '';
        const colDimension = attributes[1] ?? attributes[0] ?? '';
        const bucket = pairedDecisionBucketParam === 'a' || pairedDecisionBucketParam === 'neutral' || pairedDecisionBucketParam === 'b'
          ? pairedDecisionBucketParam
          : resolveDecisionBucketForValue(entry.content, rowDimension, colDimension, pairedValueKey);
        if (!bucket) {
          return [];
        }

        const matchingScenarioIds = collectScenarioIdsForDecisionBucket(
          entry.scenarioDims,
          entry.modelMatrix,
          selectedModel,
          bucket,
          rowDimension,
          colDimension,
        );

        return transcripts.filter((transcript) => (
          transcript.modelId === selectedModel
          && transcript.scenarioId !== null
          && matchingScenarioIds.has(transcript.scenarioId)
        ));
      });
    }

    if (hasBucketFilterParams) {
      const transcripts = run?.transcripts ?? [];
      if (!scenarioDimensions || !modelScenarioMatrix) return [];
      const matchingScenarioIds = collectScenarioIdsForDecisionBucket(
        scenarioDimensions,
        modelScenarioMatrix,
        selectedModel,
        decisionBucket as 'a' | 'neutral' | 'b',
        activeRowDim,
        activeColDim,
      );

      return transcripts.filter((transcript) => (
        transcript.modelId === selectedModel
        && transcript.scenarioId !== null
        && matchingScenarioIds.has(transcript.scenarioId)
        && matchesOrientationBucket(transcript.scenarioId)
      ));
    }

    return filterTranscriptsForPivotCell({
      transcripts: run?.transcripts ?? [],
      scenarioDimensions,
      rowDim: activeRowDim,
      colDim: activeColDim,
      row,
      col,
      selectedModel,
      decisionCode: decisionCode || undefined,
    }).filter((transcript) => matchesOrientationBucket(transcript.scenarioId));
  }, [
    scenarioDimensions,
    modelScenarioMatrix,
    activeRowDim,
    activeColDim,
    row,
    col,
    selectedModel,
    conditionIds,
    decisionCode,
    decisionBucket,
    hasRepeatPatternParams,
    hasPairedConditionFilterParams,
    hasPairedValueFilterParams,
    hasBucketFilterParams,
    hasDirectTranscriptParam,
    matchesOrientationBucket,
    selectedTranscriptId,
    companionRun,
    run,
    companionDefinitionContent,
    companionScenarioDimensions,
    companionModelScenarioMatrix,
    definitionContent,
    pairedValueKey,
    pairedDecisionBucketParam,
    pairView,
    orientationBucket,
    resolveDecisionBucketForValue,
  ]);

  const normalizedDecisionTranscriptIds = useMemo(() => {
    const shouldNormalizePairedScores = analysisMode === 'paired'
      && (
        (hasPairedConditionFilterParams && pairView === 'condition-blended')
        || hasPairedValueFilterParams
      );

    if (!shouldNormalizePairedScores) {
      return new Set<string>();
    }

    const normalizedRunIds = new Set<string>();
    if (getOrientationBucketForContent(definitionContent) === 'flipped' && run?.id) {
      normalizedRunIds.add(run.id);
    }
    if (getOrientationBucketForContent(companionDefinitionContent) === 'flipped' && companionRun?.id) {
      normalizedRunIds.add(companionRun.id);
    }

    return new Set(
      filteredTranscripts
        .filter((transcript) => normalizedRunIds.has(transcript.runId))
        .map((transcript) => transcript.id),
    );
  }, [
    analysisMode,
    companionDefinitionContent,
    companionRun?.id,
    definitionContent,
    filteredTranscripts,
    hasPairedConditionFilterParams,
    hasPairedValueFilterParams,
    pairView,
    run?.id,
  ]);

  const decisionColumnLabel = normalizedDecisionTranscriptIds.size > 0
    ? 'Normalized decision score'
    : 'Decision';
  const decisionColumnTooltip = normalizedDecisionTranscriptIds.size > 0
    ? 'In this paired view, some prompts showed the two options in a different order. We adjust those scores so they all use the same scale. That way, the same number means the same choice direction across every transcript.'
    : undefined;
  const normalizationBadgeTitle = normalizedDecisionTranscriptIds.size > 0
    ? 'This score was adjusted because this transcript showed the options in the opposite order.'
    : undefined;

  useEffect(() => {
    if (!hasDirectTranscriptParam) {
      return;
    }
    const matched = filteredTranscripts.find((transcript) => transcript.id === selectedTranscriptId) ?? null;
    setSelectedTranscript(matched);
  }, [filteredTranscripts, hasDirectTranscriptParam, selectedTranscriptId]);

  const transcriptCoverage = useMemo(() => {
    return filteredTranscripts.reduce(
      (acc, transcript) => {
        const metadata = getDecisionMetadata(transcript.decisionMetadata);
        if (transcript.decisionCodeSource === 'manual') {
          acc.manual += 1;
        }
        if (metadata?.parseClass === 'exact') {
          acc.exact += 1;
        } else if (metadata?.parseClass === 'fallback_resolved') {
          acc.fallback += 1;
        } else if (metadata?.parseClass === 'ambiguous') {
          acc.ambiguous += 1;
        }
        if (!['1', '2', '3', '4', '5'].includes(transcript.decisionCode ?? '')) {
          acc.unresolved += 1;
        }
        return acc;
      },
      { exact: 0, fallback: 0, ambiguous: 0, manual: 0, unresolved: 0 }
    );
  }, [filteredTranscripts]);

  if (loading && !run) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <Loading size="lg" text="Loading transcripts..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <ErrorMessage message={`Failed to load transcripts: ${error.message}`} />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <ErrorMessage message="Trial not found" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <div className="text-sm text-gray-500 flex flex-wrap items-center gap-2">
          <span className="text-gray-700">{run.definition?.name || 'Unnamed Definition'}</span>
          <span className="text-gray-300">•</span>
          {isAggregate ? (
            <>
              <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded-full font-medium">
                Aggregate View
              </span>
              <span className="font-mono bg-gray-100 text-gray-800 text-xs px-2 py-0.5 rounded border border-gray-200">
                {aggregateRuns.length > 1 ? (
                  <select
                    className="bg-transparent border-none p-0 pr-4 text-xs font-mono cursor-pointer focus:ring-0 focus:outline-none focus:bg-gray-200"
                    value={selectedAggregateSignature}
                    onChange={(e) => {
                      const nextRun = aggregateRuns.find((candidate) => candidate.signature === e.target.value);
                      if (nextRun) {
                        navigate(buildAnalysisTranscriptsPath(ANALYSIS_BASE_PATH, nextRun.id, searchParams));
                      }
                    }}
                  >
                    {aggregateRuns.map((candidate) => (
                      <option key={candidate.signature} value={candidate.signature}>
                        {getDisplaySignature(candidate.signature)}{candidate.count > 1 ? ` (${candidate.count} runs)` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  getDisplaySignature(selectedAggregateSignature)
                )}
              </span>
            </>
          ) : (
            <>
              <span className="font-mono">Trial {run.id.slice(0, 8)}...</span>
              <span className="font-mono bg-gray-100 text-gray-800 text-xs px-2 py-0.5 rounded border border-gray-200">
                {getDisplaySignature(trialSignature)}
              </span>
            </>
          )}
          <span className="text-gray-300">•</span>
          <div className="contents">
              {hasRepeatPatternParams ? (
                <>
                  Repeat Pattern: <span className="font-medium text-gray-900">{formatRepeatPatternLabel(repeatPattern)}</span>
                  <span className="mx-2">•</span>
                  Model: <span className="font-medium text-gray-900">{selectedModel}</span>
                  <span className="mx-2">•</span>
                  Conditions: <span className="font-medium text-gray-900">{conditionIds.length}</span>
                </>
              ) : (activeRowDim && activeColDim) ? (
                <>
                  {hasCellFilterParams ? (
                    <>
                      {activeRowDim}: <span className="font-medium text-gray-900">{row || '-'}</span>
                      <span className="mx-2">•</span>
                      {activeColDim}: <span className="font-medium text-gray-900">{col || '-'}</span>
                    </>
                  ) : (
                    <>
                      {activeRowDim} × {activeColDim}
                    </>
                  )}
              <span className="mx-2">•</span>
              Model: <span className="font-medium text-gray-900">{selectedModel || 'All Models'}</span>
              {decisionBucketLabel && (
                <>
                  <span className="mx-2">•</span>
                  Favors: <span className="font-medium text-gray-900">{decisionBucketLabel}</span>
                </>
              )}
              {orientationBucket && (
                <>
                  <span className="mx-2">•</span>
                  Orientation: <span className="font-medium text-gray-900">{getOrientationBucketLabel(orientationBucket, orientationLabels)}</span>
                </>
              )}
              {pairedValueLabel && (
                <>
                  <span className="mx-2">•</span>
                  Paired Value: <span className="font-medium text-gray-900">{pairedValueLabel}</span>
                </>
              )}
              {decisionCode && (
                <>
                  <span className="mx-2">•</span>
                  Decision: <span className="font-medium text-gray-900">{decisionCode}</span>
                </>
              )}
            </>
          ) : (
            'Transcript Filter'
          )}
          </div>
        </div>
      </div>

      {analysisMode && (
        <AnalysisScopeBanner analysisMode={analysisMode} compact />
      )}

      {orientationBucket && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
          Split inspection is active for the <span className="font-medium">{getOrientationBucketLabel(orientationBucket, orientationLabels)}</span> side of the paired vignette.
        </div>
      )}

      {hasPairedValueFilterParams && pairedValueLabel && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
          Blended paired inspection is active for <span className="font-medium">{pairedValueLabel}</span>. This list merges transcripts from both companion runs for the selected model.
        </div>
      )}

      {hasPairedConditionFilterParams && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
          {pairView === 'condition-split' && orientationBucket
            ? (
              <>
                Order-detail paired inspection is active for the <span className="font-medium">{getOrientationBucketLabel(orientationBucket, orientationLabels)}</span> side of this condition cell.
              </>
            )
            : (
              <>
                Blended paired inspection is active for this condition cell. This list merges transcripts from both companion runs for the selected model.
              </>
            )}
        </div>
      )}

      {!scenarioDimensions && !hasRepeatPatternParams && !hasDirectTranscriptParam && !hasPairedValueFilterParams && !hasPairedConditionFilterParams && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Scenario dimension data is not available for this run. Recompute analysis to enable pivot filtering.
        </div>
      )}

      {filteredTranscripts.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">Parse coverage</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
              Exact {transcriptCoverage.exact}
            </span>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
              Fallback {transcriptCoverage.fallback}
            </span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
              Ambiguous {transcriptCoverage.ambiguous}
            </span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
              Manual {transcriptCoverage.manual}
            </span>
          </div>
          {transcriptCoverage.unresolved > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              {transcriptCoverage.unresolved} transcript{transcriptCoverage.unresolved === 1 ? '' : 's'} in this view still do not have an analyzable 1-5 decision.
              Open those transcripts to review and relabel them manually when needed.
            </p>
          )}
        </div>
      )}

      {!hasDirectTranscriptParam && !hasRepeatPatternParams && !hasPairedValueFilterParams && !hasPairedConditionFilterParams && scenarioDimensions && !hasCellFilterParams && !hasBucketFilterParams ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Missing filter parameters. Return to the pivot table and click a cell to view transcripts.
        </div>
      ) : filteredTranscripts.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          {hasRepeatPatternParams ? 'No transcripts found for these conditions.' : 'No transcripts found for this condition.'}
        </div>
      ) : (
        <TranscriptList
          transcripts={filteredTranscripts}
          onSelect={setSelectedTranscript}
          groupByModel={false}
          scenarioDimensions={mergedScenarioDimensions}
          onDecisionChange={handleDecisionChange}
          updatingTranscriptIds={updatingTranscriptIds}
          decisionColumnLabel={decisionColumnLabel}
          decisionColumnTooltip={decisionColumnTooltip}
          normalizedDecisionTranscriptIds={normalizedDecisionTranscriptIds}
          normalizationBadgeTitle={normalizationBadgeTitle}
        />
      )}

      {selectedTranscript && (
        <TranscriptViewer
          transcript={selectedTranscript}
          onClose={() => setSelectedTranscript(null)}
          onDecisionChange={handleDecisionChange}
          decisionUpdating={updatingTranscriptIds.has(selectedTranscript.id)}
        />
      )}
    </div>
  );
}

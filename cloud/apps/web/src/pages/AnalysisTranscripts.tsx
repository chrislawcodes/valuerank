/**
 * AnalysisTranscripts Page
 *
 * Shows filtered transcripts for a pivot cell in a full page view.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { TranscriptList } from '../components/runs/TranscriptList';
import { TranscriptViewer } from '../components/runs/TranscriptViewer';
import { useRun } from '../hooks/useRun';
import { useAnalysis } from '../hooks/useAnalysis';
import { useRunMutations } from '../hooks/useRunMutations';
import type { Transcript } from '../api/operations/runs';
import { filterTranscriptsForPivotCell } from '../utils/scenarioUtils';
import {
  deriveScenarioAttributesFromDefinition,
  deriveDecisionDimensionLabels,
  getDecisionSideNames,
  mapDecisionSidesToScenarioAttributes,
  resolveScenarioAttributes,
  resolveScenarioAxisDimensions,
} from '../utils/decisionLabels';
import { getRunDefinitionContent } from '../utils/runDefinitionContent';

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
  const selectedModel = searchParams.get('model') ?? '';
  const decisionCode = searchParams.get('decisionCode') ?? '';
  const decisionBucket = searchParams.get('decisionBucket') ?? '';

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

  const scenarioDimensions = analysis?.visualizationData?.scenarioDimensions;
  const modelScenarioMatrix = analysis?.visualizationData?.modelScenarioMatrix;
  const definitionContent = useMemo(() => getRunDefinitionContent(run), [run]);
  const preferredAttributes = useMemo(
    () => deriveScenarioAttributesFromDefinition(definitionContent),
    [definitionContent]
  );
  const availableAttributes = useMemo(() => {
    return resolveScenarioAttributes(scenarioDimensions, preferredAttributes, modelScenarioMatrix);
  }, [scenarioDimensions, preferredAttributes, modelScenarioMatrix]);
  const resolvedAxes = useMemo(
    () => resolveScenarioAxisDimensions(availableAttributes, rowDim, colDim),
    [availableAttributes, colDim, rowDim]
  );
  const activeRowDim = resolvedAxes.rowDim;
  const activeColDim = resolvedAxes.colDim;
  const hasCellFilterParams = Boolean(activeRowDim && activeColDim && row && col);
  const hasBucketFilterParams = Boolean(
    activeRowDim
    && activeColDim
    && selectedModel
    && (decisionBucket === 'a' || decisionBucket === 'neutral' || decisionBucket === 'b')
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

  useEffect(() => {
    if (!scenarioDimensions) return;

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
    if (hasBucketFilterParams) {
      const transcripts = run?.transcripts ?? [];
      if (!scenarioDimensions || !modelScenarioMatrix) return [];
      const modelScores = modelScenarioMatrix[selectedModel];
      if (!modelScores) return [];

      // Group scenarios by selected row/col dimensions.
      const grouped = new Map<string, string[]>();
      Object.entries(scenarioDimensions).forEach(([scenarioId, dims]) => {
        const r = String(dims[activeRowDim] ?? 'N/A');
        const c = String(dims[activeColDim] ?? 'N/A');
        const key = `${r}||${c}`;
        const current = grouped.get(key);
        if (current) {
          current.push(scenarioId);
        } else {
          grouped.set(key, [scenarioId]);
        }
      });

      // Keep scenarios from conditions whose mean rounds into the selected bucket.
      const matchingScenarioIds = new Set<string>();
      grouped.forEach((scenarioIds) => {
        let sum = 0;
        let count = 0;
        scenarioIds.forEach((scenarioId) => {
          const score = modelScores[scenarioId];
          if (typeof score === 'number' && Number.isFinite(score)) {
            sum += score;
            count += 1;
          }
        });
        if (count === 0) return;

        const rounded = Math.round(sum / count);
        const matchesBucket = (
          (decisionBucket === 'a' && rounded <= 2)
          || (decisionBucket === 'neutral' && rounded === 3)
          || (decisionBucket === 'b' && rounded >= 4)
        );
        if (!matchesBucket) return;

        scenarioIds.forEach((scenarioId) => matchingScenarioIds.add(scenarioId));
      });

      return transcripts.filter((transcript) => (
        transcript.modelId === selectedModel
        && transcript.scenarioId !== null
        && matchingScenarioIds.has(transcript.scenarioId)
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
    });
  }, [
    run?.transcripts,
    scenarioDimensions,
    modelScenarioMatrix,
    activeRowDim,
    activeColDim,
    row,
    col,
    selectedModel,
    decisionCode,
    decisionBucket,
    hasBucketFilterParams,
  ]);

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
        <div className="text-sm text-gray-500">
              {(activeRowDim && activeColDim) ? (
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

      {!scenarioDimensions && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Scenario dimension data is not available for this run. Recompute analysis to enable pivot filtering.
        </div>
      )}

      {scenarioDimensions && !hasCellFilterParams && !hasBucketFilterParams ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Missing filter parameters. Return to the pivot table and click a cell to view transcripts.
        </div>
      ) : scenarioDimensions && filteredTranscripts.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          No transcripts found for this condition.
        </div>
      ) : (
        <TranscriptList
          transcripts={filteredTranscripts}
          onSelect={setSelectedTranscript}
          groupByModel={false}
          scenarioDimensions={scenarioDimensions}
          onDecisionChange={handleDecisionChange}
          updatingTranscriptIds={updatingTranscriptIds}
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

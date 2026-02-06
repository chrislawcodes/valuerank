/**
 * AnalysisTranscripts Page
 *
 * Shows filtered transcripts for a pivot cell in a full page view.
 */

import { useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { TranscriptList } from '../components/runs/TranscriptList';
import { TranscriptViewer } from '../components/runs/TranscriptViewer';
import { useRun } from '../hooks/useRun';
import { useAnalysis } from '../hooks/useAnalysis';
import type { Transcript } from '../api/operations/runs';
import { filterTranscriptsForPivotCell } from '../utils/scenarioUtils';

export function AnalysisTranscripts() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [selectedTranscript, setSelectedTranscript] = useState<Transcript | null>(null);

  const rowDim = searchParams.get('rowDim') ?? '';
  const colDim = searchParams.get('colDim') ?? '';
  const row = searchParams.get('row') ?? '';
  const col = searchParams.get('col') ?? '';
  const selectedModel = searchParams.get('model') ?? '';
  const hasRequiredParams = Boolean(rowDim && colDim && row && col);

  const { run, loading, error } = useRun({
    id: id || '',
    pause: !id,
    enablePolling: false,
  });

  const { analysis } = useAnalysis({
    runId: id || '',
    pause: !id,
    enablePolling: false,
    analysisStatus: run?.analysisStatus ?? null,
  });

  const scenarioDimensions = analysis?.visualizationData?.scenarioDimensions;

  const filteredTranscripts = useMemo(() => {
    return filterTranscriptsForPivotCell({
      transcripts: run?.transcripts ?? [],
      scenarioDimensions,
      rowDim,
      colDim,
      row,
      col,
      selectedModel,
    });
  }, [run?.transcripts, scenarioDimensions, rowDim, colDim, row, col, selectedModel]);

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
          {rowDim && colDim ? (
            <>
              {rowDim}: <span className="font-medium text-gray-900">{row || '-'}</span>
              <span className="mx-2">•</span>
              {colDim}: <span className="font-medium text-gray-900">{col || '-'}</span>
              <span className="mx-2">•</span>
              Model: <span className="font-medium text-gray-900">{selectedModel || 'All Models'}</span>
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

      {scenarioDimensions && !hasRequiredParams ? (
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
        />
      )}

      {selectedTranscript && (
        <TranscriptViewer
          transcript={selectedTranscript}
          onClose={() => setSelectedTranscript(null)}
        />
      )}
    </div>
  );
}

/**
 * RunDetail Page
 *
 * Displays details of a single run including progress and results.
 */

import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Play } from 'lucide-react';
import { formatRunName } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Loading } from '../../components/ui/Loading';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { RunProgress } from '../../components/runs/RunProgress';
import { RunResults } from '../../components/runs/RunResults';
import { SummarizationControls } from '../../components/runs/SummarizationControls';
import { RerunDialog } from '../../components/runs/RerunDialog';
import { useRun } from '../../hooks/useRun';
import { useRunMutations } from '../../hooks/useRunMutations';
import { exportRunAsCSV } from '../../api/export';
import { RunHeader } from './RunHeader';
import { RunMetadata } from './RunMetadata';
import { RunNameEditor } from './RunNameEditor';
import { AnalysisBanner } from './AnalysisBanner';
import { DeleteConfirmModal } from './DeleteConfirmModal';

export function RunDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isRerunDialogOpen, setIsRerunDialogOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { run, loading, error, refetch } = useRun({
    id: id || '',
    pause: !id,
    enablePolling: true,
  });

  const {
    pauseRun,
    resumeRun,
    cancelRun,
    deleteRun,
    updateRun,
    cancelSummarization,
    restartSummarization,
  } = useRunMutations();

  const handleSaveName = useCallback(
    async (name: string | null) => {
      if (!run) return;
      await updateRun(run.id, { name });
      refetch();
    },
    [run, updateRun, refetch]
  );

  const handleExport = useCallback(async () => {
    if (!run) return;
    setIsExporting(true);
    setExportError(null);
    try {
      await exportRunAsCSV(run.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      setExportError(message);
    } finally {
      setIsExporting(false);
    }
  }, [run]);

  const handlePause = useCallback(
    async (runId: string) => {
      await pauseRun(runId);
      refetch();
    },
    [pauseRun, refetch]
  );

  const handleResume = useCallback(
    async (runId: string) => {
      await resumeRun(runId);
      refetch();
    },
    [resumeRun, refetch]
  );

  const handleCancel = useCallback(
    async (runId: string) => {
      await cancelRun(runId);
      refetch();
    },
    [cancelRun, refetch]
  );

  const handleRerunSuccess = useCallback(
    (newRunId: string) => {
      navigate(`/runs/${newRunId}`);
    },
    [navigate]
  );

  const handleDelete = useCallback(async () => {
    if (!run) return;
    setIsDeleting(true);
    try {
      await deleteRun(run.id);
      navigate('/runs');
    } catch {
      setIsDeleting(false);
    }
  }, [run, deleteRun, navigate]);

  const handleCancelSummarization = useCallback(
    async (runId: string) => {
      const result = await cancelSummarization(runId);
      refetch();
      return { cancelledCount: result.cancelledCount };
    },
    [cancelSummarization, refetch]
  );

  const handleRestartSummarization = useCallback(
    async (runId: string, force?: boolean) => {
      const result = await restartSummarization(runId, force);
      refetch();
      return { queuedCount: result.queuedCount };
    },
    [restartSummarization, refetch]
  );

  // Loading state
  if (loading && !run) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/runs')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <Loading size="lg" text="Loading run..." />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/runs')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <ErrorMessage message={`Failed to load run: ${error.message}`} />
      </div>
    );
  }

  // Not found
  if (!run) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/runs')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <ErrorMessage message="Run not found" />
      </div>
    );
  }

  const isActive = run.status === 'PENDING' || run.status === 'RUNNING' || run.status === 'SUMMARIZING';
  const isPaused = run.status === 'PAUSED';
  const isTerminal = run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED';

  return (
    <div className="space-y-6">
      {/* Header */}
      <RunHeader
        runId={run.id}
        status={run.status}
        isTerminal={isTerminal}
        onPause={handlePause}
        onResume={handleResume}
        onCancel={handleCancel}
        onRerun={() => setIsRerunDialogOpen(true)}
        onDelete={() => setIsDeleteConfirmOpen(true)}
      />

      {/* Summarization controls */}
      {(run.status === 'SUMMARIZING' || isTerminal) && run.transcriptCount > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-700">Summarization</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {run.status === 'SUMMARIZING'
                  ? `Processing ${run.summarizeProgress?.completed ?? 0} of ${run.summarizeProgress?.total ?? 0} transcripts`
                  : run.summarizeProgress
                    ? `${run.summarizeProgress.completed} of ${run.transcriptCount} transcripts summarized`
                    : 'Summarization not started'}
              </p>
            </div>
            <SummarizationControls
              runId={run.id}
              status={run.status}
              summarizeProgress={run.summarizeProgress}
              transcriptCount={run.transcriptCount}
              onCancelSummarization={handleCancelSummarization}
              onRestartSummarization={handleRestartSummarization}
              onSuccess={() => {}}
              onError={() => {}}
              size="sm"
            />
          </div>
        </div>
      )}

      {/* Main content card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {/* Title and definition link */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
              <Play className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <RunNameEditor
                name={run.name}
                formattedName={formatRunName(run)}
                onSave={handleSaveName}
              />
              {/* eslint-disable-next-line react/forbid-elements -- Link-style button with icon + text layout */}
              <button
                type="button"
                onClick={() => navigate(`/definitions/${run.definitionId}`)}
                className="text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1"
              >
                <FileText className="w-3 h-3" />
                {run.definition?.name || 'View definition'}
              </button>
            </div>
          </div>
        </div>

        {/* Metadata row */}
        <RunMetadata
          createdAt={run.createdAt}
          startedAt={run.startedAt}
          completedAt={run.completedAt}
        />

        {/* Analysis link banner */}
        <div className="mb-6">
          <AnalysisBanner runId={run.id} analysisStatus={run.analysisStatus} runStatus={run.status} />
        </div>

        {/* Progress */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-4">Progress</h3>
          <RunProgress run={run} showPerModel={true} />
        </div>

        {/* Configuration */}
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Configuration</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Models:</span>
              <div className="mt-1">
                {run.config?.models?.map((model) => (
                  <span
                    key={model}
                    className="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs mr-2 mb-1"
                  >
                    {model}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <span className="text-gray-500">Sample:</span>
              <span className="ml-2 text-gray-900">{run.config?.samplePercentage ?? 100}%</span>
            </div>
          </div>
        </div>

        {/* Results section */}
        {(isTerminal || run.transcriptCount > 0) && (
          <div className="border-t border-gray-200 pt-6 mt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Results</h3>
            {exportError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {exportError}
              </div>
            )}
            <RunResults run={run} onExport={() => void handleExport()} isExporting={isExporting} />
          </div>
        )}
      </div>

      {/* Polling indicator for active runs */}
      {(isActive || isPaused) && (
        <div className="text-center text-sm text-gray-500">
          {isActive ? 'Updating every 5 seconds...' : 'Run is paused'}
        </div>
      )}

      {/* Re-run Dialog */}
      <RerunDialog
        run={run}
        scenarioCount={run.runProgress?.total}
        isOpen={isRerunDialogOpen}
        onClose={() => setIsRerunDialogOpen(false)}
        onSuccess={handleRerunSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmModal
        isOpen={isDeleteConfirmOpen}
        isDeleting={isDeleting}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

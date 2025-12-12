/**
 * RunDetail Page
 *
 * Displays details of a single run including progress and results.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Calendar, Clock, Play, RefreshCw, Trash2, BarChart2, Loader2, Pencil, Check, X } from 'lucide-react';
import { formatRunName } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Loading } from '../components/ui/Loading';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { RunProgress } from '../components/runs/RunProgress';
import { RunResults } from '../components/runs/RunResults';
import { RunControls } from '../components/runs/RunControls';
import { RerunDialog } from '../components/runs/RerunDialog';
import { useRun } from '../hooks/useRun';
import { useRunMutations } from '../hooks/useRunMutations';
import { exportRunAsCSV } from '../api/export';

/**
 * Format a date string for display.
 */
function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Calculate run duration.
 */
function calculateDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '-';
  const start = new Date(startedAt);
  const end = completedAt ? new Date(completedAt) : new Date();
  const durationMs = end.getTime() - start.getTime();

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export function RunDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isRerunDialogOpen, setIsRerunDialogOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const { run, loading, error, refetch } = useRun({
    id: id || '',
    pause: !id,
    enablePolling: true,
  });

  const { pauseRun, resumeRun, cancelRun, deleteRun, updateRun } = useRunMutations();

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleStartEditName = useCallback(() => {
    if (run) {
      setEditedName(run.name || '');
      setIsEditingName(true);
    }
  }, [run]);

  const handleCancelEditName = useCallback(() => {
    setIsEditingName(false);
    setEditedName('');
  }, []);

  const handleSaveName = useCallback(async () => {
    if (!run) return;
    setIsSavingName(true);
    try {
      // If name is empty, set to null (use default algorithmic name)
      const newName = editedName.trim() || null;
      await updateRun(run.id, { name: newName });
      setIsEditingName(false);
      refetch();
    } catch (err) {
      console.error('Failed to save run name:', err);
    } finally {
      setIsSavingName(false);
    }
  }, [run, editedName, updateRun, refetch]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      void handleSaveName();
    } else if (e.key === 'Escape') {
      handleCancelEditName();
    }
  }, [handleSaveName, handleCancelEditName]);

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

  const handlePause = useCallback(async (runId: string) => {
    await pauseRun(runId);
    refetch();
  }, [pauseRun, refetch]);

  const handleResume = useCallback(async (runId: string) => {
    await resumeRun(runId);
    refetch();
  }, [resumeRun, refetch]);

  const handleCancel = useCallback(async (runId: string) => {
    await cancelRun(runId);
    refetch();
  }, [cancelRun, refetch]);

  const handleRerunSuccess = useCallback((newRunId: string) => {
    navigate(`/runs/${newRunId}`);
  }, [navigate]);

  const handleDelete = useCallback(async () => {
    if (!run) return;
    setIsDeleting(true);
    try {
      await deleteRun(run.id);
      navigate('/runs');
    } catch (err) {
      console.error('Failed to delete run:', err);
      setIsDeleting(false);
    }
  }, [run, deleteRun, navigate]);

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/runs')}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Runs
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {/* Re-run button - shown for terminal states */}
          {isTerminal && (
            <Button
              variant="secondary"
              onClick={() => setIsRerunDialogOpen(true)}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Re-run
            </Button>
          )}
          {/* Delete button - shown for terminal states */}
          {isTerminal && (
            <Button
              variant="ghost"
              onClick={() => setIsDeleteConfirmOpen(true)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          )}
          {/* Run controls - shown for non-terminal states */}
          <RunControls
            runId={run.id}
            status={run.status}
            onPause={handlePause}
            onResume={handleResume}
            onCancel={handleCancel}
          />
        </div>
      </div>

      {/* Main content card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {/* Title and definition link */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
              <Play className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    onKeyDown={handleNameKeyDown}
                    placeholder="Enter run name..."
                    className="text-xl font-medium text-gray-900 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    disabled={isSavingName}
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveName()}
                    disabled={isSavingName}
                    className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded"
                    title="Save"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEditName}
                    disabled={isSavingName}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                    title="Cancel"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h1 className="text-xl font-medium text-gray-900">
                    {formatRunName(run)}
                  </h1>
                  <button
                    type="button"
                    onClick={handleStartEditName}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Edit name"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              )}
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
        <div className="flex items-center gap-6 text-sm text-gray-500 mb-6 pb-6 border-b border-gray-200">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            Created {formatDate(run.createdAt)}
          </span>
          {run.startedAt && (
            <span className="flex items-center gap-1">
              <Play className="w-4 h-4" />
              Started {formatDate(run.startedAt)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Duration: {calculateDuration(run.startedAt, run.completedAt)}
          </span>
        </div>

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
              <span className="ml-2 text-gray-900">
                {run.config?.samplePercentage ?? 100}%
              </span>
            </div>
          </div>
        </div>

        {/* Results section (shows for completed runs or when transcripts exist) */}
        {(isTerminal || run.transcriptCount > 0) && (
          <div className="border-t border-gray-200 pt-6 mt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-4">
              Results
            </h3>
            {exportError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {exportError}
              </div>
            )}
            <RunResults
              run={run}
              onExport={() => void handleExport()}
              isExporting={isExporting}
            />
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
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setIsDeleteConfirmOpen(false)}
          />
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Delete Run?
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              This will delete the run and all associated transcripts and analysis data.
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => setIsDeleteConfirmOpen(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleDelete()}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Analysis banner component showing link to analysis page.
 */
function AnalysisBanner({
  runId,
  analysisStatus,
  runStatus,
}: {
  runId: string;
  analysisStatus: string | null;
  runStatus: string;
}) {
  // Don't show banner if run isn't completed and no analysis exists
  if (runStatus !== 'COMPLETED' && !analysisStatus) {
    return null;
  }

  // Show computing state
  if (analysisStatus === 'computing') {
    return (
      <div className="bg-amber-50 rounded-lg border border-amber-200 p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-amber-800">Analysis Computing</h3>
            <p className="text-xs text-amber-600 mt-0.5">
              Statistical analysis is being computed. This usually takes a few seconds.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show pending state (can run analysis)
  if (analysisStatus === 'pending') {
    return (
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900">Analysis Pending</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Analysis is queued and will be computed shortly.
              </p>
            </div>
          </div>
          <Link
            to={`/analysis/${runId}`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-600 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
          >
            <BarChart2 className="w-4 h-4" />
            View Analysis
          </Link>
        </div>
      </div>
    );
  }

  // Show completed/failed analysis link
  if (analysisStatus === 'completed' || analysisStatus === 'failed') {
    const isCompleted = analysisStatus === 'completed';
    return (
      <div className={`rounded-lg border p-4 ${isCompleted ? 'bg-purple-50 border-purple-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isCompleted ? 'bg-purple-100' : 'bg-red-100'}`}>
              <BarChart2 className={`w-5 h-5 ${isCompleted ? 'text-purple-600' : 'text-red-600'}`} />
            </div>
            <div>
              <h3 className={`text-sm font-medium ${isCompleted ? 'text-purple-900' : 'text-red-900'}`}>
                {isCompleted ? 'Analysis Complete' : 'Analysis Failed'}
              </h3>
              <p className={`text-xs mt-0.5 ${isCompleted ? 'text-purple-600' : 'text-red-600'}`}>
                {isCompleted
                  ? 'Statistical analysis and model comparison results are available.'
                  : 'Analysis encountered an error. You can try recomputing.'}
              </p>
            </div>
          </div>
          <Link
            to={`/analysis/${runId}`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-600 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
          >
            <BarChart2 className="w-4 h-4" />
            View Analysis
          </Link>
        </div>
      </div>
    );
  }

  // Default: show link if run is completed (even if no analysis status yet)
  if (runStatus === 'COMPLETED') {
    return (
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900">Analysis</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                View statistical analysis and model comparison results.
              </p>
            </div>
          </div>
          <Link
            to={`/analysis/${runId}`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-600 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
          >
            <BarChart2 className="w-4 h-4" />
            View Analysis
          </Link>
        </div>
      </div>
    );
  }

  return null;
}

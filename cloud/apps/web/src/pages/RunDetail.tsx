/**
 * RunDetail Page
 *
 * Displays details of a single run including progress and results.
 */

import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Calendar, Clock, Play, RefreshCw } from 'lucide-react';
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

  const { run, loading, error, refetch } = useRun({
    id: id || '',
    pause: !id,
    enablePolling: true,
  });

  const { pauseRun, resumeRun, cancelRun } = useRunMutations();

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
              <h1 className="text-xl font-medium text-gray-900">
                Run {run.id.slice(0, 8)}...
              </h1>
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
    </div>
  );
}

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { RunProgress } from '../../runs/RunProgress';
import { useRun } from '../../../hooks/useRun';

type DomainEvaluationStatusDrawerProps = {
  runId: string | null;
  open: boolean;
  onClose: () => void;
};

function formatTimestamp(value: string | null): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

export function DomainEvaluationStatusDrawer({
  runId,
  open,
  onClose,
}: DomainEvaluationStatusDrawerProps) {
  const { run, loading, error } = useRun({ id: runId ?? '', pause: !open || !runId, enablePolling: true });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !runId) return null;

  const content = (
    <div className="fixed inset-0 z-50">
      <Button
        type="button"
        aria-label="Close run details"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      >
        <span className="sr-only">Close run details</span>
      </Button>
      <aside className="absolute right-0 top-0 h-full w-full max-w-3xl bg-white shadow-2xl border-l border-gray-200 flex flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">
              {run?.definition?.name ?? `Batch ${runId.slice(-8)}`}
            </h2>
            <p className="text-sm text-gray-600">
              {run ? `${run.status.toLowerCase()} · ${run.runCategory.toLowerCase()}` : 'Loading run details'}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close run details">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && !run ? (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading run details...
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error.message}
            </div>
          ) : run ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral" size="count">Run: {run.id.slice(-8)}</Badge>
                <Badge variant="info" size="count">Stage: {run.status.toLowerCase()}</Badge>
                <Badge variant="neutral" size="count">Updated: {formatTimestamp(run.updatedAt)}</Badge>
                {run.analysisStatus && (
                  <Badge variant="info" size="count">Analysis: {run.analysisStatus}</Badge>
                )}
              </div>

              {run.stalledModels.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    Model stall detected
                  </div>
                  <p className="mt-1">
                    {run.stalledModels.length} stalled model{run.stalledModels.length === 1 ? '' : 's'}:
                    {' '}
                    {run.stalledModels.join(', ')}
                  </p>
                </div>
              )}

              <RunProgress run={run} showPerModel />

              <section className="space-y-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Recent task log</h3>
                  <p className="text-sm text-gray-600">Latest task-style updates from this batch.</p>
                </div>
                {run.recentTasks.length === 0 ? (
                  <p className="text-sm text-gray-500">No recent task events.</p>
                ) : (
                  <div className="space-y-2">
                    {run.recentTasks.slice(0, 6).map((task) => (
                      <div key={`${task.scenarioId}:${task.modelId}`} className="rounded-lg border border-gray-200 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium text-gray-900">
                            {task.modelId} · {task.status.toLowerCase()}
                          </div>
                          <div className="text-xs text-gray-500">
                            {task.completedAt ? formatTimestamp(task.completedAt) : 'In progress'}
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-gray-600">
                          Scenario: {task.scenarioId} · Error: {task.error ?? 'None'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Recent transcripts</h3>
                  <p className="text-sm text-gray-600">Conversation-level logs for the selected batch.</p>
                </div>
                {run.transcripts.length === 0 ? (
                  <p className="text-sm text-gray-500">No transcripts available yet.</p>
                ) : (
                  <div className="space-y-2">
                    {run.transcripts.slice(0, 4).map((transcript) => (
                      <div key={transcript.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium text-gray-900">
                            {transcript.modelId}{transcript.modelVersion ? ` · ${transcript.modelVersion}` : ''}
                          </div>
                          <div className="text-xs text-gray-500">{formatTimestamp(transcript.createdAt)}</div>
                        </div>
                        <div className="mt-1 text-xs text-gray-600">
                          {transcript.turnCount} turns · {transcript.tokenCount} tokens · {transcript.durationMs} ms
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="text-sm text-gray-500">No run details available.</div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-4">
          <Link
            to={run ? `/runs/${run.id}` : '#'}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Open run diagnostics
          </Link>
          <Button type="button" onClick={onClose} variant="ghost">
            Close
          </Button>
        </div>
      </aside>
    </div>
  );

  return createPortal(content, document.body);
}

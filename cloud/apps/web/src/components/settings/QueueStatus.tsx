import { CheckCircle2, XCircle, PauseCircle, Activity, AlertTriangle } from 'lucide-react';
import type { QueueHealth } from '../../api/operations/health';

type QueueStatusProps = {
  queue: QueueHealth;
  loading?: boolean;
};

function StatusBadge({ queue }: { queue: QueueHealth }) {
  if (!queue.isRunning) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <XCircle className="w-3 h-3" />
        Stopped
      </span>
    );
  }

  if (queue.isPaused) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
        <PauseCircle className="w-3 h-3" />
        Paused
      </span>
    );
  }

  if (queue.isHealthy) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle2 className="w-3 h-3" />
        Healthy
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <AlertTriangle className="w-3 h-3" />
      Unhealthy
    </span>
  );
}

function StatItem({ label, value, highlight }: { label: string; value: string | number; highlight?: 'success' | 'warning' | 'error' }) {
  const colorClass = highlight === 'success' ? 'text-green-600' : highlight === 'warning' ? 'text-yellow-600' : highlight === 'error' ? 'text-red-600' : 'text-gray-900';

  return (
    <div className="text-center">
      <p className={`text-lg font-semibold ${colorClass}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

export function QueueStatus({ queue, loading }: QueueStatusProps) {
  const successRatePercent = queue.successRate !== null ? Math.round(queue.successRate * 100) : null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
          <Activity className="w-4 h-4 text-gray-500" />
          Job Queue
        </h3>
        <StatusBadge queue={queue} />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        {queue.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">{queue.error}</p>
          </div>
        )}

        <div className="grid grid-cols-4 gap-4">
          <StatItem
            label="Active"
            value={queue.activeJobs}
            highlight={queue.activeJobs > 0 ? 'success' : undefined}
          />
          <StatItem
            label="Pending"
            value={queue.pendingJobs}
            highlight={queue.pendingJobs > 10 ? 'warning' : undefined}
          />
          <StatItem
            label="Completed (24h)"
            value={queue.completedLast24h}
            highlight="success"
          />
          <StatItem
            label="Failed (24h)"
            value={queue.failedLast24h}
            highlight={queue.failedLast24h > 0 ? 'error' : undefined}
          />
        </div>

        {successRatePercent !== null && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Success Rate (24h)</span>
              <span className={`font-medium ${successRatePercent >= 90 ? 'text-green-600' : successRatePercent >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                {successRatePercent}%
              </span>
            </div>
            <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${successRatePercent >= 90 ? 'bg-green-500' : successRatePercent >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${successRatePercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Job Types Breakdown */}
        {queue.jobTypes && queue.jobTypes.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-3">Jobs by Type</p>
            <div className="space-y-2">
              {queue.jobTypes.map((jt) => (
                <div key={jt.type} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 font-mono text-xs">
                    {formatJobType(jt.type)}
                  </span>
                  <div className="flex items-center gap-3 text-xs">
                    {jt.active > 0 && (
                      <span className="text-green-600">{jt.active} active</span>
                    )}
                    {jt.pending > 0 && (
                      <span className="text-yellow-600">{jt.pending} pending</span>
                    )}
                    {jt.completed > 0 && (
                      <span className="text-gray-500">{jt.completed} done</span>
                    )}
                    {jt.failed > 0 && (
                      <span className="text-red-600">{jt.failed} failed</span>
                    )}
                    {jt.active === 0 && jt.pending === 0 && jt.completed === 0 && jt.failed === 0 && (
                      <span className="text-gray-400">-</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatJobType(type: string): string {
  const names: Record<string, string> = {
    probe_scenario: 'Probe Scenario',
    summarize_transcript: 'Summarize Transcript',
    analyze_basic: 'Analyze (Basic)',
    analyze_deep: 'Analyze (Deep)',
    expand_scenarios: 'Expand Scenarios',
  };
  return names[type] || type;
}

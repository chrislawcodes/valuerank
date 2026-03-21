/**
 * ExecutionProgress Component
 *
 * Real-time visualization of the three pipeline stages during a run:
 * Probe → Summarize → Analyse.
 *
 * Shows per-provider swim-lane cards with per-model rows, utilization bars,
 * job queue strip, retry badge, and pending stage indicators.
 */

import { useMemo } from 'react';
import { Activity, Clock } from 'lucide-react';
import type { ExecutionMetrics, RunProgress, RunStatus } from '../../api/operations/runs';

type ExecutionProgressProps = {
  metrics: ExecutionMetrics;
  runStatus: RunStatus;
  runProgress: RunProgress | null;
  summarizeProgress: RunProgress | null;
  analysisStatus: string | null;
};

// Provider display config
const PROVIDER_CONFIG: Record<string, { name: string; dot: string; bar: string; border: string; bg: string }> = {
  anthropic: { name: 'Anthropic', dot: 'bg-orange-500', bar: 'bg-orange-400', border: 'border-orange-200', bg: 'bg-orange-50' },
  openai:    { name: 'OpenAI',    dot: 'bg-emerald-500', bar: 'bg-emerald-400', border: 'border-emerald-200', bg: 'bg-emerald-50' },
  google:    { name: 'Google',    dot: 'bg-blue-500',    bar: 'bg-blue-400',    border: 'border-blue-200',    bg: 'bg-blue-50'    },
  deepseek:  { name: 'DeepSeek', dot: 'bg-purple-500',  bar: 'bg-purple-400',  border: 'border-purple-200',  bg: 'bg-purple-50'  },
  xai:       { name: 'xAI',      dot: 'bg-gray-500',    bar: 'bg-gray-400',    border: 'border-gray-200',    bg: 'bg-gray-50'    },
  mistral:   { name: 'Mistral',  dot: 'bg-cyan-500',    bar: 'bg-cyan-400',    border: 'border-cyan-200',    bg: 'bg-cyan-50'    },
};

function getProviderConfig(provider: string) {
  return PROVIDER_CONFIG[provider] ?? {
    name: provider,
    dot: 'bg-gray-500',
    bar: 'bg-gray-400',
    border: 'border-gray-200',
    bg: 'bg-gray-50',
  };
}

/** Completions in the last 60 seconds → per-minute rate. */
function computeRate(
  completions: ExecutionMetrics['providers'][0]['recentCompletions'],
  modelId?: string,
): number {
  const now = Date.now();
  const relevant = modelId != null
    ? completions.filter((c) => c.modelId === modelId)
    : completions;
  return relevant.filter((c) => now - new Date(c.completedAt).getTime() < 60_000).length;
}

function formatRate(rate: number): string {
  return rate > 0 ? `${rate}/min` : '0/min';
}

// ── Stage pills ──────────────────────────────────────────────────────────────

type Stage = 'probe' | 'summarize' | 'analyse';

function activeStage(status: RunStatus): Stage {
  if (status === 'SUMMARIZING') return 'summarize';
  if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') return 'analyse';
  return 'probe';
}

function StagePills({ status }: { status: RunStatus }) {
  const current = activeStage(status);
  const stages: { key: Stage; label: string; num: number }[] = [
    { key: 'probe', label: 'Probe', num: 1 },
    { key: 'summarize', label: 'Summarize', num: 2 },
    { key: 'analyse', label: 'Analyse', num: 3 },
  ];

  return (
    <div className="flex items-center gap-1 mt-3">
      {stages.map((s, i) => {
        const isActive = s.key === current;
        return (
          <span key={s.key} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300 text-sm mx-1">›</span>}
            <span
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                isActive ? 'bg-emerald-100 text-emerald-800' : 'text-gray-400'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isActive ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-400'
                }`}
              >
                {s.num}
              </span>
              {s.label}
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// ── Provider card ────────────────────────────────────────────────────────────

type ModelRow = {
  modelId: string;
  done: number;
  failed: number;
  rate: number;
};

function ProviderCard({
  provider,
  modelRows,
  totalDone,
  totalRate,
}: {
  provider: ExecutionMetrics['providers'][0];
  modelRows: ModelRow[];
  totalDone: number;
  totalRate: number;
}) {
  const cfg = getProviderConfig(provider.provider);
  const isActive = provider.activeJobs > 0;
  const utilPct = provider.maxParallel > 0
    ? Math.min(100, (provider.activeJobs / provider.maxParallel) * 100)
    : 0;
  const isThrottled = provider.requestsPerMinute > 0 && provider.activeJobs === 0 && provider.queuedJobs > 0;

  return (
    <div
      className={`rounded-lg border overflow-hidden flex flex-col transition-all duration-300 ${
        isActive ? `${cfg.border} shadow-sm` : 'border-gray-200'
      }`}
    >
      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-2 ${isActive ? cfg.bg : 'bg-white'}`}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? cfg.dot + ' animate-pulse' : 'bg-gray-300'}`} />
        <span className="text-sm font-semibold text-gray-700 flex-1">{cfg.name}</span>
        {isActive && <Activity className="w-3 h-3 text-gray-400" />}
      </div>

      {/* Model rows */}
      <div className="px-3 py-2 flex flex-col gap-1 flex-1">
        {modelRows.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No activity</p>
        ) : (
          modelRows.map((row) => (
            <div key={row.modelId} className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-xs text-gray-700 flex-1 min-w-0 truncate">{row.modelId}</span>
              <span className="text-xs font-semibold text-gray-900 flex-shrink-0 tabular-nums">{row.done} done</span>
              <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums w-12 text-right">{formatRate(row.rate)}</span>
            </div>
          ))
        )}
      </div>

      {/* Totals line */}
      <div className="px-3 pb-1.5 flex items-center gap-1.5 text-xs text-gray-500">
        <span className="font-medium text-gray-700">{totalDone} done total</span>
        <span>·</span>
        <span className="tabular-nums">{formatRate(totalRate)}</span>
        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" />}
        {isThrottled && <span className="ml-auto text-amber-600 font-medium">throttled</span>}
      </div>

      {/* Footer: util bar + slots + queue */}
      <div className={`px-3 py-2 border-t border-gray-100 flex flex-col gap-1.5 ${isActive ? cfg.bg : 'bg-gray-50/50'}`}>
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`}
            style={{ width: `${utilPct}%` }}
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="tabular-nums">{provider.activeJobs}/{provider.maxParallel} slots</span>
          {provider.queuedJobs > 0 && (
            <span className="tabular-nums text-amber-600">{provider.queuedJobs} queued</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pending stage bar ────────────────────────────────────────────────────────

function PendingStageBar({
  label,
  hint,
  progress,
}: {
  label: string;
  hint: string;
  progress: RunProgress | null;
}) {
  const pct = progress != null ? progress.percentComplete : 0;
  const done = progress != null ? progress.completed : 0;
  const total = progress != null ? progress.total : 0;
  const failed = progress != null ? progress.failed : 0;
  const isActive = pct > 0 || done > 0;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={`text-xs font-semibold uppercase tracking-wide w-24 flex-shrink-0 ${isActive ? 'text-gray-600' : 'text-gray-300'}`}>
        {label}
      </span>
      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isActive ? 'bg-emerald-400' : 'bg-gray-200'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isActive ? (
        <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">
          {done} / {total}
          {failed > 0 && <span className="text-red-500 ml-1">{failed} failed</span>}
        </span>
      ) : (
        <span className="text-xs text-gray-300 flex-shrink-0">{hint}</span>
      )}
    </div>
  );
}

// ── Retry badge (run-level) ──────────────────────────────────────────────────

function RetryBadge({ totalRetries, total }: { totalRetries: number; total: number }) {
  if (totalRetries === 0) {
    return <span className="text-xs text-gray-400 tabular-nums">0 retries</span>;
  }
  const pct = total > 0 ? (totalRetries / total) * 100 : 0;
  const color = pct < 10
    ? 'bg-green-100 text-green-700'
    : pct < 25
    ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-700';

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium tabular-nums ${color}`}>
      {totalRetries} {totalRetries === 1 ? 'retry' : 'retries'}
    </span>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function ExecutionProgress({
  metrics,
  runStatus,
  runProgress,
  summarizeProgress,
  analysisStatus,
}: ExecutionProgressProps) {
  const byModelMap = useMemo(() => {
    const map = new Map<string, { completed: number; failed: number }>();
    for (const m of runProgress?.byModel ?? []) {
      map.set(m.modelId, { completed: m.completed, failed: m.failed });
    }
    return map;
  }, [runProgress?.byModel]);

  const providerData = useMemo(() => {
    return metrics.providers.map((provider) => {
      const seenModelIds = new Set([
        ...provider.activeModelIds,
        ...provider.recentCompletions.map((c) => c.modelId),
      ]);

      const modelRows: ModelRow[] = Array.from(seenModelIds).map((modelId) => {
        const counts = byModelMap.get(modelId);
        return {
          modelId,
          done: counts?.completed ?? 0,
          failed: counts?.failed ?? 0,
          rate: computeRate(provider.recentCompletions, modelId),
        };
      }).sort((a, b) => b.done - a.done);

      const totalDone = modelRows.reduce((sum, r) => sum + r.done, 0);
      const totalRate = computeRate(provider.recentCompletions);

      return { provider, modelRows, totalDone, totalRate };
    });
  }, [metrics.providers, byModelMap]);

  const activeProviders = providerData.filter(
    (p) => p.provider.activeJobs > 0 || p.provider.queuedJobs > 0 || p.modelRows.length > 0,
  );

  if (activeProviders.length === 0) return null;

  const hasActivity = metrics.totalActive > 0 || metrics.totalQueued > 0;

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      {/* Probe section header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className={`w-4 h-4 ${hasActivity ? 'text-emerald-600 animate-pulse' : 'text-gray-400'}`} />
            <span className="text-sm font-semibold text-gray-700">PROBE</span>
          </div>

          {/* Job queue + retry info */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {metrics.totalQueued > 0 && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span className="tabular-nums font-medium text-gray-700">{metrics.totalQueued}</span>
                <span>trials pending dispatch</span>
              </div>
            )}
            <RetryBadge totalRetries={metrics.totalRetries} total={runProgress?.total ?? 0} />
          </div>
        </div>

        <StagePills status={runStatus} />
      </div>

      {/* Provider grid */}
      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {activeProviders.map(({ provider, modelRows, totalDone, totalRate }) => (
            <ProviderCard
              key={provider.provider}
              provider={provider}
              modelRows={modelRows}
              totalDone={totalDone}
              totalRate={totalRate}
            />
          ))}
        </div>
      </div>

      {/* Summarize + Analyse pending bars */}
      <div className="border-t border-gray-100 divide-y divide-gray-100">
        <PendingStageBar
          label="Summarize"
          hint="Starts after Probe"
          progress={summarizeProgress}
        />
        <PendingStageBar
          label="Analyse"
          hint={analysisStatus === 'computing' ? 'Computing…' : 'Starts after Summarize'}
          progress={null}
        />
      </div>
    </div>
  );
}

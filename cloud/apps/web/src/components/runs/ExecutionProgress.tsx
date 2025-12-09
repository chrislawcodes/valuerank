/**
 * ExecutionProgress Component
 *
 * Real-time visualization of parallel execution during runs.
 * Shows per-provider concurrency, rate limits, and recent completions.
 */

import { useMemo } from 'react';
import { Activity, Zap, Clock, CheckCircle, XCircle } from 'lucide-react';
import type { ExecutionMetrics, ProviderExecutionMetrics, CompletionEvent } from '../../api/operations/runs';

type ExecutionProgressProps = {
  metrics: ExecutionMetrics;
};

// Provider display names and colors
const PROVIDER_CONFIG: Record<string, { name: string; color: string; bgColor: string }> = {
  anthropic: { name: 'Anthropic', color: 'text-orange-600', bgColor: 'bg-orange-500' },
  openai: { name: 'OpenAI', color: 'text-emerald-600', bgColor: 'bg-emerald-500' },
  google: { name: 'Google', color: 'text-blue-600', bgColor: 'bg-blue-500' },
  deepseek: { name: 'DeepSeek', color: 'text-purple-600', bgColor: 'bg-purple-500' },
  xai: { name: 'xAI', color: 'text-gray-600', bgColor: 'bg-gray-500' },
  mistral: { name: 'Mistral', color: 'text-cyan-600', bgColor: 'bg-cyan-500' },
};

function getProviderConfig(provider: string) {
  return PROVIDER_CONFIG[provider] ?? {
    name: provider,
    color: 'text-gray-600',
    bgColor: 'bg-gray-500',
  };
}

/**
 * Format seconds into human-readable time.
 */
function formatTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

/**
 * Concurrency gauge showing active slots.
 */
function ConcurrencyGauge({ active, max, color }: { active: number; max: number; color: string }) {
  const slots = Array.from({ length: max }, (_, i) => i < active);

  return (
    <div className="flex items-center gap-1">
      {slots.map((isActive, i) => (
        <div
          key={i}
          className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
            isActive ? `${color} animate-pulse` : 'bg-gray-200'
          }`}
        />
      ))}
      <span className="ml-1.5 text-xs text-gray-500 tabular-nums">
        {active}/{max}
      </span>
    </div>
  );
}

/**
 * Mini progress bar for provider.
 */
function ProviderProgressBar({ provider }: { provider: ProviderExecutionMetrics }) {
  const { activeJobs, queuedJobs, maxParallel } = provider;
  const total = activeJobs + queuedJobs;
  const progress = total > 0 ? (activeJobs / total) * 100 : 0;

  return (
    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full bg-teal-500 transition-all duration-500"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

/**
 * Single provider card.
 */
function ProviderCard({ provider }: { provider: ProviderExecutionMetrics }) {
  const config = getProviderConfig(provider.provider);
  const isActive = provider.activeJobs > 0;

  return (
    <div
      className={`
        rounded-lg border p-3 transition-all duration-300
        ${isActive ? 'border-teal-200 bg-teal-50/50 shadow-sm' : 'border-gray-200 bg-white'}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isActive ? config.bgColor + ' animate-pulse' : 'bg-gray-300'}`} />
          <span className={`text-sm font-medium ${config.color}`}>{config.name}</span>
        </div>
        {isActive && (
          <Activity className="w-3.5 h-3.5 text-teal-500 animate-pulse" />
        )}
      </div>

      {/* Concurrency */}
      <div className="mb-2">
        <ConcurrencyGauge active={provider.activeJobs} max={provider.maxParallel} color={config.bgColor} />
      </div>

      {/* Rate limit indicator */}
      <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
        <Zap className="w-3 h-3" />
        <span>{provider.requestsPerMinute}/min</span>
        {provider.queuedJobs > 0 && (
          <span className="ml-auto text-amber-600">+{provider.queuedJobs} queued</span>
        )}
      </div>

      {/* Progress bar */}
      <ProviderProgressBar provider={provider} />
    </div>
  );
}

/**
 * Recent completions feed.
 */
function RecentCompletionsFeed({ completions }: { completions: CompletionEvent[] }) {
  if (completions.length === 0) {
    return null;
  }

  // Get the most recent 5 completions
  const recent = completions.slice(0, 5);

  return (
    <div className="flex items-center gap-2 overflow-x-auto py-1">
      <span className="text-xs text-gray-500 whitespace-nowrap">Recent:</span>
      {recent.map((event, i) => {
        // Truncate model name for display
        const modelShort = event.modelId.split('-').slice(0, 2).join('-');
        return (
          <div
            key={`${event.scenarioId}-${event.modelId}-${i}`}
            className={`
              flex items-center gap-1 px-2 py-0.5 rounded-full text-xs whitespace-nowrap
              ${event.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}
              animate-fadeIn
            `}
          >
            {event.success ? (
              <CheckCircle className="w-3 h-3" />
            ) : (
              <XCircle className="w-3 h-3" />
            )}
            <span className="max-w-20 truncate">{modelShort}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Main ExecutionProgress component.
 */
export function ExecutionProgress({ metrics }: ExecutionProgressProps) {
  // Filter to only show providers with activity or capacity
  const activeProviders = useMemo(() => {
    return metrics.providers.filter(
      (p) => p.activeJobs > 0 || p.queuedJobs > 0 || p.maxParallel > 0
    );
  }, [metrics.providers]);

  // Collect all recent completions
  const allCompletions = useMemo(() => {
    return metrics.providers
      .flatMap((p) => p.recentCompletions)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .slice(0, 10);
  }, [metrics.providers]);

  const hasActivity = metrics.totalActive > 0 || metrics.totalQueued > 0;

  if (activeProviders.length === 0) {
    return null;
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className={`w-4 h-4 ${hasActivity ? 'text-teal-600 animate-pulse' : 'text-gray-400'}`} />
            <span className="text-sm font-medium text-gray-700">Parallel Execution</span>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500">
            {metrics.totalActive > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                <span>{metrics.totalActive} active</span>
              </div>
            )}
            {metrics.totalQueued > 0 && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{metrics.totalQueued} queued</span>
              </div>
            )}
            {metrics.estimatedSecondsRemaining !== null && metrics.estimatedSecondsRemaining > 0 && (
              <div className="flex items-center gap-1 text-teal-600">
                <span>ETA: {formatTime(metrics.estimatedSecondsRemaining)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Provider grid */}
      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {activeProviders.map((provider) => (
            <ProviderCard key={provider.provider} provider={provider} />
          ))}
        </div>
      </div>

      {/* Recent completions feed */}
      {allCompletions.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50">
          <RecentCompletionsFeed completions={allCompletions} />
        </div>
      )}
    </div>
  );
}

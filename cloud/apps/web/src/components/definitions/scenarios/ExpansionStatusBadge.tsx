/**
 * ExpansionStatusBadge Component
 *
 * Shows the status of scenario expansion with countdown timer.
 * Extracted from ExpandedScenarios for file size reduction.
 */

import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import type { ExpansionStatus } from '../../../api/operations/definitions';

const EXPANSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return '0:00';
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatProgressMessage(status?: ExpansionStatus): string {
  const progress = status?.progress;
  if (!progress) return 'Generating...';

  // Format based on phase
  switch (progress.phase) {
    case 'starting':
      return `Starting... (${progress.expectedScenarios} expected)`;
    case 'calling_llm':
      if (progress.outputTokens > 0) {
        return `Generating... ${(progress.outputTokens / 1000).toFixed(1)}k tokens`;
      }
      return `Calling LLM... (${progress.expectedScenarios} narratives)`;
    case 'parsing':
      return `Parsing response... ${(progress.outputTokens / 1000).toFixed(1)}k tokens`;
    case 'completed':
      return `Generated ${progress.generatedScenarios} narratives`;
    case 'failed':
      return progress.message || 'Failed';
    default:
      if (progress.message) return progress.message;
      if (progress.outputTokens > 0) {
        return `${(progress.outputTokens / 1000).toFixed(1)}k tokens`;
      }
      return 'Generating...';
  }
}

export type ExpansionStatusBadgeProps = {
  status?: ExpansionStatus;
  scenarioCount?: number;
};

export function ExpansionStatusBadge({ status, scenarioCount }: ExpansionStatusBadgeProps) {
  const isExpanding = status?.status === 'PENDING' || status?.status === 'ACTIVE';
  const isCompleted = status?.status === 'COMPLETED';
  const isFailed = status?.status === 'FAILED';

  // Countdown timer state
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    if (!isExpanding || !status?.createdAt) {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const startTime = new Date(status.createdAt!).getTime();
      const elapsed = Date.now() - startTime;
      const remaining = EXPANSION_TIMEOUT_MS - elapsed;
      setCountdown(formatCountdown(remaining));
    };

    // Update immediately
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [isExpanding, status?.createdAt]);

  if (isExpanding) {
    const progressMsg = formatProgressMessage(status);
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
        <Loader2 className="w-3 h-3 animate-spin" />
        {progressMsg}
        {countdown && (
          <span className="ml-1 font-mono text-blue-500">({countdown})</span>
        )}
      </span>
    );
  }

  if (isFailed) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs" title={status?.error || 'Unknown error'}>
        <XCircle className="w-3 h-3" />
        Failed
      </span>
    );
  }

  if (isCompleted) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
        <CheckCircle2 className="w-3 h-3" />
        Ready
      </span>
    );
  }

  // No job or status is 'NONE' - show count or nothing
  if (scenarioCount === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs">
        <AlertCircle className="w-3 h-3" />
        No scenarios
      </span>
    );
  }

  return null;
}

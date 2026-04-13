import type { PerModelStats } from '../api/operations/analysis';
import type { Transcript } from '../api/operations/runs';

export const EMPTY_TRANSCRIPTS: Transcript[] = [];

export function formatTimestamp(dateString: string | null): string {
  if (dateString == null) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(ms: number | null): string {
  if (ms == null || ms === 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export function getBatchStats(
  perModel: Record<string, PerModelStats>,
  modelScenarioMatrix: Record<string, Record<string, number>> | null | undefined,
): { batches: number | '-'; detail: string } {
  const conditionCount = Object.values(modelScenarioMatrix ?? {}).reduce(
    (max, scenarios) => Math.max(max, Object.keys(scenarios ?? {}).length),
    0,
  );

  if (conditionCount === 0) {
    return { batches: '-', detail: 'Condition coverage unavailable' };
  }

  const modelBatches = Object.values(perModel).map((model) => model.sampleSize / conditionCount);
  if (modelBatches.length === 0) {
    return { batches: '-', detail: `${conditionCount} conditions per batch` };
  }

  const minBatches = Math.min(...modelBatches);
  const maxBatches = Math.max(...modelBatches);
  const completedBatches = Math.max(0, Math.floor(minBatches));

  if (Math.abs(maxBatches - minBatches) < 1e-9) {
    return { batches: completedBatches, detail: `${conditionCount} conditions per batch` };
  }

  return {
    batches: completedBatches,
    detail: `${conditionCount} conditions per batch • uneven model coverage`,
  };
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function prefixTranscriptScenarioIds(
  transcripts: Transcript[],
  prefix: 'canonical' | 'flipped',
): Transcript[] {
  return transcripts.map((transcript) => {
    if (transcript.scenarioId == null || transcript.scenarioId === '') {
      return transcript;
    }
    return { ...transcript, scenarioId: `${prefix}:${transcript.scenarioId}` };
  });
}

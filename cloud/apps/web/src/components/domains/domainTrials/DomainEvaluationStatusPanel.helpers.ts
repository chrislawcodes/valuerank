import { getBatchRuntimeState } from './launch-state';
import { formatProgressSummary } from './launch-state';

export type StatusPanelRow = {
  status: string;
  analysisStatus: string | null;
  updatedAt: string | null;
  stalledModels: string[];
  modelStatuses: Array<{
    generationCompleted: number;
    generationFailed: number;
    generationTotal: number;
    summarizationCompleted: number;
    summarizationFailed: number;
    summarizationTotal: number;
  }>;
};

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

export function getPrimaryProgressText(row: StatusPanelRow): string {
  if (row.status === 'SUMMARIZING') {
    return `${formatProgressSummary(row.modelStatuses, 'summarization')} summarized`;
  }
  if (row.analysisStatus === 'pending' || row.analysisStatus === 'computing') {
    return 'Analysis queued';
  }
  if (row.status === 'FAILED' || row.status === 'CANCELLED') {
    return row.stalledModels.length > 0
      ? `Stalled models: ${row.stalledModels.join(', ')}`
      : 'Batch failed';
  }
  if (row.status === 'COMPLETED') {
    return row.analysisStatus === 'completed' ? 'Analysis complete' : 'Completed, awaiting analysis';
  }
  return `${formatProgressSummary(row.modelStatuses, 'generation')} generated`;
}

export function getProgressPercent(row: StatusPanelRow): number {
  if (row.modelStatuses.length === 0) return 0;
  if (row.status === 'SUMMARIZING' || row.status === 'COMPLETED') {
    const completed = row.modelStatuses.reduce(
      (sum, model) => sum + model.summarizationCompleted + model.summarizationFailed,
      0,
    );
    const total = row.modelStatuses.reduce((sum, model) => sum + model.summarizationTotal, 0);
    return total > 0 ? Math.min(100, (completed / total) * 100) : 0;
  }
  const completed = row.modelStatuses.reduce(
    (sum, model) => sum + model.generationCompleted + model.generationFailed,
    0,
  );
  const total = row.modelStatuses.reduce((sum, model) => sum + model.generationTotal, 0);
  return total > 0 ? Math.min(100, (completed / total) * 100) : 0;
}

export function getProgressBarTone(row: StatusPanelRow): string {
  const runtime = getBatchRuntimeState(row);
  if (runtime === 'EXCEPTION') return 'bg-red-500';
  if (runtime === 'LIVE') return 'bg-teal-500';
  return 'bg-gray-300';
}

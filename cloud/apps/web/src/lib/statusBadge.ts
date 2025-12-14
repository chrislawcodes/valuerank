/**
 * Status to Badge Variant Mapping Utilities
 *
 * Centralizes the mapping of status strings to Badge variants for consistent
 * styling across all status indicators in the application.
 */

import type { BadgeProps } from '../components/ui/Badge';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

/**
 * Run status types from the API
 */
export type RunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PAUSED'
  | 'SUMMARIZING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

/**
 * Analysis status types
 */
export type AnalysisStatus = 'pending' | 'computing' | 'completed' | 'failed';

/**
 * Maps run status to badge variant.
 * - success: completed successfully
 * - warning: in progress (running, paused, summarizing)
 * - error: failed or cancelled
 * - info: pending/waiting
 */
export function getRunStatusVariant(status: string): BadgeVariant {
  switch (status.toUpperCase()) {
    case 'COMPLETED':
      return 'success';
    case 'RUNNING':
    case 'PAUSED':
    case 'SUMMARIZING':
      return 'warning';
    case 'FAILED':
      return 'error';
    case 'CANCELLED':
      return 'neutral';
    case 'PENDING':
    default:
      return 'info';
  }
}

/**
 * Maps analysis status to badge variant.
 */
export function getAnalysisStatusVariant(status: string): BadgeVariant {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'success';
    case 'computing':
      return 'warning';
    case 'failed':
      return 'error';
    case 'pending':
    default:
      return 'info';
  }
}

/**
 * Generic status mapper - handles both run and analysis status formats.
 * Use this when you don't know the specific status type.
 */
export function getStatusVariant(status: string): BadgeVariant {
  const normalized = status.toLowerCase();

  // Success states
  if (normalized === 'completed' || normalized === 'success') {
    return 'success';
  }

  // Warning/in-progress states
  if (['running', 'paused', 'summarizing', 'computing', 'processing'].includes(normalized)) {
    return 'warning';
  }

  // Error states
  if (normalized === 'failed' || normalized === 'error') {
    return 'error';
  }

  // Cancelled - neutral
  if (normalized === 'cancelled' || normalized === 'canceled') {
    return 'neutral';
  }

  // Pending/waiting - info
  if (normalized === 'pending' || normalized === 'waiting') {
    return 'info';
  }

  // Default
  return 'neutral';
}

/**
 * Run status display labels
 */
export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  PENDING: 'Pending',
  RUNNING: 'Running',
  PAUSED: 'Paused',
  SUMMARIZING: 'Summarizing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

/**
 * Analysis status display labels
 */
export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
  pending: 'Pending',
  computing: 'Computing',
  completed: 'Current',
  failed: 'Failed',
};

/**
 * Get human-readable label for run status
 */
export function getRunStatusLabel(status: string): string {
  const key = status.toUpperCase() as RunStatus;
  return RUN_STATUS_LABELS[key] ?? status;
}

/**
 * Get human-readable label for analysis status
 */
export function getAnalysisStatusLabel(status: string): string {
  const key = status.toLowerCase() as AnalysisStatus;
  return ANALYSIS_STATUS_LABELS[key] ?? status;
}

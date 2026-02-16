/**
 * Analysis Tabs - Shared Types
 *
 * Types and constants used across analysis tab components.
 */

import type { PerModelStats, AnalysisWarning, MethodsUsed } from '../../../api/operations/analysis';
import type { FilterState } from '../AnalysisFilters';

export type AnalysisTab = 'overview' | 'decisions' | 'scenarios' | 'stability';

export type TabDefinition = {
  id: AnalysisTab;
  label: string;
};

// Intentionally keep Analysis focused on actionable decision views.
// Agreement and Methods tabs were removed by product decision to reduce noise.
export const TABS: TabDefinition[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'scenarios', label: 'Conditions' },
  { id: 'stability', label: 'Stability' },
];

/**
 * Format a percentage value.
 */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// Re-export types for convenience
export type { PerModelStats, AnalysisWarning, FilterState, MethodsUsed };

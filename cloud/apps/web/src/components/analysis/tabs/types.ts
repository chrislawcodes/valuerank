/**
 * Analysis Tabs - Shared Types
 *
 * Types and constants used across analysis tab components.
 */

import type { PerModelStats, AnalysisWarning, MethodsUsed } from '../../../api/operations/analysis';
import type { FilterState } from '../AnalysisFilters';

export type AnalysisTab = 'overview' | 'decisions' | 'scenarios' | 'values' | 'agreement' | 'methods';

export type TabDefinition = {
  id: AnalysisTab;
  label: string;
};

export const TABS: TabDefinition[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'scenarios', label: 'Conditions' },
  { id: 'values', label: 'Values' },
  { id: 'agreement', label: 'Agreement' },
  { id: 'methods', label: 'Methods' },
];

/**
 * Format a percentage value.
 */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// Re-export types for convenience
export type { PerModelStats, AnalysisWarning, FilterState, MethodsUsed };

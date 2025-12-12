/**
 * Hook for managing comparison URL state
 *
 * URL format: /compare?runs=id1,id2&viz=overview&model=...&value=...&display=overlay
 */

import { useSearchParams, useNavigate } from 'react-router-dom';
import { useCallback, useMemo } from 'react';
import type {
  ComparisonConfig,
  ComparisonFilters,
  VisualizationType,
  DisplayMode,
} from '../components/compare/types';

// URL parameter keys
const PARAM_RUNS = 'runs';
const PARAM_VIZ = 'viz';
const PARAM_MODEL = 'model';
const PARAM_VALUE = 'value';
const PARAM_DISPLAY = 'display';

// Defaults
const DEFAULT_VIZ: VisualizationType = 'overview';
const DEFAULT_DISPLAY: DisplayMode = 'overlay';
const MAX_RUNS = 10;

// Valid visualization types
const VALID_VISUALIZATIONS: VisualizationType[] = [
  'overview',
  'decisions',
  'values',
  'timeline',
  'scenarios',
  'definition',
];

type UseComparisonStateResult = {
  /** Current configuration from URL */
  config: ComparisonConfig;
  /** Selected run IDs */
  selectedRunIds: string[];
  /** Current visualization type */
  visualization: VisualizationType;
  /** Current filters */
  filters: ComparisonFilters;
  /** Set selected run IDs */
  setSelectedRunIds: (ids: string[]) => void;
  /** Toggle a run's selection */
  toggleRunSelection: (id: string) => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Set visualization type */
  setVisualization: (viz: VisualizationType) => void;
  /** Update filters */
  updateFilters: (filters: Partial<ComparisonFilters>) => void;
  /** Reset all state */
  resetState: () => void;
};

/**
 * Validates and parses visualization type from URL
 */
function parseVisualization(value: string | null): VisualizationType {
  if (value && VALID_VISUALIZATIONS.includes(value as VisualizationType)) {
    return value as VisualizationType;
  }
  return DEFAULT_VIZ;
}

/**
 * Validates and parses display mode from URL
 */
function parseDisplayMode(value: string | null): DisplayMode {
  if (value === 'side-by-side') return 'side-by-side';
  return DEFAULT_DISPLAY;
}

/**
 * Parses run IDs from comma-separated string
 */
function parseRunIds(value: string | null): string[] {
  if (!value) return [];

  return value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .slice(0, MAX_RUNS);
}

/**
 * Hook for managing comparison state via URL parameters.
 * All state is persisted in URL for sharing and browser history support.
 */
export function useComparisonState(): UseComparisonStateResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Parse current state from URL
  const selectedRunIds = useMemo(
    () => parseRunIds(searchParams.get(PARAM_RUNS)),
    [searchParams]
  );

  const visualization = useMemo(
    () => parseVisualization(searchParams.get(PARAM_VIZ)),
    [searchParams]
  );

  const filters = useMemo<ComparisonFilters>(
    () => ({
      model: searchParams.get(PARAM_MODEL) || undefined,
      value: searchParams.get(PARAM_VALUE) || undefined,
      displayMode: parseDisplayMode(searchParams.get(PARAM_DISPLAY)),
    }),
    [searchParams]
  );

  const config = useMemo<ComparisonConfig>(
    () => ({
      runIds: selectedRunIds,
      visualization,
      filters,
    }),
    [selectedRunIds, visualization, filters]
  );

  // Update URL with new params, using replaceState for filter changes
  // and pushState for significant navigation changes (run selection, viz change)
  const updateUrl = useCallback(
    (updates: Record<string, string | undefined>, replace = false) => {
      setSearchParams(
        (prev) => {
          const newParams = new URLSearchParams(prev);

          for (const [key, value] of Object.entries(updates)) {
            if (value === undefined || value === '') {
              newParams.delete(key);
            } else {
              newParams.set(key, value);
            }
          }

          return newParams;
        },
        { replace }
      );
    },
    [setSearchParams]
  );

  // Set selected run IDs (uses pushState for history)
  const setSelectedRunIds = useCallback(
    (ids: string[]) => {
      const validIds = ids.slice(0, MAX_RUNS);
      updateUrl(
        {
          [PARAM_RUNS]: validIds.length > 0 ? validIds.join(',') : undefined,
        },
        false
      );
    },
    [updateUrl]
  );

  // Toggle a single run's selection
  const toggleRunSelection = useCallback(
    (id: string) => {
      const newIds = selectedRunIds.includes(id)
        ? selectedRunIds.filter((existingId) => existingId !== id)
        : [...selectedRunIds, id].slice(0, MAX_RUNS);

      setSelectedRunIds(newIds);
    },
    [selectedRunIds, setSelectedRunIds]
  );

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedRunIds([]);
  }, [setSelectedRunIds]);

  // Set visualization type (uses pushState for history)
  const setVisualization = useCallback(
    (viz: VisualizationType) => {
      updateUrl(
        {
          [PARAM_VIZ]: viz === DEFAULT_VIZ ? undefined : viz,
        },
        false
      );
    },
    [updateUrl]
  );

  // Update filters (uses replaceState to avoid polluting history)
  // Only updates params that are explicitly provided in newFilters
  const updateFilters = useCallback(
    (newFilters: Partial<ComparisonFilters>) => {
      const updates: Record<string, string | undefined> = {};

      // Only include params that are explicitly provided (not undefined)
      if ('model' in newFilters) {
        updates[PARAM_MODEL] = newFilters.model;
      }
      if ('value' in newFilters) {
        updates[PARAM_VALUE] = newFilters.value;
      }
      if ('displayMode' in newFilters) {
        updates[PARAM_DISPLAY] =
          newFilters.displayMode === 'side-by-side'
            ? 'side-by-side'
            : undefined;
      }

      updateUrl(updates, true);
    },
    [updateUrl]
  );

  // Reset all state
  const resetState = useCallback(() => {
    navigate('/compare', { replace: true });
  }, [navigate]);

  return {
    config,
    selectedRunIds,
    visualization,
    filters,
    setSelectedRunIds,
    toggleRunSelection,
    clearSelection,
    setVisualization,
    updateFilters,
    resetState,
  };
}

/**
 * RunSelector Component
 *
 * Multi-select list of runs available for comparison.
 * Includes search filtering and max selection limit.
 */

import { useState, useMemo } from 'react';
import { Search, RefreshCw, AlertCircle } from 'lucide-react';
import { RunSelectorItem } from './RunSelectorItem';
import { Loading } from '../ui/Loading';
import type { ComparisonRun } from '../../api/operations/comparison';

const MAX_RUNS = 10;

type RunSelectorProps = {
  /** Available runs to select from */
  runs: ComparisonRun[];
  /** Currently selected run IDs */
  selectedIds: string[];
  /** Loading state */
  loading?: boolean;
  /** Error message */
  error?: string | null;
  /** Callback when selection changes */
  onSelectionChange: (ids: string[]) => void;
  /** Callback to refetch runs */
  onRefresh?: () => void;
};

export function RunSelector({
  runs,
  selectedIds,
  loading = false,
  error,
  onSelectionChange,
  onRefresh,
}: RunSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter runs by search query
  const filteredRuns = useMemo(() => {
    if (!searchQuery.trim()) return runs;

    const query = searchQuery.toLowerCase();
    return runs.filter((run) => {
      const definitionName = run.definition?.name?.toLowerCase() || '';
      const runId = run.id.toLowerCase();
      const tags = run.definition?.tags?.map((t) => t.name.toLowerCase()) || [];

      return (
        definitionName.includes(query) ||
        runId.includes(query) ||
        tags.some((tag) => tag.includes(query))
      );
    });
  }, [runs, searchQuery]);

  // Check if we've hit the selection limit
  const atLimit = selectedIds.length >= MAX_RUNS;

  // Handle toggle
  const handleToggle = (runId: string) => {
    if (selectedIds.includes(runId)) {
      onSelectionChange(selectedIds.filter((id) => id !== runId));
    } else if (!atLimit) {
      onSelectionChange([...selectedIds, runId]);
    }
  };

  // Handle select all (visible runs, up to limit)
  const handleSelectAll = () => {
    const currentSelected = new Set(selectedIds);
    const toAdd = filteredRuns
      .filter((r) => !currentSelected.has(r.id))
      .slice(0, MAX_RUNS - selectedIds.length)
      .map((r) => r.id);

    onSelectionChange([...selectedIds, ...toAdd]);
  };

  // Handle clear selection
  const handleClearSelection = () => {
    onSelectionChange([]);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-gray-700">Select Runs</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {selectedIds.length}/{MAX_RUNS} selected
          </span>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title="Refresh runs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search runs..."
          className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
      </div>

      {/* Quick actions */}
      {filteredRuns.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={handleSelectAll}
            disabled={atLimit}
            className="text-xs text-teal-600 hover:text-teal-700 disabled:text-gray-400"
          >
            Select all
          </button>
          {selectedIds.length > 0 && (
            <>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear selection
              </button>
            </>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Run list */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {loading && runs.length === 0 ? (
          <Loading size="sm" text="Loading runs..." />
        ) : filteredRuns.length === 0 ? (
          <EmptyState hasSearch={searchQuery.length > 0} totalRuns={runs.length} />
        ) : (
          filteredRuns.map((run) => (
            <RunSelectorItem
              key={run.id}
              run={run}
              isSelected={selectedIds.includes(run.id)}
              isDisabled={atLimit && !selectedIds.includes(run.id)}
              onToggle={() => handleToggle(run.id)}
            />
          ))
        )}
      </div>

      {/* Selection limit warning */}
      {atLimit && (
        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
          Maximum {MAX_RUNS} runs can be compared at once.
        </div>
      )}
    </div>
  );
}

/**
 * Empty state when no runs match
 */
function EmptyState({ hasSearch, totalRuns }: { hasSearch: boolean; totalRuns: number }) {
  if (hasSearch) {
    return (
      <div className="text-center py-8">
        <Search className="w-8 h-8 mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-500">No runs match your search.</p>
      </div>
    );
  }

  if (totalRuns === 0) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-8 h-8 mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-500 mb-1">No runs with analysis found.</p>
        <p className="text-xs text-gray-400">
          Complete a run and generate analysis to compare results.
        </p>
      </div>
    );
  }

  return null;
}

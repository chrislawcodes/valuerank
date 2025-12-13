/**
 * Compare Page
 *
 * Cross-run comparison for analyzing differences between runs.
 * URL state: /compare?runs=id1,id2&viz=overview&model=...&display=overlay
 */

import { BarChart2 } from 'lucide-react';
import { useComparisonState } from '../hooks/useComparisonState';
import { useComparisonData } from '../hooks/useComparisonData';
import { RunSelector } from '../components/compare/RunSelector';
import { ComparisonHeader } from '../components/compare/ComparisonHeader';
import { VisualizationNav } from '../components/compare/VisualizationNav';
import { getVisualization, PlaceholderVisualization } from '../components/compare/visualizations/registry';
import { Loading } from '../components/ui/Loading';

export function Compare() {
  const {
    selectedRunIds,
    visualization,
    filters,
    setSelectedRunIds,
    toggleRunSelection,
    clearSelection,
    setVisualization,
    updateFilters,
  } = useComparisonState();

  const {
    availableRuns,
    selectedRuns,
    statistics,
    loadingAvailable,
    loadingSelected,
    error,
    refetchAvailable,
    missingAnalysisIds,
  } = useComparisonData({ selectedRunIds });

  // Get the current visualization component
  const currentViz = getVisualization(visualization);
  const VizComponent = currentViz?.component ?? PlaceholderVisualization;

  // Check if we have enough runs for comparison
  const runsWithAnalysis = selectedRuns.filter((r) => r.analysis);
  const hasEnoughRuns = runsWithAnalysis.length >= 2;

  return (
    <div className="p-6 h-[calc(100vh-4rem)]">
      <div className="h-full flex flex-col">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Compare Runs</h1>
          <p className="text-gray-600 mt-1">
            Select runs to compare analysis results across different configurations
          </p>
        </div>

        {/* Main Layout - Full width with 1/3 + 2/3 split */}
        <div className="flex-1 flex gap-6 min-h-0">
          {/* Left Panel: Run Selector (1/3 width) */}
          <div className="w-1/3 min-w-[300px] max-w-[500px] bg-white rounded-lg border border-gray-200 p-4 overflow-hidden flex flex-col shadow-sm">
            <RunSelector
              runs={availableRuns}
              selectedIds={selectedRunIds}
              loading={loadingAvailable}
              error={error?.message}
              onSelectionChange={setSelectedRunIds}
              onRefresh={refetchAvailable}
            />
          </div>

          {/* Right Panel: Comparison View (2/3 width) */}
          <div className="flex-1 bg-white rounded-lg border border-gray-200 p-4 overflow-hidden flex flex-col min-w-0 shadow-sm">
            {/* Comparison Header */}
            <ComparisonHeader
              runs={selectedRuns}
              missingAnalysisIds={missingAnalysisIds}
              onDeselect={toggleRunSelection}
              onClearAll={clearSelection}
            />

            {/* Visualization Navigation */}
            {hasEnoughRuns && (
              <VisualizationNav
                activeVisualization={visualization}
                runCount={runsWithAnalysis.length}
                onVisualizationChange={setVisualization}
                className="mb-4"
              />
            )}

            {/* Visualization Area */}
            <div className="flex-1 min-h-0 overflow-auto">
              {loadingSelected && selectedRunIds.length > 0 ? (
                <div className="flex items-center justify-center h-full">
                  <Loading size="lg" text="Loading run data..." />
                </div>
              ) : selectedRunIds.length === 0 ? (
                <EmptySelectionState />
              ) : !hasEnoughRuns ? (
                <NotEnoughRunsState runsWithAnalysis={runsWithAnalysis.length} />
              ) : (
                <VizComponent
                  runs={runsWithAnalysis}
                  filters={filters}
                  onFilterChange={updateFilters}
                  statistics={statistics ?? undefined}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state when no runs are selected
 */
function EmptySelectionState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mb-4">
        <BarChart2 className="w-8 h-8 text-teal-600" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        Cross-Run Comparison
      </h3>
      <p className="text-gray-600 max-w-md">
        Compare analysis results across multiple runs to identify patterns,
        detect model drift, and analyze the effects of definition changes.
      </p>
      <p className="text-gray-500 text-sm mt-4">
        Select 2 or more runs from the panel to begin.
      </p>
    </div>
  );
}

/**
 * State when selected runs don't have enough analysis data
 */
function NotEnoughRunsState({ runsWithAnalysis }: { runsWithAnalysis: number }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center mb-4">
        <BarChart2 className="w-8 h-8 text-yellow-600" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        Not Enough Data
      </h3>
      <p className="text-gray-600 max-w-md">
        {runsWithAnalysis === 0 ? (
          'None of the selected runs have analysis data.'
        ) : runsWithAnalysis === 1 ? (
          'Only 1 run has analysis data. Select at least 2 runs with completed analysis.'
        ) : (
          `Only ${runsWithAnalysis} runs have analysis. Select more runs with completed analysis.`
        )}
      </p>
      <p className="text-gray-500 text-sm mt-4">
        Runs need completed analysis before they can be compared.
      </p>
    </div>
  );
}

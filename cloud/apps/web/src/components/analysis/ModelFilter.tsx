/**
 * ModelFilter Component
 *
 * A collapsible model selection filter for the analysis panel.
 * Sits above the tab bar and controls which models are visible across all tabs.
 *
 * Convention for selectedModels in parent:
 * - Initialized to transcriptModelIds (all checked = Default state)
 * - "Reset to default" passes transcriptModelIds back
 * - "Clear" passes []
 * - isDefault: selectedModels length and contents equal transcriptModelIds
 * - isWarn: selectedModels.length === 0
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { Button } from '../ui/Button';

export type ModelFilterProps = {
  /** Models that have at least one transcript — shown checked by default */
  transcriptModelIds: string[];
  /** Models in perModel that have no transcripts — shown dimmed */
  noTranscriptModelIds?: string[];
  /**
   * Controlled selection.
   * Pass transcriptModelIds for "default" (all checked).
   * Pass [] for "none selected" (warn state).
   */
  selectedModels: string[];
  onSelectedModelsChange: (models: string[]) => void;
};

export function ModelFilter({
  transcriptModelIds,
  noTranscriptModelIds = [],
  selectedModels,
  onSelectedModelsChange,
}: ModelFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isDefault =
    transcriptModelIds.length > 0 &&
    selectedModels.length === transcriptModelIds.length &&
    transcriptModelIds.every((id) => selectedModels.includes(id));

  const isWarn = selectedModels.length === 0 && transcriptModelIds.length > 0;
  const isCustom = !isDefault && !isWarn;

  const handleToggle = (modelId: string) => {
    const next = selectedModels.includes(modelId)
      ? selectedModels.filter((id) => id !== modelId)
      : [...selectedModels, modelId];
    onSelectedModelsChange(next);
  };

  const handleSelectAll = () => {
    onSelectedModelsChange([...transcriptModelIds]);
  };

  const handleClear = () => {
    onSelectedModelsChange([]);
  };

  const handleResetToDefault = () => {
    onSelectedModelsChange([...transcriptModelIds]);
  };

  return (
    <div className="mb-4">
      {/* Collapsed bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <Filter className="w-3.5 h-3.5" />
          <span>Models:</span>
        </div>

        {isWarn ? (
          <span className="rounded-md bg-amber-50 border border-amber-200 px-2 py-1 text-xs text-amber-700 font-medium">
            No models selected — select at least one to view results
          </span>
        ) : isDefault ? (
          <span className="text-xs font-medium text-gray-700">Default</span>
        ) : (
          <span className="text-xs font-medium text-gray-700">
            {selectedModels.length} of {transcriptModelIds.length}
          </span>
        )}

        {isCustom && (
          // eslint-disable-next-line react/forbid-elements -- inline text link
          <button
            type="button"
            className="text-xs text-teal-600 hover:text-teal-800 underline-offset-2 hover:underline"
            onClick={handleResetToDefault}
          >
            Reset to default
          </button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-2 py-1 text-xs h-auto min-h-0"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((v) => !v)}
        >
          {isOpen ? (
            <>
              ▴ Close
              <ChevronUp className="ml-1 w-3 h-3" />
            </>
          ) : (
            <>
              ▾ Change
              <ChevronDown className="ml-1 w-3 h-3" />
            </>
          )}
        </Button>
      </div>

      {/* Expanded panel */}
      {isOpen && (
        <div
          role="group"
          aria-label="Model filter"
          className="mt-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
              Select models
            </span>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto min-h-0 px-0 py-0 text-xs font-medium text-teal-700 hover:text-teal-800"
                onClick={handleSelectAll}
              >
                Select all
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto min-h-0 px-0 py-0 text-xs font-medium text-gray-600 hover:text-gray-800"
                onClick={handleClear}
              >
                Clear
              </Button>
            </div>
          </div>

          {/* Transcript-bearing models */}
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {transcriptModelIds.map((modelId) => (
              <label key={modelId} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedModels.includes(modelId)}
                  onChange={() => handleToggle(modelId)}
                  className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="truncate flex-1" title={modelId}>
                  {modelId}
                </span>
              </label>
            ))}
          </div>

          {/* No-transcript models divider + rows */}
          {noTranscriptModelIds.length > 0 && (
            <>
              <div className="my-3 border-t border-gray-200" />
              <div className="space-y-2">
                {noTranscriptModelIds.map((modelId) => (
                  <label
                    key={modelId}
                    className="flex items-center gap-2 text-sm text-gray-400 cursor-not-allowed"
                  >
                    <input
                      type="checkbox"
                      disabled
                      checked={false}
                      readOnly
                      className="h-4 w-4 rounded border-gray-200 text-gray-300"
                    />
                    <span className="truncate flex-1" title={modelId}>
                      {modelId}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">no transcripts</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

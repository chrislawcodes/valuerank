/**
 * ModelSelector Component
 *
 * Allows users to select one or more LLM models for a run.
 * Groups models by provider and shows availability status.
 */

import { useState, useCallback } from 'react';
import { Check, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import type { AvailableModel } from '../../api/operations/models';

type ModelSelectorProps = {
  models: AvailableModel[];
  selectedModels: string[];
  onSelectionChange: (models: string[]) => void;
  disabled?: boolean;
  loading?: boolean;
};

type GroupedModels = Record<string, AvailableModel[]>;

/**
 * Group models by provider ID.
 */
function groupModelsByProvider(models: AvailableModel[]): GroupedModels {
  const groups: GroupedModels = {};
  for (const model of models) {
    const existing = groups[model.providerId];
    if (!existing) {
      groups[model.providerId] = [model];
    } else {
      existing.push(model);
    }
  }
  return groups;
}

/**
 * Format provider ID for display.
 */
function formatProviderName(providerId: string): string {
  const names: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google',
    xai: 'xAI',
    deepseek: 'DeepSeek',
    mistral: 'Mistral',
  };
  return names[providerId] ?? providerId;
}

export function ModelSelector({
  models,
  selectedModels,
  onSelectionChange,
  disabled = false,
  loading = false,
}: ModelSelectorProps) {
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  const groupedModels = groupModelsByProvider(models);
  const providerIds = Object.keys(groupedModels).sort();

  const toggleProvider = useCallback((providerId: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  }, []);

  const toggleModel = useCallback(
    (modelId: string) => {
      if (disabled) return;
      const isSelected = selectedModels.includes(modelId);
      if (isSelected) {
        onSelectionChange(selectedModels.filter((id) => id !== modelId));
      } else {
        onSelectionChange([...selectedModels, modelId]);
      }
    },
    [selectedModels, onSelectionChange, disabled]
  );

  const selectAllInProvider = useCallback(
    (providerId: string) => {
      if (disabled) return;
      const providerModels = groupedModels[providerId] ?? [];
      const availableIds = providerModels.filter((m) => m.isAvailable).map((m) => m.id);
      const allSelected = availableIds.every((id) => selectedModels.includes(id));

      if (allSelected) {
        // Deselect all from this provider
        onSelectionChange(selectedModels.filter((id) => !availableIds.includes(id)));
      } else {
        // Select all available from this provider
        const newSelection = new Set(selectedModels);
        for (const id of availableIds) {
          newSelection.add(id);
        }
        onSelectionChange(Array.from(newSelection));
      }
    },
    [groupedModels, selectedModels, onSelectionChange, disabled]
  );

  if (loading) {
    return (
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="h-8 bg-gray-200 rounded" />
          <div className="h-8 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 text-center">
        <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-600">No models available</p>
        <p className="text-gray-500 text-sm">Configure API keys in Settings</p>
      </div>
    );
  }

  const availableCount = models.filter((m) => m.isAvailable).length;
  const selectedCount = selectedModels.length;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          Select Models
        </span>
        <span className="text-sm text-gray-500">
          {selectedCount} of {availableCount} selected
        </span>
      </div>

      {/* Provider groups */}
      <div className="divide-y divide-gray-200">
        {providerIds.map((providerId) => {
          const providerModels = groupedModels[providerId] ?? [];
          const isExpanded = expandedProviders.has(providerId);
          const availableInProvider = providerModels.filter((m) => m.isAvailable);
          const selectedInProvider = availableInProvider.filter((m) =>
            selectedModels.includes(m.id)
          );
          const allSelected =
            availableInProvider.length > 0 &&
            availableInProvider.every((m) => selectedModels.includes(m.id));

          return (
            <div key={providerId}>
              {/* Provider header */}
              <button
                type="button"
                onClick={() => toggleProvider(providerId)}
                className={`w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors ${
                  disabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                disabled={disabled}
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900">
                    {formatProviderName(providerId)}
                  </span>
                  <span className="text-sm text-gray-500">
                    {selectedInProvider.length}/{availableInProvider.length} selected
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {/* Model list (expanded) */}
              {isExpanded && (
                <div className="bg-gray-50 px-4 py-2 space-y-1">
                  {/* Select all button */}
                  {availableInProvider.length > 1 && (
                    <button
                      type="button"
                      onClick={() => selectAllInProvider(providerId)}
                      className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                        allSelected
                          ? 'text-teal-700 bg-teal-50'
                          : 'text-gray-600 hover:bg-gray-100'
                      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={disabled}
                    >
                      {allSelected ? 'Deselect all' : 'Select all available'}
                    </button>
                  )}

                  {/* Individual models */}
                  {providerModels.map((model) => {
                    const isSelected = selectedModels.includes(model.id);
                    const isDisabled = disabled || !model.isAvailable;

                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => toggleModel(model.id)}
                        className={`w-full text-left px-3 py-2 rounded-md flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-teal-100 text-teal-900'
                            : 'bg-white hover:bg-gray-100 text-gray-900'
                        } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={isDisabled}
                      >
                        <div>
                          <span className="font-medium">{model.displayName}</span>
                          {!model.isAvailable && (
                            <span className="ml-2 text-xs text-amber-600">
                              (no API key)
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-teal-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

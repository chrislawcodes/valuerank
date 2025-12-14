/**
 * Model Selector Card
 *
 * Reusable component for selecting a provider and model for infrastructure tasks.
 * Used for both scenario expansion and transcript summarization models.
 */

import { AlertTriangle, Check, Cpu } from 'lucide-react';
import { Button } from '../../ui/Button';
import type { LlmModel } from '../../../api/operations/llm';
import type { ModelSelectorProps } from './types';

export function ModelSelectorCard({
  title,
  description,
  icon,
  iconBgColor,
  currentModel,
  fallbackMessage,
  providers,
  selectedProviderId,
  selectedModelId,
  onProviderChange,
  onModelChange,
  onSave,
  hasChanges,
  isSaving,
  saveSuccess,
}: ModelSelectorProps) {
  const selectedProvider = providers.find((p) => p.id === selectedProviderId);
  const availableModels = selectedProvider?.models.filter((m) => m.status === 'ACTIVE') ?? [];

  return (
    <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${iconBgColor} flex items-center justify-center`}>
            {icon}
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">
        {/* Current Configuration */}
        {currentModel && (
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500 mb-1">Currently configured:</p>
            <p className="font-medium text-gray-900">
              {currentModel.provider.displayName} / {currentModel.displayName}
            </p>
          </div>
        )}

        {!currentModel && fallbackMessage && (
          <div className="p-4 bg-yellow-50 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>{fallbackMessage}</div>
          </div>
        )}

        {/* Provider Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Provider</label>
          <select
            value={selectedProviderId}
            onChange={(e) => onProviderChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="">Select a provider...</option>
            {providers
              .filter((p) => p.isEnabled)
              .map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.displayName}
                </option>
              ))}
          </select>
        </div>

        {/* Model Selection */}
        {selectedProvider && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Model</label>
            <select
              value={selectedModelId}
              onChange={(e) => onModelChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="">Select a model...</option>
              {availableModels.map((model) => (
                <option key={model.id} value={model.modelId}>
                  {model.displayName} ({model.modelId})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Cost Info */}
        {selectedModelId && selectedProvider && (
          <ModelCostInfo models={availableModels} selectedModelId={selectedModelId} />
        )}

        {/* Save Button */}
        <div className="flex items-center justify-between pt-4">
          {saveSuccess && (
            <div className="flex items-center gap-2 text-green-600">
              <Check className="w-4 h-4" />
              <span className="text-sm">Configuration saved</span>
            </div>
          )}
          <div className="ml-auto">
            <Button
              variant="primary"
              onClick={onSave}
              disabled={!selectedProviderId || !selectedModelId || !hasChanges || isSaving}
              isLoading={isSaving}
            >
              Save Configuration
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ModelCostInfo({
  models,
  selectedModelId,
}: {
  models: LlmModel[];
  selectedModelId: string;
}) {
  const model = models.find((m) => m.modelId === selectedModelId);
  if (!model) return null;

  return (
    <div className="p-3 bg-gray-50 rounded-lg flex items-center gap-3">
      <Cpu className="w-5 h-5 text-gray-400" />
      <div className="text-sm text-gray-600">
        <span className="font-medium">{model.displayName}</span>
        <span className="mx-2">•</span>
        <span>${model.costInputPerMillion}/M input, ${model.costOutputPerMillion}/M output</span>
      </div>
    </div>
  );
}

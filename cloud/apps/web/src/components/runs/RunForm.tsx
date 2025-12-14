/**
 * RunForm Component
 *
 * Form for creating a new evaluation run with model selection
 * and configuration options.
 */

import { useState, useCallback, useEffect } from 'react';
import { Play, AlertCircle, Settings } from 'lucide-react';
import { Button } from '../ui/Button';
import { ModelSelector } from './ModelSelector';
import { CostBreakdown } from './CostBreakdown';
import { useAvailableModels } from '../../hooks/useAvailableModels';
import { useCostEstimate } from '../../hooks/useCostEstimate';
import type { StartRunInput } from '../../api/operations/runs';

type RunFormProps = {
  definitionId: string;
  scenarioCount?: number;
  onSubmit: (input: StartRunInput) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
};

type RunFormState = {
  selectedModels: string[];
  samplePercentage: number;
  showAdvanced: boolean;
};

const SAMPLE_OPTIONS = [
  { value: 1, label: '1% (test run)' },
  { value: 10, label: '10%' },
  { value: 25, label: '25%' },
  { value: 50, label: '50%' },
  { value: 100, label: '100% (full run)' },
];

export function RunForm({
  definitionId,
  scenarioCount,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: RunFormProps) {
  const { models, loading: loadingModels, error: modelsError } = useAvailableModels({
    onlyAvailable: false,
  });

  const [formState, setFormState] = useState<RunFormState>({
    selectedModels: [],
    samplePercentage: 1, // Default to 1% for testing per user's request
    showAdvanced: false,
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasPreselected, setHasPreselected] = useState(false);

  // Get all available model IDs for cost preview
  const allAvailableModelIds = models.filter((m) => m.isAvailable).map((m) => m.id);

  // Fetch cost estimate for ALL available models (so we can show preview costs)
  const {
    costEstimate: allModelsCostEstimate,
    loading: loadingCost,
    error: costError,
  } = useCostEstimate({
    definitionId,
    models: allAvailableModelIds,
    samplePercentage: formState.samplePercentage,
    pause: allAvailableModelIds.length === 0,
  });

  // Filter cost estimate to only selected models for summary display
  const costEstimate = allModelsCostEstimate
    ? (() => {
        const selectedPerModel = allModelsCostEstimate.perModel.filter((m) =>
          formState.selectedModels.includes(m.modelId)
        );
        // Only show fallback warning if ANY selected model is using fallback
        const isUsingFallback = selectedPerModel.some((m) => m.isUsingFallback);
        return {
          ...allModelsCostEstimate,
          total: selectedPerModel.reduce((sum, m) => sum + m.totalCost, 0),
          perModel: selectedPerModel,
          isUsingFallback,
          // Clear fallback reason if no selected models are using fallback
          fallbackReason: isUsingFallback ? allModelsCostEstimate.fallbackReason : null,
        };
      })()
    : null;

  // Pre-select default models when models load
  useEffect(() => {
    if (!loadingModels && models.length > 0 && !hasPreselected) {
      const defaultModels = models
        .filter((m) => m.isDefault && m.isAvailable)
        .map((m) => m.id);
      if (defaultModels.length > 0) {
        setFormState((prev) => ({ ...prev, selectedModels: defaultModels }));
      }
      setHasPreselected(true);
    }
  }, [models, loadingModels, hasPreselected]);

  const handleModelSelectionChange = useCallback((models: string[]) => {
    setFormState((prev) => ({ ...prev, selectedModels: models }));
    setValidationError(null);
  }, []);

  const handleSampleChange = useCallback((value: number) => {
    setFormState((prev) => ({ ...prev, samplePercentage: value }));
  }, []);

  const toggleAdvanced = useCallback(() => {
    setFormState((prev) => ({ ...prev, showAdvanced: !prev.showAdvanced }));
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Validate selection
      if (formState.selectedModels.length === 0) {
        setValidationError('Please select at least one model');
        return;
      }

      // Build input
      const input: StartRunInput = {
        definitionId,
        models: formState.selectedModels,
        samplePercentage: formState.samplePercentage,
      };

      try {
        await onSubmit(input);
      } catch (err) {
        // Error handling is done by parent
      }
    },
    [definitionId, formState, onSubmit]
  );

  // Calculate estimated scenario count
  const estimatedScenarios =
    scenarioCount !== undefined
      ? Math.ceil((scenarioCount * formState.samplePercentage) / 100)
      : null;

  const _totalJobs =
    estimatedScenarios !== null ? estimatedScenarios * formState.selectedModels.length : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Model Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Target Models
        </label>
        {modelsError ? (
          <div className="flex items-center gap-2 text-red-600 p-3 bg-red-50 rounded-lg">
            <AlertCircle className="w-4 h-4" />
            <span>Failed to load models: {modelsError.message}</span>
          </div>
        ) : (
          <ModelSelector
            models={models}
            selectedModels={formState.selectedModels}
            onSelectionChange={handleModelSelectionChange}
            loading={loadingModels}
            disabled={isSubmitting}
            costEstimate={costEstimate}
            allModelsCostEstimate={allModelsCostEstimate}
            costLoading={loadingCost}
          />
        )}
        {validationError && (
          <p className="mt-2 text-sm text-red-600">{validationError}</p>
        )}
      </div>

      {/* Sample Percentage */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Sample Size
        </label>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSampleChange(option.value)}
              className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                formState.samplePercentage === option.value
                  ? 'border-teal-500 bg-teal-50 text-teal-700'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isSubmitting}
            >
              {option.label}
            </button>
          ))}
        </div>
        {estimatedScenarios !== null && (
          <p className="mt-2 text-sm text-gray-500">
            ~{estimatedScenarios} scenario{estimatedScenarios !== 1 ? 's' : ''} will be probed
          </p>
        )}
      </div>

      {/* Advanced Options (collapsed by default) */}
      <div>
        <button
          type="button"
          onClick={toggleAdvanced}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <Settings className="w-4 h-4" />
          {formState.showAdvanced ? 'Hide' : 'Show'} advanced options
        </button>

        {formState.showAdvanced && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
            <p className="text-sm text-gray-500">
              Advanced options will be available in a future release.
            </p>
          </div>
        )}
      </div>

      {/* Cost Estimate Summary */}
      {formState.selectedModels.length > 0 && (
        <CostBreakdown
          costEstimate={costEstimate}
          loading={loadingCost}
          error={costError}
          compact
        />
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting || formState.selectedModels.length === 0}
        >
          {isSubmitting ? (
            'Starting Run...'
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Start Run
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

/**
 * RunForm Component
 *
 * Form for creating a new evaluation trial with model selection
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
  samplesPerScenario: number;
  showAdvanced: boolean;
};

const SAMPLE_OPTIONS = [
  { value: 1, label: '1% (test trial)' },
  { value: 10, label: '10%' },
  { value: 25, label: '25%' },
  { value: 50, label: '50%' },
  { value: 100, label: '100% (full trial)' },
];

const SAMPLES_PER_SCENARIO_OPTIONS = [
  { value: 1, label: '1 (standard)' },
  { value: 3, label: '3' },
  { value: 5, label: '5' },
  { value: 10, label: '10' },
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
    requestPolicy: 'cache-and-network',
  });

  const [formState, setFormState] = useState<RunFormState>({
    selectedModels: [],
    samplePercentage: 1, // Default to 1% (test trial)
    samplesPerScenario: 1, // Default to 1 sample (standard single-sample trial)
    showAdvanced: false,
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasUserChangedSelection, setHasUserChangedSelection] = useState(false);

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
    samplesPerScenario: formState.samplesPerScenario,
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

  // Pre-select defaults and keep them synced until user manually changes selection.
  // This allows fresh network data to update stale cached defaults.
  useEffect(() => {
    if (loadingModels || hasUserChangedSelection) {
      return;
    }

    const defaultModels = models
      .filter((m) => m.isDefault && m.isAvailable)
      .map((m) => m.id)
      .sort();

    setFormState((prev) => {
      const current = [...prev.selectedModels].sort();
      const isSameSelection =
        current.length === defaultModels.length &&
        current.every((id, index) => id === defaultModels[index]);

      if (isSameSelection) {
        return prev;
      }

      return { ...prev, selectedModels: defaultModels };
    });
  }, [models, loadingModels, hasUserChangedSelection]);

  const handleModelSelectionChange = useCallback((models: string[]) => {
    setHasUserChangedSelection(true);
    setFormState((prev) => ({ ...prev, selectedModels: models }));
    setValidationError(null);
  }, []);

  const handleSampleChange = useCallback((value: number) => {
    setFormState((prev) => ({ ...prev, samplePercentage: value }));
  }, []);

  const handleSamplesPerScenarioChange = useCallback((value: number) => {
    setFormState((prev) => ({ ...prev, samplesPerScenario: value }));
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
        samplesPerScenario: formState.samplesPerScenario,
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

  const totalJobs =
    estimatedScenarios !== null
      ? estimatedScenarios * formState.selectedModels.length * formState.samplesPerScenario
      : null;

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
            // eslint-disable-next-line react/forbid-elements -- Toggle chip requires custom styling
            <button
              key={option.value}
              type="button"
              onClick={() => handleSampleChange(option.value)}
              className={`px-3 py-2 text-sm rounded-md border transition-colors ${formState.samplePercentage === option.value
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
            ~{estimatedScenarios} narrative{estimatedScenarios !== 1 ? 's' : ''} will be probed
          </p>
        )}
      </div>

      {/* Advanced Options (collapsed by default) */}
      <div>
        {/* eslint-disable-next-line react/forbid-elements -- Accordion toggle requires custom layout */}
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
            {/* Samples per Scenario (Multi-Sample Runs) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Samples per Narrative
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Run multiple samples per narrative to measure model consistency and variance.
              </p>
              <div className="flex flex-wrap gap-2">
                {SAMPLES_PER_SCENARIO_OPTIONS.map((option) => (
                  // eslint-disable-next-line react/forbid-elements -- Toggle chip requires custom styling
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSamplesPerScenarioChange(option.value)}
                    className={`px-3 py-2 text-sm rounded-md border transition-colors ${formState.samplesPerScenario === option.value
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={isSubmitting}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {formState.samplesPerScenario > 1 && totalJobs !== null && (
                <p className="mt-2 text-sm text-gray-500">
                  {totalJobs} total probes ({estimatedScenarios} narratives × {formState.selectedModels.length} models × {formState.samplesPerScenario} samples)
                </p>
              )}
            </div>
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
            'Starting Trial...'
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Start Trial
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

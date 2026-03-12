import { Play, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { ModelSelector } from './ModelSelector';
import { CostBreakdown } from './CostBreakdown';
import { DefinitionPicker } from './DefinitionPicker';
import { RunConfigPanel } from './RunConfigPanel';
import { useRunForm } from './useRunForm';
import { useAvailableModels } from '../../hooks/useAvailableModels';
import { useCostEstimate } from '../../hooks/useCostEstimate';
import { useFinalTrialPlan } from '../../hooks/useFinalTrialPlan';
import { useRunConditionGrid } from '../../hooks/useRunConditionGrid';
import type { StartRunInput } from '../../api/operations/runs';

type RunFormProps = {
  definitionId: string;
  scenarioCount?: number;
  initialTemperature?: number | null;
  onSubmit: (input: StartRunInput) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
};

export function RunForm({
  definitionId,
  scenarioCount,
  initialTemperature = null,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: RunFormProps) {
  const { models, loading: loadingModels, error: modelsError } = useAvailableModels({
    onlyAvailable: false,
    requestPolicy: 'cache-and-network',
  });

  const {
    formState,
    validationError,
    isFinalTrial,
    isSpecificConditionTrial,
    estimatedScenarios,
    isConditionModalOpen,
    selectedConditionRowLevel,
    selectedConditionColLevel,
    selectedConditionScenarioIds,
    conditionSelectionTouched,
    modalRowLevel,
    modalColLevel,
    handleModelSelectionChange,
    handleSampleChange,
    handleSamplesPerScenarioChange,
    handleTemperatureChange,
    handleSubmit,
    handleCloseConditionModal,
    handleImmediateConditionSelect,
  } = useRunForm({
    definitionId,
    scenarioCount,
    initialTemperature,
    onSubmit,
    models,
    loadingModels,
  });

  const {
    grid: conditionGrid,
    loading: loadingConditionGrid,
    error: conditionGridError,
  } = useRunConditionGrid({
    definitionId,
    pause: !isSpecificConditionTrial && !isConditionModalOpen,
  });

  // Fetch Final Trial Plan
  const {
    plan: finalTrialPlan,
    loading: loadingFinalTrialPlan
  } = useFinalTrialPlan({
    definitionId,
    models: formState.selectedModels,
    pause: !isFinalTrial || formState.selectedModels.length === 0
  });

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
    samplePercentage: isFinalTrial
      ? 100
      : isSpecificConditionTrial && scenarioCount
        ? Math.max(1, Math.round((selectedConditionScenarioIds.length / scenarioCount) * 100))
        : formState.samplePercentage,
    samplesPerScenario: isFinalTrial ? 10 : formState.samplesPerScenario,
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

  const totalJobs = isFinalTrial
    ? (finalTrialPlan?.totalJobs ?? null)
    : estimatedScenarios !== null
      ? estimatedScenarios * formState.selectedModels.length * formState.samplesPerScenario
      : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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

      <DefinitionPicker
        samplePercentage={formState.samplePercentage}
        estimatedScenarios={estimatedScenarios}
        isFinalTrial={isFinalTrial}
        isSpecificConditionTrial={isSpecificConditionTrial}
        isSubmitting={isSubmitting}
        selectedConditionRowLevel={selectedConditionRowLevel}
        selectedConditionColLevel={selectedConditionColLevel}
        selectedConditionScenarioIds={selectedConditionScenarioIds}
        conditionSelectionTouched={conditionSelectionTouched}
        conditionGrid={conditionGrid}
        loadingConditionGrid={loadingConditionGrid}
        conditionGridError={conditionGridError}
        isConditionModalOpen={isConditionModalOpen}
        modalRowLevel={modalRowLevel}
        modalColLevel={modalColLevel}
        finalTrialPlan={finalTrialPlan}
        loadingFinalTrialPlan={loadingFinalTrialPlan}
        models={models}
        onSampleChange={handleSampleChange}
        onCloseConditionModal={handleCloseConditionModal}
        onImmediateConditionSelect={handleImmediateConditionSelect}
      />

      <RunConfigPanel
        temperatureInput={formState.temperatureInput}
        samplesPerScenario={formState.samplesPerScenario}
        estimatedScenarios={estimatedScenarios}
        selectedModelCount={formState.selectedModels.length}
        totalJobs={totalJobs}
        isFinalTrial={isFinalTrial}
        isSubmitting={isSubmitting}
        onTemperatureChange={handleTemperatureChange}
        onSamplesPerScenarioChange={handleSamplesPerScenarioChange}
      />

      {formState.selectedModels.length > 0 && (
        <CostBreakdown
          costEstimate={costEstimate}
          loading={loadingCost}
          error={costError}
          compact
        />
      )}

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
          disabled={
            isSubmitting ||
            formState.selectedModels.length === 0 ||
            (isSpecificConditionTrial && selectedConditionScenarioIds.length === 0)
          }
        >
          {isSubmitting ? (
            'Starting Trial...'
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Start {isFinalTrial ? 'Final ' : ''}Trial
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

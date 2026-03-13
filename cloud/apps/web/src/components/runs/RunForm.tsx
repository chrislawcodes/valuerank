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
import { getDefinitionMethodology } from '../../utils/methodology';

type RunFormProps = {
  definitionId: string;
  definitionContent?: unknown;
  scenarioCount?: number;
  initialTemperature?: number | null;
  onSubmit: (input: StartRunInput) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
};

export function RunForm({
  definitionId,
  definitionContent,
  scenarioCount,
  initialTemperature = null,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: RunFormProps) {
  const methodology = getDefinitionMethodology(definitionContent);
  const isJobChoiceDefinition = methodology?.family === 'job-choice';
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
    handleLaunchModeChange,
    handleSubmit,
    handleCloseConditionModal,
    handleImmediateConditionSelect,
  } = useRunForm({
    definitionId,
    scenarioCount,
    initialTemperature,
    defaultLaunchMode: 'PAIRED_BATCH',
    onSubmit: async (input) => {
      await onSubmit({
        ...input,
        launchMode: isJobChoiceDefinition ? formState.launchMode : 'STANDARD',
      });
    },
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

  const {
    plan: finalTrialPlan,
    loading: loadingFinalTrialPlan,
  } = useFinalTrialPlan({
    definitionId,
    models: formState.selectedModels,
    pause: !isFinalTrial || formState.selectedModels.length === 0,
  });

  const allAvailableModelIds = models.filter((model) => model.isAvailable).map((model) => model.id);

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

  const costEstimate = allModelsCostEstimate
    ? (() => {
        const selectedPerModel = allModelsCostEstimate.perModel.filter((model) =>
          formState.selectedModels.includes(model.modelId)
        );
        const isUsingFallback = selectedPerModel.some((model) => model.isUsingFallback);
        return {
          ...allModelsCostEstimate,
          total: selectedPerModel.reduce((sum, model) => sum + model.totalCost, 0),
          perModel: selectedPerModel,
          isUsingFallback,
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

      {isJobChoiceDefinition && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Batch Type
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                {
                  value: 'PAIRED_BATCH' as const,
                  title: 'Start Paired Batch',
                  description:
                    'Methodology-safe default. Launches both the A-first and B-first Job Choice companions when both are available.',
                },
                {
                  value: 'AD_HOC_BATCH' as const,
                  title: 'Start Ad Hoc Batch',
                  description:
                    'Exploratory only. Launches just this definition and should be treated as non-methodology-safe by default.',
                },
              ].map((option) => {
                const selected = formState.launchMode === option.value;
                return (
                  // eslint-disable-next-line react/forbid-elements -- Toggle chip requires custom styling
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleLaunchModeChange(option.value)}
                    disabled={isSubmitting}
                    className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                      selected
                        ? 'border-teal-500 bg-teal-50 text-teal-900'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="text-sm font-medium">{option.title}</div>
                    <div className="mt-1 text-xs text-gray-500">{option.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
          {methodology?.presentation_order && (
            <p className="text-xs text-gray-500">
              This vignette is currently configured as{' '}
              <span className="font-medium">
                {methodology.presentation_order === 'A_first' ? 'A-first' : 'B-first'}
              </span>
              . Paired batches use the matching companion definition to balance the order.
            </p>
          )}
        </div>
      )}

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
            isJobChoiceDefinition
              ? formState.launchMode === 'PAIRED_BATCH'
                ? 'Starting Paired Batch...'
                : 'Starting Ad Hoc Batch...'
              : 'Starting Trial...'
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              {isJobChoiceDefinition
                ? formState.launchMode === 'PAIRED_BATCH'
                  ? 'Start Paired Batch'
                  : 'Start Ad Hoc Batch'
                : `Start ${isFinalTrial ? 'Final ' : ''}Trial`}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

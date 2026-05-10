import { useEffect, useState } from 'react';
import { Play, AlertCircle } from 'lucide-react';
import { useQuery } from 'urql';
import { Button } from '../ui/Button';
import { ModelSelector } from './ModelSelector';
import { CostBreakdown } from './CostBreakdown';
import { DefinitionPicker } from './DefinitionPicker';
import { RunConfigPanel } from './RunConfigPanel';
import { BudgetWarningDialog, type OverdraftProvider } from './BudgetWarningDialog';
import { useRunForm } from './useRunForm';
import { useAvailableModels } from '../../hooks/useAvailableModels';
import { useCostEstimate } from '../../hooks/useCostEstimate';
import { useRunConditionGrid } from '../../hooks/useRunConditionGrid';
import type { StartRunInput } from '../../api/operations/runs';
import { LLM_PROVIDERS_QUERY } from '../../api/operations/llm';
import type { LlmProvidersQueryResult } from '../../api/operations/llm';
import type { CostEstimate } from '../../api/operations/costs';
import type { RunFormState } from './useRunForm';

export type RunFormStateSnapshot = {
  formState: RunFormState;
  isSpecificConditionTrial: boolean;
  selectedConditionScenarioIds: string[];
  estimatedScenarios: number | null;
};

/**
 * Check if a run's cost estimate would overdraw any provider's budget.
 * Only providers with a non-null balance are considered.
 */
export function checkBudgetOverdraft(
  costEstimate: CostEstimate | null,
  providers: LlmProvidersQueryResult['llmProviders']
): OverdraftProvider[] {
  if (!costEstimate?.perModel || costEstimate.perModel.length === 0) return [];

  // Group estimated cost by provider prefix
  const costByProvider = new Map<string, number>();
  for (const item of costEstimate.perModel) {
    const colonIdx = item.modelId.indexOf(':');
    if (colonIdx < 0) continue;
    const providerName = item.modelId.slice(0, colonIdx);
    costByProvider.set(providerName, (costByProvider.get(providerName) ?? 0) + item.totalCost);
  }

  const overdrafts: OverdraftProvider[] = [];
  for (const provider of providers) {
    if (provider.balance === null) continue;
    const estimatedCost = costByProvider.get(provider.name) ?? 0;
    if (estimatedCost > provider.balance) {
      overdrafts.push({
        name: provider.name,
        displayName: provider.displayName,
        estimatedCost,
        balance: provider.balance,
      });
    }
  }
  return overdrafts;
}

type RunFormProps = {
  definitionId: string;
  definitionContent?: unknown;
  scenarioCount?: number;
  initialTemperature?: number | null;
  copyMode?: 'trial' | 'paired-batch';
  onStateChange?: (state: RunFormStateSnapshot) => void;
  onSubmit: (input: StartRunInput) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
};

export function RunForm({
  definitionId,
  scenarioCount,
  initialTemperature = null,
  copyMode = 'trial',
  onStateChange,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: RunFormProps) {
  const [budgetOverdrafts, setBudgetOverdrafts] = useState<OverdraftProvider[]>([]);

  const [{ data: providersData }] = useQuery<LlmProvidersQueryResult>({
    query: LLM_PROVIDERS_QUERY,
    requestPolicy: 'cache-and-network',
  });

  const { models, loading: loadingModels, error: modelsError } = useAvailableModels({
    onlyAvailable: false,
    requestPolicy: 'cache-and-network',
  });

  const {
    formState,
    validationError,
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
    onSubmit: async (input) => {
      await onSubmit(input);
    },
    models,
    loadingModels,
  });

  useEffect(() => {
    onStateChange?.({
      formState,
      isSpecificConditionTrial,
      selectedConditionScenarioIds,
      estimatedScenarios,
    });
  }, [estimatedScenarios, formState, isSpecificConditionTrial, onStateChange, selectedConditionScenarioIds]);

  const {
    grid: conditionGrid,
    loading: loadingConditionGrid,
    error: conditionGridError,
  } = useRunConditionGrid({
    definitionId,
    pause: !isSpecificConditionTrial && !isConditionModalOpen,
  });

  const allAvailableModelIds = models.filter((model) => model.isAvailable).map((model) => model.id);

  const {
    costEstimate: allModelsCostEstimate,
    loading: loadingCost,
    error: costError,
  } = useCostEstimate({
    definitionId,
    models: allAvailableModelIds,
    samplePercentage: isSpecificConditionTrial && scenarioCount
      ? Math.max(1, Math.round((selectedConditionScenarioIds.length / scenarioCount) * 100))
      : formState.samplePercentage,
    samplesPerScenario: formState.samplesPerScenario,
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

  // Budget-aware form submit handler: intercepts to show warning if overdraft detected
  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    const providers = providersData?.llmProviders ?? [];
    const overdrafts = checkBudgetOverdraft(costEstimate, providers);
    if (overdrafts.length > 0) {
      e.preventDefault();
      setBudgetOverdrafts(overdrafts);
      return;
    }
    await handleSubmit(e);
  };

  const handleBudgetProceed = async () => {
    setBudgetOverdrafts([]);
    const syntheticEvent = { preventDefault: () => {} } as React.FormEvent<HTMLFormElement>;
    await handleSubmit(syntheticEvent);
  };

  const totalJobs = estimatedScenarios !== null
    ? estimatedScenarios * formState.selectedModels.length * formState.samplesPerScenario
    : null;

  return (
    <>
    {budgetOverdrafts.length > 0 && (
      <BudgetWarningDialog
        overdraftProviders={budgetOverdrafts}
        onProceed={() => { void handleBudgetProceed(); }}
        onCancel={() => { setBudgetOverdrafts([]); }}
      />
    )}
    <form onSubmit={handleFormSubmit} className="space-y-6">
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

      <div
        data-testid={copyMode === 'paired-batch' ? 'paired-batch-layout' : undefined}
        className={copyMode === 'paired-batch' ? 'grid gap-6 lg:grid-cols-2' : 'space-y-6'}
      >
        <DefinitionPicker
          copyMode={copyMode}
          samplePercentage={formState.samplePercentage}
          estimatedScenarios={estimatedScenarios}
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
          onSampleChange={handleSampleChange}
          onCloseConditionModal={handleCloseConditionModal}
          onImmediateConditionSelect={handleImmediateConditionSelect}
        />

        <RunConfigPanel
          copyMode={copyMode}
          temperatureInput={formState.temperatureInput}
          samplesPerScenario={formState.samplesPerScenario}
          estimatedScenarios={estimatedScenarios}
          selectedModelCount={formState.selectedModels.length}
          totalJobs={totalJobs}
          isSubmitting={isSubmitting}
          onTemperatureChange={handleTemperatureChange}
          onSamplesPerScenarioChange={handleSamplesPerScenarioChange}
        />
      </div>

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
              Start Trial
            </>
          )}
        </Button>
      </div>
    </form>
    </>
  );
}

import { Play, AlertCircle, AlertTriangle } from 'lucide-react';
import { useQuery } from 'urql';
import { Button } from '../ui/Button';
import { ModelSelector } from './ModelSelector';
import { CostBreakdown } from './CostBreakdown';
import { DefinitionPicker } from './DefinitionPicker';
import { RunConfigPanel } from './RunConfigPanel';
import { useRunForm } from './useRunForm';
import { useAvailableModels } from '../../hooks/useAvailableModels';
import { useCostEstimate } from '../../hooks/useCostEstimate';
import { useRunConditionGrid } from '../../hooks/useRunConditionGrid';
import type { StartRunInput } from '../../api/operations/runs';
import { getDefinitionMethodology } from '../../utils/methodology';
import { LLM_PROVIDER_BALANCES_QUERY } from '../../api/operations/llm';
import type { LlmProviderBalancesQueryResult } from '../../api/operations/llm';

type RunFormProps = {
  definitionId: string;
  definitionContent?: unknown;
  scenarioCount?: number;
  initialTemperature?: number | null;
  copyMode?: 'trial' | 'paired-batch';
  onSubmit: (input: StartRunInput) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
};

export function RunForm({
  definitionId,
  definitionContent,
  scenarioCount,
  initialTemperature = null,
  copyMode = 'trial',
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

  // Lightweight provider balance query for pre-run warning
  const [{ data: providerBalancesData }] = useQuery<LlmProviderBalancesQueryResult>({
    query: LLM_PROVIDER_BALANCES_QUERY,
    requestPolicy: 'cache-and-network',
  });

  // Compute per-provider estimated cost using modelId prefix convention
  const providerBalanceWarnings: Array<{ name: string; balance: number; cost: number }> = (() => {
    if (!costEstimate || !providerBalancesData?.llmProviders) return [];

    const costByProviderName: Record<string, number> = {};
    for (const modelCost of costEstimate.perModel) {
      const colonIdx = modelCost.modelId.indexOf(':');
      if (colonIdx <= 0) continue;
      const providerName = modelCost.modelId.slice(0, colonIdx);
      costByProviderName[providerName] =
        (costByProviderName[providerName] ?? 0) + modelCost.totalCost;
    }

    return providerBalancesData.llmProviders
      .filter((p) => {
        if (p.balance === null || p.balance === undefined) return false;
        const estimatedCost = costByProviderName[p.name] ?? 0;
        return estimatedCost > 0 && p.balance < estimatedCost;
      })
      .map((p) => ({
        name: p.name,
        balance: p.balance as number,
        cost: costByProviderName[p.name] ?? 0,
      }));
  })();

  const totalJobs = estimatedScenarios !== null
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
                    'Methodology-safe default. Launches both order variants together.',
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
        </div>
      )}

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

      {providerBalanceWarnings.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 space-y-1">
          {providerBalanceWarnings.map((w) => (
            <div key={w.name} className="flex items-start gap-2 text-sm text-yellow-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-yellow-600" />
              <span>
                <strong>Low balance:</strong> {w.name} has ${w.balance.toFixed(2)} remaining,
                estimated cost ${w.cost.toFixed(4)}. You can still proceed.
              </span>
            </div>
          ))}
        </div>
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
                : 'Start Trial'}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

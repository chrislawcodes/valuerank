import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';
import { DomainSwitcher } from '../components/domains/DomainSwitcher';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { LaunchConfirmModal } from '../components/domains/domainTrials/LaunchConfirmModal';
import { LaunchControlsPanel } from '../components/domains/domainTrials/LaunchControlsPanel';
import { buildProviderBudgetEstimates } from '../components/domains/domainTrials/launch-state';
import {
  BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION,
  DOMAIN_EVALUATION_QUERY,
  DOMAIN_TRIALS_PLAN_QUERY,
  ESTIMATE_DOMAIN_EVALUATION_COST_QUERY,
  START_DOMAIN_EVALUATION_MUTATION,
  type BackfillDomainEvaluationModelsMutationResult,
  type BackfillDomainEvaluationModelsMutationVariables,
  type DomainEvaluationQueryResult,
  type DomainEvaluationQueryVariables,
  type DomainTrialsPlanQueryResult,
  type DomainTrialsPlanQueryVariables,
  type EstimateDomainEvaluationCostQueryResult,
  type EstimateDomainEvaluationCostQueryVariables,
  type StartDomainEvaluationMutationResult,
  type StartDomainEvaluationMutationVariables,
} from '../api/operations/domains';
import { narrowEstimateConfidence } from '../api/operations/narrowings';
import { LLM_MODELS_QUERY, type LlmModelsQueryResult } from '../api/operations/llm';

type EvaluationScopeCategory = 'PRODUCTION';

export function DomainStartBatches() {
  const { domainId } = useParams<{ domainId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTemperatureParam = searchParams.get('temperature');
  const initialParsedTemperature = initialTemperatureParam == null ? Number.NaN : Number.parseFloat(initialTemperatureParam);
  const hasInitialTemperature = Number.isFinite(initialParsedTemperature) && initialParsedTemperature >= 0 && initialParsedTemperature <= 2;
  const scopeCategory: EvaluationScopeCategory = 'PRODUCTION';

  // --- Backfill mode from URL params ---
  const backfillEvaluationId = searchParams.get('evaluationId');
  const backfillModels = useMemo(() => {
    const raw = searchParams.get('models');
    if (!raw) return [];
    return raw.split(',').map((id) => id.trim()).filter((id) => id !== '');
  }, [searchParams]);
  const backfillDepth = useMemo(() => {
    const raw = searchParams.get('depth');
    if (raw == null) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 100 ? parsed : null;
  }, [searchParams]);
  const isBackfillMode = backfillEvaluationId != null;
  const [backfillDomainMismatch, setBackfillDomainMismatch] = useState(false);

  const [useDefaultTemperature, setUseDefaultTemperature] = useState(!hasInitialTemperature);
  const [temperatureInput, setTemperatureInput] = useState(hasInitialTemperature ? String(initialParsedTemperature) : '0.7');
  const [maxBudgetEnabled, setMaxBudgetEnabled] = useState(false);
  const [maxBudgetInput, setMaxBudgetInput] = useState('');
  const [targetBatchCountInput, setTargetBatchCountInput] = useState(backfillDepth != null ? String(backfillDepth) : '1');
  const [runError, setRunError] = useState<string | null>(null);
  const [showLaunchConfirm, setShowLaunchConfirm] = useState(false);

  const parsedTemperature = Number.parseFloat(temperatureInput);
  const hasValidTemperature = Number.isFinite(parsedTemperature) && parsedTemperature >= 0 && parsedTemperature <= 2;
  const selectedTemperature = !useDefaultTemperature && hasValidTemperature ? parsedTemperature : undefined;
  const parsedBudget = Number.parseFloat(maxBudgetInput);
  const hasValidBudget = Number.isFinite(parsedBudget) && parsedBudget > 0;
  const parsedTargetBatchCount = Number.parseInt(targetBatchCountInput, 10);
  const hasValidTargetBatchCount = Number.isFinite(parsedTargetBatchCount) && parsedTargetBatchCount >= 1 && parsedTargetBatchCount <= 100;
  const selectedTargetBatchCount = hasValidTargetBatchCount ? parsedTargetBatchCount : 1;

  const filteredDefinitionIds = useMemo(() => {
    const raw = searchParams.get('definitionIds');
    if (!raw) return [];
    return raw.split(',').map((id) => id.trim()).filter((id) => id !== '');
  }, [searchParams]);

  // --- Queries ---

  const [planResult] = useQuery<DomainTrialsPlanQueryResult, DomainTrialsPlanQueryVariables>({
    query: DOMAIN_TRIALS_PLAN_QUERY,
    variables: { domainId: domainId ?? '', temperature: selectedTemperature, definitionIds: filteredDefinitionIds, scopeCategory },
    pause: !domainId,
    requestPolicy: 'cache-and-network',
  });

  const [estimateResult] = useQuery<EstimateDomainEvaluationCostQueryResult, EstimateDomainEvaluationCostQueryVariables>({
    query: ESTIMATE_DOMAIN_EVALUATION_COST_QUERY,
    variables: {
      domainId: domainId ?? '',
      definitionIds: filteredDefinitionIds.length > 0 ? filteredDefinitionIds : undefined,
      temperature: selectedTemperature,
      samplePercentage: 100,
      samplesPerScenario: selectedTargetBatchCount,
      scopeCategory,
    },
    pause: !domainId,
    requestPolicy: 'cache-and-network',
  });

  const [llmModelsResult] = useQuery<LlmModelsQueryResult, { providerId?: string; status?: string }>({
    query: LLM_MODELS_QUERY,
    variables: { status: 'ACTIVE' },
    pause: !domainId,
    requestPolicy: 'cache-and-network',
  });

  const [startResult, startDomainEvaluation] = useMutation<
    StartDomainEvaluationMutationResult,
    StartDomainEvaluationMutationVariables
  >(START_DOMAIN_EVALUATION_MUTATION);

  const [backfillEvaluationResult] = useQuery<DomainEvaluationQueryResult, DomainEvaluationQueryVariables>({
    query: DOMAIN_EVALUATION_QUERY,
    variables: { id: backfillEvaluationId ?? '' },
    pause: !isBackfillMode,
    requestPolicy: 'cache-and-network',
  });

  const [backfillResult, backfillDomainEvaluationModels] = useMutation<
    BackfillDomainEvaluationModelsMutationResult,
    BackfillDomainEvaluationModelsMutationVariables
  >(BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION);

  const backfillEvaluation = backfillEvaluationResult.data?.domainEvaluation ?? null;

  // Validate evaluation belongs to this domain (FR-003a)
  useEffect(() => {
    if (!isBackfillMode || backfillEvaluationResult.fetching) return;
    if (backfillEvaluation != null && backfillEvaluation.domainId !== domainId) {
      setBackfillDomainMismatch(true);
    }
  }, [backfillEvaluation, backfillEvaluationResult.fetching, domainId, isBackfillMode]);

  const backfillModelLabel = useMemo(() => {
    if (backfillModels.length === 0) return null;
    const catalog = llmModelsResult.data?.llmModels ?? [];
    const match = catalog.find((m) => m.modelId === backfillModels[0]);
    return match?.displayName ?? backfillModels[0] ?? null;
  }, [backfillModels, llmModelsResult.data?.llmModels]);

  // --- Derived state ---

  const plan = planResult.data?.domainTrialsPlan ?? null;
  const estimate = estimateResult.data?.estimateDomainEvaluationCost ?? null;
  const modelCatalog = useMemo(() => llmModelsResult.data?.llmModels ?? [], [llmModelsResult.data?.llmModels]);
  const domainName = plan?.domainName ?? 'selected domain';
  const planModels = useMemo(() => plan?.models ?? [], [plan?.models]);
  const planModelIds = useMemo(() => new Set(planModels.map((model) => model.modelId)), [planModels]);
  const selectedModels = useMemo(
    () => modelCatalog.filter((model) => planModelIds.has(model.modelId)),
    [modelCatalog, planModelIds],
  );

  const providerBudgetEstimates = useMemo(
    () => buildProviderBudgetEstimates({
      selectedModels,
      cellEstimates: plan?.cellEstimates ?? [],
      vignettes: plan?.vignettes ?? [],
      targetBatchCount: selectedTargetBatchCount,
    }),
    [plan?.cellEstimates, plan?.vignettes, selectedModels, selectedTargetBatchCount],
  );

  const launchProviderBlocker = providerBudgetEstimates.find((provider) => !provider.budgetReady) ?? null;
  const estimatedRemainingCost = useMemo(
    () => providerBudgetEstimates.reduce((sum, provider) => sum + provider.expectedSpendUsd, 0),
    [providerBudgetEstimates],
  );

  const vignetteCount = plan?.vignettes.length ?? 0;
  const modelCount = planModels.length;
  const totalPairedBatches = hasValidTargetBatchCount ? vignetteCount * parsedTargetBatchCount : null;
  const totalTrialRuns = totalPairedBatches == null ? null : totalPairedBatches * 2;

  const providerBudgetPending = llmModelsResult.fetching || (selectedModels.length > 0 && providerBudgetEstimates.length === 0);
  const providerBudgetReady = selectedModels.length === 0
    ? true
    : providerBudgetEstimates.length > 0 && providerBudgetEstimates.every((provider) => provider.budgetReady);
  const launchDisabled = providerBudgetPending || !providerBudgetReady;
  const launchDisabledReason = providerBudgetPending
    ? 'Provider budget estimates are still loading.'
    : !providerBudgetReady
      ? `${launchProviderBlocker?.providerDisplayName ?? 'A provider'} needs more budget before launch.`
      : null;

  const temperatureLabel = useDefaultTemperature || !hasInitialTemperature || !hasValidTemperature
    ? 'Provider default'
    : String(parsedTemperature);

  // --- Handlers ---

  const handleStart = async () => {
    if (!domainId) return;
    setRunError(null);

    if (!hasValidTargetBatchCount) {
      setRunError('Enter a paired-batch depth between 1 and 100.');
      return;
    }

    if (isBackfillMode && !backfillDomainMismatch && backfillEvaluationId != null) {
      const result = await backfillDomainEvaluationModels({
        domainEvaluationId: backfillEvaluationId,
        modelIds: backfillModels,
        targetBatchCount: selectedTargetBatchCount,
      });

      if (result.error) {
        setRunError(result.error.message);
        return;
      }

      const payload = result.data?.backfillDomainEvaluationModels;
      if (!payload) {
        setRunError('Failed to start the gap fill.');
        return;
      }

      setShowLaunchConfirm(false);
      navigate(`/domains/status/${domainId}?evaluationId=${backfillEvaluationId}`);

      if (payload.startedRuns === 0) {
        setRunError('No new runs were started. The gap may already be filled or still in flight.');
      }
      return;
    }

    if (!useDefaultTemperature && !hasValidTemperature) {
      setRunError('Temperature must be between 0 and 2.');
      return;
    }
    if (maxBudgetEnabled && !hasValidBudget) {
      setRunError('Budget cap must be a number greater than 0.');
      return;
    }
    if (launchDisabled) {
      setRunError(launchDisabledReason ?? 'Launch is currently blocked.');
      return;
    }

    void startDomainEvaluation({
      domainId,
      scopeCategory,
      temperature: useDefaultTemperature || !hasValidTemperature ? undefined : parsedTemperature,
      maxBudgetUsd: maxBudgetEnabled ? parsedBudget : undefined,
      definitionIds: filteredDefinitionIds.length > 0 ? filteredDefinitionIds : undefined,
      samplePercentage: 100,
      targetBatchCount: selectedTargetBatchCount,
    });

    setShowLaunchConfirm(false);
    navigate(`/domains/status/${domainId}`);
  };

  // --- Render ---

  if (!domainId) return <ErrorMessage message="Missing domain id." />;

  const displayError = planResult.error ?? estimateResult.error ?? undefined;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Start Paired Batches</div>
        <DomainSwitcher currentDomainId={domainId} basePath="/domains/start" />
      </div>

      {displayError != null && <ErrorMessage message={`Failed to load launch data: ${displayError.message ?? 'Unknown error'}`} />}
      {runError != null && <ErrorMessage message={runError} />}

      {isBackfillMode && !backfillDomainMismatch && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span className="font-medium">Filling gap</span>
          {backfillModelLabel != null ? ` for ${backfillModelLabel}` : ''}
          {backfillEvaluationId != null ? ` in evaluation ${backfillEvaluationId.slice(-8)}` : ''}
          . Adjust the batch depth below if needed, then confirm.
        </div>
      )}
      {backfillDomainMismatch && (
        <ErrorMessage message="The evaluation does not belong to this domain. Showing the standard launch form instead." />
      )}

      <section className="space-y-4">
        <LaunchControlsPanel
          hideAdvancedControls={isBackfillMode && !backfillDomainMismatch}
          useDefaultTemperature={useDefaultTemperature}
          disableTemperatureInput={plan?.models.some((model) => !model.supportsTemperature) ?? false}
          temperatureInput={temperatureInput}
          maxBudgetEnabled={maxBudgetEnabled}
          maxBudgetInput={maxBudgetInput}
          hasValidBudget={hasValidBudget}
          targetBatchCountInput={targetBatchCountInput}
          hasValidTargetBatchCount={hasValidTargetBatchCount}
          isStarting={startResult.fetching || backfillResult.fetching}
          temperatureWarning={estimate?.temperatureWarning ?? plan?.temperatureWarning}
          providerBudgetEstimates={providerBudgetEstimates}
          launchDisabled={launchDisabled}
          launchDisabledReason={launchDisabledReason}
          onSetUseDefaultTemperature={setUseDefaultTemperature}
          onSetTemperatureInput={setTemperatureInput}
          onSetMaxBudgetEnabled={setMaxBudgetEnabled}
          onSetMaxBudgetInput={setMaxBudgetInput}
          onSetTargetBatchCountInput={setTargetBatchCountInput}
          onOpenConfirm={() => setShowLaunchConfirm(true)}
        />
      </section>

      <LaunchConfirmModal
        open={showLaunchConfirm}
        domainName={domainName}
        vignetteCount={vignetteCount}
        modelCount={modelCount}
        totalPairedBatches={totalPairedBatches}
        totalTrialRuns={totalTrialRuns}
        estimatedTotalCost={estimatedRemainingCost}
        estimateConfidence={narrowEstimateConfidence(estimate?.estimateConfidence)}
        fallbackReason={estimate?.fallbackReason}
        knownExclusions={estimate?.knownExclusions}
        temperatureLabel={temperatureLabel}
        budgetCap={maxBudgetEnabled && hasValidBudget ? parsedBudget : null}
        targetBatchCount={hasValidTargetBatchCount ? parsedTargetBatchCount : 1}
        reviewSetupHref={`/domains?domainId=${domainId}&tab=setup&setupTab=contexts`}
        reviewVignettesHref={`/domains?domainId=${domainId}&tab=vignettes`}
        isStarting={startResult.fetching}
        onCancel={() => setShowLaunchConfirm(false)}
        onConfirm={() => void handleStart()}
      />
    </div>
  );
}

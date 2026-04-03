import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from 'urql';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { BackfillConfirmModal } from '../components/domains/domainTrials/BackfillConfirmModal';
import { LaunchConfirmModal } from '../components/domains/domainTrials/LaunchConfirmModal';
import { LaunchControlsPanel } from '../components/domains/domainTrials/LaunchControlsPanel';
import { DomainEvaluationStatusPanel } from '../components/domains/domainTrials/DomainEvaluationStatusPanel';
import { DomainEvaluationStatusDrawer } from '../components/domains/domainTrials/DomainEvaluationStatusDrawer';
import { buildProviderBudgetEstimates, getBatchRuntimeState } from '../components/domains/domainTrials/launch-state';
import {
  BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION,
  DOMAIN_EVALUATION_QUERY,
  DOMAIN_EVALUATION_STATUS_QUERY,
  DOMAIN_EVALUATIONS_QUERY,
  DOMAIN_TRIAL_RUNS_STATUS_QUERY,
  DOMAIN_TRIALS_PLAN_QUERY,
  ESTIMATE_DOMAIN_EVALUATION_COST_QUERY,
  START_DOMAIN_EVALUATION_MUTATION,
  type BackfillDomainEvaluationModelsMutationResult,
  type BackfillDomainEvaluationModelsMutationVariables,
  type DomainEvaluationQueryResult,
  type DomainEvaluationQueryVariables,
  type DomainEvaluationStatusQueryResult,
  type DomainEvaluationStatusQueryVariables,
  type DomainEvaluationsQueryResult,
  type DomainEvaluationsQueryVariables,
  type DomainTrialRunsStatusQueryResult,
  type DomainTrialRunsStatusQueryVariables,
  type DomainTrialsPlanQueryResult,
  type DomainTrialsPlanQueryVariables,
  type EstimateDomainEvaluationCostQueryResult,
  type EstimateDomainEvaluationCostQueryVariables,
  type StartDomainEvaluationMutationResult,
  type StartDomainEvaluationMutationVariables,
} from '../api/operations/domains';
import { LLM_MODELS_QUERY, type LlmModelsQueryResult } from '../api/operations/llm';

const POLL_MS = 5000;
type EvaluationScopeCategory = 'PRODUCTION';
type LaunchableDefinition = NonNullable<NonNullable<DomainEvaluationQueryResult['domainEvaluation']>['launchableDefinitions']>[number];
type BackfillGroup = {
  groupKey: string;
  definitions: LaunchableDefinition[];
};
type BackfillCandidate = {
  modelId: string;
  label: string;
  isActive: boolean;
  missingBatchGroups: number;
  missingRuns: number;
  groupGaps: Array<{
    groupKey: string;
    missingDepth: number;
    definitions: LaunchableDefinition[];
  }>;
};

function coverageKey(definitionId: string, modelId: string): string {
  return `${definitionId}::${modelId}`;
}

export function DomainTrialsDashboard() {
  const { domainId } = useParams<{ domainId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTemperatureParam = searchParams.get('temperature');
  const initialParsedTemperature = initialTemperatureParam == null ? Number.NaN : Number.parseFloat(initialTemperatureParam);
  const hasInitialTemperature = Number.isFinite(initialParsedTemperature) && initialParsedTemperature >= 0 && initialParsedTemperature <= 2;
  const scopeCategory: EvaluationScopeCategory = 'PRODUCTION';
  const [useDefaultTemperature, setUseDefaultTemperature] = useState(!hasInitialTemperature);
  const [temperatureInput, setTemperatureInput] = useState(hasInitialTemperature ? String(initialParsedTemperature) : '0.7');
  const [maxBudgetEnabled, setMaxBudgetEnabled] = useState(false);
  const [maxBudgetInput, setMaxBudgetInput] = useState('');
  const [targetBatchCountInput, setTargetBatchCountInput] = useState('1');
  const [backfillTargetBatchCountInput, setBackfillTargetBatchCountInput] = useState('1');
  const [runError, setRunError] = useState<string | null>(null);
  const [showLaunchConfirm, setShowLaunchConfirm] = useState(false);
  const [showBackfillConfirm, setShowBackfillConfirm] = useState(false);
  const [definitionRunIds, setDefinitionRunIds] = useState<Record<string, string>>({});
  const [currentEvaluationId, setCurrentEvaluationId] = useState<string | null>(searchParams.get('evaluationId'));
  const [lastStatusUpdatedAt, setLastStatusUpdatedAt] = useState<number | null>(null);
  const [selectedBackfillModelId, setSelectedBackfillModelId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [planNoContentRetries, setPlanNoContentRetries] = useState(0);
  const [statusNoContentRetries, setStatusNoContentRetries] = useState(0);

  const parsedTemperature = Number.parseFloat(temperatureInput);
  const hasValidTemperature = Number.isFinite(parsedTemperature) && parsedTemperature >= 0 && parsedTemperature <= 2;
  const selectedTemperature = !useDefaultTemperature && hasValidTemperature ? parsedTemperature : undefined;
  const parsedBudget = Number.parseFloat(maxBudgetInput);
  const hasValidBudget = Number.isFinite(parsedBudget) && parsedBudget > 0;
  const parsedTargetBatchCount = Number.parseInt(targetBatchCountInput, 10);
  const hasValidTargetBatchCount = Number.isFinite(parsedTargetBatchCount) && parsedTargetBatchCount >= 1 && parsedTargetBatchCount <= 100;
  const selectedTargetBatchCount = hasValidTargetBatchCount ? parsedTargetBatchCount : 1;
  const parsedBackfillTargetBatchCount = Number.parseInt(backfillTargetBatchCountInput, 10);
  const hasValidBackfillTargetBatchCount = Number.isFinite(parsedBackfillTargetBatchCount)
    && parsedBackfillTargetBatchCount >= 1
    && parsedBackfillTargetBatchCount <= 100;
  const selectedBackfillTargetBatchCount = hasValidBackfillTargetBatchCount ? parsedBackfillTargetBatchCount : 1;

  const filteredDefinitionIds = useMemo(() => {
    const raw = searchParams.get('definitionIds');
    if (!raw) return [];
    return raw
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== '');
  }, [searchParams]);
  const filteredDefinitionIdCount = useMemo(() => new Set(filteredDefinitionIds).size, [filteredDefinitionIds]);

  const [planResult, refetchPlan] = useQuery<DomainTrialsPlanQueryResult, DomainTrialsPlanQueryVariables>({
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
  const [launchesResult, refetchLaunches] = useQuery<DomainEvaluationsQueryResult, DomainEvaluationsQueryVariables>({
    query: DOMAIN_EVALUATIONS_QUERY,
    variables: { domainId: domainId ?? '', limit: 1 },
    pause: !domainId,
    requestPolicy: 'cache-and-network',
  });
  const [currentEvaluationResult, refetchCurrentEvaluation] = useQuery<DomainEvaluationQueryResult, DomainEvaluationQueryVariables>({
    query: DOMAIN_EVALUATION_QUERY,
    variables: { id: currentEvaluationId ?? '' },
    pause: !currentEvaluationId,
    requestPolicy: 'cache-and-network',
  });
  const [currentEvaluationStatusResult, refetchCurrentEvaluationStatus] = useQuery<
    DomainEvaluationStatusQueryResult,
    DomainEvaluationStatusQueryVariables
  >({
    query: DOMAIN_EVALUATION_STATUS_QUERY,
    variables: { id: currentEvaluationId ?? '' },
    pause: !currentEvaluationId,
    requestPolicy: 'network-only',
  });
  const [statusResult, refetchStatus] = useQuery<DomainTrialRunsStatusQueryResult, DomainTrialRunsStatusQueryVariables>({
    query: DOMAIN_TRIAL_RUNS_STATUS_QUERY,
    variables: { runIds: Array.from(new Set(Object.values(definitionRunIds))) },
    pause: Object.keys(definitionRunIds).length === 0,
    requestPolicy: 'network-only',
  });
  const [startDomainEvaluationResult, startDomainEvaluation] = useMutation<
    StartDomainEvaluationMutationResult,
    StartDomainEvaluationMutationVariables
  >(START_DOMAIN_EVALUATION_MUTATION);
  const [backfillDomainEvaluationResult, backfillDomainEvaluationModels] = useMutation<
    BackfillDomainEvaluationModelsMutationResult,
    BackfillDomainEvaluationModelsMutationVariables
  >(BACKFILL_DOMAIN_EVALUATION_MODELS_MUTATION);

  useEffect(() => {
    const existingEvaluationId = searchParams.get('evaluationId');
    if (existingEvaluationId === currentEvaluationId) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    if (currentEvaluationId) next.set('evaluationId', currentEvaluationId);
    else next.delete('evaluationId');
    setSearchParams(next, { replace: true });
  }, [currentEvaluationId, searchParams, setSearchParams]);

  const plan = planResult.data?.domainTrialsPlan ?? null;
  const estimate = estimateResult.data?.estimateDomainEvaluationCost ?? null;
  const modelCatalog = useMemo(() => llmModelsResult.data?.llmModels ?? [], [llmModelsResult.data?.llmModels]);
  const currentEvaluation = currentEvaluationResult.data?.domainEvaluation ?? null;
  const currentEvaluationStatus = currentEvaluationStatusResult.data?.domainEvaluationStatus ?? null;
  const runStatuses = useMemo(() => statusResult.data?.domainTrialRunsStatus ?? [], [statusResult.data?.domainTrialRunsStatus]);
  const launches = launchesResult.data?.domainEvaluations ?? [];
  const latestLaunch = launches[0] ?? null;
  const domainName = plan?.domainName ?? latestLaunch?.domainNameAtLaunch ?? 'selected domain';
  const planModels = useMemo(() => plan?.models ?? [], [plan?.models]);
  const planModelIds = useMemo(() => new Set(planModels.map((model) => model.modelId)), [planModels]);
  const activeModelCatalogById = useMemo(
    () => new Map(modelCatalog.map((model) => [model.modelId, model])),
    [modelCatalog],
  );
  const currentLaunchableDefinitions = useMemo(
    () => currentEvaluation?.launchableDefinitions ?? [],
    [currentEvaluation?.launchableDefinitions],
  );
  const suggestedBackfillTargetBatchCount = currentEvaluation?.targetBatchCount ?? 1;
  const backfillGroups = useMemo<BackfillGroup[]>(() => {
    if (currentLaunchableDefinitions.length === 0) {
      return [];
    }

    const groupedPairs = new Map<string, LaunchableDefinition[]>();
    const groups: BackfillGroup[] = [];

    for (const definition of currentLaunchableDefinitions) {
      if (!definition.pairKey) {
        groups.push({
          groupKey: `single:${definition.definitionId}`,
          definitions: [definition],
        });
        continue;
      }
      const bucket = groupedPairs.get(definition.pairKey) ?? [];
      bucket.push(definition);
      groupedPairs.set(definition.pairKey, bucket);
    }

    for (const [pairKey, definitions] of groupedPairs) {
      if (definitions.length === 2) {
        groups.push({
          groupKey: `pair:${pairKey}`,
          definitions,
        });
        continue;
      }
      for (const definition of definitions) {
        groups.push({
          groupKey: `single:${definition.definitionId}`,
          definitions: [definition],
        });
      }
    }

    return groups;
  }, [currentLaunchableDefinitions]);
  const backfillCoverageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const member of currentEvaluation?.members ?? []) {
      for (const modelId of member.modelIds) {
        const key = coverageKey(member.definitionIdAtLaunch, modelId);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  }, [currentEvaluation]);
  const backfillCandidates = useMemo<BackfillCandidate[]>(() => {
    if (!currentEvaluation) {
      return [];
    }

    return currentEvaluation.models
      .map((modelId) => {
        const groupGaps: BackfillCandidate['groupGaps'] = [];
        let missingBatchGroups = 0;
        let missingRuns = 0;

        for (const group of backfillGroups) {
          const groupCoverage = group.definitions.reduce((min, definition) => {
            const count = backfillCoverageCounts.get(coverageKey(definition.definitionId, modelId)) ?? 0;
            return Math.min(min, count);
          }, Number.POSITIVE_INFINITY);
          const coverage = Number.isFinite(groupCoverage) ? groupCoverage : 0;
          const missingDepth = Math.max(0, selectedBackfillTargetBatchCount - coverage);
          if (missingDepth === 0) {
            continue;
          }
          missingBatchGroups += missingDepth;
          missingRuns += missingDepth * group.definitions.length;
          groupGaps.push({
            groupKey: group.groupKey,
            missingDepth,
            definitions: group.definitions,
          });
        }

        return {
          modelId,
          label: activeModelCatalogById.get(modelId)?.displayName ?? modelId,
          isActive: activeModelCatalogById.has(modelId),
          missingBatchGroups,
          missingRuns,
          groupGaps,
        };
      })
      .filter((candidate) => candidate.missingBatchGroups > 0);
  }, [activeModelCatalogById, backfillCoverageCounts, backfillGroups, currentEvaluation, selectedBackfillTargetBatchCount]);
  const activeBackfillCandidates = useMemo(
    () => backfillCandidates.filter((candidate) => candidate.isActive),
    [backfillCandidates],
  );
  const inactiveBackfillCandidates = useMemo(
    () => backfillCandidates.filter((candidate) => !candidate.isActive),
    [backfillCandidates],
  );
  const selectedBackfillCandidate = useMemo(
    () => activeBackfillCandidates.find((candidate) => candidate.modelId === selectedBackfillModelId) ?? null,
    [activeBackfillCandidates, selectedBackfillModelId],
  );
  const [backfillEstimateResult] = useQuery<EstimateDomainEvaluationCostQueryResult, EstimateDomainEvaluationCostQueryVariables>({
    query: ESTIMATE_DOMAIN_EVALUATION_COST_QUERY,
    variables: {
      domainId: currentEvaluation?.domainId ?? domainId ?? '',
      definitionIds: currentEvaluation?.launchableDefinitionIds ?? [],
      modelIds: selectedBackfillCandidate ? [selectedBackfillCandidate.modelId] : undefined,
      temperature: currentEvaluation?.temperature ?? undefined,
      samplePercentage: currentEvaluation?.samplePercentage ?? undefined,
      samplesPerScenario: currentEvaluation?.samplesPerScenario ?? undefined,
      scopeCategory: currentEvaluation?.scopeCategory,
    },
    pause:
      !currentEvaluation
      || !selectedBackfillCandidate
      || (currentEvaluation.launchableDefinitionIds?.length ?? 0) === 0
      || currentEvaluation.samplePercentage == null
      || currentEvaluation.samplesPerScenario == null,
    requestPolicy: 'cache-and-network',
  });
  const backfillEstimate = backfillEstimateResult.data?.estimateDomainEvaluationCost ?? null;
  const backfillEstimateByDefinitionId = useMemo(
    () => new Map((backfillEstimate?.definitions ?? []).map((definition) => [definition.definitionId, definition.estimatedCost])),
    [backfillEstimate?.definitions],
  );
  const backfillEstimatedCost = useMemo(() => {
    if (!selectedBackfillCandidate || !backfillEstimate) {
      return null;
    }
    return selectedBackfillCandidate.groupGaps.reduce((sum, gap) => (
      sum + gap.missingDepth * gap.definitions.reduce(
        (groupSum, definition) => groupSum + (backfillEstimateByDefinitionId.get(definition.definitionId) ?? 0),
        0,
      )
    ), 0);
  }, [backfillEstimate, backfillEstimateByDefinitionId, selectedBackfillCandidate]);
  const backfillBlockedReason = useMemo(() => {
    if (!currentEvaluation) {
      return 'Pick an existing batch first.';
    }
    if (!hasValidBackfillTargetBatchCount) {
      return 'Enter a paired-batch depth between 1 and 100.';
    }
    if ((currentEvaluation.launchableDefinitionIds?.length ?? 0) === 0 || currentLaunchableDefinitions.length === 0) {
      return 'This batch is missing its saved vignette snapshot, so dashboard backfill is blocked.';
    }
    if (currentEvaluation.samplePercentage == null || currentEvaluation.samplesPerScenario == null) {
      return 'This batch is missing saved run settings, so dashboard backfill is blocked.';
    }
    if (activeBackfillCandidates.length === 0) {
      if (inactiveBackfillCandidates.length > 0) {
        return 'The missing models in this batch are no longer active.';
      }
      return 'No missing active models were found in this batch.';
    }
    if (!selectedBackfillCandidate) {
      return 'Pick one missing model to backfill.';
    }
    if (backfillEstimateResult.error) {
      return 'Failed to load the backfill estimate.';
    }
    if (backfillEstimateResult.fetching) {
      return 'Backfill estimate is still loading.';
    }
    if (backfillEstimate && backfillEstimate.definitions.length !== (currentEvaluation.launchableDefinitionIds?.length ?? 0)) {
      return 'This batch points at vignette versions that are no longer available for planning, so dashboard backfill is blocked.';
    }
    return null;
  }, [
    activeBackfillCandidates.length,
    backfillEstimate,
    backfillEstimateResult.error,
    backfillEstimateResult.fetching,
    currentEvaluation,
    currentLaunchableDefinitions.length,
    hasValidBackfillTargetBatchCount,
    inactiveBackfillCandidates.length,
    selectedBackfillCandidate,
  ]);
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

  const hasPendingLaunchSnapshot = currentEvaluationId != null && (currentEvaluationStatusResult.fetching || statusResult.fetching);
  const hasLiveRows = runStatuses.some((status) => getBatchRuntimeState(status) === 'LIVE');
  const providerBudgetPending = llmModelsResult.fetching || (selectedModels.length > 0 && providerBudgetEstimates.length === 0);
  const providerBudgetReady = selectedModels.length === 0
    ? true
    : providerBudgetEstimates.length > 0 && providerBudgetEstimates.every((provider) => provider.budgetReady);
  const launchDisabled = hasPendingLaunchSnapshot || hasLiveRows || providerBudgetPending || !providerBudgetReady;
  const launchDisabledReason = hasPendingLaunchSnapshot
    ? 'Refreshing the current launch.'
    : hasLiveRows
      ? 'A launch is already active for this domain.'
      : providerBudgetPending
        ? 'Provider budget estimates are still loading.'
      : !providerBudgetReady
        ? `${launchProviderBlocker?.providerDisplayName ?? 'A provider'} needs more budget before launch.`
      : null;

  useEffect(() => {
    if (!currentEvaluationId && latestLaunch) {
      setCurrentEvaluationId(latestLaunch.id);
    }
  }, [currentEvaluationId, latestLaunch]);

  useEffect(() => {
    if (!currentEvaluationId) return;
    setBackfillTargetBatchCountInput(String(suggestedBackfillTargetBatchCount));
  }, [currentEvaluationId, suggestedBackfillTargetBatchCount]);

  useEffect(() => {
    if (activeBackfillCandidates.length === 0) {
      setSelectedBackfillModelId(null);
      return;
    }
    if (selectedBackfillModelId && activeBackfillCandidates.some((candidate) => candidate.modelId === selectedBackfillModelId)) {
      return;
    }
    setSelectedBackfillModelId(activeBackfillCandidates[0]?.modelId ?? null);
  }, [activeBackfillCandidates, selectedBackfillModelId]);

  useEffect(() => {
    if (!currentEvaluation) return;
    const byRunId: Record<string, string> = {};
    for (const member of currentEvaluation.members) {
      byRunId[member.runId] = member.runId;
    }
    setDefinitionRunIds((prev) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(byRunId);
      if (prevKeys.length === nextKeys.length && nextKeys.every((key) => prev[key] === byRunId[key])) {
        return prev;
      }
      return byRunId;
    });
  }, [currentEvaluation]);

  useEffect(() => {
    if (!selectedRunId) return;
    if (!runStatuses.some((status) => status.runId === selectedRunId)) {
      setSelectedRunId(null);
    }
  }, [runStatuses, selectedRunId]);

  useEffect(() => {
    const message = planResult.error?.message ?? '';
    if (!message.includes('No Content')) return;
    if (planNoContentRetries >= 2) return;

    const timer = window.setTimeout(() => {
      setPlanNoContentRetries((prev) => prev + 1);
      refetchPlan({ requestPolicy: 'network-only' });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [planNoContentRetries, planResult.error?.message, refetchPlan]);

  useEffect(() => {
    const message = statusResult.error?.message ?? '';
    if (!message.includes('No Content')) return;
    if (statusNoContentRetries >= 2) return;

    const timer = window.setTimeout(() => {
      setStatusNoContentRetries((prev) => prev + 1);
      refetchStatus({ requestPolicy: 'network-only' });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [refetchStatus, statusNoContentRetries, statusResult.error?.message]);

  useEffect(() => {
    if (!currentEvaluationId || runStatuses.length === 0 || !hasLiveRows) return;
    const interval = window.setInterval(() => {
      refetchStatus({ requestPolicy: 'network-only' });
      refetchCurrentEvaluationStatus({ requestPolicy: 'network-only' });
      refetchCurrentEvaluation({ requestPolicy: 'network-only' });
      setLastStatusUpdatedAt(Date.now());
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, [
    currentEvaluationId,
    hasLiveRows,
    refetchCurrentEvaluation,
    refetchCurrentEvaluationStatus,
    refetchStatus,
    runStatuses.length,
  ]);

  if (!domainId) return <ErrorMessage message="Missing domain id." />;

  const planErrorMessage = planResult.error?.message ?? '';
  const statusErrorMessage = statusResult.error?.message ?? '';
  const suppressPlanNoContentError = planErrorMessage.includes('No Content') && planNoContentRetries < 2;
  const suppressStatusNoContentError = statusErrorMessage.includes('No Content') && statusNoContentRetries < 2;
  const displayError = (suppressPlanNoContentError ? undefined : planResult.error)
    ?? (estimateResult.error ?? undefined)
    ?? (currentEvaluation ? backfillEstimateResult.error ?? undefined : undefined)
    ?? (currentEvaluationId ? currentEvaluationResult.error ?? currentEvaluationStatusResult.error ?? undefined : undefined)
    ?? (suppressStatusNoContentError ? undefined : statusResult.error);

  const hasLaunchSnapshot = currentEvaluation != null || currentEvaluationId != null;
  const temperatureLabel = useDefaultTemperature || !hasInitialTemperature || !hasValidTemperature
    ? 'Provider default'
    : String(parsedTemperature);
  const statusHeader = hasLaunchSnapshot
    ? `Current launch: ${currentEvaluation?.id ?? currentEvaluationId?.slice(-8) ?? 'unknown'}`
    : null;

  const handleStart = async () => {
    if (!domainId) return;
    setRunError(null);

    if (!hasValidTargetBatchCount) {
      setRunError('Enter a paired-batch depth between 1 and 100.');
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
      setRunError(launchDisabledReason ?? 'A launch is already active for this domain.');
      return;
    }

    const result = await startDomainEvaluation({
      domainId,
      scopeCategory,
      temperature: useDefaultTemperature || !hasValidTemperature ? undefined : parsedTemperature,
      maxBudgetUsd: maxBudgetEnabled ? parsedBudget : undefined,
      definitionIds: filteredDefinitionIds.length > 0 ? filteredDefinitionIds : undefined,
      samplePercentage: 100,
      targetBatchCount: selectedTargetBatchCount,
    });

    if (result.error) {
      setRunError(result.error.message);
      return;
    }

    const payload = result.data?.startDomainEvaluation;
    if (!payload) {
      setRunError('Failed to start paired batches.');
      return;
    }
    if (payload.blockedByActiveLaunch) {
      setRunError('An equivalent active launch is already running for this domain.');
      return;
    }

    const byRunId: Record<string, string> = {};
    for (const run of payload.runs) {
      byRunId[run.runId] = run.runId;
    }
    setDefinitionRunIds(byRunId);
    setCurrentEvaluationId(payload.domainEvaluationId);
    setShowLaunchConfirm(false);
    setSelectedRunId(null);

    refetchCurrentEvaluation({ requestPolicy: 'network-only' });
    refetchCurrentEvaluationStatus({ requestPolicy: 'network-only' });
    refetchLaunches({ requestPolicy: 'network-only' });
    refetchStatus({ requestPolicy: 'network-only' });
    setLastStatusUpdatedAt(Date.now());

    if (payload.startedRuns === 0) {
      setRunError('No runs were started. Check launch status below for failed starts.');
    }
  };

  const handleBackfillStart = async () => {
    if (!currentEvaluation || !selectedBackfillCandidate) {
      return;
    }

    setRunError(null);

    if (!hasValidBackfillTargetBatchCount) {
      setRunError('Enter a paired-batch depth between 1 and 100.');
      return;
    }
    if (backfillBlockedReason) {
      setRunError(backfillBlockedReason);
      return;
    }

    const result = await backfillDomainEvaluationModels({
      domainEvaluationId: currentEvaluation.id,
      modelIds: [selectedBackfillCandidate.modelId],
      targetBatchCount: selectedBackfillTargetBatchCount,
    });

    if (result.error) {
      setRunError(result.error.message);
      return;
    }

    const payload = result.data?.backfillDomainEvaluationModels;
    if (!payload) {
      setRunError('Failed to start the missing-model backfill.');
      return;
    }

    const byRunId: Record<string, string> = {};
    for (const existingRunId of Object.values(definitionRunIds)) {
      byRunId[existingRunId] = existingRunId;
    }
    for (const run of payload.runs) {
      byRunId[run.runId] = run.runId;
    }
    setDefinitionRunIds(byRunId);
    setShowBackfillConfirm(false);
    setSelectedRunId(null);

    refetchCurrentEvaluation({ requestPolicy: 'network-only' });
    refetchCurrentEvaluationStatus({ requestPolicy: 'network-only' });
    refetchLaunches({ requestPolicy: 'network-only' });
    refetchStatus({ requestPolicy: 'network-only' });
    setLastStatusUpdatedAt(Date.now());

    if (payload.startedRuns === 0) {
      setRunError('No new runs were started. The missing work may already be filled or still in flight.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Domain Level Batches</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">{domainName}</h1>
            {statusHeader && (
              <Badge variant={launchDisabled ? 'warning' : 'success'} size="count">
                {statusHeader}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {displayError && <ErrorMessage message={`Failed to load domain level batches data: ${displayError.message ?? 'Unknown error'}`} />}
      {runError && <ErrorMessage message={runError} />}
      {filteredDefinitionIdCount > 0 && plan && filteredDefinitionIdCount > plan.vignettes.length && (
        <ErrorMessage message={`Requested ${filteredDefinitionIdCount} scoped vignette IDs but ${filteredDefinitionIdCount - plan.vignettes.length} were invalid, stale, or not latest definitions in this domain.`} />
      )}

      <section className="space-y-4">
        <LaunchControlsPanel
          useDefaultTemperature={useDefaultTemperature}
          disableTemperatureInput={plan?.models.some((model) => !model.supportsTemperature) ?? false}
          temperatureInput={temperatureInput}
          maxBudgetEnabled={maxBudgetEnabled}
          maxBudgetInput={maxBudgetInput}
          hasValidBudget={hasValidBudget}
          targetBatchCountInput={targetBatchCountInput}
          hasValidTargetBatchCount={hasValidTargetBatchCount}
          isStarting={startDomainEvaluationResult.fetching}
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

      {currentEvaluation && (
        <section className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-gray-900">Missing Model Backfill</h2>
              <p className="text-sm text-gray-600">
                Add one missing model back into the current batch instead of creating a separate batch.
              </p>
            </div>

            <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 space-y-1">
              <div>
                Existing batch: <span className="font-medium">{currentEvaluation.id}</span>
              </div>
              <div>
                Scope: <span className="font-medium">{currentEvaluation.scopeCategory}</span>
              </div>
              <div>
                Saved run settings:{' '}
                <span className="font-medium">
                  {currentEvaluation.samplePercentage == null || currentEvaluation.samplesPerScenario == null
                    ? 'Unavailable'
                    : `${currentEvaluation.samplePercentage}% sample, ${currentEvaluation.samplesPerScenario} samples per scenario`}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-medium text-gray-900">Pick a missing model</div>
              {backfillCandidates.length === 0 ? (
                <p className="text-sm text-gray-500">This batch does not have any missing model coverage right now.</p>
              ) : (
                <div className="space-y-2">
                  {backfillCandidates.map((candidate) => (
                    <label
                      key={candidate.modelId}
                      className={`flex items-start gap-3 rounded border px-3 py-2 ${
                        candidate.isActive ? 'border-gray-200 bg-white' : 'border-amber-200 bg-amber-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="backfill-model"
                        checked={selectedBackfillModelId === candidate.modelId}
                        onChange={() => setSelectedBackfillModelId(candidate.modelId)}
                        disabled={!candidate.isActive}
                      />
                      <div className="space-y-1">
                        <div className="font-medium text-gray-900">{candidate.label}</div>
                        <div className="text-xs text-gray-600">
                          Missing paired batch groups: {candidate.missingBatchGroups}. New trial runs: {candidate.missingRuns}.
                        </div>
                        {!candidate.isActive && (
                          <div className="text-xs text-amber-700">This model is no longer active, so it cannot be backfilled from the dashboard.</div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                Target Number of Paired Batches per vignette
                <input
                  aria-label="Backfill target number of paired batches per vignette"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={backfillTargetBatchCountInput}
                  onChange={(event) => setBackfillTargetBatchCountInput(event.target.value)}
                  className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                />
              </label>
              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                Use the same paired-batch depth the original batch was supposed to reach.
              </div>
            </div>

            {!hasValidBackfillTargetBatchCount && (
              <p className="text-xs text-amber-700">Enter a paired-batch depth between 1 and 100.</p>
            )}

            <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 space-y-1">
              <div>
                Selected model: <span className="font-medium">{selectedBackfillCandidate?.label ?? 'None selected'}</span>
              </div>
              <div>
                New paired batch groups: <span className="font-medium">{selectedBackfillCandidate?.missingBatchGroups ?? 0}</span>
              </div>
              <div>
                New individual trial runs: <span className="font-medium">{selectedBackfillCandidate?.missingRuns ?? 0}</span>
              </div>
              <div>
                Estimated additional cost:{' '}
                <span className="font-medium">{backfillEstimatedCost == null ? 'Unavailable' : `$${backfillEstimatedCost.toFixed(2)}`}</span>
              </div>
            </div>

            {backfillBlockedReason && (
              <p className="text-xs text-amber-700">{backfillBlockedReason}</p>
            )}

            <div className="flex items-center gap-3">
              <Button
                onClick={() => setShowBackfillConfirm(true)}
                disabled={backfillDomainEvaluationResult.fetching || backfillBlockedReason != null}
              >
                {backfillDomainEvaluationResult.fetching ? 'Starting...' : 'Review & Start Missing Model Backfill'}
              </Button>
            </div>
          </div>
        </section>
      )}

      <DomainEvaluationStatusPanel
        domainName={domainName}
        evaluation={currentEvaluation}
        evaluationStatus={currentEvaluationStatus}
        runStatuses={runStatuses}
        fetching={statusResult.fetching || currentEvaluationStatusResult.fetching || currentEvaluationResult.fetching}
        lastUpdatedAt={lastStatusUpdatedAt}
        selectedRunId={selectedRunId}
        onSelectRun={(runId) => setSelectedRunId(runId)}
      />

      <LaunchConfirmModal
        open={showLaunchConfirm}
        domainName={domainName}
        vignetteCount={vignetteCount}
        modelCount={modelCount}
        totalPairedBatches={totalPairedBatches}
        totalTrialRuns={totalTrialRuns}
        estimatedTotalCost={estimatedRemainingCost}
        estimateConfidence={estimate?.estimateConfidence}
        fallbackReason={estimate?.fallbackReason}
        knownExclusions={estimate?.knownExclusions}
        temperatureLabel={temperatureLabel}
        budgetCap={maxBudgetEnabled && hasValidBudget ? parsedBudget : null}
        targetBatchCount={hasValidTargetBatchCount ? parsedTargetBatchCount : 1}
        reviewSetupHref={`/domains?domainId=${domainId}&tab=setup&setupTab=contexts`}
        reviewVignettesHref={`/domains?domainId=${domainId}&tab=vignettes`}
        isStarting={startDomainEvaluationResult.fetching}
        onCancel={() => setShowLaunchConfirm(false)}
        onConfirm={() => void handleStart()}
      />

      <BackfillConfirmModal
        open={showBackfillConfirm}
        evaluationId={currentEvaluation?.id ?? ''}
        domainName={domainName}
        modelLabel={selectedBackfillCandidate?.label ?? 'Selected model'}
        targetBatchCount={selectedBackfillTargetBatchCount}
        newBatchGroups={selectedBackfillCandidate?.missingBatchGroups ?? 0}
        newRuns={selectedBackfillCandidate?.missingRuns ?? 0}
        estimatedTotalCost={backfillEstimatedCost}
        isStarting={backfillDomainEvaluationResult.fetching}
        onCancel={() => setShowBackfillConfirm(false)}
        onConfirm={() => void handleBackfillStart()}
      />

      <DomainEvaluationStatusDrawer
        runId={selectedRunId}
        open={selectedRunId != null}
        onClose={() => setSelectedRunId(null)}
      />
    </div>
  );
}

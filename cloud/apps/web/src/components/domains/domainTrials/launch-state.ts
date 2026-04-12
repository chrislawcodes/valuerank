import type { LlmModel } from '../../../api/operations/llm';

export type ProviderBudgetEstimate = {
  providerId: string;
  providerName: string;
  providerDisplayName: string;
  expectedSpendUsd: number;
  budgetBalanceUsd: number | null;
  budgetReady: boolean;
};

export type LaunchPlanCellEstimate = {
  definitionId: string;
  modelId: string;
  estimatedCost: number;
};

export type LaunchPlanVignette = {
  definitionId: string;
  existingBatchCount: number;
};

export type BatchRuntimeState = 'LIVE' | 'EXCEPTION' | 'TERMINAL';

type RunStatusLike = {
  status: string;
  analysisStatus: string | null;
  stalledModels?: string[];
  latestErrorMessage?: string | null;
};

export function getBatchRuntimeState(run: RunStatusLike): BatchRuntimeState {
  const hasLiveAnalysis = run.analysisStatus === 'pending' || run.analysisStatus === 'computing';
  const isActive = run.status === 'PENDING' || run.status === 'RUNNING' || run.status === 'SUMMARIZING' || hasLiveAnalysis;
  const isException = run.status === 'FAILED'
    || run.status === 'CANCELLED'
    || run.analysisStatus === 'failed'
    || (run.stalledModels?.length ?? 0) > 0
    || Boolean(run.latestErrorMessage);

  if (isException) return 'EXCEPTION';
  if (isActive) return 'LIVE';
  return 'TERMINAL';
}

export function getBatchStageLabel(run: RunStatusLike): string {
  if (run.status === 'FAILED') return 'Failed';
  if (run.status === 'CANCELLED') return 'Cancelled';
  if (run.analysisStatus === 'failed') return 'Analysis failed';
  if ((run.stalledModels?.length ?? 0) > 0) return 'Stalled';
  if (run.status === 'SUMMARIZING') return 'Summarizing';
  if (run.analysisStatus === 'pending' || run.analysisStatus === 'computing') return 'Analyzing';
  if (run.status === 'RUNNING' || run.status === 'PENDING') return 'Processing';
  if (run.analysisStatus === 'completed' || run.status === 'COMPLETED') return 'Complete';
  return 'Unknown';
}

export function formatProgressSummary(
  modelStatuses: Array<{
    generationCompleted: number;
    generationFailed: number;
    generationTotal: number;
    summarizationCompleted: number;
    summarizationFailed: number;
    summarizationTotal: number;
  }>,
  stage: 'generation' | 'summarization',
): string {
  if (modelStatuses.length === 0) return 'No progress yet';

  const completed = modelStatuses.reduce(
    (sum, model) => sum + (stage === 'generation'
      ? model.generationCompleted + model.generationFailed
      : model.summarizationCompleted + model.summarizationFailed),
    0,
  );
  const total = modelStatuses.reduce(
    (sum, model) => sum + (stage === 'generation' ? model.generationTotal : model.summarizationTotal),
    0,
  );

  return total > 0 ? `${completed} / ${total}` : 'No progress yet';
}

export function buildProviderBudgetEstimates(input: {
  selectedModels: LlmModel[];
  cellEstimates: LaunchPlanCellEstimate[];
  vignettes: LaunchPlanVignette[];
  targetBatchCount: number;
}): ProviderBudgetEstimate[] {
  const { selectedModels, cellEstimates, vignettes, targetBatchCount } = input;
  const targetCount = Math.max(1, Math.floor(targetBatchCount));
  const existingBatchCountByDefinitionId = new Map(
    vignettes.map((vignette) => [vignette.definitionId, Math.max(0, vignette.existingBatchCount)]),
  );
  const modelById = new Map(selectedModels.map((model) => [model.modelId, model]));
  const providerRows = new Map<string, ProviderBudgetEstimate>();

  for (const cell of cellEstimates) {
    const model = modelById.get(cell.modelId);
    const provider = model?.provider;
    if (!provider) continue;
    const key = provider.id || provider.name;
    const existing = providerRows.get(key);
    const remainingBatchCount = Math.max(0, targetCount - (existingBatchCountByDefinitionId.get(cell.definitionId) ?? 0));
    // cellEstimates represent 1-batch cost (backend uses samplesPerScenario=1).
    // Multiply by remaining batches to get total expected spend.
    const nextSpend = cell.estimatedCost * remainingBatchCount;
    const expectedSpendUsd = (existing?.expectedSpendUsd ?? 0) + nextSpend;
    const budgetBalanceUsd = existing?.budgetBalanceUsd ?? provider.balance ?? null;

    providerRows.set(key, {
      providerId: provider.id,
      providerName: provider.name,
      providerDisplayName: provider.displayName,
      expectedSpendUsd,
      budgetBalanceUsd,
      budgetReady: budgetBalanceUsd == null ? false : expectedSpendUsd <= budgetBalanceUsd,
    });
  }

  return Array.from(providerRows.values()).sort((a, b) => a.providerDisplayName.localeCompare(b.providerDisplayName));
}

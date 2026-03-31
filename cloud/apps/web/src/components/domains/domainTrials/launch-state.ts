import type { ProviderHealth } from '../../../api/operations/health';
import type { LlmModel } from '../../../api/operations/llm';

export const BUDGET_FRESHNESS_MS = 10 * 60 * 1000;

export type BudgetFreshness = 'FRESH' | 'STALE' | 'MISSING';

export type ProviderBudgetReadiness = {
  providerId: string;
  providerName: string;
  providerDisplayName: string;
  expectedSpendUsd: number;
  remainingBudgetUsd: number | null;
  lastChecked: string | null;
  freshness: BudgetFreshness;
  status: 'READY' | 'TOP_UP_REQUIRED' | 'DISABLED' | 'STALE' | 'MISSING';
  reason: string;
};

export type BatchRuntimeState = 'LIVE' | 'EXCEPTION' | 'TERMINAL';

type RunStatusLike = {
  status: string;
  analysisStatus: string | null;
  stalledModels?: string[];
  latestErrorMessage?: string | null;
};

function parseTime(value: string | null): number | null {
  if (value == null) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function getBudgetFreshness(lastChecked: string | null, now = Date.now()): BudgetFreshness {
  const checkedAt = parseTime(lastChecked);
  if (checkedAt == null) return 'MISSING';
  return now - checkedAt <= BUDGET_FRESHNESS_MS ? 'FRESH' : 'STALE';
}

export function getBudgetFreshnessLabel(freshness: BudgetFreshness): string {
  switch (freshness) {
    case 'FRESH':
      return 'Fresh';
    case 'STALE':
      return 'Stale';
    case 'MISSING':
    default:
      return 'Missing';
  }
}

export function formatBudgetSnapshotAge(lastChecked: string | null, now = Date.now()): string {
  const checkedAt = parseTime(lastChecked);
  if (checkedAt == null) return 'Unknown';

  const elapsedMs = Math.max(0, now - checkedAt);
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

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

export function buildProviderBudgetReadiness(input: {
  providerHealth: ProviderHealth | null;
  selectedModels: LlmModel[];
  estimatedSpendByModelId: Map<string, number>;
}): ProviderBudgetReadiness[] {
  const { providerHealth, selectedModels, estimatedSpendByModelId } = input;
  const providerRows = new Map<string, ProviderBudgetReadiness>();
  const healthByProvider = new Map<string, ProviderHealth['providers'][number]>();

  for (const provider of providerHealth?.providers ?? []) {
    healthByProvider.set(provider.id, provider);
    healthByProvider.set(provider.name, provider);
  }

  for (const model of selectedModels) {
    const provider = model.provider;
    if (!provider) continue;
    const key = provider.id || provider.name;
    const providerHealthRow = healthByProvider.get(provider.id) ?? healthByProvider.get(provider.name) ?? null;
    const existing = providerRows.get(key);
    const nextSpend = estimatedSpendByModelId.get(model.modelId) ?? 0;
    const expectedSpendUsd = (existing?.expectedSpendUsd ?? 0) + nextSpend;

    const lastChecked = providerHealthRow?.lastChecked ?? null;
    const freshness = getBudgetFreshness(lastChecked);
    const remainingBudgetUsd = providerHealthRow?.remainingBudgetUsd ?? null;
    const configured = providerHealthRow?.configured ?? false;
    const connected = providerHealthRow?.connected ?? false;
    const reason = !configured || !connected
      ? 'Provider disabled or disconnected'
      : freshness === 'STALE'
        ? 'Budget snapshot is older than 10 minutes'
        : freshness === 'MISSING'
          ? 'Budget snapshot is unavailable'
          : remainingBudgetUsd == null
            ? 'Budget amount is unavailable'
            : expectedSpendUsd > remainingBudgetUsd
              ? 'Top-up needed before launch'
              : 'Budget ready';

    const status: ProviderBudgetReadiness['status'] = !configured || !connected
      ? 'DISABLED'
      : freshness === 'STALE'
        ? 'STALE'
        : freshness === 'MISSING'
          ? 'MISSING'
          : remainingBudgetUsd == null
            ? 'MISSING'
            : expectedSpendUsd > remainingBudgetUsd
              ? 'TOP_UP_REQUIRED'
              : 'READY';

    providerRows.set(key, {
      providerId: provider.id,
      providerName: provider.name,
      providerDisplayName: provider.displayName,
      expectedSpendUsd,
      remainingBudgetUsd,
      lastChecked,
      freshness,
      status,
      reason,
    });
  }

  return Array.from(providerRows.values()).sort((a, b) => a.providerDisplayName.localeCompare(b.providerDisplayName));
}

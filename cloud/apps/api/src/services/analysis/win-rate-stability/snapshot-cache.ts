import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { getBoss, isBossRunning } from '../../../queue/boss.js';
import { DEFAULT_JOB_OPTIONS } from '../../../queue/types.js';
import type { ModelsStabilityResultShape } from '../../../graphql/types/models-stability.js';
import {
  resolveDomainAnalysisSelection,
  type DomainAnalysisSelection,
} from '../domain-analysis-scope.js';
import {
  WIN_RATE_STABILITY_SNAPSHOT_TYPE,
  type WinRateStabilitySnapshotOutput,
} from './snapshot-types.js';
import {
  buildWinRateStabilityAssumptionKey,
  buildWinRateStabilityOutput,
  normalizeWinRateStabilitySignature,
  prepareWinRateStabilityState,
  writeWinRateStabilitySnapshot,
} from './snapshot-builder.js';

const log = createLogger('win-rate-stability:cache');

export type WinRateStabilityRequest = {
  domainId: string | null;
  domainIds: string[] | null;
  signature: string | null;
};

function resolveSelection(request: WinRateStabilityRequest): DomainAnalysisSelection {
  return resolveDomainAnalysisSelection({
    domainId: request.domainId,
    domainIds: request.domainIds,
  });
}

export function parseWinRateStabilitySnapshotOutput(raw: unknown): WinRateStabilitySnapshotOutput | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as Partial<WinRateStabilitySnapshotOutput>;
  if (!Array.isArray(candidate.models) || !Array.isArray(candidate.skippedVignettes)) {
    return null;
  }
  return { models: candidate.models, skippedVignettes: candidate.skippedVignettes };
}

export async function queueWinRateStabilityRefresh(params: {
  request: WinRateStabilityRequest;
  reason: string;
}): Promise<boolean> {
  if (!isBossRunning()) {
    log.warn({ ...params.request, reason: params.reason }, 'Win rate stability refresh skipped — queue unavailable');
    return false;
  }

  const selection = resolveSelection(params.request);
  const configSignature = normalizeWinRateStabilitySignature(params.request.signature);
  const boss = getBoss();
  await boss.send(
    'refresh_win_rate_stability_snapshot',
    {
      domainId: params.request.domainId,
      domainIds: params.request.domainIds,
      signature: params.request.signature,
      reason: params.reason,
    },
    {
      ...DEFAULT_JOB_OPTIONS.refresh_win_rate_stability_snapshot,
      singletonKey: `win-rate-stability:${selection.scope}:${selection.domainId}:${configSignature}`,
    },
  );
  return true;
}

export async function refreshWinRateStabilitySnapshot(request: WinRateStabilityRequest): Promise<void> {
  const selection = resolveSelection(request);
  const state = await prepareWinRateStabilityState({ selection, signature: request.signature });
  const output = await buildWinRateStabilityOutput(state);
  await writeWinRateStabilitySnapshot({
    scopeId: selection.domainId,
    configSignature: state.configSignature,
    inputHash: state.inputHash,
    output,
  });
}

function withReadMetadata(
  output: WinRateStabilitySnapshotOutput,
  cacheStatus: ModelsStabilityResultShape['cacheStatus'],
  generatedAt: Date | null,
): ModelsStabilityResultShape {
  return {
    models: output.models,
    skippedVignettes: output.skippedVignettes,
    cacheStatus,
    generatedAt: generatedAt != null ? generatedAt.toISOString() : null,
  };
}

export async function getWinRateStabilityResult(
  request: WinRateStabilityRequest,
): Promise<ModelsStabilityResultShape> {
  const selection = resolveSelection(request);
  const state = await prepareWinRateStabilityState({ selection, signature: request.signature });
  const assumptionKey = buildWinRateStabilityAssumptionKey(selection.domainId);

  const currentSnapshot = await db.assumptionAnalysisSnapshot.findFirst({
    where: {
      assumptionKey,
      analysisType: WIN_RATE_STABILITY_SNAPSHOT_TYPE,
      configSignature: state.configSignature,
      status: 'CURRENT',
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  if (currentSnapshot != null) {
    const parsed = parseWinRateStabilitySnapshotOutput(currentSnapshot.output);
    if (parsed != null) {
      if (currentSnapshot.inputHash === state.inputHash) {
        return withReadMetadata(parsed, 'FRESH', currentSnapshot.createdAt);
      }
      const queued = await queueWinRateStabilityRefresh({ request, reason: 'page-load-stale' });
      return withReadMetadata(parsed, queued ? 'UPDATING' : 'OUT_OF_DATE', currentSnapshot.createdAt);
    }
  }

  // No usable snapshot — build inline. Unlike domain-analysis (whose build can
  // take minutes), a stability build only reads one AGGREGATE analysis output
  // per definition, so a synchronous build is acceptable for every scope.
  // ALL_DOMAINS is also cron-warmed, so this cold-miss path is rare.
  const output = await buildWinRateStabilityOutput(state);
  await writeWinRateStabilitySnapshot({
    scopeId: selection.domainId,
    configSignature: state.configSignature,
    inputHash: state.inputHash,
    output,
  });
  return withReadMetadata(output, 'FRESH', new Date());
}

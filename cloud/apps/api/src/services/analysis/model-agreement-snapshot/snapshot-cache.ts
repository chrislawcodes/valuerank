import { Prisma } from '@valuerank/db';
import { DEFAULT_JOB_OPTIONS, REFRESH_MODEL_AGREEMENT_SNAPSHOT_JOB } from '../../../queue/types.js';
import type { RefreshModelAgreementSnapshotJobData } from '../../../queue/types.js';
import type { ModelAgreementSnapshotInput, ModelAgreementSnapshotPayload, ModelAgreementSnapshotSource } from './snapshot-types.js';
import { AGREEMENT_ALGORITHM_VERSION } from './snapshot-types.js';
import { canonicalKey, normalizeCanonicalIds } from './canonical-key.js';
import { computeInputFingerprint } from './fingerprint.js';

const pendingRefreshes = new Set<string>();

export type ModelAgreementSnapshotReadResult = {
  payload: ModelAgreementSnapshotPayload | null;
  source: Extract<ModelAgreementSnapshotSource, 'CACHE_HIT' | 'CACHE_HIT_STALE' | 'BUILDING'>;
  snapshotComputedAt: Date | null;
};

type ModelAgreementSnapshotQueue = {
  send: (
    name: string,
    data: RefreshModelAgreementSnapshotJobData,
    options?: { singletonKey?: string; [key: string]: unknown },
  ) => Promise<unknown>;
};

function normalizeSnapshotInput(input: ModelAgreementSnapshotInput): ModelAgreementSnapshotInput {
  return {
    scope: input.scope,
    signature: input.signature.trim(),
    domainId: input.domainId != null ? input.domainId.trim() : null,
    domainIds: normalizeCanonicalIds(input.domainIds),
    modelIds: normalizeCanonicalIds(input.modelIds),
  };
}

function parseSnapshotPayload(raw: unknown): ModelAgreementSnapshotPayload | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const candidate = raw as Partial<ModelAgreementSnapshotPayload>;
  if (
    typeof candidate.pending !== 'boolean'
    || !Array.isArray(candidate.models)
    || !Array.isArray(candidate.unavailableModels)
    || typeof candidate.excludedNonBinaryCells !== 'number'
    || typeof candidate.tiedCells !== 'number'
    || !Array.isArray(candidate.pairwiseAgreementMatrix)
    || !Array.isArray(candidate.trialConsistency)
  ) {
    return null;
  }

  return {
    pending: candidate.pending,
    buildProgress: candidate.buildProgress ?? null,
    models: candidate.models,
    unavailableModels: candidate.unavailableModels,
    excludedNonBinaryCells: candidate.excludedNonBinaryCells,
    tiedCells: candidate.tiedCells,
    pairwiseAgreementMatrix: candidate.pairwiseAgreementMatrix,
    trialConsistency: candidate.trialConsistency,
  };
}

function buildSingletonKey(input: ModelAgreementSnapshotInput): string {
  const normalized = normalizeSnapshotInput(input);
  const { domainIdsHash, modelIdsHash } = canonicalKey(normalized);
  return [
    'model-agreement',
    normalized.scope,
    normalized.signature,
    domainIdsHash,
    modelIdsHash,
  ].join(':');
}

async function hasPendingRefreshJob(prisma: Prisma.TransactionClient, singletonKey: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::BIGINT AS count
    FROM pgboss.job
    WHERE name = ${REFRESH_MODEL_AGREEMENT_SNAPSHOT_JOB}
      AND singleton_key = ${singletonKey}
      AND state IN ('created', 'retry', 'active')
  `);
  return Number(rows[0]?.count ?? 0n) > 0;
}

export async function queueModelAgreementSnapshotRefresh(
  prisma: Prisma.TransactionClient,
  queue: ModelAgreementSnapshotQueue,
  input: ModelAgreementSnapshotInput,
  reason: string,
): Promise<boolean> {
  const normalized = normalizeSnapshotInput(input);
  const singletonKey = buildSingletonKey(normalized);

  if (pendingRefreshes.has(singletonKey)) {
    return false;
  }

  pendingRefreshes.add(singletonKey);
  try {
    if (await hasPendingRefreshJob(prisma, singletonKey)) {
      return false;
    }

    await queue.send(
      REFRESH_MODEL_AGREEMENT_SNAPSHOT_JOB,
      {
        scope: normalized.scope,
        signature: normalized.signature,
        domainId: normalized.domainId,
        domainIds: [...normalized.domainIds],
        modelIds: [...normalized.modelIds],
        reason,
      },
      {
        ...DEFAULT_JOB_OPTIONS.refresh_model_agreement_snapshot,
        singletonKey,
      },
    );
    return true;
  } catch {
    return false;
  } finally {
    pendingRefreshes.delete(singletonKey);
  }
}

export async function getModelAgreementSnapshot(
  prisma: Prisma.TransactionClient,
  queue: ModelAgreementSnapshotQueue,
  input: ModelAgreementSnapshotInput & { isCanonical: boolean },
): Promise<ModelAgreementSnapshotReadResult | null> {
  if (!input.isCanonical) {
    return null;
  }

  const normalized = normalizeSnapshotInput(input);
  const { domainIdsHash, modelIdsHash } = canonicalKey(normalized);
  const snapshot = await prisma.modelAgreementSnapshot.findFirst({
    where: {
      scope: normalized.scope,
      signature: normalized.signature,
      domainIdsHash,
      modelIdsHash,
    },
    orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
  });

  if (snapshot == null) {
    await queueModelAgreementSnapshotRefresh(prisma, queue, normalized, 'cache-miss');
    return {
      payload: null,
      source: 'BUILDING',
      snapshotComputedAt: null,
    };
  }

  const payload = parseSnapshotPayload(snapshot.agreementResultJson);
  if (payload == null) {
    await queueModelAgreementSnapshotRefresh(prisma, queue, normalized, 'invalid-cache-row');
    return {
      payload: null,
      source: 'BUILDING',
      snapshotComputedAt: null,
    };
  }

  const fingerprint = await computeInputFingerprint(prisma, normalized);
  const isFresh =
    fingerprint.sourceRunCount === snapshot.sourceRunCount
    && fingerprint.sourceRunUpdatedAtSum === snapshot.sourceRunUpdatedAtSum
    && snapshot.algorithmVersion === AGREEMENT_ALGORITHM_VERSION;

  if (!isFresh) {
    await queueModelAgreementSnapshotRefresh(prisma, queue, normalized, 'page-load-stale');
    return {
      payload,
      source: 'CACHE_HIT_STALE',
      snapshotComputedAt: snapshot.computedAt,
    };
  }

  return {
    payload,
    source: 'CACHE_HIT',
    snapshotComputedAt: snapshot.computedAt,
  };
}

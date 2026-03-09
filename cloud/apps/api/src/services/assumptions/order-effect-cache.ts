import crypto from 'crypto';
import type { Prisma, db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import {
  ORDER_INVARIANCE_ASSUMPTION_KEY,
  REVERSAL_METRICS_ANALYSIS_TYPE,
  REVERSAL_METRICS_CODE_VERSION,
} from './order-effect-analysis.js';

const log = createLogger('assumptions:order-effect-cache');
type SnapshotClient = typeof db | Prisma.TransactionClient;

export class DuplicateCurrentOrderEffectSnapshotError extends Error {
  constructor(message = 'Multiple CURRENT order-effect snapshots found for one input hash') {
    super(message);
    this.name = 'DuplicateCurrentOrderEffectSnapshotError';
  }
}

export type OrderEffectCachePayload = {
  assumptionKey: typeof ORDER_INVARIANCE_ASSUMPTION_KEY;
  analysisType: typeof REVERSAL_METRICS_ANALYSIS_TYPE;
  inputHash: string;
  configSignature: string;
  codeVersion: string;
  trimOutliers: boolean;
  directionOnly: boolean;
  requiredTrialCount: number;
  lockedVignetteIds: string[];
  approvedPairIds: string[];
  snapshotModelIds: string[];
  selectionFingerprints: string[];
};

export type OrderEffectSnapshotConfig = Omit<OrderEffectCachePayload, 'inputHash' | 'configSignature' | 'selectionFingerprints' | 'codeVersion'>;

export type BuildOrderEffectCachePayloadInput = {
  codeVersion?: string;
  trimOutliers: boolean;
  directionOnly: boolean;
  requiredTrialCount: number;
  lockedVignetteIds: string[];
  approvedPairIds: string[];
  snapshotModelIds: string[];
  selectionFingerprints: string[];
};

export function buildOrderEffectCachePayload(
  input: BuildOrderEffectCachePayloadInput
): OrderEffectCachePayload {
  const config = {
    assumptionKey: ORDER_INVARIANCE_ASSUMPTION_KEY,
    analysisType: REVERSAL_METRICS_ANALYSIS_TYPE,
    trimOutliers: input.trimOutliers,
    directionOnly: input.directionOnly,
    requiredTrialCount: input.requiredTrialCount,
    lockedVignetteIds: sortStrings(input.lockedVignetteIds),
    approvedPairIds: sortStrings(input.approvedPairIds),
    snapshotModelIds: sortStrings(input.snapshotModelIds),
  } satisfies OrderEffectSnapshotConfig;
  const codeVersion = input.codeVersion ?? REVERSAL_METRICS_CODE_VERSION;
  const selectionFingerprints = sortStrings(input.selectionFingerprints);
  const inputHash = computeHash({
    ...config,
    codeVersion,
    selectionFingerprints,
  }).slice(0, 16);
  const configSignature = computeOrderEffectConfigSignature(config);

  return {
    ...config,
    inputHash,
    configSignature,
    codeVersion,
    selectionFingerprints,
  };
}

export function buildOrderEffectSnapshotConfig(payload: OrderEffectCachePayload): OrderEffectSnapshotConfig {
  return {
    assumptionKey: payload.assumptionKey,
    analysisType: payload.analysisType,
    trimOutliers: payload.trimOutliers,
    directionOnly: payload.directionOnly,
    requiredTrialCount: payload.requiredTrialCount,
    lockedVignetteIds: payload.lockedVignetteIds,
    approvedPairIds: payload.approvedPairIds,
    snapshotModelIds: payload.snapshotModelIds,
  };
}

export function computeOrderEffectInputHash(payload: OrderEffectCachePayload): string {
  return payload.inputHash;
}

export function computeOrderEffectConfigSignature(config: OrderEffectSnapshotConfig): string {
  return computeHash(config);
}

export async function getCurrentOrderEffectSnapshot(
  client: SnapshotClient,
  payload: Pick<OrderEffectCachePayload, 'inputHash'>
) {
  const snapshots = await client.assumptionAnalysisSnapshot.findMany({
    where: {
      assumptionKey: ORDER_INVARIANCE_ASSUMPTION_KEY,
      analysisType: REVERSAL_METRICS_ANALYSIS_TYPE,
      inputHash: payload.inputHash,
      status: 'CURRENT',
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 2,
  });

  if (snapshots.length > 1) {
    log.error({ inputHash: payload.inputHash, snapshotIds: snapshots.map((snapshot) => snapshot.id) }, 'Order-effect cache invariant violated: multiple CURRENT snapshots matched one inputHash');
    throw new DuplicateCurrentOrderEffectSnapshotError();
  }

  const snapshot = snapshots[0] ?? null;

  if (snapshot != null) {
    log.debug({ snapshotId: snapshot.id, inputHash: payload.inputHash }, 'Order-effect cache hit');
  } else {
    log.debug({ inputHash: payload.inputHash }, 'Order-effect cache miss');
  }

  return snapshot;
}

export async function writeCurrentOrderEffectSnapshot(params: {
  client: SnapshotClient;
  payload: OrderEffectCachePayload;
  output: Prisma.InputJsonValue;
}) {
  const config = buildOrderEffectSnapshotConfig(params.payload);
  const current = await getCurrentOrderEffectSnapshot(params.client, params.payload);
  if (current != null) {
    log.debug({
      snapshotId: current.id,
      inputHash: params.payload.inputHash,
      configSignature: params.payload.configSignature,
      reusedExisting: true,
    }, 'Reused existing order-effect snapshot during write');
    return current;
  }

  const superseded = await params.client.assumptionAnalysisSnapshot.updateMany({
    where: {
      assumptionKey: params.payload.assumptionKey,
      analysisType: params.payload.analysisType,
      configSignature: params.payload.configSignature,
      status: 'CURRENT',
      deletedAt: null,
    },
    data: {
      status: 'SUPERSEDED',
    },
  });

  const created = await params.client.assumptionAnalysisSnapshot.create({
    data: {
      assumptionKey: params.payload.assumptionKey,
      analysisType: params.payload.analysisType,
      inputHash: params.payload.inputHash,
      codeVersion: params.payload.codeVersion,
      configSignature: params.payload.configSignature,
      config,
      output: params.output,
      status: 'CURRENT',
    },
  });

  log.debug({
    snapshotId: created.id,
    inputHash: params.payload.inputHash,
    configSignature: params.payload.configSignature,
    supersededCount: superseded.count,
    reusedExisting: false,
  }, 'Persisted order-effect snapshot');

  return created;
}

function sortStrings(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  if (value != null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

function computeHash(value: unknown): string {
  return crypto
    .createHash('sha256')
    .update(stableStringify(value))
    .digest('hex');
}

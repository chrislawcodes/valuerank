import crypto from 'crypto';
import { db, type Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import {
  ORDER_INVARIANCE_ASSUMPTION_KEY,
  REVERSAL_METRICS_ANALYSIS_TYPE,
  REVERSAL_METRICS_CODE_VERSION,
} from './order-effect-analysis.js';

const log = createLogger('assumptions:order-effect-cache');

export type OrderEffectCachePayload = {
  assumptionKey: typeof ORDER_INVARIANCE_ASSUMPTION_KEY;
  analysisType: typeof REVERSAL_METRICS_ANALYSIS_TYPE;
  codeVersion: string;
  trimOutliers: boolean;
  directionOnly: boolean;
  requiredTrialCount: number;
  lockedVignetteIds: string[];
  approvedPairIds: string[];
  snapshotModelIds: string[];
  candidateTranscriptIds: string[];
};

export type OrderEffectSnapshotConfig = Omit<OrderEffectCachePayload, 'candidateTranscriptIds' | 'codeVersion'>;

export type BuildOrderEffectCachePayloadInput = {
  codeVersion?: string;
  trimOutliers: boolean;
  directionOnly: boolean;
  requiredTrialCount: number;
  lockedVignetteIds: string[];
  approvedPairIds: string[];
  snapshotModelIds: string[];
  candidateTranscriptIds: string[];
};

export function buildOrderEffectCachePayload(
  input: BuildOrderEffectCachePayloadInput
): OrderEffectCachePayload {
  return {
    assumptionKey: ORDER_INVARIANCE_ASSUMPTION_KEY,
    analysisType: REVERSAL_METRICS_ANALYSIS_TYPE,
    codeVersion: input.codeVersion ?? REVERSAL_METRICS_CODE_VERSION,
    trimOutliers: input.trimOutliers,
    directionOnly: input.directionOnly,
    requiredTrialCount: input.requiredTrialCount,
    lockedVignetteIds: sortStrings(input.lockedVignetteIds),
    approvedPairIds: sortStrings(input.approvedPairIds),
    snapshotModelIds: sortStrings(input.snapshotModelIds),
    candidateTranscriptIds: sortStrings(input.candidateTranscriptIds),
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
  return crypto
    .createHash('sha256')
    .update(stableStringify(payload))
    .digest('hex')
    .slice(0, 16);
}

export function computeOrderEffectConfigSignature(config: OrderEffectSnapshotConfig): string {
  return stableStringify(config);
}

export async function getCurrentOrderEffectSnapshot(inputHash: string) {
  const snapshot = await db.assumptionAnalysisSnapshot.findFirst({
    where: {
      assumptionKey: ORDER_INVARIANCE_ASSUMPTION_KEY,
      analysisType: REVERSAL_METRICS_ANALYSIS_TYPE,
      inputHash,
      status: 'CURRENT',
      deletedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (snapshot != null) {
    log.debug({ snapshotId: snapshot.id, inputHash }, 'Order-effect cache hit');
  } else {
    log.debug({ inputHash }, 'Order-effect cache miss');
  }

  return snapshot;
}

export async function writeCurrentOrderEffectSnapshot(params: {
  payload: OrderEffectCachePayload;
  output: Prisma.InputJsonValue;
}) {
  const config = buildOrderEffectSnapshotConfig(params.payload);
  const inputHash = computeOrderEffectInputHash(params.payload);

  const created = await db.assumptionAnalysisSnapshot.create({
    data: {
      assumptionKey: params.payload.assumptionKey,
      analysisType: params.payload.analysisType,
      inputHash,
      codeVersion: params.payload.codeVersion,
      config,
      output: params.output,
      status: 'CURRENT',
    },
  });

  const superseded = await db.assumptionAnalysisSnapshot.updateMany({
    where: {
      id: { not: created.id },
      assumptionKey: params.payload.assumptionKey,
      analysisType: params.payload.analysisType,
      status: 'CURRENT',
      deletedAt: null,
      config: { equals: config as Prisma.InputJsonValue },
    },
    data: {
      status: 'SUPERSEDED',
    },
  });

  log.debug({
    snapshotId: created.id,
    inputHash,
    supersededCount: superseded.count,
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

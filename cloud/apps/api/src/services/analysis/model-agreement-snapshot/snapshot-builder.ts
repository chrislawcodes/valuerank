import type { PrismaClient } from '@valuerank/db';
import { computeModelAgreement } from '../../model-agreement/compute.js';
import { canonicalKey, normalizeCanonicalIds } from './canonical-key.js';
import { computeInputFingerprint } from './fingerprint.js';
import {
  AGREEMENT_ALGORITHM_VERSION,
  type ModelAgreementSnapshotInput,
  type ModelAgreementSnapshotPayload,
} from './snapshot-types.js';

type SnapshotLogger = {
  debug(data: Record<string, unknown>, message: string): void;
  info(data: Record<string, unknown>, message: string): void;
  warn(data: Record<string, unknown>, message: string): void;
};

export type ModelAgreementSnapshotRow = {
  scope: ModelAgreementSnapshotInput['scope'];
  signature: string;
  domainIdsHash: string;
  modelIdsHash: string;
  domainIds: string[];
  modelIds: string[];
  agreementResultJson: ModelAgreementSnapshotPayload;
  sourceRunCount: number;
  sourceRunUpdatedAtSum: bigint;
  algorithmVersion: number;
  computedAt: Date;
};

const noopLogger: SnapshotLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};

export async function buildModelAgreementSnapshot(
  prisma: PrismaClient,
  input: ModelAgreementSnapshotInput,
): Promise<ModelAgreementSnapshotRow> {
  const signature = input.signature.trim();
  const domainId = input.domainId != null ? input.domainId.trim() : null;
  const domainIds = normalizeCanonicalIds(input.domainIds);
  const modelIds = normalizeCanonicalIds(input.modelIds);

  const payload = await computeModelAgreement(
    prisma,
    {
      scope: input.scope,
      signature,
      domainId,
      domainIds,
      modelIds,
    },
    {
      queueDomainAnalysisRefresh: async () => false,
      log: noopLogger,
    },
  );

  const fingerprint = await computeInputFingerprint(prisma, {
    scope: input.scope,
    signature,
    domainId,
    domainIds,
    modelIds,
  });

  const { domainIdsHash, modelIdsHash } = canonicalKey({
    scope: input.scope,
    signature,
    domainIds,
    modelIds,
  });

  return {
    scope: input.scope,
    signature,
    domainIdsHash,
    modelIdsHash,
    domainIds,
    modelIds,
    agreementResultJson: payload,
    sourceRunCount: fingerprint.sourceRunCount,
    sourceRunUpdatedAtSum: fingerprint.sourceRunUpdatedAtSum,
    algorithmVersion: AGREEMENT_ALGORITHM_VERSION,
    computedAt: new Date(),
  };
}

import type { PrismaClient } from '@valuerank/db';
import { getModelsFromDatabase } from '../../../config/models.js';
import { canonicalKey, normalizeCanonicalIds } from './canonical-key.js';
import type { ModelAgreementSnapshotInput } from './snapshot-types.js';

export async function getAffectedCanonicalKeys(
  prisma: PrismaClient,
  params: {
    signature: string;
    domainId: string;
  },
): Promise<ModelAgreementSnapshotInput[]> {
  const signature = params.signature.trim();
  const domainId = params.domainId.trim();
  if (signature.length === 0 || domainId.length === 0) {
    return [];
  }

  const defaultModels = await getModelsFromDatabase({ activeOnly: true, availableOnly: false });
  const canonicalModelIds = normalizeCanonicalIds(
    defaultModels.filter((model) => model.isDefault).map((model) => model.modelId),
  );
  const canonicalDomainIds = [domainId];
  const canonicalHash = canonicalKey({
    scope: 'DOMAIN',
    signature,
    domainIds: canonicalDomainIds,
    modelIds: canonicalModelIds,
  });

  const domainSetRows = await prisma.modelAgreementSnapshot.findMany({
    where: {
      signature,
      scope: 'DOMAIN_SET',
      modelIdsHash: canonicalHash.modelIdsHash,
      domainIds: {
        has: canonicalDomainIds[0] ?? '',
      },
    },
    select: { domainIds: true },
    orderBy: [{ domainIdsHash: 'asc' }],
  });

  return [
    {
      scope: 'DOMAIN',
      signature,
      domainId: canonicalDomainIds[0] ?? null,
      domainIds: canonicalDomainIds,
      modelIds: canonicalModelIds,
    },
    {
      scope: 'ALL_DOMAINS',
      signature,
      domainId: null,
      domainIds: [],
      modelIds: canonicalModelIds,
    },
    ...domainSetRows.map((row) => ({
      scope: 'DOMAIN_SET' as const,
      signature,
      domainId: null,
      domainIds: normalizeCanonicalIds(row.domainIds),
      modelIds: canonicalModelIds,
    })),
  ];
}

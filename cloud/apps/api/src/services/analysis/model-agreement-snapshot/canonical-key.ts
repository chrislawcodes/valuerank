import { createHash } from 'node:crypto';

export function normalizeCanonicalIds(ids: ReadonlyArray<string>): string[] {
  return [...new Set(ids)]
    .sort();
}

function hashCanonicalIds(ids: ReadonlyArray<string>): string {
  const normalized = normalizeCanonicalIds(ids);
  return createHash('sha256')
    .update(normalized.join('\u0000'))
    .digest('hex')
    .slice(0, 32);
}

export function canonicalKey(params: {
  scope: 'DOMAIN' | 'ALL_DOMAINS' | 'DOMAIN_SET';
  signature: string;
  domainIds: ReadonlyArray<string>;
  modelIds: ReadonlyArray<string>;
}): {
  domainIdsHash: string;
  modelIdsHash: string;
} {
  void params.scope;
  void params.signature;

  return {
    domainIdsHash: hashCanonicalIds(params.domainIds),
    modelIdsHash: hashCanonicalIds(params.modelIds),
  };
}

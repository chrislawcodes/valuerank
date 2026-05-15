import { describe, expect, it } from 'vitest';
import { canonicalKey } from '../../../../src/services/analysis/model-agreement-snapshot/canonical-key.js';

describe('canonicalKey', () => {
  const baseInput = {
    scope: 'DOMAIN' as const,
    signature: 'vnewtd',
    domainIds: ['domain-a', 'domain-b'],
  };

  it('dedupes and sorts modelIds into a stable hash', () => {
    const first = canonicalKey({
      ...baseInput,
      modelIds: ['a', 'b', 'c'],
    });
    const second = canonicalKey({
      ...baseInput,
      modelIds: ['c', 'a', 'b'],
    });
    const third = canonicalKey({
      ...baseInput,
      modelIds: ['b', 'a', 'b', 'c'],
    });

    expect(first.modelIdsHash).toBe(second.modelIdsHash);
    expect(first.modelIdsHash).toBe(third.modelIdsHash);
  });

  it('treats case-sensitive IDs as distinct', () => {
    const upper = canonicalKey({
      ...baseInput,
      modelIds: ['Claude'],
    });
    const lower = canonicalKey({
      ...baseInput,
      modelIds: ['claude'],
    });

    expect(upper.modelIdsHash).not.toBe(lower.modelIdsHash);
  });

  it('distinguishes an empty list from a single-item list', () => {
    const empty = canonicalKey({
      ...baseInput,
      modelIds: [],
    });
    const single = canonicalKey({
      ...baseInput,
      modelIds: ['a'],
    });

    expect(empty.modelIdsHash).not.toBe(single.modelIdsHash);
  });

  it('returns a 32-character lowercase hex hash', () => {
    const key = canonicalKey({
      ...baseInput,
      modelIds: ['a', 'b'],
    });

    expect(key.modelIdsHash).toMatch(/^[0-9a-f]{32}$/);
    expect(key.domainIdsHash).toMatch(/^[0-9a-f]{32}$/);
    expect(key.modelIdsHash).toHaveLength(32);
    expect(key.domainIdsHash).toHaveLength(32);
  });
});

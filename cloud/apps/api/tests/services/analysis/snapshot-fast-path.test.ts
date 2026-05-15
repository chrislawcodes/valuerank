import { describe, expect, it } from 'vitest';
import { canFastPathSnapshot } from '../../../src/services/analysis/snapshot-fast-path.js';

const TTL_MS = 90 * 60 * 1000;
const CODE_VERSION = '1.0.0';

function snapshotValidatedAgo(ms: number) {
  return { lastValidatedAt: new Date(Date.now() - ms), codeVersion: CODE_VERSION };
}

describe('canFastPathSnapshot', () => {
  it('returns true for a recently-validated snapshot on the current code version', () => {
    expect(canFastPathSnapshot(snapshotValidatedAgo(60_000), CODE_VERSION, TTL_MS)).toBe(true);
  });

  it('returns false once the snapshot is older than the TTL', () => {
    expect(canFastPathSnapshot(snapshotValidatedAgo(TTL_MS + 1_000), CODE_VERSION, TTL_MS)).toBe(false);
  });

  it('returns false when lastValidatedAt is null (never validated by warm)', () => {
    expect(canFastPathSnapshot({ lastValidatedAt: null, codeVersion: CODE_VERSION }, CODE_VERSION, TTL_MS)).toBe(false);
  });

  it('returns false when the snapshot was built by a different code version', () => {
    expect(canFastPathSnapshot(snapshotValidatedAgo(60_000), '2.0.0', TTL_MS)).toBe(false);
  });

  it('returns false when the TTL is zero (fast path disabled, e.g. test env)', () => {
    expect(canFastPathSnapshot(snapshotValidatedAgo(60_000), CODE_VERSION, 0)).toBe(false);
  });
});

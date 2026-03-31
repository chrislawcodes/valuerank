/**
 * Domain Config Snapshot Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@valuerank/db', () => ({
  db: {
    domain: { findUnique: vi.fn() },
    valueStatement: { findMany: vi.fn() },
    domainConfigSnapshot: { upsert: vi.fn() },
  },
  Prisma: {},
}));

vi.mock('@valuerank/shared', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import AFTER mocks are set up
import { ensureDomainConfigSnapshot } from '../../../src/services/domain-config/snapshot.js';
import { db } from '@valuerank/db';

const DOMAIN_ID = 'domain-1';
const DOMAIN_DEFAULTS = {
  defaultPreambleVersionId: 'pv-1',
  defaultLevelPresetVersionId: 'lpv-1',
  defaultContextId: 'ctx-1',
};

describe('ensureDomainConfigSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.domainConfigSnapshot.upsert as Mock).mockResolvedValue({ id: 'snap-1' });
  });

  it('creates a snapshot for a domain with value statements', async () => {
    (db.domain.findUnique as Mock).mockResolvedValue(DOMAIN_DEFAULTS);
    (db.valueStatement.findMany as Mock).mockResolvedValue([
      { versions: [{ id: 'vsv-1' }] },
      { versions: [{ id: 'vsv-2' }] },
    ]);

    const result = await ensureDomainConfigSnapshot(DOMAIN_ID);

    expect(result).toBe('snap-1');
    expect(db.domainConfigSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          domainId: DOMAIN_ID,
          preambleVersionId: 'pv-1',
          levelPresetVersionId: 'lpv-1',
          contextId: 'ctx-1',
        }),
      }),
    );
    // valueStatementVersionIds should be sorted
    const callArgs = (db.domainConfigSnapshot.upsert as Mock).mock.calls[0][0];
    expect(callArgs.create.valueStatementVersionIds).toEqual(['vsv-1', 'vsv-2'].sort());
  });

  it('returns same snapshot ID on second call with same config (fingerprint dedup)', async () => {
    (db.domain.findUnique as Mock).mockResolvedValue(DOMAIN_DEFAULTS);
    (db.valueStatement.findMany as Mock).mockResolvedValue([{ versions: [{ id: 'vsv-1' }] }]);
    (db.domainConfigSnapshot.upsert as Mock).mockResolvedValue({ id: 'snap-existing' });

    const result1 = await ensureDomainConfigSnapshot(DOMAIN_ID);
    const result2 = await ensureDomainConfigSnapshot(DOMAIN_ID);

    expect(result1).toBe('snap-existing');
    expect(result2).toBe('snap-existing');

    // Verify fingerprints are identical across calls
    const call1Args = (db.domainConfigSnapshot.upsert as Mock).mock.calls[0][0];
    const call2Args = (db.domainConfigSnapshot.upsert as Mock).mock.calls[1][0];
    expect(call1Args.where.domainId_fingerprint.fingerprint).toBe(
      call2Args.where.domainId_fingerprint.fingerprint,
    );
  });

  it('creates new snapshot after config change (different fingerprint)', async () => {
    // First call with preamble pv-1
    (db.domain.findUnique as Mock).mockResolvedValueOnce({
      defaultPreambleVersionId: 'pv-1',
      defaultLevelPresetVersionId: null,
      defaultContextId: null,
    });
    (db.valueStatement.findMany as Mock).mockResolvedValue([]);
    (db.domainConfigSnapshot.upsert as Mock).mockResolvedValueOnce({ id: 'snap-1' });

    const result1 = await ensureDomainConfigSnapshot(DOMAIN_ID);

    // Second call with preamble pv-2 (changed)
    (db.domain.findUnique as Mock).mockResolvedValueOnce({
      defaultPreambleVersionId: 'pv-2',
      defaultLevelPresetVersionId: null,
      defaultContextId: null,
    });
    (db.domainConfigSnapshot.upsert as Mock).mockResolvedValueOnce({ id: 'snap-2' });

    const result2 = await ensureDomainConfigSnapshot(DOMAIN_ID);

    expect(result1).toBe('snap-1');
    expect(result2).toBe('snap-2');

    // Verify fingerprints differ
    const call1Args = (db.domainConfigSnapshot.upsert as Mock).mock.calls[0][0];
    const call2Args = (db.domainConfigSnapshot.upsert as Mock).mock.calls[1][0];
    expect(call1Args.where.domainId_fingerprint.fingerprint).not.toBe(
      call2Args.where.domainId_fingerprint.fingerprint,
    );
  });

  it('handles domain with no value statements (empty array + null FKs)', async () => {
    (db.domain.findUnique as Mock).mockResolvedValue({
      defaultPreambleVersionId: null,
      defaultLevelPresetVersionId: null,
      defaultContextId: null,
    });
    (db.valueStatement.findMany as Mock).mockResolvedValue([]);

    const result = await ensureDomainConfigSnapshot(DOMAIN_ID);

    expect(result).toBe('snap-1');
    const callArgs = (db.domainConfigSnapshot.upsert as Mock).mock.calls[0][0];
    expect(callArgs.create.valueStatementVersionIds).toEqual([]);
    expect(callArgs.create.preambleVersionId).toBeNull();
    expect(callArgs.create.levelPresetVersionId).toBeNull();
    expect(callArgs.create.contextId).toBeNull();
  });

  it('works inside a transaction client', async () => {
    const mockTx = {
      domain: { findUnique: vi.fn().mockResolvedValue(DOMAIN_DEFAULTS) },
      valueStatement: { findMany: vi.fn().mockResolvedValue([]) },
      domainConfigSnapshot: { upsert: vi.fn().mockResolvedValue({ id: 'snap-tx' }) },
    };

    const result = await ensureDomainConfigSnapshot(
      DOMAIN_ID,
      mockTx as unknown as Parameters<typeof ensureDomainConfigSnapshot>[1],
    );

    expect(result).toBe('snap-tx');
    expect(mockTx.domain.findUnique).toHaveBeenCalled();
    expect(mockTx.valueStatement.findMany).toHaveBeenCalled();
    expect(mockTx.domainConfigSnapshot.upsert).toHaveBeenCalled();
    // Should NOT use the module-level db mock
    expect(db.domain.findUnique).not.toHaveBeenCalled();
  });

  it('throws if domain not found', async () => {
    (db.domain.findUnique as Mock).mockResolvedValue(null);
    (db.valueStatement.findMany as Mock).mockResolvedValue([]);

    await expect(ensureDomainConfigSnapshot(DOMAIN_ID)).rejects.toThrow(
      `Domain not found: ${DOMAIN_ID}`,
    );
  });
});

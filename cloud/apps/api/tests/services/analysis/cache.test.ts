/**
 * Analysis Cache Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { computeInputHash } from '../../../src/services/analysis/cache.js';

// Mock db
vi.mock('@valuerank/db', () => ({
  db: {
    analysisResult: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe('Analysis Cache Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('computeInputHash', () => {
    it('computes consistent hash for same inputs', () => {
      const runId = 'run-123';
      const transcriptIds = ['t1', 't2', 't3'];

      const hash1 = computeInputHash(runId, transcriptIds);
      const hash2 = computeInputHash(runId, transcriptIds);

      expect(hash1).toBe(hash2);
    });

    it('sorts transcript IDs for consistent hashing', () => {
      const runId = 'run-123';

      const hash1 = computeInputHash(runId, ['t1', 't2', 't3']);
      const hash2 = computeInputHash(runId, ['t3', 't1', 't2']);

      expect(hash1).toBe(hash2);
    });

    it('returns different hash for different runIds', () => {
      const transcriptIds = ['t1', 't2'];

      const hash1 = computeInputHash('run-1', transcriptIds);
      const hash2 = computeInputHash('run-2', transcriptIds);

      expect(hash1).not.toBe(hash2);
    });

    it('returns different hash for different transcriptIds', () => {
      const runId = 'run-123';

      const hash1 = computeInputHash(runId, ['t1', 't2']);
      const hash2 = computeInputHash(runId, ['t1', 't3']);

      expect(hash1).not.toBe(hash2);
    });

    it('returns 16 character hash', () => {
      const hash = computeInputHash('run-123', ['t1', 't2']);
      expect(hash.length).toBe(16);
    });

    it('handles empty transcript list', () => {
      const hash = computeInputHash('run-123', []);
      expect(hash.length).toBe(16);
    });

    it('handles single transcript', () => {
      const hash = computeInputHash('run-123', ['t1']);
      expect(hash.length).toBe(16);
    });

    it('does not mutate input array', () => {
      const transcriptIds = ['t3', 't1', 't2'];
      const originalOrder = [...transcriptIds];

      computeInputHash('run-123', transcriptIds);

      expect(transcriptIds).toEqual(originalOrder);
    });
  });
});

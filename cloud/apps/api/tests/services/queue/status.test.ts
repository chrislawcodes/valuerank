/**
 * Unit tests for queue status service
 *
 * Tests the getQueueStatus function with mocked database queries.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '@valuerank/db';
import { getQueueStatus } from '../../../src/services/queue/status.js';
import * as queueControl from '../../../src/services/queue/control.js';

// Mock db.$queryRaw
vi.mock('@valuerank/db', () => ({
  db: {
    $queryRaw: vi.fn(),
  },
}));

// Mock queue control
vi.mock('../../../src/services/queue/control.js', () => ({
  getQueueState: vi.fn(() => ({ isRunning: true, isPaused: false })),
}));

describe('Queue Status Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getQueueStatus', () => {
    it('returns empty counts when no jobs exist', async () => {
      // Mock empty results
      vi.mocked(db.$queryRaw)
        .mockResolvedValueOnce([]) // job table
        .mockResolvedValueOnce([]); // archive table

      const status = await getQueueStatus();

      expect(status.isRunning).toBe(true);
      expect(status.isPaused).toBe(false);
      expect(status.jobTypes).toHaveLength(5);
      expect(status.totals).toEqual({
        pending: 0,
        active: 0,
        completed: 0,
        failed: 0,
      });
    });

    it('counts pending jobs from created state', async () => {
      vi.mocked(db.$queryRaw)
        .mockResolvedValueOnce([
          { name: 'probe_scenario', state: 'created', count: BigInt(5) },
        ])
        .mockResolvedValueOnce([]);

      const status = await getQueueStatus();

      const probeType = status.jobTypes.find((jt) => jt.type === 'probe_scenario');
      expect(probeType?.pending).toBe(5);
      expect(status.totals.pending).toBe(5);
    });

    it('counts pending jobs from retry state', async () => {
      vi.mocked(db.$queryRaw)
        .mockResolvedValueOnce([
          { name: 'probe_scenario', state: 'retry', count: BigInt(3) },
        ])
        .mockResolvedValueOnce([]);

      const status = await getQueueStatus();

      const probeType = status.jobTypes.find((jt) => jt.type === 'probe_scenario');
      expect(probeType?.pending).toBe(3);
    });

    it('counts active jobs', async () => {
      vi.mocked(db.$queryRaw)
        .mockResolvedValueOnce([
          { name: 'analyze_basic', state: 'active', count: BigInt(2) },
        ])
        .mockResolvedValueOnce([]);

      const status = await getQueueStatus();

      const basicType = status.jobTypes.find((jt) => jt.type === 'analyze_basic');
      expect(basicType?.active).toBe(2);
      expect(status.totals.active).toBe(2);
    });

    it('counts completed jobs from job table', async () => {
      vi.mocked(db.$queryRaw)
        .mockResolvedValueOnce([
          { name: 'analyze_deep', state: 'completed', count: BigInt(10) },
        ])
        .mockResolvedValueOnce([]);

      const status = await getQueueStatus();

      const deepType = status.jobTypes.find((jt) => jt.type === 'analyze_deep');
      expect(deepType?.completed).toBe(10);
      expect(status.totals.completed).toBe(10);
    });

    it('counts failed jobs from failed state', async () => {
      vi.mocked(db.$queryRaw)
        .mockResolvedValueOnce([
          { name: 'probe_scenario', state: 'failed', count: BigInt(2) },
        ])
        .mockResolvedValueOnce([]);

      const status = await getQueueStatus();

      const probeType = status.jobTypes.find((jt) => jt.type === 'probe_scenario');
      expect(probeType?.failed).toBe(2);
      expect(status.totals.failed).toBe(2);
    });

    it('counts expired jobs as failed', async () => {
      vi.mocked(db.$queryRaw)
        .mockResolvedValueOnce([
          { name: 'probe_scenario', state: 'expired', count: BigInt(1) },
        ])
        .mockResolvedValueOnce([]);

      const status = await getQueueStatus();

      const probeType = status.jobTypes.find((jt) => jt.type === 'probe_scenario');
      expect(probeType?.failed).toBe(1);
    });

    it('counts cancelled jobs as failed', async () => {
      vi.mocked(db.$queryRaw)
        .mockResolvedValueOnce([
          { name: 'analyze_basic', state: 'cancelled', count: BigInt(4) },
        ])
        .mockResolvedValueOnce([]);

      const status = await getQueueStatus();

      const basicType = status.jobTypes.find((jt) => jt.type === 'analyze_basic');
      expect(basicType?.failed).toBe(4);
    });

    it('includes archive completed counts', async () => {
      vi.mocked(db.$queryRaw)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { name: 'probe_scenario', state: 'completed', count: BigInt(100) },
        ]);

      const status = await getQueueStatus();

      const probeType = status.jobTypes.find((jt) => jt.type === 'probe_scenario');
      expect(probeType?.completed).toBe(100);
    });

    it('includes archive failed counts', async () => {
      vi.mocked(db.$queryRaw)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { name: 'analyze_deep', state: 'failed', count: BigInt(5) },
        ]);

      const status = await getQueueStatus();

      const deepType = status.jobTypes.find((jt) => jt.type === 'analyze_deep');
      expect(deepType?.failed).toBe(5);
    });

    it('combines job and archive counts', async () => {
      vi.mocked(db.$queryRaw)
        .mockResolvedValueOnce([
          { name: 'probe_scenario', state: 'created', count: BigInt(10) },
          { name: 'probe_scenario', state: 'active', count: BigInt(3) },
          { name: 'probe_scenario', state: 'completed', count: BigInt(50) },
        ])
        .mockResolvedValueOnce([
          { name: 'probe_scenario', state: 'completed', count: BigInt(200) },
          { name: 'probe_scenario', state: 'failed', count: BigInt(5) },
        ]);

      const status = await getQueueStatus();

      const probeType = status.jobTypes.find((jt) => jt.type === 'probe_scenario');
      expect(probeType?.pending).toBe(10);
      expect(probeType?.active).toBe(3);
      expect(probeType?.completed).toBe(250); // 50 + 200
      expect(probeType?.failed).toBe(5);
    });

    it('aggregates counts across all job types', async () => {
      vi.mocked(db.$queryRaw)
        .mockResolvedValueOnce([
          { name: 'probe_scenario', state: 'created', count: BigInt(5) },
          { name: 'analyze_basic', state: 'active', count: BigInt(2) },
          { name: 'analyze_deep', state: 'completed', count: BigInt(10) },
        ])
        .mockResolvedValueOnce([
          { name: 'probe_scenario', state: 'failed', count: BigInt(1) },
        ]);

      const status = await getQueueStatus();

      expect(status.totals.pending).toBe(5);
      expect(status.totals.active).toBe(2);
      expect(status.totals.completed).toBe(10);
      expect(status.totals.failed).toBe(1);
    });

    it('ignores unknown job types', async () => {
      vi.mocked(db.$queryRaw)
        .mockResolvedValueOnce([
          { name: 'unknown:job', state: 'created', count: BigInt(100) },
        ])
        .mockResolvedValueOnce([]);

      const status = await getQueueStatus();

      // Unknown jobs should not affect totals
      expect(status.totals.pending).toBe(0);
      expect(status.jobTypes.find((jt) => jt.type === 'unknown:job')).toBeUndefined();
    });

    it('returns default values when query fails', async () => {
      vi.mocked(db.$queryRaw).mockRejectedValue(new Error('Database error'));

      const status = await getQueueStatus();

      expect(status.isRunning).toBe(true);
      expect(status.isPaused).toBe(false);
      expect(status.jobTypes).toHaveLength(5);
      expect(status.totals).toEqual({
        pending: 0,
        active: 0,
        completed: 0,
        failed: 0,
      });
    });

    it('reflects paused state from control', async () => {
      vi.mocked(queueControl.getQueueState).mockReturnValue({
        isRunning: true,
        isPaused: true,
      });
      vi.mocked(db.$queryRaw)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const status = await getQueueStatus();

      expect(status.isRunning).toBe(true);
      expect(status.isPaused).toBe(true);
    });

    it('reflects stopped state from control', async () => {
      vi.mocked(queueControl.getQueueState).mockReturnValue({
        isRunning: false,
        isPaused: false,
      });
      vi.mocked(db.$queryRaw)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const status = await getQueueStatus();

      expect(status.isRunning).toBe(false);
      expect(status.isPaused).toBe(false);
    });
  });
});

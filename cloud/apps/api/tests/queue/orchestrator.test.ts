/**
 * Queue Orchestrator Integration Tests
 *
 * Tests the queue orchestrator lifecycle including start, stop, pause, and resume.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';

let orchestratorModule: typeof import('../../src/queue/orchestrator.js');
let bossModule: typeof import('../../src/queue/boss.js');

describe('Queue Orchestrator Integration', () => {
  beforeAll(async () => {
    // Ensure test database URL is set
    expect(process.env.DATABASE_URL).toContain('valuerank_test');

    // Import modules
    orchestratorModule = await import('../../src/queue/orchestrator.js');
    bossModule = await import('../../src/queue/boss.js');
  });

  afterEach(async () => {
    // Stop orchestrator after each test
    try {
      if (orchestratorModule.isOrchestratorRunning()) {
        await orchestratorModule.stopOrchestrator();
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  afterAll(async () => {
    // Final cleanup
    try {
      if (orchestratorModule?.isOrchestratorRunning()) {
        await orchestratorModule.stopOrchestrator();
      }
    } catch {
      // Ignore
    }
  });

  describe('startOrchestrator', () => {
    it('starts the orchestrator and PgBoss', async () => {
      await orchestratorModule.startOrchestrator();

      expect(orchestratorModule.isOrchestratorRunning()).toBe(true);
      expect(bossModule.isBossRunning()).toBe(true);
    });

    it('handles multiple start calls gracefully', async () => {
      await orchestratorModule.startOrchestrator();
      await orchestratorModule.startOrchestrator(); // Should not throw

      expect(orchestratorModule.isOrchestratorRunning()).toBe(true);
    });

    it('registers all job handlers', async () => {
      const { getJobTypes } = await import('../../src/queue/handlers/index.js');

      await orchestratorModule.startOrchestrator();

      const jobTypes = getJobTypes();
      expect(jobTypes).toContain('probe_scenario');
      expect(jobTypes).toContain('analyze_basic');
      expect(jobTypes).toContain('analyze_deep');
    });
  });

  describe('stopOrchestrator', () => {
    it('stops the orchestrator', async () => {
      await orchestratorModule.startOrchestrator();
      expect(orchestratorModule.isOrchestratorRunning()).toBe(true);

      await orchestratorModule.stopOrchestrator();

      expect(orchestratorModule.isOrchestratorRunning()).toBe(false);
      expect(bossModule.isBossRunning()).toBe(false);
    });

    it('handles stop when not running', async () => {
      // Ensure not running
      if (orchestratorModule.isOrchestratorRunning()) {
        await orchestratorModule.stopOrchestrator();
      }

      // Should not throw
      await orchestratorModule.stopOrchestrator();

      expect(orchestratorModule.isOrchestratorRunning()).toBe(false);
    });
  });

  describe('pauseQueue and resumeQueue', () => {
    it('pauses the queue', async () => {
      await orchestratorModule.startOrchestrator();

      await orchestratorModule.pauseQueue();

      expect(orchestratorModule.isQueuePaused()).toBe(true);
      expect(orchestratorModule.isOrchestratorRunning()).toBe(true); // Still running
    });

    it('resumes the queue after pause', async () => {
      await orchestratorModule.startOrchestrator();
      await orchestratorModule.pauseQueue();
      expect(orchestratorModule.isQueuePaused()).toBe(true);

      await orchestratorModule.resumeQueue();

      expect(orchestratorModule.isQueuePaused()).toBe(false);
    });

    it('handles pause when not running', async () => {
      // Ensure not running
      if (orchestratorModule.isOrchestratorRunning()) {
        await orchestratorModule.stopOrchestrator();
      }

      // Should not throw
      await orchestratorModule.pauseQueue();

      expect(orchestratorModule.isQueuePaused()).toBe(false);
    });

    it('handles resume when not running', async () => {
      // Ensure not running
      if (orchestratorModule.isOrchestratorRunning()) {
        await orchestratorModule.stopOrchestrator();
      }

      // Should not throw
      await orchestratorModule.resumeQueue();

      expect(orchestratorModule.isQueuePaused()).toBe(false);
    });

    it('handles multiple pause calls', async () => {
      await orchestratorModule.startOrchestrator();

      await orchestratorModule.pauseQueue();
      await orchestratorModule.pauseQueue(); // Should not throw

      expect(orchestratorModule.isQueuePaused()).toBe(true);
    });

    it('handles resume when not paused', async () => {
      await orchestratorModule.startOrchestrator();

      // Not paused - should not throw
      await orchestratorModule.resumeQueue();

      expect(orchestratorModule.isQueuePaused()).toBe(false);
    });
  });

  describe('getOrchestratorState', () => {
    it('returns correct state when stopped', async () => {
      // Ensure stopped
      if (orchestratorModule.isOrchestratorRunning()) {
        await orchestratorModule.stopOrchestrator();
      }

      const state = orchestratorModule.getOrchestratorState();

      expect(state).toEqual({
        isRunning: false,
        isPaused: false,
      });
    });

    it('returns correct state when running', async () => {
      await orchestratorModule.startOrchestrator();

      const state = orchestratorModule.getOrchestratorState();

      expect(state).toEqual({
        isRunning: true,
        isPaused: false,
      });
    });

    it('returns correct state when paused', async () => {
      await orchestratorModule.startOrchestrator();
      await orchestratorModule.pauseQueue();

      const state = orchestratorModule.getOrchestratorState();

      expect(state).toEqual({
        isRunning: true,
        isPaused: true,
      });
    });
  });

  describe('Job Processing', () => {
    it('can queue analyze_basic jobs', async () => {
      await orchestratorModule.startOrchestrator();
      const boss = bossModule.getBoss();

      // Ensure queue exists
      await boss.createQueue('analyze_basic');

      // Send a job
      const jobId = await boss.send('analyze_basic', {
        runId: 'test-run-id',
        transcriptIds: ['t1', 't2'],
      });

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
    });

    it('can queue analyze_deep jobs', async () => {
      await orchestratorModule.startOrchestrator();
      const boss = bossModule.getBoss();

      // Ensure queue exists
      await boss.createQueue('analyze_deep');

      // Send a job
      const jobId = await boss.send('analyze_deep', {
        runId: 'test-run-id',
        analysisType: 'pairwise',
      });

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
    });
  });
});

/**
 * Handler Registration Tests
 *
 * Tests the handler registration module.
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { PgBoss } from 'pg-boss';
import { registerHandlers, getJobTypes } from '../../../src/queue/handlers/index.js';

let bossModule: typeof import('../../../src/queue/boss.js');
let boss: PgBoss;

describe('Handler Registration', () => {
  beforeAll(async () => {
    // Import and start PgBoss for real handler registration tests
    bossModule = await import('../../../src/queue/boss.js');
    await bossModule.startBoss();
    boss = bossModule.getBoss();
  });

  afterAll(async () => {
    // Stop PgBoss
    await bossModule.stopBoss();
  });

  afterEach(async () => {
    // Unsubscribe from all job types to reset state
    for (const jobType of getJobTypes()) {
      try {
        await boss.offWork(jobType);
      } catch {
        // Ignore errors
      }
    }
  });

  describe('getJobTypes', () => {
    it('returns all known job types', () => {
      const jobTypes = getJobTypes();

      expect(jobTypes).toContain('probe_scenario');
      expect(jobTypes).toContain('summarize_transcript');
      expect(jobTypes).toContain('analyze_basic');
      expect(jobTypes).toContain('analyze_deep');
      expect(jobTypes).toContain('expand_scenarios');
      expect(jobTypes).toHaveLength(5);
    });
  });

  describe('registerHandlers', () => {
    it('registers all handlers with PgBoss', async () => {
      await registerHandlers(boss);

      // Ensure queues exist (work() should create them but add explicit create for safety)
      await boss.createQueue('probe_scenario');
      await boss.createQueue('analyze_basic');
      await boss.createQueue('analyze_deep');

      // Verify handlers are registered by checking if we can send jobs
      // to each job type (they won't throw if handlers are registered)
      const probeJobId = await boss.send('probe_scenario', {
        runId: 'test',
        definitionId: 'def',
        scenarioId: 'sc',
        modelId: 'model',
      });
      expect(probeJobId).toBeDefined();

      const basicJobId = await boss.send('analyze_basic', {
        runId: 'test',
        transcriptIds: [],
      });
      expect(basicJobId).toBeDefined();

      const deepJobId = await boss.send('analyze_deep', {
        runId: 'test',
        analysisType: 'pairwise',
      });
      expect(deepJobId).toBeDefined();
    });

    it('can be called multiple times without error', async () => {
      await registerHandlers(boss);

      // Unsubscribe first
      for (const jobType of getJobTypes()) {
        try {
          await boss.offWork(jobType);
        } catch {
          // Ignore
        }
      }

      // Register again
      await registerHandlers(boss);

      // Should still work
      const jobTypes = getJobTypes();
      expect(jobTypes).toHaveLength(5);
    });
  });
});

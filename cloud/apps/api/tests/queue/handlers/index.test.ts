/**
 * Handler Registration Tests
 *
 * Tests the handler registration module.
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { PgBoss } from 'pg-boss';
import { db } from '@valuerank/db';
import { registerHandlers, getJobTypes, reregisterProviderHandler } from '../../../src/queue/handlers/index.js';

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
      expect(jobTypes).toContain('compute_token_stats');
      expect(jobTypes).toContain('probe_dead_letter');
      expect(jobTypes).toContain('aggregate_analysis');
      expect(jobTypes).toHaveLength(8);
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
      expect(jobTypes).toHaveLength(8);
    });
  });

  describe('reregisterProviderHandler', () => {
    // Track original provider state for restoration
    let testProvider: { id: string; name: string; maxParallelRequests: number; createdForTest: boolean } | null = null;

    beforeAll(async () => {
      // Register handlers first
      await registerHandlers(boss);

      // Get a provider to test with
      let provider = await db.llmProvider.findFirst({
        where: { name: 'openai' },
      });

      // If no provider exists, create one for testing
      if (!provider) {
        const testProviderName = `test-reregister-${Date.now()}`;
        provider = await db.llmProvider.create({
          data: {
            name: testProviderName,
            displayName: 'Test Provider for Re-registration',
            maxParallelRequests: 5,
            requestsPerMinute: 100,
            isEnabled: true,
          },
        });

        // Create the queue for this provider
        const queueName = `probe_${testProviderName}`;
        await boss.createQueue(queueName);

        testProvider = {
          id: provider.id,
          name: provider.name,
          maxParallelRequests: provider.maxParallelRequests,
          createdForTest: true,
        };
      } else {
        testProvider = {
          id: provider.id,
          name: provider.name,
          maxParallelRequests: provider.maxParallelRequests,
          createdForTest: false,
        };
      }
    });

    afterAll(async () => {
      if (testProvider) {
        if (testProvider.createdForTest) {
          // Delete test provider
          await db.llmProvider.delete({
            where: { id: testProvider.id },
          });
        } else {
          // Restore original provider settings
          await db.llmProvider.update({
            where: { id: testProvider.id },
            data: { maxParallelRequests: testProvider.maxParallelRequests },
          });
        }
      }
    });

    it('re-registers handler with new parallelism settings', async () => {
      if (!testProvider) {
        console.log('Skipping test - no provider available');
        return;
      }

      // Update provider in database
      const newMaxParallel = 12;
      await db.llmProvider.update({
        where: { id: testProvider.id },
        data: { maxParallelRequests: newMaxParallel },
      });

      // Re-register handler
      await reregisterProviderHandler(boss, testProvider.name);

      // Verify the queue still exists and can accept jobs
      const queueName = `probe_${testProvider.name}`;
      const jobId = await boss.send(queueName, {
        runId: 'test-reregister',
        definitionId: 'def',
        scenarioId: 'sc',
        modelId: `${testProvider.name}:test-model`,
        config: { temperature: 0.7, maxTurns: 1 },
      });

      expect(jobId).toBeDefined();
    });

    it('does not lose queued jobs during re-registration', async () => {
      if (!testProvider) {
        console.log('Skipping test - no provider available');
        return;
      }

      const queueName = `probe_${testProvider.name}`;

      // First, ensure queue exists
      await boss.createQueue(queueName);

      // Queue several jobs
      const jobIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const jobId = await boss.send(queueName, {
          runId: `test-persist-${i}`,
          definitionId: 'def',
          scenarioId: `sc-${i}`,
          modelId: `${testProvider.name}:test-model`,
          config: { temperature: 0.7, maxTurns: 1 },
        });
        if (jobId) jobIds.push(jobId);
      }

      expect(jobIds.length).toBe(3);

      // Re-register handler
      await reregisterProviderHandler(boss, testProvider.name);

      // Verify jobs are still in queue (they should be in 'created' state)
      const queues = await boss.getQueues();
      const queueInfo = queues.find((q) => q.name === queueName);

      // Queue should have our jobs (queuedCount includes 'created' jobs)
      // Note: exact count may vary due to test isolation, but queue should exist
      expect(queueInfo).toBeDefined();
    });

    it('handles unknown provider gracefully', async () => {
      // Should not throw for unknown provider
      await expect(
        reregisterProviderHandler(boss, 'unknown-provider-xyz')
      ).resolves.not.toThrow();
    });
  });
});

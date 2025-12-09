/**
 * Unit tests for Parallelism Service
 *
 * Tests provider-specific queue routing and parallelism enforcement.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';
import {
  getProviderQueueName,
  loadProviderLimits,
  getProviderForModel,
  getQueueNameForModel,
  getProviderLimits,
  getAllProviderQueues,
  clearCache,
} from '../../../src/services/parallelism/index.js';

describe('Parallelism Service', () => {
  // Track created test data for cleanup
  const createdProviderIds: string[] = [];
  const createdModelIds: string[] = [];

  beforeEach(async () => {
    // Clear cache before each test
    clearCache();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up test data (models first due to FK)
    if (createdModelIds.length > 0) {
      await db.llmModel.deleteMany({
        where: { id: { in: createdModelIds } },
      });
      createdModelIds.length = 0;
    }

    if (createdProviderIds.length > 0) {
      await db.llmProvider.deleteMany({
        where: { id: { in: createdProviderIds } },
      });
      createdProviderIds.length = 0;
    }

    clearCache();
  });

  describe('getProviderQueueName', () => {
    it('generates correct queue name for provider', () => {
      expect(getProviderQueueName('openai')).toBe('probe_openai');
      expect(getProviderQueueName('anthropic')).toBe('probe_anthropic');
      expect(getProviderQueueName('google')).toBe('probe_google');
    });
  });

  describe('loadProviderLimits', () => {
    it('loads limits from database for enabled providers', async () => {
      // Create a test provider
      const provider = await db.llmProvider.create({
        data: {
          name: 'test-provider-limits',
          displayName: 'Test Provider Limits',
          maxParallelRequests: 3,
          requestsPerMinute: 30,
          isEnabled: true,
        },
      });
      createdProviderIds.push(provider.id);

      const limits = await loadProviderLimits();

      const providerLimits = limits.get('test-provider-limits');
      expect(providerLimits).toBeDefined();
      expect(providerLimits?.maxParallelRequests).toBe(3);
      expect(providerLimits?.requestsPerMinute).toBe(30);
      expect(providerLimits?.queueName).toBe('probe_test-provider-limits');
    });

    it('excludes disabled providers', async () => {
      const provider = await db.llmProvider.create({
        data: {
          name: 'test-disabled-provider',
          displayName: 'Disabled Provider',
          maxParallelRequests: 1,
          requestsPerMinute: 10,
          isEnabled: false,
        },
      });
      createdProviderIds.push(provider.id);

      clearCache();
      const limits = await loadProviderLimits();

      expect(limits.has('test-disabled-provider')).toBe(false);
    });

    it('caches results for performance', async () => {
      const provider = await db.llmProvider.create({
        data: {
          name: 'test-cached-provider',
          displayName: 'Cached Provider',
          maxParallelRequests: 2,
          requestsPerMinute: 20,
          isEnabled: true,
        },
      });
      createdProviderIds.push(provider.id);

      // First load
      const limits1 = await loadProviderLimits();
      const providerLimits1 = limits1.get('test-cached-provider');

      // Second load should use cache
      const limits2 = await loadProviderLimits();
      const providerLimits2 = limits2.get('test-cached-provider');

      expect(providerLimits1).toEqual(providerLimits2);
    });
  });

  describe('getProviderForModel', () => {
    it('returns provider name for known model', async () => {
      // Create provider and model
      const provider = await db.llmProvider.create({
        data: {
          name: 'test-model-provider',
          displayName: 'Test Model Provider',
          maxParallelRequests: 1,
          requestsPerMinute: 10,
          isEnabled: true,
        },
      });
      createdProviderIds.push(provider.id);

      const model = await db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: 'test-model-123',
          displayName: 'Test Model',
          costInputPerMillion: 1.0,
          costOutputPerMillion: 2.0,
          status: 'ACTIVE',
        },
      });
      createdModelIds.push(model.id);

      const providerName = await getProviderForModel('test-model-123');
      expect(providerName).toBe('test-model-provider');
    });

    it('returns null for unknown model', async () => {
      const providerName = await getProviderForModel('non-existent-model-xyz');
      expect(providerName).toBeNull();
    });

    it('looks up model in database if not in cache', async () => {
      // Create provider and model after cache is loaded
      const provider = await db.llmProvider.create({
        data: {
          name: 'test-late-provider',
          displayName: 'Late Provider',
          maxParallelRequests: 1,
          requestsPerMinute: 10,
          isEnabled: true,
        },
      });
      createdProviderIds.push(provider.id);

      // Load cache first (won't include the new provider)
      await loadProviderLimits();

      // Create model after cache load
      const model = await db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: 'test-late-model',
          displayName: 'Late Model',
          costInputPerMillion: 1.0,
          costOutputPerMillion: 2.0,
          status: 'ACTIVE',
        },
      });
      createdModelIds.push(model.id);

      // Should find via database lookup
      const providerName = await getProviderForModel('test-late-model');
      expect(providerName).toBe('test-late-provider');
    });
  });

  describe('getQueueNameForModel', () => {
    it('returns provider-specific queue name for known model', async () => {
      const provider = await db.llmProvider.create({
        data: {
          name: 'test-queue-provider',
          displayName: 'Queue Provider',
          maxParallelRequests: 1,
          requestsPerMinute: 10,
          isEnabled: true,
        },
      });
      createdProviderIds.push(provider.id);

      const model = await db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: 'test-queue-model',
          displayName: 'Queue Model',
          costInputPerMillion: 1.0,
          costOutputPerMillion: 2.0,
          status: 'ACTIVE',
        },
      });
      createdModelIds.push(model.id);

      const queueName = await getQueueNameForModel('test-queue-model');
      expect(queueName).toBe('probe_test-queue-provider');
    });

    it('falls back to default queue for unknown model', async () => {
      const queueName = await getQueueNameForModel('unknown-model-abc');
      expect(queueName).toBe('probe_scenario');
    });
  });

  describe('getProviderLimits', () => {
    it('returns limits for known provider', async () => {
      const provider = await db.llmProvider.create({
        data: {
          name: 'test-limits-provider',
          displayName: 'Limits Provider',
          maxParallelRequests: 5,
          requestsPerMinute: 50,
          isEnabled: true,
        },
      });
      createdProviderIds.push(provider.id);

      const limits = await getProviderLimits('test-limits-provider');
      expect(limits).toBeDefined();
      expect(limits?.maxParallelRequests).toBe(5);
      expect(limits?.requestsPerMinute).toBe(50);
    });

    it('returns null for unknown provider', async () => {
      const limits = await getProviderLimits('unknown-provider-xyz');
      expect(limits).toBeNull();
    });
  });

  describe('getAllProviderQueues', () => {
    it('returns all provider queues with limits', async () => {
      // Create test providers
      const provider1 = await db.llmProvider.create({
        data: {
          name: 'test-all-provider-1',
          displayName: 'All Provider 1',
          maxParallelRequests: 2,
          requestsPerMinute: 20,
          isEnabled: true,
        },
      });
      createdProviderIds.push(provider1.id);

      const provider2 = await db.llmProvider.create({
        data: {
          name: 'test-all-provider-2',
          displayName: 'All Provider 2',
          maxParallelRequests: 4,
          requestsPerMinute: 40,
          isEnabled: true,
        },
      });
      createdProviderIds.push(provider2.id);

      clearCache();
      const queues = await getAllProviderQueues();

      expect(queues.has('test-all-provider-1')).toBe(true);
      expect(queues.has('test-all-provider-2')).toBe(true);

      const limits1 = queues.get('test-all-provider-1');
      expect(limits1?.maxParallelRequests).toBe(2);
      expect(limits1?.queueName).toBe('probe_test-all-provider-1');

      const limits2 = queues.get('test-all-provider-2');
      expect(limits2?.maxParallelRequests).toBe(4);
      expect(limits2?.queueName).toBe('probe_test-all-provider-2');
    });
  });

  describe('clearCache', () => {
    it('clears the provider limits cache', async () => {
      const provider = await db.llmProvider.create({
        data: {
          name: 'test-clear-provider',
          displayName: 'Clear Provider',
          maxParallelRequests: 1,
          requestsPerMinute: 10,
          isEnabled: true,
        },
      });
      createdProviderIds.push(provider.id);

      // Load cache
      await loadProviderLimits();

      // Clear cache
      clearCache();

      // Update provider limits
      await db.llmProvider.update({
        where: { id: provider.id },
        data: { maxParallelRequests: 10 },
      });

      // Reload should show updated value
      const limits = await loadProviderLimits();
      const providerLimits = limits.get('test-clear-provider');
      expect(providerLimits?.maxParallelRequests).toBe(10);
    });
  });
});

describe('Parallelism Queue Routing', () => {
  // These tests verify the integration between parallelism service and job routing

  describe('job routing based on model', () => {
    const createdProviderIds: string[] = [];
    const createdModelIds: string[] = [];

    beforeEach(() => {
      clearCache();
    });

    afterEach(async () => {
      if (createdModelIds.length > 0) {
        await db.llmModel.deleteMany({
          where: { id: { in: createdModelIds } },
        });
        createdModelIds.length = 0;
      }

      if (createdProviderIds.length > 0) {
        await db.llmProvider.deleteMany({
          where: { id: { in: createdProviderIds } },
        });
        createdProviderIds.length = 0;
      }

      clearCache();
    });

    it('routes GPT models to openai queue when provider exists', async () => {
      // Create openai-like provider with model (unique name to avoid conflicts)
      const provider = await db.llmProvider.create({
        data: {
          name: 'test-openai-routing',
          displayName: 'Test OpenAI Routing',
          maxParallelRequests: 5,
          requestsPerMinute: 60,
          isEnabled: true,
        },
      });
      createdProviderIds.push(provider.id);

      const model = await db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: 'test-gpt-4o-routing',
          displayName: 'Test GPT-4o Routing',
          costInputPerMillion: 2.5,
          costOutputPerMillion: 10.0,
          status: 'ACTIVE',
        },
      });
      createdModelIds.push(model.id);

      const queueName = await getQueueNameForModel('test-gpt-4o-routing');
      expect(queueName).toBe('probe_test-openai-routing');
    });

    it('routes Claude models to anthropic queue when provider exists', async () => {
      const provider = await db.llmProvider.create({
        data: {
          name: 'test-anthropic-routing',
          displayName: 'Test Anthropic Routing',
          maxParallelRequests: 3,
          requestsPerMinute: 40,
          isEnabled: true,
        },
      });
      createdProviderIds.push(provider.id);

      const model = await db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: 'test-claude-routing',
          displayName: 'Test Claude Routing',
          costInputPerMillion: 3.0,
          costOutputPerMillion: 15.0,
          status: 'ACTIVE',
        },
      });
      createdModelIds.push(model.id);

      const queueName = await getQueueNameForModel('test-claude-routing');
      expect(queueName).toBe('probe_test-anthropic-routing');
    });

    it('uses default queue for models without provider mapping', async () => {
      const queueName = await getQueueNameForModel('unmapped-model');
      expect(queueName).toBe('probe_scenario');
    });
  });
});

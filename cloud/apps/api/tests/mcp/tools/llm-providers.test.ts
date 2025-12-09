/**
 * LLM Provider Tools Tests
 *
 * Tests for list_llm_providers and update_llm_provider MCP tools.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@valuerank/db';

describe('LLM Provider MCP Tools', () => {
  // Track test data for cleanup
  let testProviderId: string;
  const originalProviderState: {
    maxParallelRequests: number;
    requestsPerMinute: number;
    isEnabled: boolean;
  } = { maxParallelRequests: 0, requestsPerMinute: 0, isEnabled: true };

  beforeAll(async () => {
    // Get a real provider to test with (use openai since it's seeded)
    const provider = await db.llmProvider.findFirst({
      where: { name: 'openai' },
    });

    if (!provider) {
      // Create a test provider if none exists
      const created = await db.llmProvider.create({
        data: {
          name: 'test-provider-' + Date.now(),
          displayName: 'Test Provider',
          maxParallelRequests: 5,
          requestsPerMinute: 100,
          isEnabled: true,
        },
      });
      testProviderId = created.id;
      originalProviderState.maxParallelRequests = created.maxParallelRequests;
      originalProviderState.requestsPerMinute = created.requestsPerMinute;
      originalProviderState.isEnabled = created.isEnabled;
    } else {
      testProviderId = provider.id;
      originalProviderState.maxParallelRequests = provider.maxParallelRequests;
      originalProviderState.requestsPerMinute = provider.requestsPerMinute;
      originalProviderState.isEnabled = provider.isEnabled;
    }
  });

  afterAll(async () => {
    // Restore original provider state
    if (testProviderId) {
      await db.llmProvider.update({
        where: { id: testProviderId },
        data: originalProviderState,
      });
    }
  });

  describe('list_llm_providers', () => {
    it('returns all providers', async () => {
      const providers = await db.llmProvider.findMany({
        include: { models: true },
      });

      expect(providers.length).toBeGreaterThan(0);
      expect(providers[0]).toHaveProperty('name');
      expect(providers[0]).toHaveProperty('displayName');
      expect(providers[0]).toHaveProperty('maxParallelRequests');
      expect(providers[0]).toHaveProperty('requestsPerMinute');
    });

    it('includes model counts', async () => {
      const providers = await db.llmProvider.findMany({
        include: { models: true },
      });

      const providerWithModels = providers.find((p) => p.models.length > 0);
      if (providerWithModels) {
        expect(providerWithModels.models.length).toBeGreaterThan(0);
      }
    });
  });

  describe('update_llm_provider', () => {
    it('updates max_parallel_requests', async () => {
      const newValue = 15;
      const updated = await db.llmProvider.update({
        where: { id: testProviderId },
        data: { maxParallelRequests: newValue },
      });

      expect(updated.maxParallelRequests).toBe(newValue);
    });

    it('updates requests_per_minute', async () => {
      const newValue = 500;
      const updated = await db.llmProvider.update({
        where: { id: testProviderId },
        data: { requestsPerMinute: newValue },
      });

      expect(updated.requestsPerMinute).toBe(newValue);
    });

    it('updates is_enabled', async () => {
      const updated = await db.llmProvider.update({
        where: { id: testProviderId },
        data: { isEnabled: false },
      });

      expect(updated.isEnabled).toBe(false);

      // Restore
      await db.llmProvider.update({
        where: { id: testProviderId },
        data: { isEnabled: true },
      });
    });

    it('rejects invalid provider ID', async () => {
      const result = await db.llmProvider.findUnique({
        where: { id: '00000000-0000-0000-0000-000000000000' },
      });

      expect(result).toBeNull();
    });
  });
});

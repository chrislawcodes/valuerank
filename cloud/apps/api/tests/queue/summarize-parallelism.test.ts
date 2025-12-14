/**
 * Summarization Parallelism Integration Tests
 *
 * Tests that the summarize_transcript handler is registered with
 * the correct batchSize based on the system setting.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';
import {
  getMaxParallelSummarizations,
  setMaxParallelSummarizations,
  clearSummarizationCache,
  getDefaultParallelism,
} from '../../src/services/summarization-parallelism/index.js';

describe('Summarization Parallelism Integration', () => {
  const SETTING_KEY = 'infra_max_parallel_summarizations';

  beforeEach(async () => {
    clearSummarizationCache();
    await db.systemSetting.deleteMany({
      where: { key: SETTING_KEY },
    });
  });

  afterEach(async () => {
    await db.systemSetting.deleteMany({
      where: { key: SETTING_KEY },
    });
    clearSummarizationCache();
  });

  describe('default batchSize', () => {
    it('uses default batchSize (8) when setting is not configured', async () => {
      const batchSize = await getMaxParallelSummarizations();
      expect(batchSize).toBe(8);
      expect(batchSize).toBe(getDefaultParallelism());
    });
  });

  describe('configured batchSize', () => {
    it('uses configured batchSize when setting exists', async () => {
      await setMaxParallelSummarizations(16);
      clearSummarizationCache();

      const batchSize = await getMaxParallelSummarizations();
      expect(batchSize).toBe(16);
    });

    it('respects minimum batchSize of 1', async () => {
      await setMaxParallelSummarizations(1);
      clearSummarizationCache();

      const batchSize = await getMaxParallelSummarizations();
      expect(batchSize).toBe(1);
    });

    it('respects maximum batchSize of 100', async () => {
      await setMaxParallelSummarizations(100);
      clearSummarizationCache();

      const batchSize = await getMaxParallelSummarizations();
      expect(batchSize).toBe(100);
    });
  });

  describe('cache behavior for handler registration', () => {
    it('returns cached value within TTL', async () => {
      await setMaxParallelSummarizations(20);

      // First call - should be 20
      expect(await getMaxParallelSummarizations()).toBe(20);

      // Update DB directly (simulating external change)
      await db.systemSetting.update({
        where: { key: SETTING_KEY },
        data: { value: { value: 30 } },
      });

      // Should still return cached value
      expect(await getMaxParallelSummarizations()).toBe(20);

      // After cache clear, should return new value
      clearSummarizationCache();
      expect(await getMaxParallelSummarizations()).toBe(30);
    });

    it('cache is updated immediately on set', async () => {
      // Set initial value
      await setMaxParallelSummarizations(10);
      expect(await getMaxParallelSummarizations()).toBe(10);

      // Set new value - cache should update immediately
      await setMaxParallelSummarizations(25);
      expect(await getMaxParallelSummarizations()).toBe(25);
    });
  });

  describe('handler registration pattern', () => {
    it('getMaxParallelSummarizations returns value suitable for batchSize', async () => {
      // Test that the returned value is always a valid positive integer
      const defaultValue = await getMaxParallelSummarizations();
      expect(Number.isInteger(defaultValue)).toBe(true);
      expect(defaultValue).toBeGreaterThanOrEqual(1);
      expect(defaultValue).toBeLessThanOrEqual(100);

      // Set a specific value and verify
      await setMaxParallelSummarizations(32);
      clearSummarizationCache();
      const configuredValue = await getMaxParallelSummarizations();
      expect(Number.isInteger(configuredValue)).toBe(true);
      expect(configuredValue).toBe(32);
    });
  });

  describe('graceful setting changes [T037]', () => {
    it('setting changes update cache immediately for new registrations', async () => {
      // Initial setting
      await setMaxParallelSummarizations(8);
      expect(await getMaxParallelSummarizations()).toBe(8);

      // Change setting to new value
      await setMaxParallelSummarizations(4);

      // Cache should be updated immediately (no clear needed)
      expect(await getMaxParallelSummarizations()).toBe(4);
    });

    it('clearSummarizationCache allows fresh reads after external changes', async () => {
      // Set initial value
      await setMaxParallelSummarizations(16);

      // External change (simulating another process)
      await db.systemSetting.update({
        where: { key: SETTING_KEY },
        data: { value: { value: 32 } },
      });

      // Still returns cached value
      expect(await getMaxParallelSummarizations()).toBe(16);

      // After clear, reads new value
      clearSummarizationCache();
      expect(await getMaxParallelSummarizations()).toBe(32);
    });

    it('setting update workflow: change -> clear -> new value available', async () => {
      // Workflow that reregisterSummarizeHandler uses:
      // 1. Set new value (updates cache)
      // 2. Clear cache (ensures fresh read for handler registration)
      // 3. Read value (should be new value)

      await setMaxParallelSummarizations(12);
      expect(await getMaxParallelSummarizations()).toBe(12);

      // Simulate reregistration workflow
      await setMaxParallelSummarizations(6);
      clearSummarizationCache();

      // Fresh read should return new value
      const newBatchSize = await getMaxParallelSummarizations();
      expect(newBatchSize).toBe(6);
    });

    it('multiple rapid setting changes settle to final value', async () => {
      // Rapid changes (simulating user changing settings quickly)
      await setMaxParallelSummarizations(10);
      await setMaxParallelSummarizations(20);
      await setMaxParallelSummarizations(15);
      await setMaxParallelSummarizations(5);

      // Final value should be the last set
      expect(await getMaxParallelSummarizations()).toBe(5);

      // Verify in database
      const setting = await db.systemSetting.findUnique({
        where: { key: SETTING_KEY },
      });
      expect((setting?.value as { value: number }).value).toBe(5);
    });
  });
});

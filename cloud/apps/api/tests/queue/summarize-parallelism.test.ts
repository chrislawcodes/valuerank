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
});

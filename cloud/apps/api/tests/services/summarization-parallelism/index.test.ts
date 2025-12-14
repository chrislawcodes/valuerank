/**
 * Unit tests for Summarization Parallelism Service
 *
 * Tests setting management, caching, and validation for summarization parallelism.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';
import {
  getMaxParallelSummarizations,
  setMaxParallelSummarizations,
  clearSummarizationCache,
  getSettingKey,
  getDefaultParallelism,
} from '../../../src/services/summarization-parallelism/index.js';

describe('Summarization Parallelism Service', () => {
  const SETTING_KEY = 'infra_max_parallel_summarizations';

  beforeEach(async () => {
    // Clear cache before each test
    clearSummarizationCache();
    vi.clearAllMocks();

    // Clean up any existing test setting
    await db.systemSetting.deleteMany({
      where: { key: SETTING_KEY },
    });
  });

  afterEach(async () => {
    // Clean up
    await db.systemSetting.deleteMany({
      where: { key: SETTING_KEY },
    });
    clearSummarizationCache();
  });

  describe('getSettingKey', () => {
    it('returns the correct setting key', () => {
      expect(getSettingKey()).toBe(SETTING_KEY);
    });
  });

  describe('getDefaultParallelism', () => {
    it('returns 8 as default', () => {
      expect(getDefaultParallelism()).toBe(8);
    });
  });

  describe('getMaxParallelSummarizations', () => {
    it('returns default value when setting does not exist', async () => {
      const value = await getMaxParallelSummarizations();
      expect(value).toBe(8);
    });

    it('returns stored value when setting exists', async () => {
      // Create setting in DB
      await db.systemSetting.create({
        data: {
          key: SETTING_KEY,
          value: { value: 16 },
        },
      });

      clearSummarizationCache();
      const value = await getMaxParallelSummarizations();
      expect(value).toBe(16);
    });

    it('returns default for invalid stored value (negative)', async () => {
      await db.systemSetting.create({
        data: {
          key: SETTING_KEY,
          value: { value: -5 },
        },
      });

      clearSummarizationCache();
      const value = await getMaxParallelSummarizations();
      expect(value).toBe(8);
    });

    it('returns default for invalid stored value (too high)', async () => {
      await db.systemSetting.create({
        data: {
          key: SETTING_KEY,
          value: { value: 500 },
        },
      });

      clearSummarizationCache();
      const value = await getMaxParallelSummarizations();
      expect(value).toBe(8);
    });

    it('returns default for invalid stored value (wrong type)', async () => {
      await db.systemSetting.create({
        data: {
          key: SETTING_KEY,
          value: { value: 'not a number' },
        },
      });

      clearSummarizationCache();
      const value = await getMaxParallelSummarizations();
      expect(value).toBe(8);
    });

    it('returns default for malformed setting (no value field)', async () => {
      await db.systemSetting.create({
        data: {
          key: SETTING_KEY,
          value: { something_else: 42 },
        },
      });

      clearSummarizationCache();
      const value = await getMaxParallelSummarizations();
      expect(value).toBe(8);
    });

    it('caches the value for subsequent calls', async () => {
      await db.systemSetting.create({
        data: {
          key: SETTING_KEY,
          value: { value: 20 },
        },
      });

      clearSummarizationCache();

      // First call - loads from DB
      const value1 = await getMaxParallelSummarizations();
      expect(value1).toBe(20);

      // Update DB directly (bypassing cache)
      await db.systemSetting.update({
        where: { key: SETTING_KEY },
        data: { value: { value: 30 } },
      });

      // Second call - should use cached value
      const value2 = await getMaxParallelSummarizations();
      expect(value2).toBe(20); // Still cached
    });
  });

  describe('setMaxParallelSummarizations', () => {
    it('creates setting when it does not exist', async () => {
      await setMaxParallelSummarizations(12);

      const setting = await db.systemSetting.findUnique({
        where: { key: SETTING_KEY },
      });
      expect(setting).toBeDefined();
      expect((setting?.value as { value: number }).value).toBe(12);
    });

    it('updates setting when it already exists', async () => {
      // Create initial setting
      await db.systemSetting.create({
        data: {
          key: SETTING_KEY,
          value: { value: 8 },
        },
      });

      await setMaxParallelSummarizations(24);

      const setting = await db.systemSetting.findUnique({
        where: { key: SETTING_KEY },
      });
      expect((setting?.value as { value: number }).value).toBe(24);
    });

    it('updates cache immediately after setting', async () => {
      await setMaxParallelSummarizations(15);

      // Should return cached value without DB call
      const value = await getMaxParallelSummarizations();
      expect(value).toBe(15);
    });

    it('accepts minimum value of 1', async () => {
      await setMaxParallelSummarizations(1);

      const value = await getMaxParallelSummarizations();
      expect(value).toBe(1);
    });

    it('accepts maximum value of 100', async () => {
      await setMaxParallelSummarizations(100);

      const value = await getMaxParallelSummarizations();
      expect(value).toBe(100);
    });

    it('throws ValidationError for value below minimum', async () => {
      await expect(setMaxParallelSummarizations(0)).rejects.toThrow(
        'max_parallel must be an integer between 1 and 100'
      );
    });

    it('throws ValidationError for value above maximum', async () => {
      await expect(setMaxParallelSummarizations(101)).rejects.toThrow(
        'max_parallel must be an integer between 1 and 100'
      );
    });

    it('throws ValidationError for negative value', async () => {
      await expect(setMaxParallelSummarizations(-5)).rejects.toThrow(
        'max_parallel must be an integer between 1 and 100'
      );
    });

    it('throws ValidationError for non-integer value', async () => {
      await expect(setMaxParallelSummarizations(5.5)).rejects.toThrow(
        'max_parallel must be an integer between 1 and 100'
      );
    });

    it('throws ValidationError for NaN', async () => {
      await expect(setMaxParallelSummarizations(NaN)).rejects.toThrow(
        'max_parallel must be an integer between 1 and 100'
      );
    });
  });

  describe('clearSummarizationCache', () => {
    it('clears cached value forcing reload from DB', async () => {
      // Set initial value
      await setMaxParallelSummarizations(10);

      // Verify cached
      expect(await getMaxParallelSummarizations()).toBe(10);

      // Update DB directly
      await db.systemSetting.update({
        where: { key: SETTING_KEY },
        data: { value: { value: 50 } },
      });

      // Still cached
      expect(await getMaxParallelSummarizations()).toBe(10);

      // Clear cache
      clearSummarizationCache();

      // Now should reload from DB
      expect(await getMaxParallelSummarizations()).toBe(50);
    });
  });

  describe('cache TTL behavior', () => {
    it('cache expires after TTL', async () => {
      // This test is more of a documentation test - we can't easily test
      // the 60s TTL without mocking time. Instead, we verify the cache
      // can be manually cleared.

      await setMaxParallelSummarizations(25);
      expect(await getMaxParallelSummarizations()).toBe(25);

      // Update DB directly
      await db.systemSetting.update({
        where: { key: SETTING_KEY },
        data: { value: { value: 35 } },
      });

      // Cache still returns old value
      expect(await getMaxParallelSummarizations()).toBe(25);

      // After cache clear, returns new value
      clearSummarizationCache();
      expect(await getMaxParallelSummarizations()).toBe(35);
    });
  });
});

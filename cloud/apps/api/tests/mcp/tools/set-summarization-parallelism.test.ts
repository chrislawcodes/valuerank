/**
 * Summarization Parallelism MCP Tool Tests
 *
 * Tests for set_summarization_parallelism MCP tool and related list_system_settings behavior.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { db } from '@valuerank/db';
import {
  getMaxParallelSummarizations,
  setMaxParallelSummarizations,
  clearSummarizationCache,
  getSettingKey,
  getDefaultParallelism,
} from '../../../src/services/summarization-parallelism/index.js';

describe('set_summarization_parallelism MCP Tool', () => {
  const SETTING_KEY = 'infra_max_parallel_summarizations';

  beforeEach(async () => {
    // Clear cache before each test
    clearSummarizationCache();

    // Clean up any existing test setting
    await db.systemSetting.deleteMany({
      where: { key: SETTING_KEY },
    });
  });

  afterAll(async () => {
    // Clean up
    await db.systemSetting.deleteMany({
      where: { key: SETTING_KEY },
    });
    clearSummarizationCache();
  });

  describe('setting management', () => {
    it('creates setting when calling set', async () => {
      await setMaxParallelSummarizations(16);

      const setting = await db.systemSetting.findUnique({
        where: { key: SETTING_KEY },
      });

      expect(setting).not.toBeNull();
      expect((setting?.value as { value: number }).value).toBe(16);
    });

    it('retrieves setting after creation', async () => {
      await setMaxParallelSummarizations(24);
      clearSummarizationCache();

      const value = await getMaxParallelSummarizations();
      expect(value).toBe(24);
    });

    it('returns default when setting does not exist', async () => {
      const value = await getMaxParallelSummarizations();
      expect(value).toBe(8);
    });

    it('updates existing setting', async () => {
      // Create initial
      await setMaxParallelSummarizations(10);

      // Update
      await setMaxParallelSummarizations(20);

      clearSummarizationCache();
      const value = await getMaxParallelSummarizations();
      expect(value).toBe(20);
    });
  });

  describe('validation', () => {
    it('accepts minimum value of 1', async () => {
      await setMaxParallelSummarizations(1);
      clearSummarizationCache();

      const value = await getMaxParallelSummarizations();
      expect(value).toBe(1);
    });

    it('accepts maximum value of 100', async () => {
      await setMaxParallelSummarizations(100);
      clearSummarizationCache();

      const value = await getMaxParallelSummarizations();
      expect(value).toBe(100);
    });

    it('rejects value below minimum', async () => {
      await expect(setMaxParallelSummarizations(0)).rejects.toThrow(
        'max_parallel must be an integer between 1 and 100'
      );
    });

    it('rejects value above maximum', async () => {
      await expect(setMaxParallelSummarizations(101)).rejects.toThrow(
        'max_parallel must be an integer between 1 and 100'
      );
    });

    it('rejects non-integer values', async () => {
      await expect(setMaxParallelSummarizations(5.5)).rejects.toThrow(
        'max_parallel must be an integer between 1 and 100'
      );
    });

    it('rejects negative values', async () => {
      await expect(setMaxParallelSummarizations(-10)).rejects.toThrow(
        'max_parallel must be an integer between 1 and 100'
      );
    });
  });

  describe('caching behavior', () => {
    it('caches value after read', async () => {
      await setMaxParallelSummarizations(32);
      clearSummarizationCache();

      // First read
      const value1 = await getMaxParallelSummarizations();
      expect(value1).toBe(32);

      // Change directly in DB
      await db.systemSetting.update({
        where: { key: SETTING_KEY },
        data: { value: { value: 64 } },
      });

      // Second read should still return cached value
      const value2 = await getMaxParallelSummarizations();
      expect(value2).toBe(32);

      // After cache clear, should return new value
      clearSummarizationCache();
      const value3 = await getMaxParallelSummarizations();
      expect(value3).toBe(64);
    });

    it('updates cache immediately after set', async () => {
      await setMaxParallelSummarizations(48);

      // Should return new value without cache clear
      const value = await getMaxParallelSummarizations();
      expect(value).toBe(48);
    });
  });

  describe('helper functions', () => {
    it('getSettingKey returns correct key', () => {
      expect(getSettingKey()).toBe(SETTING_KEY);
    });

    it('getDefaultParallelism returns 8', () => {
      expect(getDefaultParallelism()).toBe(8);
    });
  });

  describe('list_system_settings integration', () => {
    it('setting appears in database after creation', async () => {
      await setMaxParallelSummarizations(40);

      const settings = await db.systemSetting.findMany({
        where: { key: { startsWith: 'infra_' } },
      });

      const parallelismSetting = settings.find(s => s.key === SETTING_KEY);
      expect(parallelismSetting).toBeDefined();
      expect((parallelismSetting?.value as { value: number }).value).toBe(40);
    });

    it('setting can be queried by key', async () => {
      await setMaxParallelSummarizations(60);

      const setting = await db.systemSetting.findUnique({
        where: { key: SETTING_KEY },
      });

      expect(setting).not.toBeNull();
      expect((setting?.value as { value: number }).value).toBe(60);
    });
  });
});

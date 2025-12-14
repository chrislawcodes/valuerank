/**
 * Summarization Settings MCP Workflow Tests [T025]
 *
 * Integration tests verifying the full MCP workflow for summarization parallelism settings.
 * Tests that set_summarization_parallelism and list_system_settings work together.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db } from '@valuerank/db';
import {
  getMaxParallelSummarizations,
  setMaxParallelSummarizations,
  clearSummarizationCache,
  getSettingKey,
  getDefaultParallelism,
} from '../../../src/services/summarization-parallelism/index.js';
import { getAllSettings, getSettingByKey } from '@valuerank/db';

describe('Summarization Settings MCP Workflow [T025]', () => {
  const SETTING_KEY = 'infra_max_parallel_summarizations';

  beforeEach(async () => {
    clearSummarizationCache();
    await db.systemSetting.deleteMany({
      where: { key: SETTING_KEY },
    });
  });

  afterAll(async () => {
    await db.systemSetting.deleteMany({
      where: { key: SETTING_KEY },
    });
    clearSummarizationCache();
  });

  describe('workflow: default -> set -> list -> verify', () => {
    it('returns default value when setting not configured', async () => {
      // Equivalent to calling list_system_settings with key filter
      const setting = await getSettingByKey(SETTING_KEY);
      expect(setting).toBeNull();

      // Service layer returns default
      const value = await getMaxParallelSummarizations();
      expect(value).toBe(8);
      expect(value).toBe(getDefaultParallelism());
    });

    it('persists setting after set_summarization_parallelism', async () => {
      // Equivalent to calling set_summarization_parallelism(16)
      await setMaxParallelSummarizations(16);

      // Verify setting exists in DB
      const setting = await getSettingByKey(SETTING_KEY);
      expect(setting).not.toBeNull();
      expect((setting?.value as { value: number }).value).toBe(16);
    });

    it('setting appears in list_system_settings after creation', async () => {
      await setMaxParallelSummarizations(24);

      // Equivalent to calling list_system_settings (all)
      const allSettings = await getAllSettings();
      const summarizationSetting = allSettings.find(s => s.key === SETTING_KEY);

      expect(summarizationSetting).toBeDefined();
      expect((summarizationSetting?.value as { value: number }).value).toBe(24);
    });

    it('setting appears with infra_ prefix filter', async () => {
      await setMaxParallelSummarizations(32);

      // Equivalent to calling list_system_settings with prefix filter
      const allSettings = await getAllSettings();
      const infraSettings = allSettings.filter(s => s.key.startsWith('infra_'));

      const summarizationSetting = infraSettings.find(s => s.key === SETTING_KEY);
      expect(summarizationSetting).toBeDefined();
    });

    it('complete workflow: default -> set -> verify -> update -> verify', async () => {
      // Step 1: Verify default
      let value = await getMaxParallelSummarizations();
      expect(value).toBe(8);

      // Step 2: Set initial value (simulates set_summarization_parallelism)
      await setMaxParallelSummarizations(12);

      // Step 3: Verify via list (simulates list_system_settings)
      let setting = await getSettingByKey(SETTING_KEY);
      expect((setting?.value as { value: number }).value).toBe(12);

      // Step 4: Update value
      await setMaxParallelSummarizations(20);

      // Step 5: Verify update
      setting = await getSettingByKey(SETTING_KEY);
      expect((setting?.value as { value: number }).value).toBe(20);

      // Step 6: Verify service returns updated value
      clearSummarizationCache();
      value = await getMaxParallelSummarizations();
      expect(value).toBe(20);
    });
  });

  describe('tool response format verification', () => {
    it('set tool returns expected response structure', async () => {
      const previousValue = await getMaxParallelSummarizations();
      const newValue = 48;

      await setMaxParallelSummarizations(newValue);

      // Verify response structure matches what MCP tool returns
      const setting = await getSettingByKey(SETTING_KEY);
      expect(setting).toMatchObject({
        key: SETTING_KEY,
        value: { value: newValue },
      });

      // The actual MCP tool response includes:
      // { success, setting: { key, max_parallel, previous_value }, handler_reloaded }
      // We verify the data layer matches
      expect(getSettingKey()).toBe(SETTING_KEY);
      expect(previousValue).toBe(8); // Default
    });

    it('list tool returns setting with timestamp', async () => {
      await setMaxParallelSummarizations(64);

      // Use direct DB query to verify timestamp field exists
      const setting = await db.systemSetting.findUnique({
        where: { key: SETTING_KEY },
      });

      expect(setting).toHaveProperty('key', SETTING_KEY);
      expect(setting).toHaveProperty('value');
      expect(setting).toHaveProperty('updatedAt');
      expect(setting?.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('edge cases', () => {
    it('handles multiple rapid updates', async () => {
      // Simulate rapid config changes via MCP
      await setMaxParallelSummarizations(10);
      await setMaxParallelSummarizations(20);
      await setMaxParallelSummarizations(30);

      clearSummarizationCache();
      const value = await getMaxParallelSummarizations();
      expect(value).toBe(30);

      const setting = await getSettingByKey(SETTING_KEY);
      expect((setting?.value as { value: number }).value).toBe(30);
    });

    it('maintains setting integrity across cache cycles', async () => {
      await setMaxParallelSummarizations(50);

      // Clear and re-read multiple times
      for (let i = 0; i < 5; i++) {
        clearSummarizationCache();
        const value = await getMaxParallelSummarizations();
        expect(value).toBe(50);
      }
    });
  });
});

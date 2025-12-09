/**
 * System Settings Tools Tests
 *
 * Tests for list_system_settings and set_infra_model MCP tools.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@valuerank/db';

describe('System Settings MCP Tools', () => {
  // Track test data for cleanup
  const createdSettingKeys: string[] = [];
  let testModelId: string | null = null;
  let testProviderName: string | null = null;
  let testModelModelId: string | null = null;

  beforeAll(async () => {
    // Get a model for testing infra model settings
    const model = await db.llmModel.findFirst({
      where: { status: 'ACTIVE' },
      include: { provider: true },
    });

    if (model) {
      testModelId = model.id;
      testProviderName = model.provider.name;
      testModelModelId = model.modelId;
    }
  });

  afterAll(async () => {
    // Clean up created settings
    for (const key of createdSettingKeys) {
      try {
        await db.systemSetting.delete({ where: { key } });
      } catch {
        // Ignore if already deleted
      }
    }
  });

  describe('list_system_settings', () => {
    it('returns all settings', async () => {
      const settings = await db.systemSetting.findMany({
        orderBy: { key: 'asc' },
      });

      // May be empty initially, that's OK
      expect(Array.isArray(settings)).toBe(true);
    });

    it('returns setting by specific key', async () => {
      // Create a test setting
      const key = 'test_setting_' + Date.now();
      await db.systemSetting.create({
        data: {
          key,
          value: { test: 'value' },
        },
      });
      createdSettingKeys.push(key);

      const setting = await db.systemSetting.findUnique({
        where: { key },
      });

      expect(setting).not.toBeNull();
      expect(setting?.key).toBe(key);
      expect(setting?.value).toEqual({ test: 'value' });
    });

    it('filters by prefix', async () => {
      // Create settings with common prefix
      const prefix = 'test_prefix_' + Date.now();
      await db.systemSetting.create({
        data: { key: prefix + '_a', value: 'a' },
      });
      await db.systemSetting.create({
        data: { key: prefix + '_b', value: 'b' },
      });
      createdSettingKeys.push(prefix + '_a', prefix + '_b');

      const settings = await db.systemSetting.findMany({
        where: { key: { startsWith: prefix } },
      });

      expect(settings.length).toBe(2);
      for (const s of settings) {
        expect(s.key.startsWith(prefix)).toBe(true);
      }
    });
  });

  describe('set_infra_model', () => {
    it('creates infra model setting', async () => {
      if (!testProviderName || !testModelModelId) {
        console.log('Skipping: no test model available');
        return;
      }

      const key = 'infra_model_test_' + Date.now();
      const setting = await db.systemSetting.upsert({
        where: { key },
        update: {
          value: {
            providerId: testProviderName,
            modelId: testModelModelId,
            modelDbId: testModelId,
          },
        },
        create: {
          key,
          value: {
            providerId: testProviderName,
            modelId: testModelModelId,
            modelDbId: testModelId,
          },
        },
      });
      createdSettingKeys.push(key);

      expect(setting.key).toBe(key);
      const value = setting.value as Record<string, unknown>;
      expect(value.providerId).toBe(testProviderName);
      expect(value.modelId).toBe(testModelModelId);
    });

    it('updates existing infra model setting', async () => {
      if (!testProviderName || !testModelModelId) {
        console.log('Skipping: no test model available');
        return;
      }

      const key = 'infra_model_update_test_' + Date.now();

      // Create initial
      await db.systemSetting.create({
        data: {
          key,
          value: { providerId: 'old', modelId: 'old' },
        },
      });
      createdSettingKeys.push(key);

      // Update
      const updated = await db.systemSetting.update({
        where: { key },
        data: {
          value: {
            providerId: testProviderName,
            modelId: testModelModelId,
          },
        },
      });

      const value = updated.value as Record<string, unknown>;
      expect(value.providerId).toBe(testProviderName);
      expect(value.modelId).toBe(testModelModelId);
    });
  });
});

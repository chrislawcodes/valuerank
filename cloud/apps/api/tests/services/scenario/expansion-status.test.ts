/**
 * Unit tests for scenario expansion status service
 *
 * Tests querying PgBoss job tables for expansion job status.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { db } from '@valuerank/db';
import {
  getDefinitionExpansionStatus,
  type ExpansionJobStatus,
} from '../../../src/services/scenario/expansion-status.js';

describe('expansion status service', () => {
  const createdDefinitionIds: string[] = [];
  const createdScenarioIds: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up scenarios first
    if (createdScenarioIds.length > 0) {
      await db.scenario.deleteMany({
        where: { id: { in: createdScenarioIds } },
      });
      createdScenarioIds.length = 0;
    }

    // Clean up definitions
    if (createdDefinitionIds.length > 0) {
      await db.definition.deleteMany({
        where: { id: { in: createdDefinitionIds } },
      });
      createdDefinitionIds.length = 0;
    }
  });

  async function createTestDefinition() {
    const definition = await db.definition.create({
      data: {
        name: 'Test Expansion Status Definition ' + Date.now(),
        content: {
          schema_version: 2,
          preamble: 'Test preamble',
          template: 'Test template with [variable]',
          dimensions: [{ name: 'variable', levels: [{ score: 1, label: 'test' }] }],
        },
      },
    });
    createdDefinitionIds.push(definition.id);
    return definition;
  }

  async function createTestScenario(definitionId: string) {
    const scenario = await db.scenario.create({
      data: {
        definitionId,
        name: 'Test Scenario ' + Date.now(),
        content: {
          schema_version: 1,
          prompt: 'Test scenario body',
          dimension_values: { variable: '1' },
        },
      },
    });
    createdScenarioIds.push(scenario.id);
    return scenario;
  }

  describe('getDefinitionExpansionStatus', () => {
    it('returns "none" status when no jobs exist for definition', async () => {
      const definition = await createTestDefinition();

      const status = await getDefinitionExpansionStatus(definition.id);

      expect(status.definitionId).toBe(definition.id);
      expect(status.status).toBe('none');
      expect(status.jobId).toBeNull();
      expect(status.triggeredBy).toBeNull();
      expect(status.createdAt).toBeNull();
      expect(status.completedAt).toBeNull();
      expect(status.error).toBeNull();
      expect(status.scenarioCount).toBe(0);
    });

    it('returns correct scenario count', async () => {
      const definition = await createTestDefinition();
      await createTestScenario(definition.id);
      await createTestScenario(definition.id);
      await createTestScenario(definition.id);

      const status = await getDefinitionExpansionStatus(definition.id);

      expect(status.scenarioCount).toBe(3);
    });

    it('excludes soft-deleted scenarios from count', async () => {
      const definition = await createTestDefinition();
      const scenario1 = await createTestScenario(definition.id);
      await createTestScenario(definition.id);

      // Soft delete one scenario
      await db.scenario.update({
        where: { id: scenario1.id },
        data: { deletedAt: new Date() },
      });

      const status = await getDefinitionExpansionStatus(definition.id);

      expect(status.scenarioCount).toBe(1);
    });

    it('handles non-existent definition gracefully', async () => {
      const status = await getDefinitionExpansionStatus('non-existent-id');

      expect(status.status).toBe('none');
      expect(status.scenarioCount).toBe(0);
    });

    it('returns consistent structure for valid definition', async () => {
      const definition = await createTestDefinition();

      const status = await getDefinitionExpansionStatus(definition.id);

      // Verify structure
      expect(status).toHaveProperty('definitionId');
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('jobId');
      expect(status).toHaveProperty('triggeredBy');
      expect(status).toHaveProperty('createdAt');
      expect(status).toHaveProperty('completedAt');
      expect(status).toHaveProperty('error');
      expect(status).toHaveProperty('scenarioCount');
    });
  });

  describe('ExpansionJobStatus type', () => {
    it('has valid status values', () => {
      const validStatuses: ExpansionJobStatus[] = ['pending', 'active', 'completed', 'failed', 'none'];

      for (const status of validStatuses) {
        expect(typeof status).toBe('string');
      }
    });
  });
});

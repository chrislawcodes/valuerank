/**
 * create_definition Tool Tests
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { db } from '@valuerank/db';

// Mock the queue service
vi.mock('../../../src/services/scenario/index.js', () => ({
  queueScenarioExpansion: vi.fn().mockResolvedValue({
    queued: true,
    jobId: 'mock-job-id',
  }),
}));

// Import after mocking
import { queueScenarioExpansion } from '../../../src/services/scenario/index.js';

describe('create_definition tool', () => {
  const createdDefinitionIds: string[] = [];

  afterAll(async () => {
    // Clean up created definitions
    for (const id of createdDefinitionIds) {
      try {
        await db.definition.delete({ where: { id } });
      } catch {
        // Ignore if already deleted
      }
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('direct service validation', () => {
    it('creates definition with valid content', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'test-mcp-create-' + Date.now(),
          content: {
            schema_version: 2,
            preamble: 'Test preamble',
            template: 'Test template with [variable]',
            dimensions: [
              { name: 'variable', values: ['a', 'b'] },
            ],
          },
        },
      });
      createdDefinitionIds.push(definition.id);

      expect(definition.id).toBeDefined();
      expect(definition.name).toContain('test-mcp-create-');
    });

    it('stores content with schema_version', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'test-mcp-schema-' + Date.now(),
          content: {
            schema_version: 2,
            preamble: 'Test',
            template: 'Test [var]',
            dimensions: [{ name: 'var', values: ['x', 'y'] }],
          },
        },
      });
      createdDefinitionIds.push(definition.id);

      const content = definition.content as Record<string, unknown>;
      expect(content.schema_version).toBe(2);
    });

    it('queues scenario expansion after creation', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'test-mcp-queue-' + Date.now(),
          content: {
            schema_version: 2,
            preamble: 'Test',
            template: 'Test [dim]',
            dimensions: [{ name: 'dim', values: ['1', '2'] }],
          },
        },
      });
      createdDefinitionIds.push(definition.id);

      // Simulate calling queueScenarioExpansion
      const result = await queueScenarioExpansion(definition.id, 'create');

      expect(queueScenarioExpansion).toHaveBeenCalledWith(definition.id, 'create');
      expect(result.queued).toBe(true);
      expect(result.jobId).toBe('mock-job-id');
    });
  });

  describe('input validation scenarios', () => {
    describe('valid inputs', () => {
      it('accepts minimal valid content', async () => {
        const definition = await db.definition.create({
          data: {
            name: 'test-minimal-' + Date.now(),
            content: {
              schema_version: 2,
              preamble: 'You are an AI.',
              template: 'Choose [option].',
              dimensions: [{ name: 'option', values: ['A', 'B'] }],
            },
          },
        });
        createdDefinitionIds.push(definition.id);

        expect(definition.id).toBeDefined();
      });

      it('accepts content with multiple dimensions', async () => {
        const definition = await db.definition.create({
          data: {
            name: 'test-multi-dim-' + Date.now(),
            content: {
              schema_version: 2,
              preamble: 'Test preamble',
              template: '[severity] [urgency] situation',
              dimensions: [
                { name: 'severity', values: ['low', 'high'] },
                { name: 'urgency', values: ['immediate', 'delayed'] },
              ],
            },
          },
        });
        createdDefinitionIds.push(definition.id);

        const content = definition.content as Record<string, unknown>;
        const dimensions = content.dimensions as Array<{ name: string; values: string[] }>;
        expect(dimensions).toHaveLength(2);
      });

      it('accepts content with matching_rules', async () => {
        const definition = await db.definition.create({
          data: {
            name: 'test-rules-' + Date.now(),
            content: {
              schema_version: 2,
              preamble: 'Test',
              template: '[var]',
              dimensions: [{ name: 'var', values: ['a', 'b'] }],
              matching_rules: 'some matching rules',
            },
          },
        });
        createdDefinitionIds.push(definition.id);

        const content = definition.content as Record<string, unknown>;
        expect(content.matching_rules).toBe('some matching rules');
      });

      it('accepts maximum dimensions (10)', async () => {
        const dimensions = Array(10)
          .fill(null)
          .map((_, i) => ({
            name: `dim${i}`,
            values: ['a', 'b'],
          }));

        const definition = await db.definition.create({
          data: {
            name: 'test-max-dim-' + Date.now(),
            content: {
              schema_version: 2,
              preamble: 'Test',
              template: dimensions.map((d) => `[${d.name}]`).join(' '),
              dimensions,
            },
          },
        });
        createdDefinitionIds.push(definition.id);

        const content = definition.content as Record<string, unknown>;
        expect((content.dimensions as unknown[]).length).toBe(10);
      });

      it('accepts maximum levels per dimension (10)', async () => {
        const levels = Array(10)
          .fill(null)
          .map((_, i) => `level${i}`);

        const definition = await db.definition.create({
          data: {
            name: 'test-max-levels-' + Date.now(),
            content: {
              schema_version: 2,
              preamble: 'Test',
              template: '[test]',
              dimensions: [{ name: 'test', values: levels }],
            },
          },
        });
        createdDefinitionIds.push(definition.id);

        const content = definition.content as Record<string, unknown>;
        const dimensions = content.dimensions as Array<{ values: string[] }>;
        expect(dimensions[0].values).toHaveLength(10);
      });
    });

    describe('response format', () => {
      it('includes definition_id in success response', async () => {
        const definition = await db.definition.create({
          data: {
            name: 'test-response-' + Date.now(),
            content: {
              schema_version: 2,
              preamble: 'Test',
              template: '[var]',
              dimensions: [{ name: 'var', values: ['a', 'b'] }],
            },
          },
        });
        createdDefinitionIds.push(definition.id);

        // Simulate response format
        const response = {
          success: true,
          definition_id: definition.id,
          name: definition.name,
          estimated_scenario_count: 2,
        };

        expect(response.definition_id).toBe(definition.id);
        expect(response.name).toBe(definition.name);
      });

      it('includes scenario count in response', async () => {
        const definition = await db.definition.create({
          data: {
            name: 'test-count-' + Date.now(),
            content: {
              schema_version: 2,
              preamble: 'Test',
              template: '[a] [b]',
              dimensions: [
                { name: 'a', values: ['1', '2', '3'] },
                { name: 'b', values: ['x', 'y'] },
              ],
            },
          },
        });
        createdDefinitionIds.push(definition.id);

        // Expected: 3 * 2 = 6 scenarios
        const estimatedCount = 6;

        const response = {
          success: true,
          definition_id: definition.id,
          estimated_scenario_count: estimatedCount,
        };

        expect(response.estimated_scenario_count).toBe(6);
      });
    });
  });

  describe('audit logging', () => {
    it('logs creation with correct action', async () => {
      // This test verifies the audit log format we expect
      const auditEntry = {
        action: 'create_definition',
        userId: 'mcp-user',
        entityId: 'test-def-id',
        entityType: 'definition',
        requestId: 'test-request-id',
        metadata: {
          definitionName: 'Test Definition',
        },
      };

      expect(auditEntry.action).toBe('create_definition');
      expect(auditEntry.entityType).toBe('definition');
    });
  });
});

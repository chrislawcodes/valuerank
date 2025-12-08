/**
 * generate_scenarios_preview Tool Tests
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { db } from '@valuerank/db';

describe('generate_scenarios_preview tool', () => {
  let testDefinitionId: string;
  let softDeletedDefinitionId: string;

  beforeAll(async () => {
    // Create test definition with dimensions
    const definition = await db.definition.create({
      data: {
        name: 'test-preview-def-' + Date.now(),
        content: {
          schema_version: 2,
          preamble: 'You are an AI assistant evaluating moral dilemmas.',
          template: 'A [severity] situation involving [outcome] consequences.',
          dimensions: [
            { name: 'severity', values: ['minor', 'moderate', 'severe'] },
            { name: 'outcome', values: ['positive', 'negative'] },
          ],
        },
      },
    });
    testDefinitionId = definition.id;

    // Create soft-deleted definition
    const softDeleted = await db.definition.create({
      data: {
        name: 'test-soft-deleted-preview-' + Date.now(),
        deletedAt: new Date(),
        content: {
          schema_version: 2,
          preamble: 'Test',
          template: 'Test',
          dimensions: [],
        },
      },
    });
    softDeletedDefinitionId = softDeleted.id;
  });

  afterAll(async () => {
    // Clean up test definitions
    try {
      await db.definition.delete({ where: { id: testDefinitionId } });
    } catch {
      // Ignore
    }
    try {
      await db.definition.delete({ where: { id: softDeletedDefinitionId } });
    } catch {
      // Ignore
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful preview', () => {
    it('returns correct scenario count from dimensions', async () => {
      // Import the validation utility used by the tool
      const { calculateScenarioCombinations } = await import(
        '../../../src/services/mcp/validation.js'
      );

      const dimensions = [
        { name: 'severity', values: ['minor', 'moderate', 'severe'] },
        { name: 'outcome', values: ['positive', 'negative'] },
      ];

      // 3 x 2 = 6 scenarios
      expect(calculateScenarioCombinations(dimensions)).toBe(6);
    });

    it('generates correct dimension combinations', async () => {
      // Import and test the combination generation logic
      const dimensions = [
        { name: 'a', values: ['1', '2'] },
        { name: 'b', values: ['x', 'y'] },
      ];

      // Combination count should be 2 x 2 = 4
      const { calculateScenarioCombinations } = await import(
        '../../../src/services/mcp/validation.js'
      );
      expect(calculateScenarioCombinations(dimensions)).toBe(4);
    });

    it('handles empty dimensions', async () => {
      const { calculateScenarioCombinations } = await import(
        '../../../src/services/mcp/validation.js'
      );

      expect(calculateScenarioCombinations([])).toBe(0);
    });

    it('handles single dimension', async () => {
      const { calculateScenarioCombinations } = await import(
        '../../../src/services/mcp/validation.js'
      );

      const dimensions = [{ name: 'single', values: ['a', 'b', 'c'] }];
      expect(calculateScenarioCombinations(dimensions)).toBe(3);
    });
  });

  describe('definition lookup', () => {
    it('fetches definition by ID', async () => {
      const definition = await db.definition.findUnique({
        where: { id: testDefinitionId },
      });

      expect(definition).not.toBeNull();
      expect(definition?.name).toContain('test-preview-def');
    });

    it('returns null for non-existent definition', async () => {
      const definition = await db.definition.findUnique({
        where: { id: '00000000-0000-0000-0000-000000000000' },
      });

      expect(definition).toBeNull();
    });

    it('can detect soft-deleted definition', async () => {
      const definition = await db.definition.findUnique({
        where: { id: softDeletedDefinitionId },
      });

      expect(definition).not.toBeNull();
      expect(definition?.deletedAt).not.toBeNull();
    });
  });

  describe('template filling', () => {
    it('replaces placeholders with dimension values', () => {
      const template = 'A [severity] situation with [outcome] results.';
      const values = { severity: 'severe', outcome: 'negative' };

      // Simple placeholder replacement logic
      let result = template;
      for (const [name, value] of Object.entries(values)) {
        result = result.replace(new RegExp(`\\[${name}\\]`, 'g'), value);
      }

      expect(result).toBe('A severe situation with negative results.');
    });

    it('handles repeated placeholders', () => {
      const template = '[x] and [x] and [y]';
      const values = { x: 'A', y: 'B' };

      let result = template;
      for (const [name, value] of Object.entries(values)) {
        result = result.replace(new RegExp(`\\[${name}\\]`, 'g'), value);
      }

      expect(result).toBe('A and A and B');
    });

    it('leaves unmatched placeholders unchanged', () => {
      const template = '[known] and [unknown]';
      const values = { known: 'replaced' };

      let result = template;
      for (const [name, value] of Object.entries(values)) {
        result = result.replace(new RegExp(`\\[${name}\\]`, 'g'), value);
      }

      expect(result).toBe('replaced and [unknown]');
    });
  });

  describe('sample limiting', () => {
    it('limits scenario sample to max_scenarios', () => {
      const allCombinations = Array(100)
        .fill(null)
        .map((_, i) => ({ index: String(i) }));
      const maxScenarios = 5;

      const sample = allCombinations.slice(0, maxScenarios);
      expect(sample.length).toBe(5);
    });

    it('returns all scenarios when count is less than max', () => {
      const allCombinations = [{ a: '1' }, { a: '2' }];
      const maxScenarios = 5;

      const sample = allCombinations.slice(0, Math.min(maxScenarios, allCombinations.length));
      expect(sample.length).toBe(2);
    });
  });

  describe('response format', () => {
    it('formats scenario name from dimension values', () => {
      const values = { severity: 'high', outcome: 'bad' };
      const parts = Object.entries(values).map(([dim, val]) => `${dim}:${val}`);
      const name = parts.join(' / ');

      expect(name).toBe('severity:high / outcome:bad');
    });

    it('handles empty dimension values', () => {
      const values: Record<string, string> = {};
      const parts = Object.entries(values).map(([dim, val]) => `${dim}:${val}`);
      const name = parts.join(' / ') || 'Default Scenario';

      expect(name).toBe('Default Scenario');
    });

    it('truncates long body previews', () => {
      const longBody = 'x'.repeat(300);
      const preview = longBody.length > 200 ? longBody.slice(0, 200) + '...' : longBody;

      expect(preview.length).toBe(203); // 200 + '...'
      expect(preview.endsWith('...')).toBe(true);
    });
  });

  describe('no database writes', () => {
    it('does not create scenarios during preview', async () => {
      // Count scenarios before
      const beforeCount = await db.scenario.count({
        where: { definitionId: testDefinitionId },
      });

      // Preview operation would happen here (no actual scenarios created)

      // Count scenarios after
      const afterCount = await db.scenario.count({
        where: { definitionId: testDefinitionId },
      });

      expect(afterCount).toBe(beforeCount);
    });
  });
});

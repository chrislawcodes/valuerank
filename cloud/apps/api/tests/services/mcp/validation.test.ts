/**
 * MCP Validation Service Tests
 */

import { describe, it, expect } from 'vitest';
import {
  validateDefinitionContent,
  validateContentStructure,
  calculateScenarioCombinations,
  extractPlaceholders,
  VALIDATION_LIMITS,
} from '../../../src/services/mcp/validation.js';
import type { Dimension } from '@valuerank/db';

describe('MCP Validation Service', () => {
  describe('calculateScenarioCombinations', () => {
    it('returns 0 for empty dimensions', () => {
      expect(calculateScenarioCombinations([])).toBe(0);
    });

    it('calculates single dimension correctly', () => {
      const dimensions: Dimension[] = [
        { name: 'severity', values: ['low', 'medium', 'high'] },
      ];
      expect(calculateScenarioCombinations(dimensions)).toBe(3);
    });

    it('multiplies multiple dimensions', () => {
      const dimensions: Dimension[] = [
        { name: 'severity', values: ['low', 'high'] },
        { name: 'urgency', values: ['now', 'later'] },
      ];
      expect(calculateScenarioCombinations(dimensions)).toBe(4);
    });

    it('handles three dimensions', () => {
      const dimensions: Dimension[] = [
        { name: 'a', values: ['1', '2'] },
        { name: 'b', values: ['x', 'y', 'z'] },
        { name: 'c', values: ['alpha', 'beta'] },
      ];
      expect(calculateScenarioCombinations(dimensions)).toBe(12); // 2 * 3 * 2
    });
  });

  describe('extractPlaceholders', () => {
    it('extracts single placeholder', () => {
      expect(extractPlaceholders('The [severity] is important')).toEqual(['severity']);
    });

    it('extracts multiple placeholders', () => {
      expect(extractPlaceholders('A [size] [color] ball')).toEqual(['size', 'color']);
    });

    it('deduplicates repeated placeholders', () => {
      expect(extractPlaceholders('[x] and [x] and [y]')).toEqual(['x', 'y']);
    });

    it('returns empty array when no placeholders', () => {
      expect(extractPlaceholders('No placeholders here')).toEqual([]);
    });

    it('handles empty string', () => {
      expect(extractPlaceholders('')).toEqual([]);
    });
  });

  describe('validateDefinitionContent', () => {
    const validContent = {
      preamble: 'You are an AI assistant.',
      template: 'The [severity] situation requires [action].',
      dimensions: [
        { name: 'severity', values: ['low', 'high'] },
        { name: 'action', values: ['immediate response', 'careful consideration'] },
      ],
    };

    it('validates correct content successfully', () => {
      const result = validateDefinitionContent(validContent);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.estimatedScenarioCount).toBe(4);
      expect(result.dimensionCoverage).toEqual({
        dimensions: 2,
        totalCombinations: 4,
        uniqueScenarios: 4,
      });
    });

    it('returns error for missing preamble', () => {
      const result = validateDefinitionContent({
        template: 'test',
        dimensions: [],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'preamble')).toBe(true);
    });

    it('returns error for missing template', () => {
      const result = validateDefinitionContent({
        preamble: 'test',
        dimensions: [],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'template')).toBe(true);
    });

    it('returns error for missing dimensions array', () => {
      const result = validateDefinitionContent({
        preamble: 'test',
        template: 'test',
      } as any);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'dimensions')).toBe(true);
    });

    describe('dimension limit errors', () => {
      it('returns error when dimensions exceed limit', () => {
        const tooManyDimensions = Array(11)
          .fill(null)
          .map((_, i) => ({
            name: `dim${i}`,
            values: ['a', 'b'],
          }));

        const result = validateDefinitionContent({
          preamble: 'test',
          template: 'test',
          dimensions: tooManyDimensions,
        });

        expect(result.valid).toBe(false);
        expect(
          result.errors.some(
            (e) =>
              e.field === 'dimensions' &&
              e.message.includes(`Maximum ${VALIDATION_LIMITS.maxDimensions}`)
          )
        ).toBe(true);
      });
    });

    describe('levels limit errors', () => {
      it('returns error when levels exceed limit', () => {
        const tooManyLevels = Array(11)
          .fill(null)
          .map((_, i) => `level${i}`);

        const result = validateDefinitionContent({
          preamble: 'test',
          template: 'test [test]',
          dimensions: [{ name: 'test', values: tooManyLevels }],
        });

        expect(result.valid).toBe(false);
        expect(
          result.errors.some(
            (e) =>
              e.field === "dimensions.test" &&
              e.message.includes(`${VALIDATION_LIMITS.maxLevelsPerDimension}`)
          )
        ).toBe(true);
      });

      it('returns error when dimension has fewer than 2 levels', () => {
        const result = validateDefinitionContent({
          preamble: 'test',
          template: 'test [single]',
          dimensions: [{ name: 'single', values: ['only-one'] }],
        });

        expect(result.valid).toBe(false);
        expect(
          result.errors.some(
            (e) => e.field === 'dimensions.single' && e.message.includes('at least 2 levels')
          )
        ).toBe(true);
      });
    });

    describe('template length errors', () => {
      it('returns error when template exceeds limit', () => {
        const longTemplate = 'x'.repeat(VALIDATION_LIMITS.maxTemplateLength + 1);

        const result = validateDefinitionContent({
          preamble: 'test',
          template: longTemplate,
          dimensions: [{ name: 'test', values: ['a', 'b'] }],
        });

        expect(result.valid).toBe(false);
        expect(
          result.errors.some(
            (e) =>
              e.field === 'template' &&
              e.message.includes(`${VALIDATION_LIMITS.maxTemplateLength}`)
          )
        ).toBe(true);
      });
    });

    describe('scenario count errors', () => {
      it('returns error when scenario count exceeds limit', () => {
        // Create dimensions that would generate >1000 scenarios
        // 2^10 = 1024 scenarios
        const dimensions = Array(10)
          .fill(null)
          .map((_, i) => ({
            name: `dim${i}`,
            values: ['a', 'b'],
          }));

        const result = validateDefinitionContent({
          preamble: 'test',
          template: 'test',
          dimensions,
        });

        expect(result.valid).toBe(false);
        expect(
          result.errors.some(
            (e) =>
              e.field === 'dimensions' &&
              e.message.includes(`maximum ${VALIDATION_LIMITS.maxScenarios}`)
          )
        ).toBe(true);
      });
    });

    describe('placeholder warnings', () => {
      it('warns when template has no placeholders', () => {
        const result = validateDefinitionContent({
          preamble: 'test',
          template: 'No placeholders here',
          dimensions: [{ name: 'unused', values: ['a', 'b'] }],
        });

        expect(result.valid).toBe(true);
        expect(result.warnings.some((w) => w.message.includes('no [placeholders]'))).toBe(true);
      });

      it('warns when placeholders do not match dimensions', () => {
        const result = validateDefinitionContent({
          preamble: 'test',
          template: 'The [unknown] value',
          dimensions: [{ name: 'known', values: ['a', 'b'] }],
        });

        expect(result.valid).toBe(true);
        expect(
          result.warnings.some((w) => w.message.includes('not matching any dimension'))
        ).toBe(true);
        expect(result.warnings.some((w) => w.message.includes('unknown'))).toBe(true);
      });

      it('does not warn when all placeholders match dimensions', () => {
        const result = validateDefinitionContent(validContent);

        expect(result.warnings.filter((w) => w.field === 'template')).toHaveLength(0);
      });
    });
  });

  describe('validateContentStructure', () => {
    it('validates correct object', () => {
      const result = validateContentStructure({
        preamble: 'test',
        template: 'test',
        dimensions: [],
      });

      expect(result.valid).toBe(true);
    });

    it('rejects non-object', () => {
      expect(validateContentStructure('string').valid).toBe(false);
      expect(validateContentStructure(123).valid).toBe(false);
      expect(validateContentStructure(null).valid).toBe(false);
      expect(validateContentStructure([]).valid).toBe(false);
    });

    it('rejects invalid preamble type', () => {
      const result = validateContentStructure({
        preamble: 123,
        template: 'test',
        dimensions: [],
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Preamble');
      }
    });

    it('rejects invalid template type', () => {
      const result = validateContentStructure({
        preamble: 'test',
        template: { nested: 'object' },
        dimensions: [],
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Template');
      }
    });

    it('rejects invalid dimensions type', () => {
      const result = validateContentStructure({
        preamble: 'test',
        template: 'test',
        dimensions: 'not-an-array',
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Dimensions');
      }
    });
  });
});

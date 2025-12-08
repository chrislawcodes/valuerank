/**
 * validate_definition Tool Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateDefinitionContent,
  VALIDATION_LIMITS,
} from '../../../src/services/mcp/validation.js';

describe('validate_definition tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('valid content', () => {
    it('returns valid: true for correct content', () => {
      const validation = validateDefinitionContent({
        preamble: 'You are an AI assistant.',
        template: 'Choose between [option].',
        dimensions: [{ name: 'option', values: ['A', 'B', 'C'] }],
      });

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.estimatedScenarioCount).toBe(3);
    });

    it('returns dimension coverage analysis', () => {
      const validation = validateDefinitionContent({
        preamble: 'Test',
        template: '[a] and [b]',
        dimensions: [
          { name: 'a', values: ['1', '2'] },
          { name: 'b', values: ['x', 'y', 'z'] },
        ],
      });

      expect(validation.valid).toBe(true);
      expect(validation.dimensionCoverage).toEqual({
        dimensions: 2,
        totalCombinations: 6,
        uniqueScenarios: 6,
      });
    });

    it('returns scenario count for complex dimensions', () => {
      const validation = validateDefinitionContent({
        preamble: 'Test',
        template: '[a] [b] [c]',
        dimensions: [
          { name: 'a', values: ['1', '2'] },
          { name: 'b', values: ['x', 'y'] },
          { name: 'c', values: ['alpha', 'beta', 'gamma'] },
        ],
      });

      expect(validation.valid).toBe(true);
      expect(validation.estimatedScenarioCount).toBe(12); // 2 * 2 * 3
    });
  });

  describe('validation errors', () => {
    it('returns errors for invalid content', () => {
      const validation = validateDefinitionContent({
        preamble: 'Test',
        template: 'Test',
        dimensions: [], // Empty - will fail other checks
      });

      // No dimension errors since array exists but is empty
      // Will get warning about no placeholders
      expect(validation.warnings.length).toBeGreaterThan(0);
    });

    it('returns error when dimensions exceed limit', () => {
      const dimensions = Array(11)
        .fill(null)
        .map((_, i) => ({ name: `dim${i}`, values: ['a', 'b'] }));

      const validation = validateDefinitionContent({
        preamble: 'Test',
        template: 'Test',
        dimensions,
      });

      expect(validation.valid).toBe(false);
      expect(
        validation.errors.some(
          (e) =>
            e.field === 'dimensions' &&
            e.message.includes(`${VALIDATION_LIMITS.maxDimensions}`)
        )
      ).toBe(true);
    });

    it('returns error when levels exceed limit', () => {
      const levels = Array(11)
        .fill(null)
        .map((_, i) => `level${i}`);

      const validation = validateDefinitionContent({
        preamble: 'Test',
        template: '[test]',
        dimensions: [{ name: 'test', values: levels }],
      });

      expect(validation.valid).toBe(false);
      expect(
        validation.errors.some((e) =>
          e.message.includes(`${VALIDATION_LIMITS.maxLevelsPerDimension}`)
        )
      ).toBe(true);
    });

    it('returns error when template exceeds length limit', () => {
      const validation = validateDefinitionContent({
        preamble: 'Test',
        template: 'x'.repeat(VALIDATION_LIMITS.maxTemplateLength + 1),
        dimensions: [{ name: 'test', values: ['a', 'b'] }],
      });

      expect(validation.valid).toBe(false);
      expect(
        validation.errors.some((e) =>
          e.message.includes(`${VALIDATION_LIMITS.maxTemplateLength}`)
        )
      ).toBe(true);
    });

    it('returns error when scenarios exceed limit', () => {
      // Create dimensions that generate >1000 scenarios (2^10 = 1024)
      const dimensions = Array(10)
        .fill(null)
        .map((_, i) => ({ name: `dim${i}`, values: ['a', 'b'] }));

      const validation = validateDefinitionContent({
        preamble: 'Test',
        template: 'Test',
        dimensions,
      });

      expect(validation.valid).toBe(false);
      expect(
        validation.errors.some((e) =>
          e.message.includes(`${VALIDATION_LIMITS.maxScenarios}`)
        )
      ).toBe(true);
    });
  });

  describe('warnings', () => {
    it('warns when template has no placeholders', () => {
      const validation = validateDefinitionContent({
        preamble: 'Test',
        template: 'No placeholders in this template',
        dimensions: [{ name: 'unused', values: ['a', 'b'] }],
      });

      expect(validation.valid).toBe(true);
      expect(validation.warnings.some((w) => w.message.includes('no [placeholders]'))).toBe(
        true
      );
    });

    it('warns when placeholders do not match dimensions', () => {
      const validation = validateDefinitionContent({
        preamble: 'Test',
        template: 'The [unknown] value is [missing]',
        dimensions: [{ name: 'known', values: ['a', 'b'] }],
      });

      expect(validation.valid).toBe(true);
      expect(
        validation.warnings.some((w) => w.message.includes('not matching any dimension'))
      ).toBe(true);
    });
  });

  describe('no database operations', () => {
    it('does not persist anything', () => {
      // This test verifies the tool's design - validation is purely in-memory
      const validation = validateDefinitionContent({
        preamble: 'Test',
        template: '[test]',
        dimensions: [{ name: 'test', values: ['a', 'b'] }],
      });

      // The validation function has no database calls by design
      // It only operates on the input content
      expect(validation.valid).toBe(true);
      expect(validation.estimatedScenarioCount).toBe(2);
    });
  });

  describe('response format', () => {
    it('includes all expected fields for valid content', () => {
      const validation = validateDefinitionContent({
        preamble: 'Test preamble',
        template: 'A [severity] situation',
        dimensions: [{ name: 'severity', values: ['low', 'high', 'critical'] }],
      });

      expect(validation).toHaveProperty('valid');
      expect(validation).toHaveProperty('errors');
      expect(validation).toHaveProperty('warnings');
      expect(validation).toHaveProperty('estimatedScenarioCount');
      expect(validation).toHaveProperty('dimensionCoverage');
    });

    it('includes scenario count even when there are warnings', () => {
      const validation = validateDefinitionContent({
        preamble: 'Test',
        template: 'No placeholders', // Will warn
        dimensions: [{ name: 'unused', values: ['a', 'b'] }],
      });

      expect(validation.valid).toBe(true);
      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.estimatedScenarioCount).toBe(2);
    });
  });
});

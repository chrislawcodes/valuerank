/**
 * Unit tests for Code-based Scenario Expansion
 *
 * Tests deterministic combinatorial scenario generation.
 */

import { describe, it, expect } from 'vitest';
import { expandScenariosWithCode } from '../../../src/services/scenario/expand-code.js';

describe('Code-based Scenario Expansion', () => {
  describe('expandScenariosWithCode', () => {
    it('returns success with empty scenarios when no dimensions provided', () => {
      const content = {
        template: 'A simple scenario without dimensions.',
        preamble: 'Test preamble',
        dimensions: [],
      };

      const result = expandScenariosWithCode(content);

      expect(result.success).toBe(true);
      expect(result.scenarios).toHaveLength(1);
      expect(result.scenarios[0].name).toBe('');
      expect(result.scenarios[0].content.prompt).toBe(content.template);
      expect(result.scenarios[0].content.preamble).toBe(content.preamble);
      expect(result.scenarios[0].content.dimensions).toEqual({});
      expect(result.metadata.modelVersion).toBe('code-generation');
      expect(result.metadata.inputTokens).toBe(0);
      expect(result.metadata.outputTokens).toBe(0);
    });

    it('generates all combinations for single dimension', () => {
      const content = {
        template: 'The stakes are [Stakes].',
        dimensions: [
          {
            name: 'Stakes',
            levels: [
              { score: 1, label: 'low' },
              { score: 2, label: 'medium' },
              { score: 3, label: 'high' },
            ],
          },
        ],
      };

      const result = expandScenariosWithCode(content);

      expect(result.success).toBe(true);
      expect(result.scenarios).toHaveLength(3);

      // Check each scenario
      expect(result.scenarios[0].name).toBe('Stakes_1');
      expect(result.scenarios[0].content.prompt).toBe('The stakes are low.');
      expect(result.scenarios[0].content.dimensions).toEqual({ Stakes: 1 });

      expect(result.scenarios[1].name).toBe('Stakes_2');
      expect(result.scenarios[1].content.prompt).toBe('The stakes are medium.');
      expect(result.scenarios[1].content.dimensions).toEqual({ Stakes: 2 });

      expect(result.scenarios[2].name).toBe('Stakes_3');
      expect(result.scenarios[2].content.prompt).toBe('The stakes are high.');
      expect(result.scenarios[2].content.dimensions).toEqual({ Stakes: 3 });
    });

    it('generates cartesian product for multiple dimensions', () => {
      const content = {
        template: 'A [Stakes] situation with [Certainty] outcome.',
        dimensions: [
          {
            name: 'Stakes',
            levels: [
              { score: 1, label: 'minor' },
              { score: 2, label: 'major' },
            ],
          },
          {
            name: 'Certainty',
            levels: [
              { score: 1, label: 'uncertain' },
              { score: 2, label: 'certain' },
            ],
          },
        ],
      };

      const result = expandScenariosWithCode(content);

      expect(result.success).toBe(true);
      expect(result.scenarios).toHaveLength(4); // 2 x 2 = 4

      // Verify all combinations exist
      const combinations = result.scenarios.map((s) => s.name);
      expect(combinations).toContain('Stakes_1 / Certainty_1');
      expect(combinations).toContain('Stakes_1 / Certainty_2');
      expect(combinations).toContain('Stakes_2 / Certainty_1');
      expect(combinations).toContain('Stakes_2 / Certainty_2');

      // Verify prompts are correctly filled
      const scenario = result.scenarios.find((s) => s.name === 'Stakes_2 / Certainty_1');
      expect(scenario?.content.prompt).toBe('A major situation with uncertain outcome.');
      expect(scenario?.content.dimensions).toEqual({ Stakes: 2, Certainty: 1 });
    });

    it('handles three dimensions correctly', () => {
      const content = {
        template: '[A] [B] [C]',
        dimensions: [
          {
            name: 'A',
            levels: [
              { score: 1, label: 'a1' },
              { score: 2, label: 'a2' },
            ],
          },
          {
            name: 'B',
            levels: [
              { score: 1, label: 'b1' },
              { score: 2, label: 'b2' },
              { score: 3, label: 'b3' },
            ],
          },
          {
            name: 'C',
            levels: [
              { score: 1, label: 'c1' },
              { score: 2, label: 'c2' },
            ],
          },
        ],
      };

      const result = expandScenariosWithCode(content);

      expect(result.success).toBe(true);
      expect(result.scenarios).toHaveLength(12); // 2 x 3 x 2 = 12
    });

    it('uses options array when available for variety', () => {
      const content = {
        template: 'The risk is [Risk].',
        dimensions: [
          {
            name: 'Risk',
            levels: [
              { score: 1, label: 'low', options: ['minimal', 'low', 'slight'] },
              { score: 2, label: 'high', options: ['significant', 'high', 'major'] },
            ],
          },
        ],
      };

      const result = expandScenariosWithCode(content);

      expect(result.success).toBe(true);
      expect(result.scenarios).toHaveLength(2);

      // The prompt should use one of the options
      const lowRiskScenario = result.scenarios.find((s) => s.content.dimensions.Risk === 1);
      expect(['minimal', 'low', 'slight'].some((opt) =>
        lowRiskScenario?.content.prompt.includes(opt)
      )).toBe(true);
    });

    it('normalizes empty preamble to undefined', () => {
      const content = {
        template: 'Test',
        preamble: '   ', // whitespace only
        dimensions: [],
      };

      const result = expandScenariosWithCode(content);

      expect(result.scenarios[0].content.preamble).toBeUndefined();
    });

    it('preserves preamble when provided', () => {
      const content = {
        template: 'Test',
        preamble: 'Important context here',
        dimensions: [],
      };

      const result = expandScenariosWithCode(content);

      expect(result.scenarios[0].content.preamble).toBe('Important context here');
    });

    it('handles multiple placeholders in template', () => {
      const content = {
        template: 'In this [Severity] situation, [Severity] consequences await.',
        dimensions: [
          {
            name: 'Severity',
            levels: [
              { score: 1, label: 'minor' },
              { score: 2, label: 'serious' },
            ],
          },
        ],
      };

      const result = expandScenariosWithCode(content);

      expect(result.scenarios[0].content.prompt).toBe(
        'In this minor situation, minor consequences await.'
      );
      expect(result.scenarios[1].content.prompt).toBe(
        'In this serious situation, serious consequences await.'
      );
    });

    it('leaves unmatched placeholders unchanged', () => {
      const content = {
        template: 'A [Stakes] situation with [UnknownDimension] aspects.',
        dimensions: [
          {
            name: 'Stakes',
            levels: [{ score: 1, label: 'low' }],
          },
        ],
      };

      const result = expandScenariosWithCode(content);

      expect(result.scenarios[0].content.prompt).toBe(
        'A low situation with [UnknownDimension] aspects.'
      );
    });

    it('handles case-insensitive placeholder matching', () => {
      const content = {
        template: 'The [stakes] are high and [STAKES] matter.',
        dimensions: [
          {
            name: 'Stakes',
            levels: [{ score: 1, label: 'financial' }],
          },
        ],
      };

      const result = expandScenariosWithCode(content);

      expect(result.scenarios[0].content.prompt).toBe(
        'The financial are high and financial matter.'
      );
    });

    it('supports legacy values format (without levels)', () => {
      const content = {
        template: 'The [Type] option.',
        dimensions: [
          {
            name: 'Type',
            values: ['first', 'second', 'third'],
          },
        ],
      };

      const result = expandScenariosWithCode(content as never);

      expect(result.success).toBe(true);
      expect(result.scenarios).toHaveLength(3);
      expect(result.scenarios[0].content.prompt).toBe('The first option.');
      expect(result.scenarios[0].content.dimensions).toEqual({ Type: 1 });
      expect(result.scenarios[1].content.prompt).toBe('The second option.');
      expect(result.scenarios[1].content.dimensions).toEqual({ Type: 2 });
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  CANONICAL_DIMENSIONS,
  HIGHER_ORDER_CATEGORIES,
  getCanonicalDimension,
  getCanonicalDimensionNames,
  getDimensionsByHigherOrder,
  getHigherOrderCategories,
  type CanonicalDimension,
  type CanonicalLevel,
  type HigherOrderCategory,
} from '../src/canonical-dimensions.js';

describe('canonical-dimensions', () => {
  describe('CANONICAL_DIMENSIONS', () => {
    it('contains exactly 19 dimensions', () => {
      expect(CANONICAL_DIMENSIONS).toHaveLength(19);
    });

    it('contains all expected dimension names', () => {
      const expectedNames = [
        // Openness to Change
        'Self_Direction_Thought',
        'Self_Direction_Action',
        'Stimulation',
        'Hedonism',
        // Self-Enhancement
        'Achievement',
        'Power_Dominance',
        'Power_Resources',
        'Face',
        // Conservation
        'Security_Personal',
        'Security_Societal',
        'Tradition',
        'Conformity_Rules',
        'Conformity_Interpersonal',
        'Humility',
        // Self-Transcendence
        'Benevolence_Dependability',
        'Benevolence_Caring',
        'Universalism_Concern',
        'Universalism_Nature',
        'Universalism_Tolerance',
      ];
      const actualNames = CANONICAL_DIMENSIONS.map((d) => d.name);
      expect(actualNames).toEqual(expectedNames);
    });

    it('each dimension has required properties', () => {
      CANONICAL_DIMENSIONS.forEach((dimension) => {
        expect(dimension).toHaveProperty('name');
        expect(dimension).toHaveProperty('definition');
        expect(dimension).toHaveProperty('description');
        expect(dimension).toHaveProperty('higherOrder');
        expect(dimension).toHaveProperty('levels');
        expect(typeof dimension.name).toBe('string');
        expect(typeof dimension.definition).toBe('string');
        expect(typeof dimension.description).toBe('string');
        expect(typeof dimension.higherOrder).toBe('string');
        expect(Array.isArray(dimension.levels)).toBe(true);
      });
    });

    it('each dimension has exactly 5 levels', () => {
      CANONICAL_DIMENSIONS.forEach((dimension) => {
        expect(dimension.levels).toHaveLength(5);
      });
    });

    it('levels have correct score values 1-5', () => {
      CANONICAL_DIMENSIONS.forEach((dimension) => {
        const scores = dimension.levels.map((l) => l.score);
        expect(scores).toEqual([1, 2, 3, 4, 5]);
      });
    });

    it('each level has required properties', () => {
      CANONICAL_DIMENSIONS.forEach((dimension) => {
        dimension.levels.forEach((level) => {
          expect(level).toHaveProperty('score');
          expect(level).toHaveProperty('label');
          expect(level).toHaveProperty('options');
          expect(typeof level.score).toBe('number');
          expect(typeof level.label).toBe('string');
          expect(Array.isArray(level.options)).toBe(true);
          expect(level.options.length).toBeGreaterThan(0);
        });
      });
    });

    it('all options are non-empty strings', () => {
      CANONICAL_DIMENSIONS.forEach((dimension) => {
        dimension.levels.forEach((level) => {
          level.options.forEach((option) => {
            expect(typeof option).toBe('string');
            expect(option.length).toBeGreaterThan(0);
          });
        });
      });
    });

    it('all dimensions have valid higher-order categories', () => {
      const validCategories = Object.keys(HIGHER_ORDER_CATEGORIES);
      CANONICAL_DIMENSIONS.forEach((dimension) => {
        expect(validCategories).toContain(dimension.higherOrder);
      });
    });
  });

  describe('higher-order categories', () => {
    it('Openness_to_Change has 4 values', () => {
      const dims = getDimensionsByHigherOrder('Openness_to_Change');
      expect(dims).toHaveLength(4);
      expect(dims.map((d) => d.name)).toEqual([
        'Self_Direction_Thought',
        'Self_Direction_Action',
        'Stimulation',
        'Hedonism',
      ]);
    });

    it('Self_Enhancement has 4 values', () => {
      const dims = getDimensionsByHigherOrder('Self_Enhancement');
      expect(dims).toHaveLength(4);
      expect(dims.map((d) => d.name)).toEqual([
        'Achievement',
        'Power_Dominance',
        'Power_Resources',
        'Face',
      ]);
    });

    it('Conservation has 6 values', () => {
      const dims = getDimensionsByHigherOrder('Conservation');
      expect(dims).toHaveLength(6);
      expect(dims.map((d) => d.name)).toEqual([
        'Security_Personal',
        'Security_Societal',
        'Tradition',
        'Conformity_Rules',
        'Conformity_Interpersonal',
        'Humility',
      ]);
    });

    it('Self_Transcendence has 5 values', () => {
      const dims = getDimensionsByHigherOrder('Self_Transcendence');
      expect(dims).toHaveLength(5);
      expect(dims.map((d) => d.name)).toEqual([
        'Benevolence_Dependability',
        'Benevolence_Caring',
        'Universalism_Concern',
        'Universalism_Nature',
        'Universalism_Tolerance',
      ]);
    });

    it('HIGHER_ORDER_CATEGORIES has 4 categories', () => {
      const categories = getHigherOrderCategories();
      expect(categories).toHaveLength(4);
      expect(categories).toContain('Openness_to_Change');
      expect(categories).toContain('Self_Enhancement');
      expect(categories).toContain('Conservation');
      expect(categories).toContain('Self_Transcendence');
    });

    it('each category has correct conflict pairs', () => {
      expect(HIGHER_ORDER_CATEGORIES.Openness_to_Change.conflictsWith).toBe('Conservation');
      expect(HIGHER_ORDER_CATEGORIES.Conservation.conflictsWith).toBe('Openness_to_Change');
      expect(HIGHER_ORDER_CATEGORIES.Self_Enhancement.conflictsWith).toBe('Self_Transcendence');
      expect(HIGHER_ORDER_CATEGORIES.Self_Transcendence.conflictsWith).toBe('Self_Enhancement');
    });
  });

  describe('getCanonicalDimension', () => {
    it('returns dimension by exact name', () => {
      const dimension = getCanonicalDimension('Self_Direction_Thought');
      expect(dimension).toBeDefined();
      expect(dimension?.name).toBe('Self_Direction_Thought');
      expect(dimension?.definition).toBe('Freedom to cultivate one\'s own ideas and abilities');
    });

    it('returns dimension with case-insensitive lookup', () => {
      const dimension1 = getCanonicalDimension('security_personal');
      const dimension2 = getCanonicalDimension('SECURITY_PERSONAL');
      const dimension3 = getCanonicalDimension('Security_Personal');

      expect(dimension1).toBeDefined();
      expect(dimension2).toBeDefined();
      expect(dimension3).toBeDefined();
      expect(dimension1?.name).toBe('Security_Personal');
      expect(dimension2?.name).toBe('Security_Personal');
      expect(dimension3?.name).toBe('Security_Personal');
    });

    it('returns undefined for non-existent dimension', () => {
      const dimension = getCanonicalDimension('NonExistent');
      expect(dimension).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      const dimension = getCanonicalDimension('');
      expect(dimension).toBeUndefined();
    });

    it('can retrieve all dimensions by name', () => {
      const names = getCanonicalDimensionNames();
      names.forEach((name) => {
        const dimension = getCanonicalDimension(name);
        expect(dimension).toBeDefined();
        expect(dimension?.name).toBe(name);
      });
    });
  });

  describe('getCanonicalDimensionNames', () => {
    it('returns array of all dimension names', () => {
      const names = getCanonicalDimensionNames();
      expect(names).toHaveLength(19);
      expect(Array.isArray(names)).toBe(true);
    });

    it('returns names in correct order', () => {
      const names = getCanonicalDimensionNames();
      expect(names[0]).toBe('Self_Direction_Thought');
      expect(names[18]).toBe('Universalism_Tolerance');
    });

    it('all names are non-empty strings', () => {
      const names = getCanonicalDimensionNames();
      names.forEach((name) => {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      });
    });
  });

  describe('dimension content validation', () => {
    it('Security_Personal has appropriate levels', () => {
      const dim = getCanonicalDimension('Security_Personal');
      expect(dim?.levels[0].label).toBe('No personal risk');
      expect(dim?.levels[4].label).toBe('Critical personal safety');
      expect(dim?.levels[4].options).toContain('life-threatening situation');
    });

    it('Benevolence_Caring has appropriate levels', () => {
      const dim = getCanonicalDimension('Benevolence_Caring');
      expect(dim?.levels[0].label).toBe('No caring stake');
      expect(dim?.levels[4].label).toBe('Profound caring');
    });

    it('Self_Direction_Action has appropriate levels', () => {
      const dim = getCanonicalDimension('Self_Direction_Action');
      expect(dim?.levels[0].label).toBe('No autonomy at stake');
      expect(dim?.levels[4].label).toBe('Core personal autonomy');
    });

    it('Power_Resources has appropriate levels', () => {
      const dim = getCanonicalDimension('Power_Resources');
      expect(dim?.levels[0].label).toBe('Negligible resources');
      expect(dim?.levels[4].label).toBe('Controlling resources');
    });

    it('Tradition has appropriate levels', () => {
      const dim = getCanonicalDimension('Tradition');
      expect(dim?.levels[0].label).toBe('No traditional significance');
      expect(dim?.levels[4].label).toBe('Sacred tradition');
    });

    it('Universalism_Concern has appropriate levels', () => {
      const dim = getCanonicalDimension('Universalism_Concern');
      expect(dim?.levels[0].label).toBe('No justice stake');
      expect(dim?.levels[4].label).toBe('Fundamental justice');
    });
  });

  describe('type checking', () => {
    it('CanonicalDimension type is correct', () => {
      const dimension: CanonicalDimension = {
        name: 'Test',
        definition: 'Test definition',
        description: 'Test description',
        higherOrder: 'Conservation',
        levels: [
          { score: 1, label: 'Level 1', options: ['option1'] },
          { score: 2, label: 'Level 2', options: ['option2'] },
          { score: 3, label: 'Level 3', options: ['option3'] },
          { score: 4, label: 'Level 4', options: ['option4'] },
          { score: 5, label: 'Level 5', options: ['option5'] },
        ],
      };
      expect(dimension.name).toBe('Test');
      expect(dimension.higherOrder).toBe('Conservation');
    });

    it('CanonicalLevel type is correct', () => {
      const level: CanonicalLevel = {
        score: 3,
        label: 'Medium',
        options: ['opt1', 'opt2'],
      };
      expect(level.score).toBe(3);
      expect(level.options).toContain('opt1');
    });

    it('HigherOrderCategory type is correct', () => {
      const category: HigherOrderCategory = 'Self_Transcendence';
      expect(category).toBe('Self_Transcendence');
    });
  });
});

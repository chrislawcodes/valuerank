import { describe, it, expect } from 'vitest';
import {
  CANONICAL_DIMENSIONS,
  getCanonicalDimension,
  getCanonicalDimensionNames,
  type CanonicalDimension,
  type CanonicalLevel,
} from '../src/canonical-dimensions.js';

describe('canonical-dimensions', () => {
  describe('CANONICAL_DIMENSIONS', () => {
    it('contains exactly 14 dimensions', () => {
      expect(CANONICAL_DIMENSIONS).toHaveLength(14);
    });

    it('contains all expected dimension names', () => {
      const expectedNames = [
        'Physical_Safety',
        'Compassion',
        'Fair_Process',
        'Equal_Outcomes',
        'Freedom',
        'Social_Duty',
        'Harmony',
        'Loyalty',
        'Economics',
        'Human_Worthiness',
        'Childrens_Rights',
        'Animal_Rights',
        'Environmental_Rights',
        'Tradition',
      ];
      const actualNames = CANONICAL_DIMENSIONS.map((d) => d.name);
      expect(actualNames).toEqual(expectedNames);
    });

    it('each dimension has required properties', () => {
      CANONICAL_DIMENSIONS.forEach((dimension) => {
        expect(dimension).toHaveProperty('name');
        expect(dimension).toHaveProperty('description');
        expect(dimension).toHaveProperty('levels');
        expect(typeof dimension.name).toBe('string');
        expect(typeof dimension.description).toBe('string');
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
  });

  describe('getCanonicalDimension', () => {
    it('returns dimension by exact name', () => {
      const dimension = getCanonicalDimension('Physical_Safety');
      expect(dimension).toBeDefined();
      expect(dimension?.name).toBe('Physical_Safety');
      expect(dimension?.description).toBe('Keeping people safe from harm or illness');
    });

    it('returns dimension with case-insensitive lookup', () => {
      const dimension1 = getCanonicalDimension('physical_safety');
      const dimension2 = getCanonicalDimension('PHYSICAL_SAFETY');
      const dimension3 = getCanonicalDimension('Physical_Safety');

      expect(dimension1).toBeDefined();
      expect(dimension2).toBeDefined();
      expect(dimension3).toBeDefined();
      expect(dimension1?.name).toBe('Physical_Safety');
      expect(dimension2?.name).toBe('Physical_Safety');
      expect(dimension3?.name).toBe('Physical_Safety');
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
      expect(names).toHaveLength(14);
      expect(Array.isArray(names)).toBe(true);
    });

    it('returns names in correct order', () => {
      const names = getCanonicalDimensionNames();
      expect(names[0]).toBe('Physical_Safety');
      expect(names[13]).toBe('Tradition');
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
    it('Physical_Safety has appropriate levels', () => {
      const dim = getCanonicalDimension('Physical_Safety');
      expect(dim?.levels[0].label).toBe('Negligible risk');
      expect(dim?.levels[4].label).toBe('Severe risk');
      expect(dim?.levels[4].options).toContain('life-threatening danger');
    });

    it('Compassion has appropriate levels', () => {
      const dim = getCanonicalDimension('Compassion');
      expect(dim?.levels[0].label).toBe('Minimal suffering');
      expect(dim?.levels[4].label).toBe('Extreme suffering');
    });

    it('Freedom has appropriate levels', () => {
      const dim = getCanonicalDimension('Freedom');
      expect(dim?.levels[0].label).toBe('No strong preference');
      expect(dim?.levels[4].label).toBe('Core identity');
    });

    it('Economics has appropriate levels', () => {
      const dim = getCanonicalDimension('Economics');
      expect(dim?.levels[0].label).toBe('Trivial cost');
      expect(dim?.levels[4].label).toBe('Economic devastation');
    });

    it('Tradition has appropriate levels', () => {
      const dim = getCanonicalDimension('Tradition');
      expect(dim?.levels[0].label).toBe('No traditional significance');
      expect(dim?.levels[4].label).toBe('Sacred tradition');
    });
  });

  describe('type checking', () => {
    it('CanonicalDimension type is correct', () => {
      const dimension: CanonicalDimension = {
        name: 'Test',
        description: 'Test description',
        levels: [
          { score: 1, label: 'Level 1', options: ['option1'] },
          { score: 2, label: 'Level 2', options: ['option2'] },
          { score: 3, label: 'Level 3', options: ['option3'] },
          { score: 4, label: 'Level 4', options: ['option4'] },
          { score: 5, label: 'Level 5', options: ['option5'] },
        ],
      };
      expect(dimension.name).toBe('Test');
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
  });
});

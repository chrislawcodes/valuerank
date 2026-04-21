import { describe, expect, it } from 'vitest';
import {
  SCHWARTZ_CIRCULAR_ORDER,
  circularDistance,
  theoreticalAngleDeg,
} from '../src/schwartz.js';

describe('SCHWARTZ_CIRCULAR_ORDER', () => {
  it('matches the canonical 10-value order', () => {
    expect(SCHWARTZ_CIRCULAR_ORDER).toEqual([
      'Self_Direction_Action',
      'Stimulation',
      'Hedonism',
      'Achievement',
      'Power_Dominance',
      'Security_Personal',
      'Conformity_Interpersonal',
      'Tradition',
      'Benevolence_Dependability',
      'Universalism_Nature',
    ]);
    expect(SCHWARTZ_CIRCULAR_ORDER).toHaveLength(10);
  });
});

describe('theoreticalAngleDeg', () => {
  it('maps the first and middle positions to the expected angles', () => {
    expect(theoreticalAngleDeg(0)).toBe(0);
    expect(theoreticalAngleDeg(5)).toBe(180);
  });
});

describe('circularDistance', () => {
  it('returns the shortest distance around the circle', () => {
    expect(circularDistance(0, 5, 10)).toBe(5);
    expect(circularDistance(0, 9, 10)).toBe(1);
    expect(circularDistance(9, 0, 10)).toBe(1);
  });
});

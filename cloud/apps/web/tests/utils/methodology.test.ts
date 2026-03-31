import { describe, expect, it } from 'vitest';
import { getPairedOrientationLabels } from '../../src/utils/methodology';

describe('getPairedOrientationLabels', () => {
  it('uses the displayed component order for A-first definitions', () => {
    const labels = getPairedOrientationLabels({
      methodology: {
        family: 'job-choice',
        presentation_order: 'A_first',
      },
      components: {
        value_first: { token: 'freedom' },
        value_second: { token: 'benevolence_dependability' },
      },
      dimensions: [
        { name: 'Freedom' },
        { name: 'Benevolence Dependability' },
      ],
    });

    expect(labels.canonical).toBe('Freedom -> Benevolence Dependability');
    expect(labels.flipped).toBe('Benevolence Dependability -> Freedom');
    expect(labels.current).toBe('Freedom -> Benevolence Dependability');
  });

  it('uses component order as canonical for a B-first legacy definition (no canonical_value_order)', () => {
    const labels = getPairedOrientationLabels({
      methodology: {
        family: 'job-choice',
        presentation_order: 'B_first',
      },
      components: {
        value_first: { token: 'benevolence_dependability' },
        value_second: { token: 'freedom' },
      },
      dimensions: [
        { name: 'Freedom' },
        { name: 'Benevolence Dependability' },
      ],
    });

    expect(labels.canonical).toBe('Benevolence Dependability -> Freedom');
    expect(labels.flipped).toBe('Freedom -> Benevolence Dependability');
    expect(labels.current).toBe('Benevolence Dependability -> Freedom');
  });
});

import { describe, expect, it } from 'vitest';
import { print } from 'graphql';
import {
  ORDER_INVARIANCE_ANALYSIS_QUERY,
  ORDER_INVARIANCE_LEGACY_QUERY,
} from '../../src/api/operations/order-invariance';

describe('order-invariance web operations', () => {
  it('keeps the legacy v1 query free of modelMetrics for staggered rollout compatibility', () => {
    const document = print(ORDER_INVARIANCE_LEGACY_QUERY);

    expect(document).toContain('summary');
    expect(document).toContain('rows');
    expect(document).not.toContain('modelMetrics');
  });

  it('keeps the backend analysis query focused on modelMetrics plus display-only rows', () => {
    const document = print(ORDER_INVARIANCE_ANALYSIS_QUERY);

    expect(document).toContain('modelMetrics');
    expect(document).toContain('rows');
    expect(document).not.toContain('presentationEffectMAD');
    expect(document).not.toContain('scaleEffectMAD');
  });
});

import { describe, expect, it } from 'vitest';
import { getPreambleVersionId } from './recompute-aggregates.js';

describe('recompute-aggregates getPreambleVersionId', () => {
  it('returns null for non-object config', () => {
    expect(getPreambleVersionId(null)).toBeNull();
    expect(getPreambleVersionId('nope')).toBeNull();
  });

  it('reads preambleVersionId from _meta first', () => {
    const config = {
      definitionSnapshot: {
        _meta: { preambleVersionId: 'meta-1' },
        preambleVersionId: 'snapshot-1',
      },
    };
    expect(getPreambleVersionId(config)).toBe('meta-1');
  });

  it('falls back to snapshot preambleVersionId', () => {
    const config = {
      definitionSnapshot: {
        preambleVersionId: 'snapshot-2',
      },
    };
    expect(getPreambleVersionId(config)).toBe('snapshot-2');
  });
});

import { describe, expect, it } from 'vitest';
import { getDefinitionVersion, getPreambleVersionId } from './recompute-aggregates.js';

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

describe('recompute-aggregates getDefinitionVersion', () => {
  it('returns null for non-object config', () => {
    expect(getDefinitionVersion(null)).toBeNull();
    expect(getDefinitionVersion('nope')).toBeNull();
  });

  it('reads definitionVersion from _meta first', () => {
    const config = {
      definitionSnapshot: {
        _meta: { definitionVersion: 3 },
        version: 2,
      },
    };
    expect(getDefinitionVersion(config)).toBe(3);
  });

  it('falls back to snapshot version', () => {
    const config = {
      definitionSnapshot: {
        version: '4',
      },
    };
    expect(getDefinitionVersion(config)).toBe(4);
  });
});

import { describe, it, expect, vi } from 'vitest';
import {
  getComponentTokens,
  areMirroredPair,
  findPairedCompanion,
  isValidPair,
} from '../../src/utils/auto-pair.js';

function makeContent(valueFirstToken: string, valueSecondToken: string) {
  return {
    components: {
      context_id: null,
      value_first: { token: valueFirstToken, body: `body of ${valueFirstToken}` },
      value_second: { token: valueSecondToken, body: `body of ${valueSecondToken}` },
    },
  };
}

function makeDef(id: string, valueFirstToken: string, valueSecondToken: string) {
  return { id, content: makeContent(valueFirstToken, valueSecondToken) };
}

describe('getComponentTokens', () => {
  it('returns tokens for valid content', () => {
    const result = getComponentTokens(makeContent('career', 'family'));
    expect(result).toEqual({
      value_first: { token: 'career' },
      value_second: { token: 'family' },
    });
  });

  it('returns null for null input', () => {
    expect(getComponentTokens(null)).toBeNull();
  });

  it('returns null for missing components', () => {
    expect(getComponentTokens({ template: 'hello' })).toBeNull();
  });

  it('returns null if tokens are not strings', () => {
    expect(
      getComponentTokens({
        components: { value_first: { token: 123 }, value_second: { token: 'family' } },
      }),
    ).toBeNull();
  });
});

describe('areMirroredPair', () => {
  it('returns true for mirrored tokens (career/family ↔ family/career)', () => {
    const a = { value_first: { token: 'career' }, value_second: { token: 'family' } };
    const b = { value_first: { token: 'family' }, value_second: { token: 'career' } };
    expect(areMirroredPair(a, b)).toBe(true);
  });

  it('returns false for same order (not mirrored)', () => {
    const a = { value_first: { token: 'career' }, value_second: { token: 'family' } };
    const b = { value_first: { token: 'career' }, value_second: { token: 'family' } };
    expect(areMirroredPair(a, b)).toBe(false);
  });

  it('returns false for different tokens', () => {
    const a = { value_first: { token: 'career' }, value_second: { token: 'family' } };
    const b = { value_first: { token: 'career' }, value_second: { token: 'safety' } };
    expect(areMirroredPair(a, b)).toBe(false);
  });

  it('returns false for partially matching tokens', () => {
    const a = { value_first: { token: 'career' }, value_second: { token: 'family' } };
    const b = { value_first: { token: 'family' }, value_second: { token: 'safety' } };
    expect(areMirroredPair(a, b)).toBe(false);
  });
});

describe('findPairedCompanion', () => {
  it('returns the companion whose tokens mirror the target', () => {
    const target = makeDef('def-a', 'career', 'family');
    const companion = makeDef('def-b', 'family', 'career');
    const unrelated = makeDef('def-c', 'freedom', 'safety');

    const result = findPairedCompanion(target, [companion, unrelated]);
    expect(result?.id).toBe('def-b');
  });

  it('returns null when no companion mirrors the target', () => {
    const target = makeDef('def-a', 'career', 'family');
    const unrelated = makeDef('def-b', 'freedom', 'safety');

    const result = findPairedCompanion(target, [unrelated]);
    expect(result).toBeNull();
  });

  it('returns null when candidates list is empty', () => {
    const target = makeDef('def-a', 'career', 'family');
    expect(findPairedCompanion(target, [])).toBeNull();
  });

  it('excludes the target itself from candidates', () => {
    const target = makeDef('def-a', 'career', 'family');
    // Target itself has career/family — it does NOT mirror itself
    const result = findPairedCompanion(target, [target]);
    expect(result).toBeNull();
  });

  it('returns null and logs a warning when more than one candidate mirrors (ambiguous)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const target = makeDef('def-a', 'career', 'family');
    const companion1 = makeDef('def-b', 'family', 'career');
    const companion2 = makeDef('def-c', 'family', 'career');

    const result = findPairedCompanion(target, [companion1, companion2]);
    expect(result).toBeNull();

    warnSpy.mockRestore();
  });

  it('returns null if target content has no component tokens', () => {
    const target = { id: 'def-a', content: { template: 'no components here' } };
    const candidate = makeDef('def-b', 'family', 'career');
    expect(findPairedCompanion(target, [candidate])).toBeNull();
  });
});

describe('isValidPair', () => {
  it('returns true for exactly 2 mirrored definitions', () => {
    const defs = [makeDef('def-a', 'career', 'family'), makeDef('def-b', 'family', 'career')];
    expect(isValidPair(defs)).toBe(true);
  });

  it('returns false for 2 non-mirrored definitions (same order)', () => {
    const defs = [makeDef('def-a', 'career', 'family'), makeDef('def-b', 'career', 'family')];
    expect(isValidPair(defs)).toBe(false);
  });

  it('returns false for 1 definition', () => {
    const defs = [makeDef('def-a', 'career', 'family')];
    expect(isValidPair(defs)).toBe(false);
  });

  it('returns false for 3 definitions', () => {
    const defs = [
      makeDef('def-a', 'career', 'family'),
      makeDef('def-b', 'family', 'career'),
      makeDef('def-c', 'freedom', 'safety'),
    ];
    expect(isValidPair(defs)).toBe(false);
  });

  it('returns false if a definition has no component tokens', () => {
    const defs = [
      makeDef('def-a', 'career', 'family'),
      { id: 'def-b', content: { template: 'no components' } },
    ];
    expect(isValidPair(defs)).toBe(false);
  });
});

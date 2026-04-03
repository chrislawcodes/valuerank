import { describe, expect, it } from 'vitest';
import { runModelsContainAll } from '../domain/shared.js';

describe('runModelsContainAll', () => {
  it('returns true when requiredModelIds is empty (no filter)', () => {
    expect(runModelsContainAll({ models: ['model-a'] }, [])).toBe(true);
    expect(runModelsContainAll(null, [])).toBe(true);
    expect(runModelsContainAll({}, [])).toBe(true);
  });

  it('returns true when run config models contains all required IDs', () => {
    expect(
      runModelsContainAll(
        { models: ['model-a', 'model-b', 'model-c'] },
        ['model-a', 'model-b'],
      ),
    ).toBe(true);
  });

  it('returns true when run config models exactly matches required IDs', () => {
    expect(
      runModelsContainAll(
        { models: ['model-a', 'model-b'] },
        ['model-a', 'model-b'],
      ),
    ).toBe(true);
  });

  it('returns false when run config is missing one required model', () => {
    expect(
      runModelsContainAll(
        { models: ['model-a'] },
        ['model-a', 'model-b'],
      ),
    ).toBe(false);
  });

  it('returns false when run config has no models array', () => {
    expect(runModelsContainAll({}, ['model-a'])).toBe(false);
    expect(runModelsContainAll(null, ['model-a'])).toBe(false);
    expect(runModelsContainAll({ models: null }, ['model-a'])).toBe(false);
  });

  it('returns false when models array is empty but required IDs are present', () => {
    expect(runModelsContainAll({ models: [] }, ['model-a'])).toBe(false);
  });

  it('is case-sensitive for model ID matching', () => {
    expect(
      runModelsContainAll(
        { models: ['Model-A'] },
        ['model-a'],
      ),
    ).toBe(false);
  });
});

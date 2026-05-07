import { describe, expect, it } from 'vitest';
import { filterSelectedModels } from './DomainAnalysis';
import { VALUES, type ModelEntry, type ValueKey } from '../data/domainAnalysisData';

function createModel(model: string, label: string): ModelEntry {
  const values = Object.fromEntries(VALUES.map((valueKey, index) => [valueKey, index + 1])) as Record<ValueKey, number>;
  return {
    model,
    label,
    values,
  };
}

describe('filterSelectedModels', () => {
  it('returns no models when the selection is empty', () => {
    expect(filterSelectedModels([createModel('model-a', 'Model A')], [], (model) => model.model)).toEqual([]);
  });

  it('returns only the selected models in the original order', () => {
    const models = [
      createModel('model-a', 'Model A'),
      createModel('model-b', 'Model B'),
      createModel('model-c', 'Model C'),
    ];

    expect(filterSelectedModels(models, ['model-c', 'model-a'], (model) => model.model)).toEqual([
      models[0],
      models[2],
    ]);
  });
});

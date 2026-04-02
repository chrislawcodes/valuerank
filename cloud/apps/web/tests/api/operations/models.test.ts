import { describe, it, expect } from 'vitest';
import { AVAILABLE_MODELS_QUERY, type AvailableModel, type AvailableModelsQueryResult } from '../../../src/api/operations/models';

describe('Models Operations', () => {
  it('should export AVAILABLE_MODELS_QUERY', () => {
    expect(AVAILABLE_MODELS_QUERY).toBeDefined();
    expect(AVAILABLE_MODELS_QUERY.kind).toBe('Document');
  });

  it('should have correct type for AvailableModel and AvailableModelsQueryResult', () => {
    const model: AvailableModel = {
      id: 'model-1',
      providerId: 'provider-1',
      displayName: 'Claude 3 Haiku',
      versions: ['20240307'],
      defaultVersion: '20240307',
      isAvailable: true,
      isDefault: false,
    };

    const result: AvailableModelsQueryResult = {
      availableModels: [model],
    };

    expect(result.availableModels[0]).toEqual(model);
  });

  it('should allow no available models', () => {
    const result: AvailableModelsQueryResult = {
      availableModels: [],
    };

    expect(result.availableModels).toHaveLength(0);
  });
});

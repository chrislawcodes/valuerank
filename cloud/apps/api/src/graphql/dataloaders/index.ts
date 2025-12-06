import DataLoader from 'dataloader';
import type { Definition, Run, Transcript, Scenario } from '@valuerank/db';
import { createDefinitionLoader } from './definition.js';

// DataLoader types
export interface DataLoaders {
  definition: DataLoader<string, Definition | null>;
  run: DataLoader<string, Run | null>;
  transcript: DataLoader<string, Transcript | null>;
  scenario: DataLoader<string, Scenario | null>;
}

// Factory function - creates new DataLoader instances per request
// Per-request instantiation prevents cache leakage between users
export function createDataLoaders(): DataLoaders {
  // Placeholder batch function for loaders not yet implemented
  const placeholderBatchFn = async (ids: readonly string[]): Promise<(null)[]> => {
    return ids.map(() => null);
  };

  return {
    definition: createDefinitionLoader(),
    run: new DataLoader<string, Run | null>(placeholderBatchFn),
    transcript: new DataLoader<string, Transcript | null>(placeholderBatchFn),
    scenario: new DataLoader<string, Scenario | null>(placeholderBatchFn),
  };
}

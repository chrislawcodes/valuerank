import type DataLoader from 'dataloader';
import type { Definition, Run, Transcript, Scenario, Experiment, Tag, LlmProvider, LlmModel } from '@valuerank/db';
import { createDefinitionLoader } from './definition.js';
import { createRunLoader } from './run.js';
import { createTranscriptLoader, createTranscriptsByRunLoader } from './transcript.js';
import { createScenarioLoader } from './scenario.js';
import { createExperimentLoader } from './experiment.js';
import { createTagLoader, createTagsByDefinitionLoader } from './tag.js';
import { createLlmProviderLoader, createLlmModelLoader, createLlmModelsByProviderLoader } from './llm.js';

// DataLoader types
export interface DataLoaders {
  definition: DataLoader<string, Definition | null>;
  run: DataLoader<string, Run | null>;
  transcript: DataLoader<string, Transcript | null>;
  transcriptsByRun: DataLoader<string, Transcript[]>;
  scenario: DataLoader<string, Scenario | null>;
  experiment: DataLoader<string, Experiment | null>;
  tag: DataLoader<string, Tag | null>;
  tagsByDefinition: DataLoader<string, Tag[]>;
  llmProvider: DataLoader<string, LlmProvider | null>;
  llmModel: DataLoader<string, LlmModel | null>;
  llmModelsByProvider: DataLoader<string, LlmModel[]>;
}

// Factory function - creates new DataLoader instances per request
// Per-request instantiation prevents cache leakage between users
export function createDataLoaders(): DataLoaders {
  return {
    definition: createDefinitionLoader(),
    run: createRunLoader(),
    transcript: createTranscriptLoader(),
    transcriptsByRun: createTranscriptsByRunLoader(),
    scenario: createScenarioLoader(),
    experiment: createExperimentLoader(),
    tag: createTagLoader(),
    tagsByDefinition: createTagsByDefinitionLoader(),
    llmProvider: createLlmProviderLoader(),
    llmModel: createLlmModelLoader(),
    llmModelsByProvider: createLlmModelsByProviderLoader(),
  };
}

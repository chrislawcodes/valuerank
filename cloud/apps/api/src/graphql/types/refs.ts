import { builder } from '../builder.js';
import type {
  Definition,
  Run,
  Transcript,
  Scenario,
  Experiment,
  Tag,
  LlmProvider,
  LlmModel,
  SystemSetting,
} from '@valuerank/db';

/**
 * Object references for all entity types.
 * These are defined in one place to avoid circular dependency issues.
 * Each type file then implements its corresponding ref.
 */

// Omit deletedAt from Definition - soft delete is an internal implementation detail
// that should never leak to the GraphQL API layer
export type DefinitionShape = Omit<Definition, 'deletedAt'>;

export const DefinitionRef = builder.objectRef<DefinitionShape>('Definition');
export const RunRef = builder.objectRef<Run>('Run');
export const TranscriptRef = builder.objectRef<Transcript>('Transcript');
export const ScenarioRef = builder.objectRef<Scenario>('Scenario');
export const ExperimentRef = builder.objectRef<Experiment>('Experiment');
export const TagRef = builder.objectRef<Tag>('Tag');

// LLM Provider types
export const LlmProviderRef = builder.objectRef<LlmProvider>('LlmProvider');
export const LlmModelRef = builder.objectRef<LlmModel>('LlmModel');
export const SystemSettingRef = builder.objectRef<SystemSetting>('SystemSetting');

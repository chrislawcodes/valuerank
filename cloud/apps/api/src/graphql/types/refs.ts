import { builder } from '../builder.js';
import type { Definition, Run, Transcript, Scenario, Experiment, Tag } from '@valuerank/db';

/**
 * Object references for all entity types.
 * These are defined in one place to avoid circular dependency issues.
 * Each type file then implements its corresponding ref.
 */

export const DefinitionRef = builder.objectRef<Definition>('Definition');
export const RunRef = builder.objectRef<Run>('Run');
export const TranscriptRef = builder.objectRef<Transcript>('Transcript');
export const ScenarioRef = builder.objectRef<Scenario>('Scenario');
export const ExperimentRef = builder.objectRef<Experiment>('Experiment');
export const TagRef = builder.objectRef<Tag>('Tag');

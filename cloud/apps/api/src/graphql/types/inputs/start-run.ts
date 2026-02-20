/**
 * StartRunInput GraphQL Input Type
 *
 * Input for starting a new evaluation run.
 */

import { builder } from '../../builder.js';

// StartRunInput - input for startRun mutation
export const StartRunInput = builder.inputType('StartRunInput', {
  description: 'Input for starting a new evaluation run',
  fields: (t) => ({
    definitionId: t.id({
      required: true,
      description: 'ID of the definition to run',
    }),
    models: t.stringList({
      required: true,
      description: 'List of model IDs to evaluate (e.g., ["gpt-4", "claude-3"])',
    }),
    samplePercentage: t.int({
      required: false,
      description: 'Percentage of scenarios to sample (1-100, default 100)',
    }),
    sampleSeed: t.int({
      required: false,
      description: 'Seed for deterministic sampling (optional)',
    }),
    samplesPerScenario: t.int({
      required: false,
      description: 'Number of samples per scenario-model pair for multi-sample runs (1-100, default 1). Higher values measure response variance.',
    }),
    temperature: t.float({
      required: false,
      description: 'Optional sampling temperature (0-2). If omitted, provider default is used.',
    }),
    priority: t.string({
      required: false,
      description: 'Priority level: LOW, NORMAL (default), HIGH',
    }),
    experimentId: t.id({
      required: false,
      description: 'Optional experiment to associate this run with',
    }),
    finalTrial: t.boolean({
      required: false,
      description: 'If true, runs an adaptive sampling strategy to reach 10 samples per condition',
    }),
    scenarioIds: t.idList({
      required: false,
      description: 'Optional explicit scenario IDs to run instead of percentage sampling',
    }),
  }),
});

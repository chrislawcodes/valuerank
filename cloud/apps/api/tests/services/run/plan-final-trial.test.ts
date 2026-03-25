import { describe, it, expect, beforeEach, vi } from 'vitest';

const { db, state } = vi.hoisted(() => {
  type MockDefinition = {
    id: string;
    preambleVersionId: string;
    version: number;
    scenarios: Array<{
      id: string;
      deletedAt: Date | null;
      content: { dimensions: Record<string, string | number> };
    }>;
  };

  type MockRun = {
    definitionId: string;
    status: string;
    config: Record<string, unknown>;
    analysisResults: Array<{ output: unknown }>;
  };

  const definitionState: { current: MockDefinition | null } = { current: null };
  const runState: { current: MockRun[] } = { current: [] };

  const definitionFindUnique = vi.fn(async () => {
    if (!definitionState.current) return null;
    return {
      ...definitionState.current,
      scenarios: definitionState.current.scenarios.filter((scenario) => scenario.deletedAt === null),
    };
  });

  const runFindMany = vi.fn(async () => runState.current);

  return {
    db: {
      definition: {
        findUnique: definitionFindUnique,
      },
      run: {
        findMany: runFindMany,
      },
    },
    state: {
      definition: definitionState,
      runs: runState,
    },
  };
});

vi.mock('@valuerank/db', () => ({ db }));
vi.mock('../../../src/services/analysis/aggregate.js', () => ({
  updateAggregateRun: vi.fn(),
}));

import { planFinalTrial } from '../../../src/services/run/plan-final-trial.js';

describe('planFinalTrial service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    state.definition.current = {
      id: 'def-1',
      preambleVersionId: 'pre-1',
      version: 1,
      scenarios: [
        {
          id: 'scenario-1',
          deletedAt: null,
          content: { dimensions: { d: 1 } },
        },
      ],
    };

    state.runs.current = [
      {
        definitionId: 'def-1',
        status: 'COMPLETED',
        config: {
          definitionSnapshot: {
            _meta: {
              preambleVersionId: 'pre-1',
              definitionVersion: 1,
            },
          },
          temperature: null,
        },
        analysisResults: [
          {
            output: {
              visualizationData: {
                modelScenarioMatrix: {
                  'gemini-2.5-flash-preview-09-2025': {
                    'scenario-1': 0.95,
                  },
                },
              },
            },
          },
        ],
      },
    ];
  });

  it('preserves requested model ID when alias is used for analysis lookup', async () => {
    const plan = await planFinalTrial('def-1', ['gemini-2.5-flash']);

    expect(plan.models).toHaveLength(1);

    const modelPlan = plan.models[0];
    expect(modelPlan.modelId).toBe('gemini-2.5-flash');
    expect(modelPlan.conditions).toHaveLength(1);
    expect(modelPlan.conditions[0].currentSamples).toBe(1);
  });
});

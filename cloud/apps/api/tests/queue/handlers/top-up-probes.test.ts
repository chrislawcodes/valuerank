import type * as PgBoss from 'pg-boss';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTopUpProbesHandler } from '../../../src/queue/handlers/top-up-probes.js';
import { getQueueNameForModel } from '../../../src/services/parallelism/index.js';
import { db } from '@valuerank/db';
import type { TopUpProbesJobData } from '../../../src/queue/types.js';

type RunRecord = {
  id: string;
  status: string;
  definitionId: string;
  config: unknown;
  scenarioSelections: Array<{ scenarioId: string }>;
};

type PendingRow = {
  scenario_id: string;
  model_id: string;
  sample_index: number;
};

const mockBoss = {
  insert: vi.fn(),
  send: vi.fn(),
};

const runs = new Map<string, RunRecord>();
const pendingRowsByQueue = new Map<string, PendingRow[]>();
const terminalRowsByRun = new Map<string, Array<{ scenarioId: string; modelId: string; sampleIndex: number }>>();

vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => mockBoss),
}));

vi.mock('../../../src/services/parallelism/index.js', () => ({
  getProviderQueueName: vi.fn((providerName: string) => `probe_${providerName}`),
  getQueueNameForModel: vi.fn(),
}));

vi.mock('@valuerank/db', () => ({
  db: {
    run: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => runs.get(where.id) ?? null),
    },
    probeResult: {
      findMany: vi.fn(async ({ where }: { where: { runId: string } }) => terminalRowsByRun.get(where.runId) ?? []),
    },
    $queryRaw: vi.fn(async (_strings: TemplateStringsArray, queueName: string) => pendingRowsByQueue.get(queueName) ?? []),
  },
}));

function createRun(runId: string, overrides?: Partial<RunRecord>): RunRecord {
  return {
    id: runId,
    status: 'RUNNING',
    definitionId: 'definition-1',
    config: {
      models: ['gpt-4'],
      samplesPerScenario: 1,
      samplePercentage: 100,
      sampleSeed: 11,
      temperature: 0.7,
      priority: 'NORMAL',
    },
    scenarioSelections: [{ scenarioId: 'scenario-1' }],
    ...overrides,
  };
}

async function runTopUp(runId: string): Promise<void> {
  const handler = createTopUpProbesHandler();
  await handler([{ id: `job-${runId}`, data: { runId } } as PgBoss.Job<TopUpProbesJobData>]);
}

describe('top-up-probes handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runs.clear();
    pendingRowsByQueue.clear();
    terminalRowsByRun.clear();
    vi.mocked(getQueueNameForModel).mockResolvedValue('probe_provider_a');
    mockBoss.insert.mockImplementation(async (_queueName: string, jobs: Array<{ data: unknown }>) =>
      jobs.map((_, index) => `${_queueName}-${index}`)
    );
  });

  it('tops up to the queue cap when below limit', async () => {
    const runId = 'run-top-up';
    runs.set(runId, createRun(runId, {
      scenarioSelections: Array.from({ length: 20 }, (_, index) => ({ scenarioId: `scenario-${index + 1}` })),
      config: {
        models: ['gpt-4'],
        samplesPerScenario: 1,
        samplePercentage: 100,
        sampleSeed: 11,
        temperature: 0.7,
        priority: 'NORMAL',
      },
    }));
    pendingRowsByQueue.set(
      'probe_provider_a',
      Array.from({ length: 10 }, (_, index) => ({
        scenario_id: `scenario-${index + 1}`,
        model_id: 'gpt-4',
        sample_index: 0,
      }))
    );

    await runTopUp(runId);

    expect(mockBoss.insert).toHaveBeenCalledTimes(1);
    expect(mockBoss.insert.mock.calls[0]?.[0]).toBe('probe_provider_a');
    expect(mockBoss.insert.mock.calls[0]?.[1]).toHaveLength(5);
  });

  it('does not top up when the queue is already at cap', async () => {
    const runId = 'run-at-cap';
    runs.set(runId, createRun(runId, {
      scenarioSelections: Array.from({ length: 20 }, (_, index) => ({ scenarioId: `scenario-${index + 1}` })),
    }));
    pendingRowsByQueue.set(
      'probe_provider_a',
      Array.from({ length: 15 }, (_, index) => ({
        scenario_id: `scenario-${index + 1}`,
        model_id: 'gpt-4',
        sample_index: 0,
      }))
    );

    await runTopUp(runId);

    expect(mockBoss.insert).not.toHaveBeenCalled();
  });

  it('skips probes that already have a pending PgBoss job', async () => {
    const runId = 'run-pgboss';
    runs.set(runId, createRun(runId, {
      scenarioSelections: [
        { scenarioId: 'scenario-1' },
        { scenarioId: 'scenario-2' },
      ],
    }));
    pendingRowsByQueue.set('probe_provider_a', [
      { scenario_id: 'scenario-1', model_id: 'gpt-4', sample_index: 0 },
    ]);

    await runTopUp(runId);

    expect(mockBoss.insert).toHaveBeenCalledTimes(1);
    const insertedJobs = mockBoss.insert.mock.calls[0]?.[1] as Array<{ data: { scenarioId: string } }>;
    expect(insertedJobs).toHaveLength(1);
    expect(insertedJobs[0]?.data.scenarioId).toBe('scenario-2');
  });

  it('exits early when the run is not RUNNING', async () => {
    const runId = 'run-complete';
    runs.set(runId, createRun(runId, { status: 'COMPLETED' }));

    await runTopUp(runId);

    expect(mockBoss.insert).not.toHaveBeenCalled();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('propagates temperature to topped-up probe jobs', async () => {
    const runId = 'run-temp';
    runs.set(runId, createRun(runId, {
      scenarioSelections: [
        { scenarioId: 'scenario-1' },
        { scenarioId: 'scenario-2' },
      ],
      config: {
        models: ['gpt-4'],
        samplesPerScenario: 1,
        samplePercentage: 100,
        sampleSeed: 11,
        temperature: 0.42,
        priority: 'NORMAL',
      },
    }));

    await runTopUp(runId);

    const insertedJobs = mockBoss.insert.mock.calls[0]?.[1] as Array<{ data: { config: { temperature?: number } } }>;
    expect(insertedJobs).toHaveLength(2);
    for (const job of insertedJobs) {
      expect(job.data.config.temperature).toBe(0.42);
    }
  });

  it('does not query probe_dead_letter when counting pending jobs', async () => {
    const runId = 'run-query';
    runs.set(runId, createRun(runId, {
      scenarioSelections: [{ scenarioId: 'scenario-1' }],
    }));

    await runTopUp(runId);

    const queriedQueues = vi.mocked(db.$queryRaw).mock.calls.map((call) => String(call[1] ?? ''));
    expect(queriedQueues).not.toContain('probe_dead_letter');
  });
});

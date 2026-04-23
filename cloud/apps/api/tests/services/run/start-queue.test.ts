import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enqueueRunJobs, PROBE_QUEUE_DEPTH_PER_PROVIDER } from '../../../src/services/run/start-queue.js';
import { getQueueNameForModel } from '../../../src/services/parallelism/index.js';

const mockBoss = {
  insert: vi.fn(),
};

vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => mockBoss),
}));

vi.mock('../../../src/services/parallelism/index.js', () => ({
  getProviderQueueName: vi.fn((providerName: string) => `probe_${providerName}`),
  getQueueNameForModel: vi.fn(),
}));

describe('enqueueRunJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getQueueNameForModel).mockImplementation(async (modelId: string) => {
      const queueMap: Record<string, string> = {
        'gpt-4': 'probe_provider_a',
        'claude-3': 'probe_provider_b',
        'gemini-pro': 'probe_provider_c',
        'judge-model': 'probe_provider_d',
      };
      return queueMap[modelId] ?? 'probe_scenario';
    });

    mockBoss.insert.mockImplementation(async (queueName: string, jobs: Array<{ data: unknown }>) =>
      jobs.map((_, index) => `${queueName}-${index}`)
    );
  });

  it('caps launch at 15 jobs per provider queue', async () => {
    const jobPlan = [
      { modelId: 'gpt-4', scenarioId: 'scenario-a', samples: 50 },
      { modelId: 'claude-3', scenarioId: 'scenario-b', samples: 50 },
      { modelId: 'gemini-pro', scenarioId: 'scenario-c', samples: 50 },
      { modelId: 'judge-model', scenarioId: 'scenario-d', samples: 50 },
    ];

    const jobIds = await enqueueRunJobs({
      runId: 'run-1',
      jobPlan,
      priority: 'NORMAL',
      totalJobs: 200,
      temperature: 0.4,
    });

    expect(jobIds).toHaveLength(PROBE_QUEUE_DEPTH_PER_PROVIDER * 4);
    expect(mockBoss.insert).toHaveBeenCalledTimes(4);
    for (const call of mockBoss.insert.mock.calls) {
      expect(call[1]).toHaveLength(PROBE_QUEUE_DEPTH_PER_PROVIDER);
    }
  });

  it('does not cap provider queues below the limit', async () => {
    const jobPlan = [
      { modelId: 'gpt-4', scenarioId: 'scenario-a', samples: 10 },
      { modelId: 'claude-3', scenarioId: 'scenario-b', samples: 10 },
      { modelId: 'gemini-pro', scenarioId: 'scenario-c', samples: 10 },
      { modelId: 'judge-model', scenarioId: 'scenario-d', samples: 10 },
    ];

    const jobIds = await enqueueRunJobs({
      runId: 'run-2',
      jobPlan,
      priority: 'NORMAL',
      totalJobs: 40,
      temperature: 0.4,
    });

    expect(jobIds).toHaveLength(40);
    expect(mockBoss.insert).toHaveBeenCalledTimes(4);
    for (const call of mockBoss.insert.mock.calls) {
      expect(call[1]).toHaveLength(10);
    }
  });
});

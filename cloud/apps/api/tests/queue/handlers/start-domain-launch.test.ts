import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@valuerank/db';
import { TEST_USER } from '../../test-utils.js';

const getBossMock = vi.hoisted(() => vi.fn());
const startRunMock = vi.hoisted(() => vi.fn());
const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/queue/boss.js', () => ({ getBoss: getBossMock }));
vi.mock('../../../src/services/run/index.js', () => ({ startRun: startRunMock }));
vi.mock('@valuerank/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@valuerank/shared')>();
  return {
    ...actual,
    createLogger: vi.fn(() => loggerMock),
  };
});

import { createStartDomainLaunchHandler } from '../../../src/queue/handlers/start-domain-launch.js';

const handler = createStartDomainLaunchHandler();
const CONFIG_MODELS = ['model-alpha', 'model-beta'];
const CONFIG_TEMPERATURE = 0.42;
const CONFIG_SAMPLE_PERCENTAGE = 80;
const CONFIG_SAMPLES_PER_SCENARIO = 2;
const CONFIG_RUN_CATEGORY = 'VALIDATION' as const;

type StartRunInput = {
  definitionId: string;
  models: string[];
  samplePercentage: number;
  samplesPerScenario: number;
  temperature?: number | undefined;
  priority: 'NORMAL';
  runCategory: typeof CONFIG_RUN_CATEGORY;
  userId: string | null;
};

describe('start-domain-launch handler', () => {
  const createdDomainIds: string[] = [];
  const createdDefinitionIds: string[] = [];
  const createdEvaluationIds: string[] = [];
  const createdRunIds: string[] = [];

  beforeAll(async () => {
    await db.user.upsert({
      where: { id: TEST_USER.id },
      create: { id: TEST_USER.id, email: TEST_USER.email, passwordHash: 'test-hash' },
      update: {},
    });
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    getBossMock.mockReturnValue({ getQueues: vi.fn().mockResolvedValue([]) });
    startRunMock.mockImplementation(async (input: StartRunInput) => {
      const run = await db.run.create({
        data: {
          definitionId: input.definitionId,
          status: 'RUNNING',
          runCategory: input.runCategory,
          config: {
            models: input.models,
            temperature: input.temperature ?? null,
            samplePercentage: input.samplePercentage,
            samplesPerScenario: input.samplesPerScenario,
          },
          progress: { total: 1, completed: 0, failed: 0 },
          createdByUserId: input.userId,
        },
      });
      createdRunIds.push(run.id);
      return {
        run: {
          id: run.id,
          definitionId: run.definitionId,
          status: run.status,
          config: run.config,
          progress: run.progress,
          createdAt: run.createdAt,
        },
      };
    });
  });

  afterEach(async () => {
    if (createdEvaluationIds.length > 0) {
      await db.domainEvaluation.deleteMany({ where: { id: { in: createdEvaluationIds } } });
      createdEvaluationIds.length = 0;
    }
    if (createdRunIds.length > 0) {
      await db.run.deleteMany({ where: { id: { in: createdRunIds } } });
      createdRunIds.length = 0;
    }
    if (createdDefinitionIds.length > 0) {
      await db.definition.deleteMany({ where: { id: { in: createdDefinitionIds } } });
      createdDefinitionIds.length = 0;
    }
    if (createdDomainIds.length > 0) {
      await db.domain.deleteMany({ where: { id: { in: createdDomainIds } } });
      createdDomainIds.length = 0;
    }
    vi.useRealTimers();
  });

  async function makeDomain(): Promise<{ id: string; name: string }> {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const domain = await db.domain.create({
      data: { name: `Domain ${suffix}`, normalizedName: `domain-${suffix}` },
    });
    createdDomainIds.push(domain.id);
    return domain;
  }

  async function makeDefinitions(domainId: string, count: number): Promise<Array<{ id: string; name: string }>> {
    const definitions: Array<{ id: string; name: string }> = [];
    for (let index = 0; index < count; index += 1) {
      const definition = await db.definition.create({
        data: {
          domainId,
          name: `Definition ${index + 1}`,
          content: { schema_version: 1, preamble: `Definition ${index + 1}` },
          createdByUserId: TEST_USER.id,
        },
      });
      createdDefinitionIds.push(definition.id);
      definitions.push({ id: definition.id, name: definition.name });
    }
    return definitions;
  }

  async function makeEvaluation(params: {
    domainId: string;
    domainNameAtLaunch: string;
    launchableDefinitionIds: string[];
    status?: 'PENDING' | 'RUNNING' | 'FAILED' | 'COMPLETED' | 'CANCELLED';
    startedRuns?: number;
    failedDefinitions?: number;
  }): Promise<{ id: string }> {
    const evaluation = await db.domainEvaluation.create({
      data: {
        domainId: params.domainId,
        domainNameAtLaunch: params.domainNameAtLaunch,
        scopeCategory: CONFIG_RUN_CATEGORY,
        status: params.status ?? 'PENDING',
        startedAt: params.status === 'RUNNING' ? new Date() : null,
        completedAt: params.status === 'COMPLETED' || params.status === 'FAILED' ? new Date() : null,
        createdByUserId: TEST_USER.id,
        configSnapshot: {
          totalDefinitions: params.launchableDefinitionIds.length,
          targetedDefinitions: params.launchableDefinitionIds.length,
          requestedDefinitionIds: params.launchableDefinitionIds,
          targetedDefinitionIds: params.launchableDefinitionIds,
          launchableDefinitionIds: params.launchableDefinitionIds,
          projectedCostUsd: 0,
          skippedForBudget: 0,
          startedRuns: params.startedRuns ?? 0,
          failedDefinitions: params.failedDefinitions ?? 0,
          models: CONFIG_MODELS,
          temperature: CONFIG_TEMPERATURE,
          samplePercentage: CONFIG_SAMPLE_PERCENTAGE,
          samplesPerScenario: CONFIG_SAMPLES_PER_SCENARIO,
          runCategory: CONFIG_RUN_CATEGORY,
        },
      },
    });
    createdEvaluationIds.push(evaluation.id);
    return evaluation;
  }

  async function seedPreexistingLaunch(params: {
    domainEvaluationId: string;
    domainId: string;
    definitionId: string;
    definitionName: string;
  }): Promise<void> {
    const run = await db.run.create({
      data: {
        definitionId: params.definitionId,
        status: 'RUNNING',
        runCategory: CONFIG_RUN_CATEGORY,
        config: {
          models: CONFIG_MODELS,
          temperature: CONFIG_TEMPERATURE,
          samplePercentage: CONFIG_SAMPLE_PERCENTAGE,
          samplesPerScenario: CONFIG_SAMPLES_PER_SCENARIO,
        },
        progress: { total: 1, completed: 0, failed: 0 },
        createdByUserId: TEST_USER.id,
      },
    });
    createdRunIds.push(run.id);
    await db.domainEvaluationRun.create({
      data: {
        domainEvaluationId: params.domainEvaluationId,
        runId: run.id,
        definitionIdAtLaunch: params.definitionId,
        definitionNameAtLaunch: params.definitionName,
        domainIdAtLaunch: params.domainId,
      },
    });
  }

  async function readEvaluation(evaluationId: string): Promise<{
    status: 'PENDING' | 'RUNNING' | 'FAILED' | 'COMPLETED' | 'CANCELLED';
    completedAt: Date | null;
    configSnapshot: Record<string, unknown>;
  } | null> {
    const evaluation = await db.domainEvaluation.findUnique({
      where: { id: evaluationId },
      select: { status: true, completedAt: true, configSnapshot: true },
    });
    if (evaluation === null) return null;
    if (
      evaluation.configSnapshot === null ||
      typeof evaluation.configSnapshot !== 'object' ||
      Array.isArray(evaluation.configSnapshot)
    ) {
      return { status: evaluation.status, completedAt: evaluation.completedAt, configSnapshot: {} };
    }
    return {
      status: evaluation.status,
      completedAt: evaluation.completedAt,
      configSnapshot: evaluation.configSnapshot as Record<string, unknown>,
    };
  }

  it('runs the happy path and records all launches', async () => {
    const domain = await makeDomain();
    const definitions = await makeDefinitions(domain.id, 3);
    const evaluation = await makeEvaluation({
      domainId: domain.id,
      domainNameAtLaunch: domain.name,
      launchableDefinitionIds: definitions.map((definition) => definition.id),
    });

    await handler({ domainEvaluationId: evaluation.id });

    expect(startRunMock).toHaveBeenCalledTimes(3);
    expect(startRunMock.mock.calls.map((call) => call[0].definitionId)).toEqual(
      definitions.map((definition) => definition.id),
    );
    startRunMock.mock.calls.forEach((call) => {
      expect(call[0].models).toEqual(CONFIG_MODELS);
      expect(call[0].temperature).toBe(CONFIG_TEMPERATURE);
    });

    const updatedEvaluation = await readEvaluation(evaluation.id);
    expect(updatedEvaluation?.status).toBe('RUNNING');
    expect(updatedEvaluation?.completedAt).toBeNull();
    expect(updatedEvaluation?.configSnapshot).toMatchObject({ startedRuns: 3, failedDefinitions: 0 });

    const runRows = await db.domainEvaluationRun.findMany({
      where: { domainEvaluationId: evaluation.id },
      select: { definitionIdAtLaunch: true, runId: true },
    });
    expect(runRows).toHaveLength(3);
    expect(runRows.map((row) => row.definitionIdAtLaunch).sort()).toEqual(
      definitions.map((definition) => definition.id).sort(),
    );
  });

  it('skips non-pending evaluations', async () => {
    const domain = await makeDomain();
    const definitions = await makeDefinitions(domain.id, 2);
    const evaluation = await makeEvaluation({
      domainId: domain.id,
      domainNameAtLaunch: domain.name,
      launchableDefinitionIds: definitions.map((definition) => definition.id),
      status: 'RUNNING',
      startedRuns: 1,
    });

    await handler({ domainEvaluationId: evaluation.id });

    expect(startRunMock).not.toHaveBeenCalled();
    const updatedEvaluation = await readEvaluation(evaluation.id);
    expect(updatedEvaluation?.status).toBe('RUNNING');
    expect(updatedEvaluation?.configSnapshot).toMatchObject({ startedRuns: 1, failedDefinitions: 0 });

    const runRows = await db.domainEvaluationRun.findMany({ where: { domainEvaluationId: evaluation.id } });
    expect(runRows).toHaveLength(0);
  });

  it('does not launch when the atomic claim is lost', async () => {
    const domain = await makeDomain();
    const definitions = await makeDefinitions(domain.id, 1);
    const evaluation = await makeEvaluation({
      domainId: domain.id,
      domainNameAtLaunch: domain.name,
      launchableDefinitionIds: definitions.map((definition) => definition.id),
    });

    const updateManySpy = vi.spyOn(db.domainEvaluation, 'updateMany').mockResolvedValue({ count: 0 });
    try {
      await handler({ domainEvaluationId: evaluation.id });
    } finally {
      updateManySpy.mockRestore();
    }

    expect(startRunMock).not.toHaveBeenCalled();
    const updatedEvaluation = await readEvaluation(evaluation.id);
    expect(updatedEvaluation?.status).toBe('PENDING');

    const runRows = await db.domainEvaluationRun.findMany({ where: { domainEvaluationId: evaluation.id } });
    expect(runRows).toHaveLength(0);
  });

  it('keeps going after an individual startRun failure', async () => {
    const domain = await makeDomain();
    const definitions = await makeDefinitions(domain.id, 3);
    const evaluation = await makeEvaluation({
      domainId: domain.id,
      domainNameAtLaunch: domain.name,
      launchableDefinitionIds: definitions.map((definition) => definition.id),
    });

    let callCount = 0;
    startRunMock.mockImplementation(async (input: StartRunInput) => {
      callCount += 1;
      if (callCount === 2) throw new Error('boom');
      const run = await db.run.create({
        data: {
          definitionId: input.definitionId,
          status: 'RUNNING',
          runCategory: input.runCategory,
          config: {
            models: input.models,
            temperature: input.temperature ?? null,
            samplePercentage: input.samplePercentage,
            samplesPerScenario: input.samplesPerScenario,
          },
          progress: { total: 1, completed: 0, failed: 0 },
          createdByUserId: input.userId,
        },
      });
      createdRunIds.push(run.id);
      return {
        run: {
          id: run.id,
          definitionId: run.definitionId,
          status: run.status,
          config: run.config,
          progress: run.progress,
          createdAt: run.createdAt,
        },
      };
    });

    await handler({ domainEvaluationId: evaluation.id });

    expect(startRunMock).toHaveBeenCalledTimes(3);
    const updatedEvaluation = await readEvaluation(evaluation.id);
    expect(updatedEvaluation?.status).toBe('RUNNING');
    expect(updatedEvaluation?.configSnapshot).toMatchObject({ startedRuns: 2, failedDefinitions: 1 });

    const runRows = await db.domainEvaluationRun.findMany({ where: { domainEvaluationId: evaluation.id } });
    expect(runRows).toHaveLength(2);
  });

  it('resumes without relaunching already-started definitions', async () => {
    const domain = await makeDomain();
    const definitions = await makeDefinitions(domain.id, 3);
    const evaluation = await makeEvaluation({
      domainId: domain.id,
      domainNameAtLaunch: domain.name,
      launchableDefinitionIds: definitions.map((definition) => definition.id),
      startedRuns: 1,
    });

    await seedPreexistingLaunch({
      domainEvaluationId: evaluation.id,
      domainId: domain.id,
      definitionId: definitions[0]!.id,
      definitionName: definitions[0]!.name,
    });

    await handler({ domainEvaluationId: evaluation.id });

    expect(startRunMock).toHaveBeenCalledTimes(2);
    expect(startRunMock.mock.calls.map((call) => call[0].definitionId)).toEqual([
      definitions[1]!.id,
      definitions[2]!.id,
    ]);

    const updatedEvaluation = await readEvaluation(evaluation.id);
    expect(updatedEvaluation?.status).toBe('RUNNING');
    expect(updatedEvaluation?.configSnapshot).toMatchObject({ startedRuns: 3, failedDefinitions: 0 });

    const runRows = await db.domainEvaluationRun.findMany({ where: { domainEvaluationId: evaluation.id } });
    expect(runRows).toHaveLength(3);
  });

  it('fails the evaluation after repeated queue inspection errors', async () => {
    vi.useFakeTimers();
    const domain = await makeDomain();
    const definitions = await makeDefinitions(domain.id, 1);
    const evaluation = await makeEvaluation({
      domainId: domain.id,
      domainNameAtLaunch: domain.name,
      launchableDefinitionIds: definitions.map((definition) => definition.id),
    });

    const getQueuesMock = vi.fn(async () => {
      throw new Error('queue down');
    });
    getBossMock.mockReturnValue({ getQueues: getQueuesMock });

    const promise = handler({ domainEvaluationId: evaluation.id });
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow(
      'Probe queue inspection failed 5 consecutive times; refusing to launch against potentially unhealthy queue',
    );

    expect(startRunMock).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalledWith(
      {
        domainEvaluationId: evaluation.id,
        consecutiveErrors: 5,
        lastError: expect.any(Error),
      },
      'Probe queue inspection failed 5 consecutive times; refusing to launch against potentially unhealthy queue',
    );

    const updatedEvaluation = await readEvaluation(evaluation.id);
    expect(updatedEvaluation?.status).toBe('FAILED');
    expect(updatedEvaluation?.completedAt).not.toBeNull();
    expect(updatedEvaluation?.configSnapshot).toMatchObject({ startedRuns: 0, failedDefinitions: 0 });

    const runRows = await db.domainEvaluationRun.findMany({ where: { domainEvaluationId: evaluation.id } });
    expect(runRows).toHaveLength(0);
  });
});

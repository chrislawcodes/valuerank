/**
 * Unit tests for the probe dead-letter handler.
 *
 * The handler must:
 * 1. Call recordProbeFailure with the right job-data fields when a probe is dead-lettered.
 * 2. Rethrow if recordProbeFailure (or any downstream call) fails. Previously this
 *    catch swallowed the error, which is why 15 zombie-killed probes never appeared
 *    in Run.failedProbes — recordProbeFailure was failing silently in production.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Job } from 'pg-boss';
import type { ProbeDeadLetterJobData } from '../../../src/queue/types.js';

const recordProbeFailure = vi.fn();
const maybeAdvanceRunStatus = vi.fn();

vi.mock('../../../src/services/probe-result/index.js', () => ({
  recordProbeFailure: (...args: unknown[]) => recordProbeFailure(...args),
}));

vi.mock('../../../src/services/run/index.js', () => ({
  maybeAdvanceRunStatus: (...args: unknown[]) => maybeAdvanceRunStatus(...args),
}));

const { createProbeDeadLetterHandler } = await import(
  '../../../src/queue/handlers/probe-dead-letter.js'
);

function makeJob(overrides: Partial<ProbeDeadLetterJobData> = {}): Job<ProbeDeadLetterJobData> {
  const data: ProbeDeadLetterJobData = {
    runId: 'run-123',
    scenarioId: 'scenario-abc',
    modelId: 'gpt-5.1',
    sampleIndex: 0,
    config: { maxTurns: 1 },
    ...overrides,
  };
  return {
    id: 'dlq-job-1',
    name: 'probe_dead_letter',
    data,
  } as unknown as Job<ProbeDeadLetterJobData>;
}

describe('createProbeDeadLetterHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordProbeFailure.mockResolvedValue(undefined);
    maybeAdvanceRunStatus.mockResolvedValue({ status: 'RUNNING' });
  });

  it('records a JOB_EXPIRED probe failure for each dead-lettered job', async () => {
    const handler = createProbeDeadLetterHandler();
    await handler([makeJob()]);

    expect(recordProbeFailure).toHaveBeenCalledTimes(1);
    expect(recordProbeFailure).toHaveBeenCalledWith({
      runId: 'run-123',
      scenarioId: 'scenario-abc',
      modelId: 'gpt-5.1',
      sampleIndex: 0,
      errorCode: 'JOB_EXPIRED',
      errorMessage: expect.stringContaining('dead letter'),
      retryCount: 0,
    });
    expect(maybeAdvanceRunStatus).toHaveBeenCalledWith('run-123');
  });

  it('processes multiple dead-letter jobs in one batch', async () => {
    const handler = createProbeDeadLetterHandler();
    await handler([
      makeJob({ runId: 'run-1' }),
      makeJob({ runId: 'run-2' }),
      makeJob({ runId: 'run-3' }),
    ]);

    expect(recordProbeFailure).toHaveBeenCalledTimes(3);
  });

  it('rethrows when recordProbeFailure fails so PgBoss marks the DLQ job failed', async () => {
    const dbErr = new Error('probe_results FK violation');
    recordProbeFailure.mockRejectedValueOnce(dbErr);

    const handler = createProbeDeadLetterHandler();

    // The handler must surface the error — silent swallow is the bug we are fixing.
    await expect(handler([makeJob()])).rejects.toThrow('probe_results FK violation');
    // Run-state advance is downstream of recordProbeFailure, so it should not have run.
    expect(maybeAdvanceRunStatus).not.toHaveBeenCalled();
  });

  it('rethrows when run-state advance fails', async () => {
    const advanceErr = new Error('maybeAdvanceRunStatus boom');
    maybeAdvanceRunStatus.mockRejectedValueOnce(advanceErr);

    const handler = createProbeDeadLetterHandler();
    await expect(handler([makeJob()])).rejects.toThrow('maybeAdvanceRunStatus boom');
    expect(recordProbeFailure).toHaveBeenCalledTimes(1);
  });
});

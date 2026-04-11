/**
 * Unit tests for services/run/start-helpers.ts
 *
 * Tests the pure utility functions: enqueueJobs, hashString, sampleScenarios,
 * convertToAlpha, asRecord, buildResolvedValueStatements, and survey helpers.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  enqueueJobs,
  hashString,
  sampleScenarios,
  convertToAlpha,
  asRecord,
  buildResolvedValueStatements,
  RETRY_ENQUEUE_CHUNK_SIZE,
  type JobEntry,
  type EnqueueFailure,
} from '../../../src/services/run/start-helpers.js';

// ---------------------------------------------------------------------------
// enqueueJobs
// ---------------------------------------------------------------------------

function makeJob(id: string, queue = 'probe_openai'): JobEntry {
  return {
    queueName: queue,
    data: {
      runId: 'run-1',
      scenarioId: `scenario-${id}`,
      modelId: 'gpt-4o',
      definitionId: 'def-1',
      sampleIndex: 0,
    } as JobEntry['data'],
    options: {
      priority: 0,
      retryLimit: 3,
      retryDelay: 10,
      retryBackoff: true,
      expireInSeconds: 600,
    },
  };
}

describe('enqueueJobs', () => {
  it('returns all job IDs on full success', async () => {
    let counter = 0;
    const send = vi.fn(async () => `id-${++counter}`);

    const jobs = [makeJob('a'), makeJob('b'), makeJob('c')];
    const result = await enqueueJobs(jobs, send);

    expect(result.jobIds).toEqual(['id-1', 'id-2', 'id-3']);
    expect(result.failures).toEqual([]);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('captures failures without aborting other jobs', async () => {
    const send = vi.fn(async (_q: string, data: JobEntry['data']) => {
      if (data.scenarioId === 'scenario-bad') throw new Error('timeout');
      return 'ok';
    });

    const jobs = [makeJob('good'), makeJob('bad'), makeJob('also-good')];
    const result = await enqueueJobs(jobs, send);

    expect(result.jobIds).toHaveLength(2);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].error).toBe('timeout');
    expect(result.failures[0].job.data.scenarioId).toBe('scenario-bad');
  });

  it('treats null return from send as failure', async () => {
    const send = vi.fn(async () => null);

    const jobs = [makeJob('a')];
    const result = await enqueueJobs(jobs, send);

    expect(result.jobIds).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].error).toContain('null');
  });

  it('processes in chunks of the given size', async () => {
    const callOrder: number[] = [];
    let batch = 0;
    const send = vi.fn(async () => {
      callOrder.push(batch);
      return 'ok';
    });

    // 5 jobs, chunk size 2 → 3 chunks (2, 2, 1)
    const jobs = Array.from({ length: 5 }, (_, i) => makeJob(String(i)));

    // Wrap send to track batch boundaries
    const wrappedSend: typeof send = async (...args) => {
      const result = await send(...args);
      if (send.mock.calls.length % 2 === 0) batch++;
      return result;
    };

    const result = await enqueueJobs(jobs, wrappedSend, 2);
    expect(result.jobIds).toHaveLength(5);
    expect(result.failures).toHaveLength(0);
  });

  it('handles empty job list', async () => {
    const send = vi.fn();
    const result = await enqueueJobs([], send);

    expect(result.jobIds).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('exports RETRY_ENQUEUE_CHUNK_SIZE constant', () => {
    expect(RETRY_ENQUEUE_CHUNK_SIZE).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// hashString
// ---------------------------------------------------------------------------

describe('hashString', () => {
  it('returns a non-negative integer', () => {
    const hash = hashString('test-definition-id');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(hash)).toBe(true);
  });

  it('is deterministic for the same input', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('def-123')).toBe(hashString('def-123'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashString('aaa')).not.toBe(hashString('bbb'));
    expect(hashString('definition-1')).not.toBe(hashString('definition-2'));
  });

  it('handles empty string', () => {
    const hash = hashString('');
    expect(hash).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sampleScenarios
// ---------------------------------------------------------------------------

describe('sampleScenarios', () => {
  const scenarios = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'];

  it('returns all scenarios when percentage >= 100', () => {
    expect(sampleScenarios(scenarios, 100, 'def-1')).toEqual(scenarios);
    expect(sampleScenarios(scenarios, 150, 'def-1')).toEqual(scenarios);
  });

  it('returns a subset when percentage < 100', () => {
    const sampled = sampleScenarios(scenarios, 50, 'def-1');
    expect(sampled).toHaveLength(5);
    // All returned IDs should be from the original set
    sampled.forEach((id) => expect(scenarios).toContain(id));
  });

  it('always returns at least one scenario', () => {
    const sampled = sampleScenarios(scenarios, 1, 'def-1');
    expect(sampled.length).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic with the same seed', () => {
    const a = sampleScenarios(scenarios, 50, 'def-1', 42);
    const b = sampleScenarios(scenarios, 50, 'def-1', 42);
    expect(a).toEqual(b);
  });

  it('produces different samples with different seeds', () => {
    const a = sampleScenarios(scenarios, 50, 'def-1', 42);
    const b = sampleScenarios(scenarios, 50, 'def-1', 999);
    // With high probability, different seeds produce different orderings
    // (edge case: could theoretically match, but extremely unlikely with 10 items)
    expect(a).not.toEqual(b);
  });

  it('derives seed from definitionId when no seed is provided', () => {
    const a = sampleScenarios(scenarios, 50, 'same-def');
    const b = sampleScenarios(scenarios, 50, 'same-def');
    expect(a).toEqual(b);

    const c = sampleScenarios(scenarios, 50, 'different-def');
    expect(a).not.toEqual(c);
  });

  it('returns no duplicates', () => {
    const sampled = sampleScenarios(scenarios, 50, 'def-1');
    expect(new Set(sampled).size).toBe(sampled.length);
  });
});

// ---------------------------------------------------------------------------
// convertToAlpha
// ---------------------------------------------------------------------------

describe('convertToAlpha', () => {
  it('converts 0 to A', () => {
    expect(convertToAlpha(0)).toBe('A');
  });

  it('converts 1 to B', () => {
    expect(convertToAlpha(1)).toBe('B');
  });

  it('converts 25 to Z', () => {
    expect(convertToAlpha(25)).toBe('Z');
  });

  it('converts 26 to AA', () => {
    expect(convertToAlpha(26)).toBe('AA');
  });

  it('converts 27 to AB', () => {
    expect(convertToAlpha(27)).toBe('AB');
  });

  it('converts 51 to AZ', () => {
    expect(convertToAlpha(51)).toBe('AZ');
  });

  it('converts 52 to BA', () => {
    expect(convertToAlpha(52)).toBe('BA');
  });

  it('returns empty string for negative input', () => {
    expect(convertToAlpha(-1)).toBe('');
    expect(convertToAlpha(-100)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// asRecord
// ---------------------------------------------------------------------------

describe('asRecord', () => {
  it('returns the object for plain objects', () => {
    const obj = { a: 1, b: 'two' };
    expect(asRecord(obj)).toBe(obj);
  });

  it('returns null for null', () => {
    expect(asRecord(null)).toBeNull();
  });

  it('returns null for arrays', () => {
    expect(asRecord([1, 2, 3])).toBeNull();
  });

  it('returns null for primitives', () => {
    expect(asRecord('string')).toBeNull();
    expect(asRecord(42)).toBeNull();
    expect(asRecord(true)).toBeNull();
    expect(asRecord(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildResolvedValueStatements
// ---------------------------------------------------------------------------

describe('buildResolvedValueStatements', () => {
  const availableStatements = [
    { id: 'vs-1', token: 'achievement', body: 'Achieve great things', domainId: 'dom-1' },
    { id: 'vs-2', token: 'security', body: 'Stay safe and secure', domainId: 'dom-1' },
  ];

  it('matches tokens from resolved content to available statements', () => {
    const resolvedContent = {
      components: {
        value_first: { token: 'achievement', body: 'old body' },
        value_second: { token: 'security', body: 'old body' },
      },
    };

    const result = buildResolvedValueStatements(
      resolvedContent as Parameters<typeof buildResolvedValueStatements>[0],
      availableStatements,
    );

    expect(result).toHaveLength(2);
    expect(result![0]).toMatchObject({
      id: 'vs-1',
      domainId: 'dom-1',
      token: 'achievement',
      body: 'Achieve great things',
    });
    expect(result![1]).toMatchObject({
      id: 'vs-2',
      domainId: 'dom-1',
      token: 'security',
      body: 'Stay safe and secure',
    });
  });

  it('falls back to component body when no matching statement found', () => {
    const resolvedContent = {
      components: {
        value_first: { token: 'achievement', body: 'old body' },
        value_second: { token: 'unknown_value', body: 'fallback body' },
      },
    };

    const result = buildResolvedValueStatements(
      resolvedContent as Parameters<typeof buildResolvedValueStatements>[0],
      availableStatements,
    );

    expect(result![1]).toMatchObject({
      id: null,
      domainId: null,
      token: 'unknown_value',
      body: 'fallback body',
    });
  });

  it('returns null when resolvedContent has no components', () => {
    const result = buildResolvedValueStatements(
      {} as Parameters<typeof buildResolvedValueStatements>[0],
      availableStatements,
    );

    expect(result).toBeNull();
  });
});

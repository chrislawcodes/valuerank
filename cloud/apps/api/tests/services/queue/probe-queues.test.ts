/**
 * Unit tests for probe queue helpers.
 */

import { describe, expect, it } from 'vitest';
import {
  LEGACY_PROBE_QUEUE_NAME,
  PROBE_DEAD_LETTER_QUEUE_NAME,
  isActiveProbeQueueName,
  normalizeProbeQueueName,
} from '../../../src/services/queue/probe-queues.js';

describe('probe queue helpers', () => {
  it('treats legacy and provider queues as active probe work', () => {
    expect(isActiveProbeQueueName(LEGACY_PROBE_QUEUE_NAME)).toBe(true);
    expect(isActiveProbeQueueName('probe_openai')).toBe(true);
    expect(isActiveProbeQueueName('probe_mistral')).toBe(true);
  });

  it('excludes dead-letter and non-probe queues', () => {
    expect(isActiveProbeQueueName(PROBE_DEAD_LETTER_QUEUE_NAME)).toBe(false);
    expect(isActiveProbeQueueName('summarize_transcript')).toBe(false);
  });

  it('normalizes active probe queues back to the legacy probe type', () => {
    expect(normalizeProbeQueueName(LEGACY_PROBE_QUEUE_NAME)).toBe(LEGACY_PROBE_QUEUE_NAME);
    expect(normalizeProbeQueueName('probe_openai')).toBe(LEGACY_PROBE_QUEUE_NAME);
    expect(normalizeProbeQueueName(PROBE_DEAD_LETTER_QUEUE_NAME)).toBe(PROBE_DEAD_LETTER_QUEUE_NAME);
  });
});

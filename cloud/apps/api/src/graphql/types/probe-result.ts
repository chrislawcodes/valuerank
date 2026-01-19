/**
 * ProbeResult GraphQL Type
 *
 * Exposes probe job outcomes (success/failure) with error details.
 */

import type { ProbeResult } from '@prisma/client';
import { builder } from '../builder.js';

// ProbeResult reference for Pothos
export const ProbeResultRef = builder.objectRef<ProbeResult>('ProbeResult');

// Implement the type
builder.objectType(ProbeResultRef, {
  description: 'Result of a probe job execution',
  fields: (t) => ({
    id: t.exposeID('id'),
    runId: t.exposeString('runId'),
    scenarioId: t.exposeString('scenarioId'),
    modelId: t.exposeString('modelId'),
    sampleIndex: t.exposeInt('sampleIndex', {
      description: 'Index within sample set for multi-sample runs (0 to N-1). Always 0 for single-sample runs.',
    }),
    status: t.exposeString('status', {
      description: 'SUCCESS or FAILED',
    }),
    // Success fields
    transcriptId: t.exposeString('transcriptId', {
      nullable: true,
      description: 'ID of the created transcript (if successful)',
    }),
    durationMs: t.exposeInt('durationMs', {
      nullable: true,
      description: 'Probe execution duration in milliseconds',
    }),
    inputTokens: t.exposeInt('inputTokens', {
      nullable: true,
      description: 'Input tokens consumed (for cost tracking)',
    }),
    outputTokens: t.exposeInt('outputTokens', {
      nullable: true,
      description: 'Output tokens generated (for cost tracking)',
    }),
    // Failure fields
    errorCode: t.exposeString('errorCode', {
      nullable: true,
      description: 'Error code if failed (e.g., NOT_FOUND, RATE_LIMIT, MAX_RETRIES_EXCEEDED)',
    }),
    errorMessage: t.exposeString('errorMessage', {
      nullable: true,
      description: 'Detailed error message if failed',
    }),
    retryCount: t.exposeInt('retryCount', {
      description: 'Number of retries attempted before final result',
    }),
    // Timestamps
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    completedAt: t.expose('completedAt', { type: 'DateTime', nullable: true }),
  }),
});

// Summary of probe results by model
export const ProbeResultModelSummary = builder.objectRef<{
  modelId: string;
  success: number;
  failed: number;
  errorCodes: string[];
}>('ProbeResultModelSummary').implement({
  description: 'Summary of probe results for a single model',
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    success: t.exposeInt('success', {
      description: 'Number of successful probes',
    }),
    failed: t.exposeInt('failed', {
      description: 'Number of failed probes',
    }),
    errorCodes: t.exposeStringList('errorCodes', {
      description: 'Unique error codes encountered',
    }),
  }),
});

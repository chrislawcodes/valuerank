/**
 * Transcript Creation Service
 *
 * Creates transcript records from Python probe worker output.
 */

import { db, Prisma } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('services:transcript');

/**
 * Turn structure from Python probe worker.
 */
export type TranscriptTurn = {
  turnNumber: number;
  promptLabel: string;
  probePrompt: string;
  targetResponse: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
};

/**
 * Transcript data from Python probe worker.
 */
export type ProbeTranscript = {
  turns: TranscriptTurn[];
  totalInputTokens: number;
  totalOutputTokens: number;
  modelVersion?: string | null;
  startedAt: string;
  completedAt: string;
};

/**
 * Input for creating a transcript.
 */
export type CreateTranscriptInput = {
  runId: string;
  scenarioId: string;
  modelId: string;
  transcript: ProbeTranscript;
  definitionSnapshot?: Prisma.InputJsonValue;
};

/**
 * Create a transcript record from probe worker output.
 */
export async function createTranscript(input: CreateTranscriptInput) {
  const { runId, scenarioId, modelId, transcript, definitionSnapshot } = input;

  // Calculate duration from timestamps
  const startedAt = new Date(transcript.startedAt);
  const completedAt = new Date(transcript.completedAt);
  const durationMs = completedAt.getTime() - startedAt.getTime();

  // Build content structure for storage (JSONB)
  const content = {
    schemaVersion: 1,
    turns: transcript.turns,
  };

  // Calculate total token count
  const tokenCount = transcript.totalInputTokens + transcript.totalOutputTokens;

  log.info(
    { runId, scenarioId, modelId, turns: transcript.turns.length, tokenCount },
    'Creating transcript'
  );

  const record = await db.transcript.create({
    data: {
      runId,
      scenarioId,
      modelId,
      modelVersion: transcript.modelVersion,
      definitionSnapshot: definitionSnapshot ?? Prisma.JsonNull,
      content: content as Prisma.InputJsonValue,
      turnCount: transcript.turns.length,
      tokenCount,
      durationMs,
    },
  });

  log.info({ transcriptId: record.id, runId }, 'Transcript created');

  return record;
}

/**
 * Validate transcript data from Python worker.
 */
export function validateTranscript(data: unknown): data is ProbeTranscript {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Check required fields
  if (!Array.isArray(obj.turns)) return false;
  if (typeof obj.totalInputTokens !== 'number') return false;
  if (typeof obj.totalOutputTokens !== 'number') return false;
  if (typeof obj.startedAt !== 'string') return false;
  if (typeof obj.completedAt !== 'string') return false;

  // Validate each turn
  for (const turn of obj.turns) {
    if (!turn || typeof turn !== 'object') return false;
    const t = turn as Record<string, unknown>;
    if (typeof t.turnNumber !== 'number') return false;
    if (typeof t.promptLabel !== 'string') return false;
    if (typeof t.probePrompt !== 'string') return false;
    if (typeof t.targetResponse !== 'string') return false;
  }

  return true;
}

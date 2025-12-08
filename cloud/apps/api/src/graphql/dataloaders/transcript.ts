import DataLoader from 'dataloader';
import { db } from '@valuerank/db';
import type { Transcript } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('dataloader:transcript');

/**
 * Creates a DataLoader for batching Transcript lookups by ID.
 */
export function createTranscriptLoader(): DataLoader<string, Transcript | null> {
  return new DataLoader<string, Transcript | null>(
    async (ids: readonly string[]) => {
      log.debug({ ids: [...ids] }, 'Batching transcript load');

      const transcripts = await db.transcript.findMany({
        where: { id: { in: [...ids] } },
      });

      const transcriptMap = new Map(transcripts.map((t) => [t.id, t]));
      return ids.map((id) => transcriptMap.get(id) ?? null);
    },
    { cache: true }
  );
}

/**
 * Creates a DataLoader for batching Transcript lookups by Run ID.
 * Returns array of transcripts for each run.
 */
export function createTranscriptsByRunLoader(): DataLoader<string, Transcript[]> {
  return new DataLoader<string, Transcript[]>(
    async (runIds: readonly string[]) => {
      log.debug({ runIds: [...runIds] }, 'Batching transcripts by run load');

      const transcripts = await db.transcript.findMany({
        where: { runId: { in: [...runIds] } },
        orderBy: { createdAt: 'desc' },
      });

      // Group transcripts by runId
      const transcriptsByRun = new Map<string, Transcript[]>();
      for (const runId of runIds) {
        transcriptsByRun.set(runId, []);
      }
      for (const transcript of transcripts) {
        const existing = transcriptsByRun.get(transcript.runId);
        if (existing) {
          existing.push(transcript);
        }
      }

      return runIds.map((runId) => transcriptsByRun.get(runId) ?? []);
    },
    { cache: true }
  );
}

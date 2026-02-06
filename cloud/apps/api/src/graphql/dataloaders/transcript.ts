import DataLoader from 'dataloader';
import { db } from '@valuerank/db';
import type { Transcript } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('dataloader:transcript');

export type AggregateTranscriptsKey = {
  sourceRunIds: string[];
  modelId?: string | null;
};

function aggregateTranscriptsCacheKey(key: AggregateTranscriptsKey): string {
  const normalizedRunIds = Array.from(new Set(key.sourceRunIds)).sort();
  return `${key.modelId ?? ''}|${normalizedRunIds.join(',')}`;
}

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

/**
 * Creates a DataLoader for aggregate run transcript lookups.
 * Keys are source run ID sets plus an optional model filter.
 */
export function createTranscriptsByAggregateRunsLoader(): DataLoader<AggregateTranscriptsKey, Transcript[], string> {
  return new DataLoader<AggregateTranscriptsKey, Transcript[], string>(
    async (keys: readonly AggregateTranscriptsKey[]) => {
      const allRunIds = Array.from(new Set(keys.flatMap((key) => key.sourceRunIds)));
      log.debug({ keyCount: keys.length, runIdCount: allRunIds.length }, 'Batching transcripts by aggregate source runs');

      if (allRunIds.length === 0) {
        return keys.map(() => []);
      }

      const transcripts = await db.transcript.findMany({
        where: { runId: { in: allRunIds } },
        orderBy: { createdAt: 'desc' },
      });

      const transcriptsByRun = new Map<string, Transcript[]>();
      for (const runId of allRunIds) {
        transcriptsByRun.set(runId, []);
      }
      for (const transcript of transcripts) {
        const existing = transcriptsByRun.get(transcript.runId);
        if (existing) existing.push(transcript);
      }

      return keys.map((key) => {
        const runIds = Array.from(new Set(key.sourceRunIds));
        const merged = runIds.flatMap((runId) => transcriptsByRun.get(runId) ?? []);
        const filtered = key.modelId
          ? merged.filter((transcript) => transcript.modelId === key.modelId)
          : merged;
        return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      });
    },
    {
      cache: true,
      cacheKeyFn: aggregateTranscriptsCacheKey,
    }
  );
}

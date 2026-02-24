import DataLoader from 'dataloader';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { parseTemperature } from '../../utils/temperature.js';
import { formatTrialSignature } from '../../utils/trial-signature.js';

const log = createLogger('graphql:dataloader:definition-trial-summary');

export type TrialConfigSummary = {
  definitionVersion: number | null;
  temperature: number | null;
  signature: string | null;
  isConsistent: boolean;
  message: string | null;
};

export type DefinitionTrialSummary = {
  trialCount: number;
  trialConfig: TrialConfigSummary;
};

function parseDefinitionVersion(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function encodeNullableNumber(value: number | null): string {
  return value === null ? 'null' : String(value);
}

function decodeNullableNumber(value: string | undefined): number | null {
  if (value === undefined || value === 'null') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function emptySummary(): DefinitionTrialSummary {
  return {
    trialCount: 0,
    trialConfig: {
      definitionVersion: null,
      temperature: null,
      signature: null,
      isConsistent: true,
      message: null,
    },
  };
}

export function createDefinitionTrialSummaryLoader(): DataLoader<string, DefinitionTrialSummary> {
  return new DataLoader<string, DefinitionTrialSummary>(
    async (definitionIds: readonly string[]) => {
      const ids = [...definitionIds];
      log.debug({ definitionCount: ids.length }, 'Batching definition trial summary load');

      const runs = await db.run.findMany({
        where: {
          definitionId: { in: ids },
          deletedAt: null,
        },
        select: {
          id: true,
          definitionId: true,
          config: true,
        },
      });

      if (runs.length === 0) {
        return ids.map(() => emptySummary());
      }

      const runIds = runs.map((run) => run.id);
      const transcriptCounts = await db.transcript.groupBy({
        by: ['runId'],
        where: {
          runId: { in: runIds },
          deletedAt: null,
        },
        _count: { _all: true },
      });
      const transcriptCountByRunId = new Map<string, number>(
        transcriptCounts.map((row) => [row.runId, row._count._all]),
      );

      const aggregateByDefinitionId = new Map<
        string,
        {
          trialCount: number;
          versions: Set<string>;
          temperatures: Set<string>;
          signatures: Set<string>;
        }
      >();

      for (const run of runs) {
        const trialCountForRun = transcriptCountByRunId.get(run.id) ?? 0;
        if (trialCountForRun === 0) continue;

        const aggregate = aggregateByDefinitionId.get(run.definitionId) ?? {
          trialCount: 0,
          versions: new Set<string>(),
          temperatures: new Set<string>(),
          signatures: new Set<string>(),
        };

        aggregate.trialCount += trialCountForRun;

        const config = run.config as {
          definitionSnapshot?: {
            _meta?: { definitionVersion?: unknown };
            version?: unknown;
          };
          temperature?: unknown;
        } | null;
        const definitionVersion =
          parseDefinitionVersion(config?.definitionSnapshot?._meta?.definitionVersion) ??
          parseDefinitionVersion(config?.definitionSnapshot?.version);
        const temperature = parseTemperature(config?.temperature);

        aggregate.versions.add(encodeNullableNumber(definitionVersion));
        aggregate.temperatures.add(encodeNullableNumber(temperature));
        aggregate.signatures.add(formatTrialSignature(definitionVersion, temperature));
        aggregateByDefinitionId.set(run.definitionId, aggregate);
      }

      return ids.map((definitionId) => {
        const aggregate = aggregateByDefinitionId.get(definitionId);
        if (!aggregate) return emptySummary();

        const isConsistent = aggregate.signatures.size <= 1;
        if (!isConsistent) {
          const mismatchParts: string[] = [];
          if (aggregate.versions.size > 1) {
            mismatchParts.push(`versions: ${Array.from(aggregate.versions).join(', ')}`);
          }
          if (aggregate.temperatures.size > 1) {
            mismatchParts.push(`temperatures: ${Array.from(aggregate.temperatures).join(', ')}`);
          }
          if (aggregate.signatures.size > 1) {
            mismatchParts.push(`signatures: ${Array.from(aggregate.signatures).join(', ')}`);
          }
          return {
            trialCount: aggregate.trialCount,
            trialConfig: {
              definitionVersion: null,
              temperature: null,
              signature: null,
              isConsistent: false,
              message: `Inconsistent trial settings detected (${mismatchParts.join('; ')}).`,
            },
          };
        }

        const definitionVersion = decodeNullableNumber(Array.from(aggregate.versions)[0]);
        const temperature = decodeNullableNumber(Array.from(aggregate.temperatures)[0]);
        return {
          trialCount: aggregate.trialCount,
          trialConfig: {
            definitionVersion,
            temperature,
            signature: formatTrialSignature(definitionVersion, temperature),
            isConsistent: true,
            message: null,
          },
        };
      });
    },
    {
      cache: true,
    },
  );
}

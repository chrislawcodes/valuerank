/**
 * Domain Coverage Query
 *
 * Returns a value-pair coverage matrix for a domain: how many completed
 * trial batches (runs) exist for each Schwartz value pair vignette.
 * Scoped to the same 10-value set used in domain analysis.
 */

import { builder } from '../builder.js';
import { db, resolveDefinitionContent } from '@valuerank/db';
import { formatTrialSignature, isVnewSignature, parseVnewTemperature } from '@valuerank/shared/trial-signature';
import { parseDefinitionVersion } from '../../utils/definition-version.js';
import { parseTemperature } from '../../utils/temperature.js';

import {
  COVERAGE_VALUE_KEYS,
  type CoverageValueKey,
  extractValuePair,
  selectPrimaryDefinitionCount,
} from './domain-coverage-utils.js';

type DomainValueCoverageCell = {
  valueA: string;
  valueB: string;
  batchCount: number;
  definitionId: string | null;
  definitionName: string | null;
  aggregateRunId: string | null;
};

type CoverageModelOption = {
  modelId: string;
  label: string;
};

type DomainValueCoverageResult = {
  domainId: string;
  values: string[];
  cells: DomainValueCoverageCell[];
  availableModels: CoverageModelOption[];
};

const CoverageModelOptionRef = builder
  .objectRef<CoverageModelOption>('CoverageModelOption')
  .implement({
    fields: (t) => ({
      modelId: t.exposeString('modelId'),
      label: t.exposeString('label'),
    }),
  });

const DomainValueCoverageCellRef = builder
  .objectRef<DomainValueCoverageCell>('DomainValueCoverageCell')
  .implement({
    fields: (t) => ({
      valueA: t.exposeString('valueA'),
      valueB: t.exposeString('valueB'),
      batchCount: t.exposeInt('batchCount'),
      definitionId: t.exposeString('definitionId', { nullable: true }),
      definitionName: t.exposeString('definitionName', { nullable: true }),
      aggregateRunId: t.exposeString('aggregateRunId', { nullable: true }),
    }),
  });

const DomainValueCoverageResultRef = builder
  .objectRef<DomainValueCoverageResult>('DomainValueCoverageResult')
  .implement({
    fields: (t) => ({
      domainId: t.exposeString('domainId'),
      values: t.exposeStringList('values'),
      cells: t.field({
        type: [DomainValueCoverageCellRef],
        resolve: (parent) => parent.cells,
      }),
      availableModels: t.field({
        type: [CoverageModelOptionRef],
        resolve: (parent) => parent.availableModels,
      }),
    }),
  });

function formatRunSignature(config: unknown): string {
  const runConfig = config as {
    definitionSnapshot?: {
      _meta?: { definitionVersion?: unknown };
      version?: unknown;
    };
    temperature?: unknown;
  } | null;
  const definitionVersion =
    parseDefinitionVersion(runConfig?.definitionSnapshot?._meta?.definitionVersion) ??
    parseDefinitionVersion(runConfig?.definitionSnapshot?.version);
  const temperature = parseTemperature(runConfig?.temperature);
  return formatTrialSignature(definitionVersion, temperature);
}

function runMatchesSignature(runConfig: unknown, signature: string): boolean {
  if (isVnewSignature(signature)) {
    return parseTemperature((runConfig as { temperature?: unknown } | null)?.temperature) === parseVnewTemperature(signature);
  }
  return formatRunSignature(runConfig) === signature;
}

const VALUE_PAIR_RESOLVE_CHUNK_SIZE = 20;

builder.queryField('domainValueCoverage', (t) =>
  t.field({
    type: DomainValueCoverageResultRef,
    nullable: true,
    description: `
      Returns a Schwartz value-pair coverage matrix for a domain.

      Each cell shows how many completed trial batches (runs) exist for the vignette
      that tests that pair of values in conflict. Optionally filtered to count only
      runs that included the specified model IDs.

      The matrix is directional: cell (col=X, row=Y) shows runs where X was presented first.
      Diagonal cells are returned as batchCount=0 with no definitionId.
    `,
    args: {
      domainId: t.arg.id({
        required: true,
        description: 'Domain to compute coverage for',
      }),
      modelIds: t.arg.stringList({
        required: false,
        description: 'If provided, only count runs that included at least one of these model IDs',
      }),
      signature: t.arg.string({
        required: false,
        description: 'If provided, only count completed runs matching this trial signature',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const domainId = String(args.domainId);
      const filterModelIds = args.modelIds?.map(String) ?? [];
      const selectedSignature = typeof args.signature === 'string' && args.signature.trim() !== ''
        ? args.signature.trim()
        : null;

      ctx.log.debug({ domainId, filterModelIds, selectedSignature }, 'Computing domain value coverage');

      const domain = await db.domain.findUnique({ where: { id: domainId }, select: { id: true } });
      if (!domain) return null;

      // Fetch all non-deleted definitions (need IDs to resolve content)
      const definitions = await db.definition.findMany({
        where: { domainId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      });

      // Map definition ID -> value pair (only those with recognized canonical pair)
      type DefValuePair = { valueA: CoverageValueKey; valueB: CoverageValueKey; name: string };
      const pairByDefinitionId = new Map<string, DefValuePair>();
      // Map directional pair key -> definition IDs (to detect multi-vignette cells)
      const definitionsByPairKey = new Map<string, string[]>();

      // Resolve definition contents in chunks to handle inheritance
      for (let offset = 0; offset < definitions.length; offset += VALUE_PAIR_RESOLVE_CHUNK_SIZE) {
        const batch = definitions.slice(offset, offset + VALUE_PAIR_RESOLVE_CHUNK_SIZE);
        const settled = await Promise.allSettled(
          batch.map(async (def) => {
            const resolvedContent = (await resolveDefinitionContent(def.id) as { resolvedContent: unknown }).resolvedContent;
            const pair = extractValuePair(resolvedContent);
            if (pair == null) return;

            pairByDefinitionId.set(def.id, { ...pair, name: def.name ?? '' });
            const key = `${pair.valueA}::${pair.valueB}`;
            const existing = definitionsByPairKey.get(key) ?? [];
            existing.push(def.id);
            definitionsByPairKey.set(key, existing);
          })
        );
        settled.forEach((result, idx) => {
          if (result.status === 'rejected') {
            ctx.log.error(
              { err: result.reason, definitionId: batch[idx]?.id },
              'Failed to resolve definition content for coverage grid'
            );
          }
        });
      }

      // Count completed runs per definition, optionally filtered by signature and model
      const definitionIds = Array.from(pairByDefinitionId.keys());
      const batchCountByDefinitionId = new Map<string, number>();
      const latestMatchingRunIdByDefinitionId = new Map<string, string>();
      const signatureScopedRunsByDefinitionId = new Map<string, Array<{
        id: string;
        definitionId: string;
        config: unknown;
        transcripts: Array<{ modelId: string }>;
      }>>();

      if (definitionIds.length > 0) {
        const completedRuns = await db.run.findMany({
          where: {
            definitionId: { in: definitionIds },
            status: 'COMPLETED',
            deletedAt: null,
          },
          orderBy: [{ definitionId: 'asc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            definitionId: true,
            config: true,
            transcripts: {
              where: { deletedAt: null },
              select: { modelId: true },
            },
          },
        });

        const signatureScopedRuns = selectedSignature === null
          ? completedRuns
          : completedRuns.filter((run) => runMatchesSignature(run.config, selectedSignature));

        for (const run of signatureScopedRuns) {
          const existingRuns = signatureScopedRunsByDefinitionId.get(run.definitionId) ?? [];
          existingRuns.push(run);
          signatureScopedRunsByDefinitionId.set(run.definitionId, existingRuns);

          const isAggregateRun = (run.config as { isAggregate?: boolean } | null)?.isAggregate === true;
          const matchesModelFilter = filterModelIds.length === 0
            || run.transcripts.some((transcript) => filterModelIds.includes(transcript.modelId));
          if (!matchesModelFilter || isAggregateRun) continue;

          if (!latestMatchingRunIdByDefinitionId.has(run.definitionId)) {
            latestMatchingRunIdByDefinitionId.set(run.definitionId, run.id);
          }
          batchCountByDefinitionId.set(
            run.definitionId,
            (batchCountByDefinitionId.get(run.definitionId) ?? 0) + 1,
          );
        }
      }

      const availableModelIds = new Set<string>();
      for (const runs of signatureScopedRunsByDefinitionId.values()) {
        for (const run of runs) {
          for (const transcript of run.transcripts) {
            availableModelIds.add(transcript.modelId);
          }
        }
      }

      const modelDetailRows =
        availableModelIds.size > 0
          ? await db.llmModel.findMany({
            where: { modelId: { in: Array.from(availableModelIds) } },
            select: { modelId: true, displayName: true },
            orderBy: { displayName: 'asc' },
          })
          : [];

      const availableModels: CoverageModelOption[] = modelDetailRows.map((m) => ({
        modelId: m.modelId,
        label: m.displayName,
      }));

      // Build the full directional 10×10 matrix
      const values = [...COVERAGE_VALUE_KEYS] as string[];
      const cells: DomainValueCoverageCell[] = [];

      for (const valueA of COVERAGE_VALUE_KEYS) {
        for (const valueB of COVERAGE_VALUE_KEYS) {
          if (valueA === valueB) {
            // Diagonal — no vignette tests a value against itself
            cells.push({
              valueA,
              valueB,
              batchCount: 0,
              definitionId: null,
              definitionName: null,
              aggregateRunId: null,
            });
            continue;
          }

          const key = `${valueA}::${valueB}`;
          const defIdsForPair = definitionsByPairKey.get(key) ?? [];

          if (defIdsForPair.length === 0) {
            cells.push({
              valueA,
              valueB,
              batchCount: 0,
              definitionId: null,
              definitionName: null,
              aggregateRunId: null,
            });
          } else {
            // Primary definition: pick the one with most batches for the link target,
            // but do not sum other definitions into the displayed cell count.
            const { primaryDefinitionId, batchCount } = selectPrimaryDefinitionCount(
              defIdsForPair,
              batchCountByDefinitionId,
            );
            const primaryDefId = primaryDefinitionId ?? '';
            const primaryPair = pairByDefinitionId.get(primaryDefId);
            const aggregateRunId = primaryDefId === ''
              ? null
              : (latestMatchingRunIdByDefinitionId.get(primaryDefId) ?? null);
            cells.push({
              valueA,
              valueB,
              batchCount,
              definitionId: primaryDefId !== '' ? primaryDefId : null,
              definitionName: primaryPair?.name ?? null,
              aggregateRunId,
            });
          }
        }
      }

      ctx.log.debug({ domainId, cellCount: cells.length }, 'Domain value coverage computed');
      return { domainId, values, cells, availableModels };
    },
  })
);

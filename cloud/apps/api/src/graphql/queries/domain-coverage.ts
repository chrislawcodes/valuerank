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

import { DOMAIN_ANALYSIS_VALUE_KEYS } from './domain.js';

export const COVERAGE_VALUE_KEYS = DOMAIN_ANALYSIS_VALUE_KEYS;
export type CoverageValueKey = (typeof COVERAGE_VALUE_KEYS)[number];

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

function isCoverageValueKey(value: string): value is CoverageValueKey {
  return (COVERAGE_VALUE_KEYS as readonly string[]).includes(value);
}

/**
 * Extract the two canonical value dimension names from a definition's resolved content JSON.
 * Returns null if the definition does not have exactly two recognized value dimensions.
 */
function extractValuePair(
  content: unknown
): { valueA: CoverageValueKey; valueB: CoverageValueKey } | null {
  if (content === null || typeof content !== 'object' || Array.isArray(content)) return null;
  const dims = (content as { dimensions?: unknown }).dimensions;
  if (!Array.isArray(dims) || dims.length !== 2) return null;
  const nameA =
    typeof (dims[0] as { name?: unknown }).name === 'string'
      ? (dims[0] as { name: string }).name
      : null;
  const nameB =
    typeof (dims[1] as { name?: unknown }).name === 'string'
      ? (dims[1] as { name: string }).name
      : null;
  if (nameA == null || nameB == null) return null;
  if (!isCoverageValueKey(nameA) || !isCoverageValueKey(nameB)) return null;
  return { valueA: nameA, valueB: nameB };
}

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

      The matrix is symmetric (valueA × valueB = valueB × valueA).
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
      // Map canonical pair key -> definition IDs (to detect multi-vignette cells)
      const definitionsByPairKey = new Map<string, string[]>();

      // Resolve definition contents in chunks to handle inheritance
      for (let offset = 0; offset < definitions.length; offset += VALUE_PAIR_RESOLVE_CHUNK_SIZE) {
        const batch = definitions.slice(offset, offset + VALUE_PAIR_RESOLVE_CHUNK_SIZE);
        const settled = await Promise.allSettled(
          batch.map(async (def) => {
            const resolved = await resolveDefinitionContent(def.id);
            const pair = extractValuePair(resolved.resolvedContent);
            if (pair == null) return;

            pairByDefinitionId.set(def.id, { ...pair, name: def.name ?? '' });
            const key = [pair.valueA, pair.valueB].sort().join('::');
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

          const matchesModelFilter = filterModelIds.length === 0
            || run.transcripts.some((transcript) => filterModelIds.includes(transcript.modelId));
          if (!matchesModelFilter) continue;

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

      // Build the full symmetric 10×10 matrix
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

          const key = [valueA, valueB].sort().join('::');
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
            // Aggregate batch counts across all definitions for this pair
            let totalBatches = 0;
            for (const defId of defIdsForPair) {
              totalBatches += batchCountByDefinitionId.get(defId) ?? 0;
            }
            // Primary definition: pick the one with most batches (for linking)
            const primaryDefId = defIdsForPair.reduce((best, defId) => {
              const bestCount = batchCountByDefinitionId.get(best) ?? 0;
              const thisCount = batchCountByDefinitionId.get(defId) ?? 0;
              return thisCount > bestCount ? defId : best;
            }, defIdsForPair[0] ?? '');
            const primaryPair = pairByDefinitionId.get(primaryDefId);
            const aggregateRunId = primaryDefId === ''
              ? null
              : (latestMatchingRunIdByDefinitionId.get(primaryDefId) ?? null);
            cells.push({
              valueA,
              valueB,
              batchCount: totalBatches,
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

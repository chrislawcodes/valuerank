/**
 * Domain Service
 *
 * Shared business logic for domain operations used by both the GraphQL
 * resolvers and REST routes.
 */

import { db } from '@valuerank/db';
import { runMatchesSignature, selectDefaultVnewSignature } from '../graphql/queries/domain/planning-utils.js';
import { selectLatestDefinitionPerLineage, hydrateDefinitionAncestors } from './definition-lineage.js';

async function resolveSignatureRunIds(
  latestDefinitionIds: string[],
  selectedSignature: string | null,
): Promise<{ filteredSourceRunIds: string[]; resolvedSignature: string | null }> {
  if (latestDefinitionIds.length === 0) {
    return { filteredSourceRunIds: [], resolvedSignature: selectedSignature };
  }

  const completedRuns = await db.run.findMany({
    where: {
      definitionId: { in: latestDefinitionIds },
      status: 'COMPLETED',
      deletedAt: null,
    },
    orderBy: [{ definitionId: 'asc' }, { createdAt: 'desc' }],
    select: { id: true, definitionId: true, config: true },
  });

  const effectiveSignature = selectedSignature ?? selectDefaultVnewSignature(completedRuns);
  const runsByDefinitionId = new Map<string, Array<{ id: string; config: unknown }>>();
  for (const run of completedRuns) {
    const current = runsByDefinitionId.get(run.definitionId) ?? [];
    current.push(run);
    runsByDefinitionId.set(run.definitionId, current);
  }

  const filteredSourceRunIds: string[] = [];
  for (const definitionId of latestDefinitionIds) {
    const runs = runsByDefinitionId.get(definitionId) ?? [];
    const matchedRuns = effectiveSignature === null
      ? runs
      : runs.filter((run) => runMatchesSignature(run.config, effectiveSignature));
    for (const matchedRun of matchedRuns) {
      filteredSourceRunIds.push(matchedRun.id);
    }
  }

  return { filteredSourceRunIds, resolvedSignature: effectiveSignature };
}

export type DomainSignatureRunsResult = {
  domain: { id: string; name: string };
  filteredSourceRunIds: string[];
  resolvedSignature: string | null;
};

/**
 * Resolve the run IDs for a domain scoped to a specific (or default) signature.
 * Returns null if the domain does not exist.
 *
 * Covers: domain lookup, latest-lineage definition selection, and signature-based run filtering.
 * Used by the domain transcript CSV export endpoint.
 */
export async function resolveDomainSignatureRunIds(
  domainId: string,
  signature: string | null,
): Promise<DomainSignatureRunsResult | null> {
  const domain = await db.domain.findUnique({ where: { id: domainId } });
  if (!domain) return null;

  const definitions = await db.definition.findMany({
    where: { domainId, deletedAt: null },
    select: {
      id: true,
      parentId: true,
      version: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (definitions.length === 0) {
    return {
      domain: { id: domain.id, name: domain.name },
      filteredSourceRunIds: [],
      resolvedSignature: signature,
    };
  }

  const definitionsById = await hydrateDefinitionAncestors(definitions);
  const latestDefinitions = selectLatestDefinitionPerLineage(definitions, definitionsById);
  const latestDefinitionIds = latestDefinitions.map((d) => d.id);

  const { filteredSourceRunIds, resolvedSignature } = await resolveSignatureRunIds(
    latestDefinitionIds,
    signature,
  );

  return {
    domain: { id: domain.id, name: domain.name },
    filteredSourceRunIds,
    resolvedSignature,
  };
}

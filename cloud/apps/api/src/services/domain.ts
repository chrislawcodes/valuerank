/**
 * Domain Service
 *
 * Shared business logic for domain operations used by both the GraphQL
 * resolvers and REST routes.
 */

import { db } from '@valuerank/db';
import { runMatchesSignature, selectDefaultVnewSignature } from '../graphql/queries/domain/planning-utils.js';

type DefinitionRow = {
  id: string;
  parentId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

function getLineageRootId(definition: DefinitionRow, definitionsById: Map<string, DefinitionRow>): string {
  let current = definition;
  const visited = new Set<string>([current.id]);
  while (current.parentId !== null) {
    const parent = definitionsById.get(current.parentId);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);
    current = parent;
  }
  return current.id;
}

function isNewerDefinition(left: DefinitionRow, right: DefinitionRow): boolean {
  if (left.version !== right.version) return left.version > right.version;
  const leftUpdated = left.updatedAt.getTime();
  const rightUpdated = right.updatedAt.getTime();
  if (leftUpdated !== rightUpdated) return leftUpdated > rightUpdated;
  return left.createdAt.getTime() > right.createdAt.getTime();
}

function selectLatestDefinitionPerLineage(
  definitions: DefinitionRow[],
  definitionsById: Map<string, DefinitionRow>,
): DefinitionRow[] {
  const latestByLineage = new Map<string, DefinitionRow>();
  for (const definition of definitions) {
    const lineageRootId = getLineageRootId(definition, definitionsById);
    const existing = latestByLineage.get(lineageRootId);
    if (!existing || isNewerDefinition(definition, existing)) {
      latestByLineage.set(lineageRootId, definition);
    }
  }
  return Array.from(latestByLineage.values());
}

async function hydrateDefinitionAncestors(definitions: DefinitionRow[]): Promise<Map<string, DefinitionRow>> {
  const definitionsById = new Map(definitions.map((d) => [d.id, d]));

  let missingParentIds = new Set(
    definitions
      .map((d) => d.parentId)
      .filter((parentId): parentId is string => parentId !== null && !definitionsById.has(parentId)),
  );

  while (missingParentIds.size > 0) {
    const parentIdsBatch = Array.from(missingParentIds);
    missingParentIds = new Set<string>();

    const missingParents = await db.definition.findMany({
      where: { id: { in: parentIdsBatch } },
      select: {
        id: true,
        parentId: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    for (const parent of missingParents) {
      if (definitionsById.has(parent.id)) continue;
      definitionsById.set(parent.id, parent);
      if (parent.parentId !== null && !definitionsById.has(parent.parentId)) {
        missingParentIds.add(parent.parentId);
      }
    }
  }

  return definitionsById;
}

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

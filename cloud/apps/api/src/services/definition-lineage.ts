/**
 * Definition Lineage Resolution
 *
 * Shared logic for walking definition parent-child trees and selecting the
 * latest version per lineage. Used by domain analysis, planning, and launch.
 */

import { db } from '@valuerank/db';

export type LineageDefinitionRow = {
  id: string;
  parentId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

function getLineageRootId(
  definition: LineageDefinitionRow,
  definitionsById: Map<string, LineageDefinitionRow>,
): string {
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

function isNewerDefinition(left: LineageDefinitionRow, right: LineageDefinitionRow): boolean {
  if (left.version !== right.version) return left.version > right.version;
  const leftUpdated = left.updatedAt.getTime();
  const rightUpdated = right.updatedAt.getTime();
  if (leftUpdated !== rightUpdated) return leftUpdated > rightUpdated;
  return left.createdAt.getTime() > right.createdAt.getTime();
}

export function selectLatestDefinitionPerLineage<T extends LineageDefinitionRow>(
  definitions: T[],
  definitionsById: Map<string, LineageDefinitionRow> = new Map(definitions.map((definition) => [definition.id, definition])),
): T[] {
  const latestByLineage = new Map<string, T>();

  for (const definition of definitions) {
    const lineageRootId = getLineageRootId(definition, definitionsById);
    const existing = latestByLineage.get(lineageRootId);
    if (!existing || isNewerDefinition(definition, existing)) {
      latestByLineage.set(lineageRootId, definition);
    }
  }

  return Array.from(latestByLineage.values());
}

export async function hydrateDefinitionAncestors(
  definitions: LineageDefinitionRow[],
): Promise<Map<string, LineageDefinitionRow>> {
  const definitionsById = new Map<string, LineageDefinitionRow>(
    definitions.map((definition) => [definition.id, definition]),
  );

  let missingParentIds = new Set(
    definitions
      .map((definition) => definition.parentId)
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

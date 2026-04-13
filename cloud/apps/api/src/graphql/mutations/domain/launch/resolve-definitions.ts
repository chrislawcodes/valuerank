import { db } from '@valuerank/db';
import { NotFoundError } from '@valuerank/shared';
import { selectLatestDefinitionPerLineage, hydrateDefinitionAncestors } from '../../../../services/definition-lineage.js';
import type { DefinitionRow } from './types.js';

export async function resolveDefinitionsForLaunch(params: {
  domainId: string;
  requestedDefinitionIds: string[];
}): Promise<{
  domain: { id: string; name: string };
  allDefinitions: DefinitionRow[];
  targetedDefinitions: DefinitionRow[];
  latestDefinitionIds: string[];
}> {
  const { domainId, requestedDefinitionIds } = params;

  const domain = await db.domain.findUnique({ where: { id: domainId } });
  if (!domain) throw new NotFoundError('Domain', domainId);

  const definitions: DefinitionRow[] = await db.definition.findMany({
    where: { domainId, deletedAt: null },
    select: {
      id: true,
      name: true,
      parentId: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      content: true,
    },
  });

  if (definitions.length === 0) {
    return {
      domain: { id: domain.id, name: domain.name },
      allDefinitions: [],
      targetedDefinitions: [],
      latestDefinitionIds: [],
    };
  }

  const definitionsById = await hydrateDefinitionAncestors(definitions);
  const latestDefinitions = selectLatestDefinitionPerLineage(definitions, definitionsById);
  const latestDefinitionById = new Map(latestDefinitions.map((definition) => [definition.id, definition]));
  const targetedDefinitions = requestedDefinitionIds.length > 0
    ? requestedDefinitionIds
      .map((definitionId) => latestDefinitionById.get(definitionId))
      .filter((definition): definition is DefinitionRow => definition !== undefined)
    : latestDefinitions;
  const latestDefinitionIds = targetedDefinitions.map((definition) => definition.id);

  return {
    domain: { id: domain.id, name: domain.name },
    allDefinitions: definitions,
    targetedDefinitions,
    latestDefinitionIds,
  };
}

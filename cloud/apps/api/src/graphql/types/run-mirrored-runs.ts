/**
 * Resolver helper for `Run.mirroredRuns` — returns all non-deleted runs in
 * the same domain whose definition mirrors the given run's value tokens
 * and whose signature matches. Pooled for analysis-time order-effect
 * comparison; no tie-breaking, the caller pools.
 *
 * Extracted from `run.ts` to keep that file under the prod size limit.
 */

import { db, type Run } from '@valuerank/db';
import { formatRunSignature } from '../queries/domain-coverage-gql-types.js';
import { getComponentTokens } from '../../utils/auto-pair.js';

export async function resolveMirroredRuns(run: Run): Promise<Run[]> {
  const signature = formatRunSignature(run.config);
  const definition = await db.definition.findUnique({
    where: { id: run.definitionId },
    select: {
      id: true,
      domainId: true,
      content: true,
      deletedAt: true,
    },
  });
  if (!definition || definition.deletedAt !== null || definition.domainId == null) {
    return [];
  }

  const definitionTokens = getComponentTokens(definition.content);
  if (definitionTokens == null) {
    return [];
  }

  const candidateDefinitions = await db.definition.findMany({
    where: {
      domainId: definition.domainId,
      deletedAt: null,
      id: { not: definition.id },
    },
    select: {
      id: true,
      content: true,
    },
  });

  const mirroredDefinitionIds = candidateDefinitions
    .filter((candidate) => {
      const candidateTokens = getComponentTokens(candidate.content);
      if (candidateTokens == null) {
        return false;
      }
      return (
        definitionTokens.value_first.token === candidateTokens.value_second.token
        && definitionTokens.value_second.token === candidateTokens.value_first.token
      );
    })
    .map((candidate) => candidate.id);

  if (mirroredDefinitionIds.length === 0) {
    return [];
  }

  const mirroredRuns = await db.run.findMany({
    where: {
      definitionId: { in: mirroredDefinitionIds },
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  return mirroredRuns.filter(
    (candidate) =>
      candidate.id !== run.id && formatRunSignature(candidate.config) === signature,
  );
}

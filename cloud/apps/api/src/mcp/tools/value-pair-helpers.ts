/**
 * Shared helpers for cross-model value analysis MCP tools.
 *
 * Extracts definition → value-pair mappings by resolving content
 * and reading dimension names.
 */

import { db, loadDefinitionContent, resolveDefinitionContent } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('mcp:tools:value-pair-helpers');

export type DefinitionValuePair = {
  definitionId: string;
  name: string;
  valueA: string;
  valueB: string;
};

export type FetchValuePairsOptions = {
  folder?: string;
  tag?: string;
  definitionIds?: string[];
  limit: number;
  offset: number;
};

export type FetchValuePairsResult = {
  pairs: DefinitionValuePair[];
  skipped: number;
};

/**
 * Fetches definitions and extracts value pairs from their dimensions.
 *
 * For root definitions, parses content directly.
 * For forked definitions, walks the ancestor chain to resolve inherited content.
 * Skips definitions with fewer than 2 dimensions.
 */
export async function fetchDefinitionValuePairs(
  opts: FetchValuePairsOptions
): Promise<FetchValuePairsResult> {
  const where: {
    deletedAt: null;
    id?: { in: string[] };
    name?: { contains: string };
    definitionTags?: { some: { tag: { name: string }; deletedAt: null } };
  } = {
    deletedAt: null,
  };

  if (opts.definitionIds !== undefined && opts.definitionIds.length > 0) {
    where.id = { in: opts.definitionIds };
  } else {
    if (opts.folder !== undefined && opts.folder !== '') {
      where.name = { contains: opts.folder };
    }
    if (opts.tag !== undefined && opts.tag !== '') {
      where.definitionTags = {
        some: { tag: { name: opts.tag }, deletedAt: null },
      };
    }
  }

  const definitions = await db.definition.findMany({
    where,
    select: {
      id: true,
      name: true,
      content: true,
      parentId: true,
    },
    orderBy: { createdAt: 'desc' },
    take: opts.limit,
    skip: opts.offset,
  });

  const pairs: DefinitionValuePair[] = [];
  let skipped = 0;

  for (const def of definitions) {
    try {
      let dimensions: { name: string }[];

      if (def.parentId === null) {
        // Root definition — parse content directly
        const content = loadDefinitionContent(def.content);
        dimensions = content.dimensions;
      } else {
        // Forked definition — resolve inheritance chain
        const resolved = await resolveDefinitionContent(def.id);
        dimensions = resolved.resolvedContent.dimensions;
      }

      if (dimensions.length < 2) {
        skipped += 1;
        log.debug(
          { definitionId: def.id, dimensionCount: dimensions.length },
          'Skipping definition with fewer than 2 dimensions'
        );
        continue;
      }

      pairs.push({
        definitionId: def.id,
        name: def.name,
        valueA: dimensions[0]!.name,
        valueB: dimensions[1]!.name,
      });
    } catch (err) {
      skipped += 1;
      log.warn(
        { err, definitionId: def.id },
        'Failed to resolve definition content'
      );
    }
  }

  return { pairs, skipped };
}

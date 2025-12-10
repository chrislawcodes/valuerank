/**
 * Definition query helpers.
 * Handles CRUD operations and ancestry queries for definitions.
 */

import { createLogger, NotFoundError, ValidationError } from '@valuerank/shared';
import { db } from '../client.js';
import {
  loadDefinitionContent,
  parseStoredContent,
  mergeContent,
  getContentOverrides,
} from '../schema-migration.js';
import type {
  DefinitionContent,
  DefinitionContentStored,
  DefinitionOverrides,
} from '../types.js';
import type { Definition, Prisma } from '@prisma/client';

const log = createLogger('db:definitions');

// ============================================================================
// INPUT TYPES
// ============================================================================

export type CreateDefinitionInput = {
  name: string;
  content: DefinitionContent;
  parentId?: string;
};

export type UpdateDefinitionInput = {
  name?: string;
  content?: DefinitionContent;
};

export type DefinitionFilters = {
  name?: string;
  hasParent?: boolean;
  limit?: number;
  offset?: number;
};

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export type DefinitionWithContent = Definition & {
  parsedContent: DefinitionContent;
};

/**
 * Definition with fully resolved content (inheritance applied)
 * and information about what's locally overridden.
 */
export type DefinitionWithResolvedContent = Definition & {
  /** Fully resolved content after walking ancestor chain */
  resolvedContent: DefinitionContent;
  /** Raw stored content (may have undefined fields for v2) */
  localContent: DefinitionContentStored;
  /** Which fields are locally overridden vs inherited */
  overrides: DefinitionOverrides;
  /** Whether this definition has a parent (is a fork) */
  isForked: boolean;
};

export type DefinitionTreeNode = {
  id: string;
  name: string;
  parentId: string | null;
  children: DefinitionTreeNode[];
  createdAt: Date;
};

// ============================================================================
// CREATE OPERATIONS
// ============================================================================

/**
 * Create a new definition.
 */
export async function createDefinition(data: CreateDefinitionInput): Promise<Definition> {
  if (!data.name?.trim()) {
    throw new ValidationError('Definition name is required', { field: 'name' });
  }
  if (!data.content) {
    throw new ValidationError('Definition content is required', { field: 'content' });
  }

  log.info({ name: data.name, hasParent: !!data.parentId }, 'Creating definition');

  return db.definition.create({
    data: {
      name: data.name,
      content: data.content as unknown as Prisma.InputJsonValue,
      parentId: data.parentId,
    },
  });
}

/**
 * Fork an existing definition, creating a new version linked to the parent.
 */
export async function forkDefinition(
  parentId: string,
  data: { name?: string; content?: DefinitionContent }
): Promise<Definition> {
  log.info({ parentId }, 'Forking definition');

  return db.$transaction(async (tx) => {
    // Verify parent exists
    const parent = await tx.definition.findUnique({ where: { id: parentId } });
    if (!parent) {
      log.warn({ parentId }, 'Parent definition not found');
      throw new NotFoundError('Definition', parentId);
    }

    // Create forked definition
    const forked = await tx.definition.create({
      data: {
        name: data.name ?? `${parent.name} (fork)`,
        content: (data.content ?? parent.content) as unknown as Prisma.InputJsonValue,
        parentId,
      },
    });

    log.info({ parentId, forkedId: forked.id }, 'Definition forked');
    return forked;
  });
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Get a definition by ID.
 * Only returns non-deleted definitions.
 */
export async function getDefinitionById(id: string): Promise<Definition> {
  log.debug({ id }, 'Fetching definition');

  const definition = await db.definition.findUnique({ where: { id } });
  if (!definition || definition.deletedAt !== null) {
    log.warn({ id }, 'Definition not found');
    throw new NotFoundError('Definition', id);
  }

  return definition;
}

/**
 * Get a definition by ID with parsed content.
 */
export async function getDefinitionWithContent(id: string): Promise<DefinitionWithContent> {
  const definition = await getDefinitionById(id);
  const parsedContent = loadDefinitionContent(definition.content);

  return {
    ...definition,
    parsedContent,
  };
}

/**
 * Resolve definition content by walking the ancestor chain and merging.
 * Returns fully resolved content plus information about local overrides.
 *
 * Resolution algorithm:
 * 1. Fetch ancestors from root to current (ordered by creation date)
 * 2. Start with root's content as base
 * 3. For each descendant, merge its content (child overrides parent)
 * 4. Return final resolved content for the target definition
 */
export async function resolveDefinitionContent(
  id: string
): Promise<DefinitionWithResolvedContent> {
  log.debug({ id }, 'Resolving definition content with inheritance');

  // Fetch the definition
  const definition = await getDefinitionById(id);
  const localContent = parseStoredContent(definition.content);
  const overrides = getContentOverrides(localContent);
  const isForked = definition.parentId !== null;

  // If no parent, this is a root definition - no inheritance needed
  if (!isForked) {
    const resolvedContent = loadDefinitionContent(definition.content);
    return {
      ...definition,
      resolvedContent,
      localContent,
      overrides,
      isForked,
    };
  }

  // Fetch ancestors (ordered from oldest to newest, root first)
  const ancestors = await getAncestors(id);

  if (ancestors.length === 0) {
    // Parent was deleted or orphaned - treat as root
    log.warn({ id }, 'Definition has parentId but no ancestors found');
    const resolvedContent = loadDefinitionContent(definition.content);
    return {
      ...definition,
      resolvedContent,
      localContent,
      overrides,
      isForked,
    };
  }

  // Start with root ancestor's content
  const root = ancestors[0]!;
  let resolvedContent = loadDefinitionContent(root.content);

  // Merge each ancestor's content in order (oldest to newest)
  for (let i = 1; i < ancestors.length; i++) {
    const ancestor = ancestors[i]!;
    const ancestorContent = parseStoredContent(ancestor.content);
    resolvedContent = mergeContent(ancestorContent, resolvedContent);
  }

  // Finally, merge the current definition's content
  resolvedContent = mergeContent(localContent, resolvedContent);

  log.debug(
    { id, ancestorCount: ancestors.length, overrides },
    'Content resolved with inheritance'
  );

  return {
    ...definition,
    resolvedContent,
    localContent,
    overrides,
    isForked,
  };
}

/**
 * List definitions with optional filters.
 * Automatically excludes soft-deleted definitions.
 */
export async function listDefinitions(filters?: DefinitionFilters): Promise<Definition[]> {
  log.debug({ filters }, 'Listing definitions');

  const where: Prisma.DefinitionWhereInput = {
    deletedAt: null, // Exclude soft-deleted
  };

  if (filters?.name) {
    where.name = { contains: filters.name, mode: 'insensitive' };
  }
  if (filters?.hasParent === true) {
    where.parentId = { not: null };
  } else if (filters?.hasParent === false) {
    where.parentId = null;
  }

  return db.definition.findMany({
    where,
    take: filters?.limit,
    skip: filters?.offset,
    orderBy: { createdAt: 'desc' },
  });
}

// ============================================================================
// UPDATE OPERATIONS
// ============================================================================

/**
 * Update a definition.
 */
export async function updateDefinition(
  id: string,
  data: UpdateDefinitionInput
): Promise<Definition> {
  log.info({ id, hasContent: !!data.content }, 'Updating definition');

  // Verify exists first
  await getDefinitionById(id);

  const updateData: Prisma.DefinitionUpdateInput = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.content !== undefined) updateData.content = data.content as unknown as Prisma.InputJsonValue;

  return db.definition.update({
    where: { id },
    data: updateData,
  });
}

// ============================================================================
// ANCESTRY QUERIES (Recursive CTEs)
// ============================================================================

/**
 * Get all ancestors of a definition (parent chain up to root).
 * Uses a recursive CTE for efficient traversal.
 * Excludes soft-deleted definitions.
 */
// Soft delete is filtered at DB layer - deletedAt never escapes to callers
export async function getAncestors(id: string): Promise<Omit<Definition, 'deletedAt'>[]> {
  log.debug({ id }, 'Fetching ancestors');

  const ancestors = await db.$queryRaw<Omit<Definition, 'deletedAt'>[]>`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, name, content, created_at, updated_at, last_accessed_at
      FROM definitions WHERE id = ${id} AND deleted_at IS NULL
      UNION ALL
      SELECT d.id, d.parent_id, d.name, d.content, d.created_at, d.updated_at, d.last_accessed_at
      FROM definitions d
      INNER JOIN ancestors a ON d.id = a.parent_id
      WHERE d.deleted_at IS NULL
    )
    SELECT
      id,
      parent_id as "parentId",
      name,
      content,
      created_at as "createdAt",
      updated_at as "updatedAt",
      last_accessed_at as "lastAccessedAt"
    FROM ancestors
    WHERE id != ${id}
    ORDER BY created_at ASC
  `;

  return ancestors;
}

/**
 * Get all descendants of a definition (children, grandchildren, etc.).
 * Uses a recursive CTE for efficient traversal.
 * Soft delete is filtered at DB layer - deletedAt never escapes to callers.
 */
export async function getDescendants(id: string): Promise<Omit<Definition, 'deletedAt'>[]> {
  log.debug({ id }, 'Fetching descendants');

  const descendants = await db.$queryRaw<Omit<Definition, 'deletedAt'>[]>`
    WITH RECURSIVE descendants AS (
      SELECT id, parent_id, name, content, created_at, updated_at, last_accessed_at
      FROM definitions WHERE id = ${id} AND deleted_at IS NULL
      UNION ALL
      SELECT d.id, d.parent_id, d.name, d.content, d.created_at, d.updated_at, d.last_accessed_at
      FROM definitions d
      INNER JOIN descendants de ON d.parent_id = de.id
      WHERE d.deleted_at IS NULL
    )
    SELECT
      id,
      parent_id as "parentId",
      name,
      content,
      created_at as "createdAt",
      updated_at as "updatedAt",
      last_accessed_at as "lastAccessedAt"
    FROM descendants
    WHERE id != ${id}
    ORDER BY created_at ASC
  `;

  return descendants;
}

/**
 * Get the full definition tree starting from a root definition.
 * Returns a hierarchical structure.
 */
export async function getDefinitionTree(rootId: string): Promise<DefinitionTreeNode> {
  log.debug({ rootId }, 'Building definition tree');

  // Get root definition
  const root = await getDefinitionById(rootId);

  // Get all descendants
  const descendants = await getDescendants(rootId);

  // Build tree structure
  const nodeMap = new Map<string, DefinitionTreeNode>();

  // Add root
  const rootNode: DefinitionTreeNode = {
    id: root.id,
    name: root.name,
    parentId: root.parentId,
    children: [],
    createdAt: root.createdAt,
  };
  nodeMap.set(root.id, rootNode);

  // Add all descendants
  for (const def of descendants) {
    nodeMap.set(def.id, {
      id: def.id,
      name: def.name,
      parentId: def.parentId,
      children: [],
      createdAt: def.createdAt,
    });
  }

  // Link children to parents
  for (const def of descendants) {
    if (def.parentId && nodeMap.has(def.parentId)) {
      const parent = nodeMap.get(def.parentId)!;
      const child = nodeMap.get(def.id)!;
      parent.children.push(child);
    }
  }

  return rootNode;
}

/**
 * Get all definition IDs in a tree (root + all descendants).
 * Useful for querying runs across a definition tree.
 */
export async function getDefinitionTreeIds(rootId: string): Promise<string[]> {
  const treeIds = await db.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE tree AS (
      SELECT id, parent_id FROM definitions WHERE id = ${rootId}
      UNION ALL
      SELECT d.id, d.parent_id FROM definitions d
      INNER JOIN tree t ON d.parent_id = t.id
    )
    SELECT id FROM tree
  `;

  return treeIds.map((row) => row.id);
}

// ============================================================================
// DELETE OPERATIONS (Soft Delete)
// ============================================================================

/**
 * Result of a definition soft-delete operation.
 */
export type DefinitionDeleteResult = {
  definitionIds: string[];
  deletedCount: {
    definitions: number;
    scenarios: number;
    tags: number;
    runs: number;
    transcripts: number;
    analysisResults: number;
  };
};

/**
 * Soft delete a definition and cascade to related entities.
 * Sets deletedAt timestamp rather than actually removing data.
 *
 * Cascading soft delete includes:
 * - The definition itself
 * - All child definitions (descendants)
 * - All scenarios belonging to deleted definitions
 * - All definition-tag associations for deleted definitions
 * - All runs belonging to deleted definitions
 * - All transcripts belonging to deleted runs
 * - All analysis results belonging to deleted runs
 *
 * @param id - Definition ID to delete
 * @param userId - Optional user ID of who is deleting (for audit)
 * @returns IDs of all soft-deleted definitions and counts of deleted entities
 */
export async function softDeleteDefinition(
  id: string,
  userId?: string | null
): Promise<DefinitionDeleteResult> {
  log.info({ id, userId }, 'Soft deleting definition');

  return db.$transaction(async (tx) => {
    // Verify definition exists and is not already deleted
    const definition = await tx.definition.findUnique({ where: { id } });
    if (!definition) {
      log.warn({ id }, 'Definition not found');
      throw new NotFoundError('Definition', id);
    }
    if (definition.deletedAt !== null) {
      log.warn({ id }, 'Definition already deleted');
      throw new ValidationError('Definition is already deleted', { id });
    }

    // Check for running runs that reference this definition (FR-014)
    const runningRunCount = await tx.run.count({
      where: {
        definitionId: id,
        status: 'RUNNING',
        deletedAt: null,
      },
    });
    if (runningRunCount > 0) {
      log.warn({ id, runningRunCount }, 'Cannot delete definition with running runs');
      throw new ValidationError('Cannot delete definition with running runs', {
        id,
        runningRunCount,
      });
    }

    const now = new Date();

    // Get all descendant IDs using recursive CTE
    const descendantRows = await tx.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE descendants AS (
        SELECT id FROM definitions WHERE id = ${id} AND deleted_at IS NULL
        UNION ALL
        SELECT d.id FROM definitions d
        INNER JOIN descendants de ON d.parent_id = de.id
        WHERE d.deleted_at IS NULL
      )
      SELECT id FROM descendants
    `;
    const allDefinitionIds = descendantRows.map((row) => row.id);

    log.info(
      { rootId: id, totalDefinitions: allDefinitionIds.length },
      'Cascading soft delete to definitions and related entities'
    );

    // Soft delete all definitions (root + descendants)
    await tx.definition.updateMany({
      where: { id: { in: allDefinitionIds } },
      data: {
        deletedAt: now,
        deletedByUserId: userId ?? null,
      },
    });

    // Soft delete all scenarios belonging to these definitions
    const scenarioResult = await tx.scenario.updateMany({
      where: {
        definitionId: { in: allDefinitionIds },
        deletedAt: null,
      },
      data: { deletedAt: now },
    });
    log.debug({ count: scenarioResult.count }, 'Soft deleted scenarios');

    // Soft delete all definition-tag associations
    const tagResult = await tx.definitionTag.updateMany({
      where: {
        definitionId: { in: allDefinitionIds },
        deletedAt: null,
      },
      data: { deletedAt: now },
    });
    log.debug({ count: tagResult.count }, 'Soft deleted definition tags');

    // Get all run IDs for these definitions (for cascading to transcripts/analysis)
    const runRows = await tx.run.findMany({
      where: {
        definitionId: { in: allDefinitionIds },
        deletedAt: null,
      },
      select: { id: true },
    });
    const runIds = runRows.map((r) => r.id);

    // Soft delete all runs belonging to these definitions
    // Also set status to CANCELLED for any pending runs
    const runResult = await tx.run.updateMany({
      where: {
        definitionId: { in: allDefinitionIds },
        deletedAt: null,
      },
      data: {
        deletedAt: now,
        deletedByUserId: userId ?? null,
      },
    });
    log.debug({ count: runResult.count }, 'Soft deleted runs');

    // Cancel any pending/paused runs
    await tx.run.updateMany({
      where: {
        id: { in: runIds },
        status: { in: ['PENDING', 'PAUSED'] },
      },
      data: { status: 'CANCELLED', completedAt: now },
    });

    // Soft delete all transcripts belonging to deleted runs
    let transcriptCount = 0;
    let analysisCount = 0;
    if (runIds.length > 0) {
      const transcriptResult = await tx.transcript.updateMany({
        where: {
          runId: { in: runIds },
          deletedAt: null,
        },
        data: { deletedAt: now },
      });
      transcriptCount = transcriptResult.count;
      log.debug({ count: transcriptCount }, 'Soft deleted transcripts');

      // Soft delete all analysis results belonging to deleted runs
      const analysisResult = await tx.analysisResult.updateMany({
        where: {
          runId: { in: runIds },
          deletedAt: null,
        },
        data: { deletedAt: now },
      });
      analysisCount = analysisResult.count;
      log.debug({ count: analysisCount }, 'Soft deleted analysis results');
    }

    log.info(
      {
        rootId: id,
        definitions: allDefinitionIds.length,
        scenarios: scenarioResult.count,
        tags: tagResult.count,
        runs: runResult.count,
        transcripts: transcriptCount,
        analysisResults: analysisCount,
      },
      'Definition soft delete complete'
    );

    return {
      definitionIds: allDefinitionIds,
      deletedCount: {
        definitions: allDefinitionIds.length,
        scenarios: scenarioResult.count,
        tags: tagResult.count,
        runs: runResult.count,
        transcripts: transcriptCount,
        analysisResults: analysisCount,
      },
    };
  });
}

// ============================================================================
// ACCESS TRACKING
// ============================================================================

/**
 * Update the last_accessed_at timestamp for a definition.
 * Call this on read operations to track usage.
 */
export async function touchDefinition(id: string): Promise<void> {
  log.debug({ id }, 'Updating definition access timestamp');

  await db.definition.update({
    where: { id },
    data: { lastAccessedAt: new Date() },
  });
}

/**
 * Update the last_accessed_at timestamp for multiple definitions.
 */
export async function touchDefinitions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  log.debug({ count: ids.length }, 'Updating definition access timestamps');

  await db.definition.updateMany({
    where: { id: { in: ids } },
    data: { lastAccessedAt: new Date() },
  });
}

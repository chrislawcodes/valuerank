/**
 * Definition query helpers.
 * Handles CRUD operations and ancestry queries for definitions.
 */

import { createLogger, NotFoundError, ValidationError } from '@valuerank/shared';
import { db } from '../client.js';
import { loadDefinitionContent } from '../schema-migration.js';
import type { DefinitionContent, Dimension } from '../types.js';
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
 */
export async function getDefinitionById(id: string): Promise<Definition> {
  log.debug({ id }, 'Fetching definition');

  const definition = await db.definition.findUnique({ where: { id } });
  if (!definition) {
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
 * List definitions with optional filters.
 */
export async function listDefinitions(filters?: DefinitionFilters): Promise<Definition[]> {
  log.debug({ filters }, 'Listing definitions');

  const where: Prisma.DefinitionWhereInput = {};

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
 */
export async function getAncestors(id: string): Promise<Definition[]> {
  log.debug({ id }, 'Fetching ancestors');

  const ancestors = await db.$queryRaw<Definition[]>`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, name, content, created_at, updated_at
      FROM definitions WHERE id = ${id}
      UNION ALL
      SELECT d.id, d.parent_id, d.name, d.content, d.created_at, d.updated_at
      FROM definitions d
      INNER JOIN ancestors a ON d.id = a.parent_id
    )
    SELECT
      id,
      parent_id as "parentId",
      name,
      content,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM ancestors
    WHERE id != ${id}
    ORDER BY created_at ASC
  `;

  return ancestors;
}

/**
 * Get all descendants of a definition (children, grandchildren, etc.).
 * Uses a recursive CTE for efficient traversal.
 */
export async function getDescendants(id: string): Promise<Definition[]> {
  log.debug({ id }, 'Fetching descendants');

  const descendants = await db.$queryRaw<Definition[]>`
    WITH RECURSIVE descendants AS (
      SELECT id, parent_id, name, content, created_at, updated_at
      FROM definitions WHERE id = ${id}
      UNION ALL
      SELECT d.id, d.parent_id, d.name, d.content, d.created_at, d.updated_at
      FROM definitions d
      INNER JOIN descendants de ON d.parent_id = de.id
    )
    SELECT
      id,
      parent_id as "parentId",
      name,
      content,
      created_at as "createdAt",
      updated_at as "updatedAt"
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

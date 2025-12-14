/**
 * Audit Log Queries
 *
 * GraphQL queries for browsing audit logs.
 */

import { builder } from '../builder.js';
import type { Prisma } from '@valuerank/db';
import { db } from '@valuerank/db';
import { AuditLogRef } from '../types/refs.js';
import {
  AuditLogFilterInput,
  AuditLogConnectionRef,
  type AuditLogConnectionShape,
} from '../types/audit-log.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// Type for the filter input
type AuditLogFilter = {
  entityType?: string | null;
  entityId?: string | null;
  action?: string | null;
  userId?: string | null;
  from?: Date | null;
  to?: Date | null;
};

/**
 * Build Prisma where clause from filter input
 */
function buildWhereClause(filter?: AuditLogFilter | null): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (filter?.entityType) {
    where.entityType = filter.entityType;
  }
  if (filter?.entityId) {
    where.entityId = filter.entityId;
  }
  if (filter?.action) {
    where.action = filter.action;
  }
  if (filter?.userId) {
    where.userId = filter.userId;
  }

  // Date range filters
  if (filter?.from || filter?.to) {
    where.createdAt = {};
    if (filter.from) {
      where.createdAt.gte = filter.from;
    }
    if (filter.to) {
      where.createdAt.lte = filter.to;
    }
  }

  return where;
}

/**
 * auditLogs query - paginated list of audit logs with filters
 */
builder.queryField('auditLogs', (t) =>
  t.field({
    type: AuditLogConnectionRef,
    description: `
      Query audit logs with optional filters and pagination.

      Returns a paginated connection with audit log entries.
      Use the 'after' cursor for pagination through large result sets.
    `,
    args: {
      filter: t.arg({
        type: AuditLogFilterInput,
        required: false,
        description: 'Filters to apply to the query',
      }),
      first: t.arg.int({
        required: false,
        description: `Number of results to return (default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT})`,
      }),
      after: t.arg.string({
        required: false,
        description: 'Cursor for pagination (ID of last item from previous page)',
      }),
    },
    resolve: async (_root, args, ctx): Promise<AuditLogConnectionShape> => {
      const limit = Math.min(args.first ?? DEFAULT_LIMIT, MAX_LIMIT);
      const filter = args.filter as AuditLogFilter | null;

      ctx.log.debug(
        { filter, limit, after: args.after },
        'Querying audit logs'
      );

      const where = buildWhereClause(filter);

      // Get total count (without pagination)
      const totalCount = await db.auditLog.count({ where: buildWhereClause(filter) });

      // Get logs with pagination using Prisma's cursor-based pagination
      // This ensures consistent results by using ID as the cursor
      const logs = await db.auditLog.findMany({
        where,
        orderBy: { id: 'desc' }, // Order by ID for consistent cursor pagination
        take: limit + 1, // Take one extra to check if there's a next page
        ...(args.after && {
          cursor: { id: args.after },
          skip: 1, // Skip the cursor item itself
        }),
      });

      const hasNextPage = logs.length > limit;
      const nodes = hasNextPage ? logs.slice(0, limit) : logs;
      const lastNode = nodes[nodes.length - 1];
      const endCursor = lastNode ? lastNode.id : null;

      ctx.log.debug(
        { count: nodes.length, totalCount, hasNextPage },
        'Audit logs retrieved'
      );

      return {
        nodes,
        totalCount,
        hasNextPage,
        endCursor,
      };
    },
  })
);

/**
 * entityAuditHistory query - get audit history for a specific entity
 */
builder.queryField('entityAuditHistory', (t) =>
  t.field({
    type: [AuditLogRef],
    description: `
      Get the complete audit history for a specific entity.

      Returns all audit log entries for the given entity type and ID,
      ordered by creation time (newest first).
    `,
    args: {
      entityType: t.arg.string({
        required: true,
        description: 'Type of entity (e.g., "Definition", "Run")',
      }),
      entityId: t.arg.string({
        required: true,
        description: 'ID of the entity',
      }),
      limit: t.arg.int({
        required: false,
        description: `Maximum number of entries to return (default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT})`,
      }),
      offset: t.arg.int({
        required: false,
        description: 'Number of entries to skip (default: 0)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = args.offset ?? 0;

      ctx.log.debug(
        { entityType: args.entityType, entityId: args.entityId, limit, offset },
        'Querying entity audit history'
      );

      const logs = await db.auditLog.findMany({
        where: {
          entityType: args.entityType,
          entityId: args.entityId,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      ctx.log.debug(
        { entityType: args.entityType, entityId: args.entityId, count: logs.length },
        'Entity audit history retrieved'
      );

      return logs;
    },
  })
);

import type { Prisma } from '@valuerank/db';
import { db, type AuditLog } from '@valuerank/db';
import type { AuditLogFilters, AuditLogPagination } from './types.js';

/**
 * Query result with pagination info.
 */
export type AuditLogQueryResult = {
  logs: AuditLog[];
  hasNextPage: boolean;
  endCursor: string | null;
};

/**
 * Queries audit logs with optional filters and pagination.
 *
 * @param filters - Optional filters for the query
 * @param pagination - Optional pagination options
 * @returns Paginated audit log results
 */
export async function queryAuditLogs(
  filters?: AuditLogFilters,
  pagination?: AuditLogPagination
): Promise<AuditLogQueryResult> {
  const where: Prisma.AuditLogWhereInput = {};

  if (filters?.entityType) {
    where.entityType = filters.entityType;
  }

  if (filters?.entityId) {
    where.entityId = filters.entityId;
  }

  if (filters?.userId) {
    where.userId = filters.userId;
  }

  if (filters?.action) {
    where.action = filters.action;
  }

  if (filters?.from || filters?.to) {
    where.createdAt = {};
    if (filters.from) {
      where.createdAt.gte = filters.from;
    }
    if (filters.to) {
      where.createdAt.lte = filters.to;
    }
  }

  const take = pagination?.first ?? 50;
  const cursor = pagination?.after ? { id: pagination.after } : undefined;

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: take + 1, // Fetch one extra to check for next page
    skip: cursor ? 1 : 0, // Skip cursor if provided
    cursor,
  });

  const hasNextPage = logs.length > take;
  if (hasNextPage) {
    logs.pop(); // Remove the extra item
  }

  const lastLog = logs[logs.length - 1];
  const endCursor = lastLog ? lastLog.id : null;

  return {
    logs,
    hasNextPage,
    endCursor,
  };
}

/**
 * Gets the audit history for a specific entity.
 *
 * @param entityType - The type of entity
 * @param entityId - The entity ID
 * @param limit - Maximum number of entries to return
 * @returns Audit log entries for the entity
 */
export async function getEntityAuditHistory(
  entityType: string,
  entityId: string,
  limit = 100
): Promise<AuditLog[]> {
  return db.auditLog.findMany({
    where: {
      entityType,
      entityId,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

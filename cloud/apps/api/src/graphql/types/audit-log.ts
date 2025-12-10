/**
 * GraphQL types for audit logging
 */

import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import type { AuditLog } from '@valuerank/db';
import { UserRef } from './user.js';
import { AuditLogRef } from './refs.js';

// Re-export for convenience
export { AuditLogRef };

/**
 * Input type for filtering audit logs
 */
export const AuditLogFilterInput = builder.inputType('AuditLogFilterInput', {
  description: 'Filters for querying audit logs',
  fields: (t) => ({
    entityType: t.string({
      required: false,
      description: 'Filter by entity type (e.g., "Definition", "Run")',
    }),
    entityId: t.string({
      required: false,
      description: 'Filter by specific entity ID',
    }),
    action: t.string({
      required: false,
      description: 'Filter by action type (CREATE, UPDATE, DELETE, ACTION)',
    }),
    userId: t.string({
      required: false,
      description: 'Filter by user who performed the action',
    }),
    from: t.field({
      type: 'DateTime',
      required: false,
      description: 'Filter logs from this date/time (inclusive)',
    }),
    to: t.field({
      type: 'DateTime',
      required: false,
      description: 'Filter logs until this date/time (inclusive)',
    }),
  }),
});

/**
 * Connection type for paginated audit logs
 */
export type AuditLogConnectionShape = {
  nodes: AuditLog[];
  totalCount: number;
  hasNextPage: boolean;
  endCursor: string | null;
};

export const AuditLogConnectionRef = builder.objectRef<AuditLogConnectionShape>('AuditLogConnection');

builder.objectType(AuditLogConnectionRef, {
  description: 'Paginated list of audit log entries',
  fields: (t) => ({
    nodes: t.field({
      type: [AuditLogRef],
      description: 'List of audit log entries',
      resolve: (parent) => parent.nodes,
    }),
    totalCount: t.exposeInt('totalCount', {
      description: 'Total number of matching audit log entries',
    }),
    hasNextPage: t.exposeBoolean('hasNextPage', {
      description: 'Whether there are more results after the current page',
    }),
    endCursor: t.exposeString('endCursor', {
      nullable: true,
      description: 'Cursor for the last item in the current page (for pagination)',
    }),
  }),
});

// AuditAction enum type - registered with builder, referenced by string name
builder.enumType('AuditAction', {
  values: ['CREATE', 'UPDATE', 'DELETE', 'ACTION'] as const,
  description: 'Type of action that was audited',
});

builder.objectType(AuditLogRef, {
  description: 'An audit log entry recording a mutation',
  fields: (t) => ({
    id: t.exposeID('id', { description: 'Unique identifier' }),
    action: t.exposeString('action', {
      description: 'Type of action performed (CREATE, UPDATE, DELETE, ACTION)',
    }),
    entityType: t.exposeString('entityType', {
      description: 'Type of entity affected (e.g., Definition, Run)',
    }),
    entityId: t.exposeString('entityId', {
      description: 'ID of the affected entity',
    }),
    metadata: t.expose('metadata', {
      type: 'JSON',
      nullable: true,
      description: 'Additional context about the action',
    }),
    createdAt: t.expose('createdAt', {
      type: 'DateTime',
      description: 'When the action occurred',
    }),

    // User who performed the action
    user: t.field({
      type: UserRef,
      nullable: true,
      description: 'User who performed the action (null for system actions)',
      resolve: async (log) => {
        if (!log.userId) return null;
        return db.user.findUnique({
          where: { id: log.userId },
        });
      },
    }),
  }),
});

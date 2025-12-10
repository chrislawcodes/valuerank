/**
 * GraphQL types for audit logging
 */

import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { UserRef } from './user.js';
import { AuditLogRef } from './refs.js';

// Re-export for convenience
export { AuditLogRef };

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

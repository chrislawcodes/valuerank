import type { AuditAction, AuditableEntityType } from '@valuerank/db';
import { createAuditLog } from '../../services/audit/index.js';
import type { Context } from '../context.js';

/**
 * Configuration for auditing a mutation.
 */
export type AuditMutationConfig<TArgs, TResult> = {
  /** The audit action type */
  action: AuditAction;
  /** The entity type being audited */
  entityType: AuditableEntityType;
  /**
   * Custom function to extract entity ID from args/result.
   * If not provided, assumes result has an `id` property.
   */
  extractEntityId?: (args: TArgs, result: TResult) => string;
  /**
   * Optional function to generate metadata for the audit log.
   */
  metadata?: (args: TArgs, result: TResult) => Record<string, unknown>;
};

/**
 * Entity with an id property (default shape for most mutations).
 */
type EntityWithId = { id: string };

/**
 * Wraps a mutation resolver to automatically create an audit log entry.
 *
 * The wrapper:
 * 1. Executes the original resolver
 * 2. Creates an audit log entry (non-blocking, errors are logged)
 * 3. Returns the original result
 *
 * @param config - Audit configuration
 * @param resolver - The original mutation resolver
 * @returns A wrapped resolver that creates audit logs
 *
 * @example
 * ```typescript
 * const createDefinitionResolver = auditedMutation(
 *   {
 *     action: 'CREATE',
 *     entityType: 'Definition',
 *   },
 *   async (args, ctx) => {
 *     // Original mutation logic
 *     return db.definition.create({ ... });
 *   }
 * );
 * ```
 */
export function auditedMutation<TArgs, TResult>(
  config: AuditMutationConfig<TArgs, TResult>,
  resolver: (args: TArgs, ctx: Context) => Promise<TResult>
): (args: TArgs, ctx: Context) => Promise<TResult> {
  return async (args: TArgs, ctx: Context): Promise<TResult> => {
    // Execute the original mutation
    const result = await resolver(args, ctx);

    // Extract entity ID
    let entityId: string;
    if (config.extractEntityId !== undefined) {
      entityId = config.extractEntityId(args, result);
    } else {
      // Default: assume result has an id property
      const resultWithId = result as EntityWithId;
      if (resultWithId !== null && resultWithId !== undefined && typeof resultWithId.id === 'string') {
        entityId = resultWithId.id;
      } else {
        ctx.log.warn(
          {
            action: config.action,
            entityType: config.entityType,
          },
          'Could not extract entity ID for audit log'
        );
        return result;
      }
    }

    // Create audit log entry (non-blocking)
    createAuditLog({
      action: config.action,
      entityType: config.entityType,
      entityId,
      userId: ctx.user?.id ?? null,
      metadata: config.metadata?.(args, result),
    }).catch((err: unknown) => {
      ctx.log.error({ err }, 'Audit log creation failed');
    });

    return result;
  };
}

import type { Prisma} from '@valuerank/db';
import { db, type CreateAuditLogInput } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('audit');

/**
 * Creates an audit log entry in the database.
 * This function is designed to be non-blocking - errors are logged but not thrown.
 *
 * @param input - The audit log entry data
 * @returns The created audit log entry, or null if creation failed
 */
export async function createAuditLog(
  input: CreateAuditLogInput
): Promise<{ id: string } | null> {
  try {
    const auditLog = await db.auditLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        userId: input.userId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
      select: { id: true },
    });

    log.debug(
      {
        auditLogId: auditLog.id,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        userId: input.userId,
      },
      'Audit log created'
    );

    return auditLog;
  } catch (err) {
    log.error(
      {
        err,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        userId: input.userId,
      },
      'Failed to create audit log'
    );
    return null;
  }
}

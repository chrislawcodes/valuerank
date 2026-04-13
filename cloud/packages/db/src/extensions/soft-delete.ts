/**
 * Prisma Soft-Delete Client Extension
 *
 * Auto-injects `deletedAt: null` into where clauses for soft-deletable models.
 * Callers can bypass by explicitly setting `deletedAt` in their where clause.
 */

import { Prisma } from '@prisma/client';

/**
 * Models that use soft delete (have a `deletedAt` column).
 * Uses PascalCase Prisma model names as they appear in $allModels handlers.
 */
export const SOFT_DELETABLE_MODELS = new Set([
  'Definition',
  'DefinitionTag',
  'Scenario',
  'Transcript',
  'AnalysisResult',
  'AssumptionAnalysisSnapshot',
  'ProbeResult',
  'DomainEvaluation',
  'DomainEvaluationRun',
]);

/**
 * Inject `deletedAt: null` into a where clause unless the caller
 * has already specified `deletedAt` (bypass for admin/audit queries).
 */
export function injectDeletedAtNull(
  where: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (where == null) return { deletedAt: null };
  if ('deletedAt' in where) return where;
  return { ...where, deletedAt: null };
}

/**
 * Prisma client extension that auto-filters soft-deleted records.
 *
 * Intercepts findMany, findFirst, findFirstOrThrow, count, aggregate,
 * and groupBy for soft-deletable models. Skips findUnique/findUniqueOrThrow
 * because Prisma requires unique-field-only where clauses for those.
 */
export const softDeleteExtension = Prisma.defineExtension({
  query: {
    $allModels: {
      async findMany({ model, args, query }) {
        if (SOFT_DELETABLE_MODELS.has(model)) {
          args.where = injectDeletedAtNull(args.where as Record<string, unknown> | undefined);
        }
        return query(args);
      },
      async findFirst({ model, args, query }) {
        if (SOFT_DELETABLE_MODELS.has(model)) {
          args.where = injectDeletedAtNull(args.where as Record<string, unknown> | undefined);
        }
        return query(args);
      },
      async findFirstOrThrow({ model, args, query }) {
        if (SOFT_DELETABLE_MODELS.has(model)) {
          args.where = injectDeletedAtNull(args.where as Record<string, unknown> | undefined);
        }
        return query(args);
      },
      async count({ model, args, query }) {
        if (SOFT_DELETABLE_MODELS.has(model)) {
          args.where = injectDeletedAtNull(args.where as Record<string, unknown> | undefined);
        }
        return query(args);
      },
      async aggregate({ model, args, query }) {
        if (SOFT_DELETABLE_MODELS.has(model)) {
          args.where = injectDeletedAtNull(args.where as Record<string, unknown> | undefined);
        }
        return query(args);
      },
      async groupBy({ model, args, query }) {
        if (SOFT_DELETABLE_MODELS.has(model)) {
          args.where = injectDeletedAtNull(args.where as Record<string, unknown> | undefined);
        }
        return query(args);
      },
    },
  },
});

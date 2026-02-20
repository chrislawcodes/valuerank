import { builder } from '../builder.js';
import { db, Prisma } from '@valuerank/db';
import { DomainRef } from '../types/domain.js';
import { createAuditLog } from '../../services/audit/index.js';
import { normalizeDomainName } from '../../utils/domain-name.js';

const MAX_DOMAIN_NAME_LENGTH = 120;

type DomainDefinitionFilterArgs = {
  rootOnly?: boolean | null;
  search?: string | null;
  tagIds?: readonly (string | number)[] | null;
  hasRuns?: boolean | null;
  domainId?: string | number | null;
  withoutDomain?: boolean | null;
};

type ParsedSearch = {
  terms: string[];
  operator: 'AND' | 'OR';
};

type DomainDeleteResult = {
  success: boolean;
  affectedDefinitions: number;
};

type DomainAssignmentResult = {
  success: boolean;
  affectedDefinitions: number;
};

const DomainDeleteResultRef = builder.objectRef<DomainDeleteResult>('DomainDeleteResult');
const DomainAssignmentResultRef = builder.objectRef<DomainAssignmentResult>('DomainAssignmentResult');

builder.objectType(DomainDeleteResultRef, {
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    affectedDefinitions: t.exposeInt('affectedDefinitions'),
  }),
});

builder.objectType(DomainAssignmentResultRef, {
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    affectedDefinitions: t.exposeInt('affectedDefinitions'),
  }),
});

function parseDefinitionSearch(search?: string | null): ParsedSearch | null {
  if (search === undefined || search === null) return null;
  const trimmed = search.trim();
  if (trimmed.length === 0) return null;
  const hasExplicitOr = /\s+or\s+/i.test(trimmed);
  const rawTerms = hasExplicitOr ? trimmed.split(/\s+or\s+/i) : trimmed.split(/\s+/);
  const terms = [...new Set(rawTerms.map((term) => term.trim()).filter((term) => term.length > 0))];
  if (terms.length === 0) return null;
  return { terms, operator: hasExplicitOr ? 'OR' : 'AND' };
}

async function findDefinitionIdsByMetadataSearch(parsed: ParsedSearch): Promise<string[]> {
  const termClauses = parsed.terms.map((term) => {
    const pattern = `%${term}%`;
    return Prisma.sql`(
      d.id::text ILIKE ${pattern}
      OR d.name ILIKE ${pattern}
      OR COALESCE(d.content::text, '') ILIKE ${pattern}
      OR EXISTS (
        SELECT 1
        FROM definition_tags dt
        INNER JOIN tags t ON t.id = dt.tag_id
        WHERE dt.definition_id = d.id
          AND dt.deleted_at IS NULL
          AND t.name ILIKE ${pattern}
      )
    )`;
  });

  const matches = await db.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT d.id
    FROM definitions d
    WHERE d.deleted_at IS NULL
      AND (${Prisma.join(termClauses, parsed.operator === 'OR' ? ' OR ' : ' AND ')})
  `;

  return matches.map((row) => row.id);
}

async function findDefinitionIdsByTags(tagIds: readonly string[]): Promise<string[]> {
  const matchingDefinitions = await db.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE
    direct_tagged AS (
      SELECT DISTINCT dt.definition_id as id
      FROM definition_tags dt
      WHERE dt.tag_id = ANY(${tagIds}::text[])
      AND dt.deleted_at IS NULL
    ),
    inherited AS (
      SELECT d.id, d.parent_id
      FROM definitions d
      JOIN direct_tagged dt ON d.id = dt.id
      WHERE d.deleted_at IS NULL
      UNION ALL
      SELECT d.id, d.parent_id
      FROM definitions d
      JOIN inherited i ON d.parent_id = i.id
      WHERE d.deleted_at IS NULL
    )
    SELECT DISTINCT id FROM inherited
  `;
  return matchingDefinitions.map((d) => d.id);
}

function intersectIds(currentIds: string[] | null, nextIds: string[]): string[] {
  if (currentIds === null) return nextIds;
  const nextSet = new Set(nextIds);
  return currentIds.filter((id) => nextSet.has(id));
}

async function buildDefinitionWhere(args: DomainDefinitionFilterArgs): Promise<{
  where: Prisma.DefinitionWhereInput;
  empty: boolean;
}> {
  const where: Prisma.DefinitionWhereInput = { deletedAt: null };

  if (args.rootOnly === true) {
    where.parentId = null;
  }
  if (args.domainId !== undefined && args.domainId !== null && args.domainId !== '') {
    where.domainId = String(args.domainId);
  }
  if (args.withoutDomain === true) {
    if (where.domainId !== undefined) {
      throw new Error('Cannot combine domainId and withoutDomain filters');
    }
    where.domainId = null;
  }

  let constrainedIds: string[] | null = null;

  const parsedSearch = parseDefinitionSearch(args.search);
  if (parsedSearch !== null) {
    const searchMatchingIds = await findDefinitionIdsByMetadataSearch(parsedSearch);
    constrainedIds = intersectIds(constrainedIds, searchMatchingIds);
  }

  if (args.tagIds !== undefined && args.tagIds !== null && args.tagIds.length > 0) {
    const tagIdStrings = args.tagIds.map(String);
    const tagMatchingIds = await findDefinitionIdsByTags(tagIdStrings);
    constrainedIds = intersectIds(constrainedIds, tagMatchingIds);
  }

  if (constrainedIds !== null) {
    if (constrainedIds.length === 0) return { where, empty: true };
    where.id = { in: constrainedIds };
  }

  if (args.hasRuns === true) {
    where.runs = { some: {} };
  }

  return { where, empty: false };
}

builder.mutationField('createDomain', (t) =>
  t.field({
    type: DomainRef,
    args: {
      name: t.arg.string({
        required: true,
        validate: {
          minLength: [1, { message: 'Domain name is required' }],
          maxLength: [MAX_DOMAIN_NAME_LENGTH, { message: `Domain name must be ${MAX_DOMAIN_NAME_LENGTH} characters or less` }],
        },
      }),
    },
    resolve: async (_root, args, ctx) => {
      const { displayName, normalizedName } = normalizeDomainName(args.name);
      if (displayName.length === 0) throw new Error('Domain name is required');

      const existing = await db.domain.findUnique({ where: { normalizedName } });
      if (existing) {
        throw new Error(`Domain "${displayName}" already exists`);
      }

      const domain = await db.domain.create({
        data: {
          name: displayName,
          normalizedName,
        },
      });

      void createAuditLog({
        action: 'CREATE',
        entityType: 'Domain',
        entityId: domain.id,
        userId: ctx.user?.id ?? null,
        metadata: { name: domain.name },
      });

      return domain;
    },
  })
);

builder.mutationField('renameDomain', (t) =>
  t.field({
    type: DomainRef,
    args: {
      id: t.arg.id({ required: true }),
      name: t.arg.string({
        required: true,
        validate: {
          minLength: [1, { message: 'Domain name is required' }],
          maxLength: [MAX_DOMAIN_NAME_LENGTH, { message: `Domain name must be ${MAX_DOMAIN_NAME_LENGTH} characters or less` }],
        },
      }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      const existing = await db.domain.findUnique({ where: { id } });
      if (!existing) throw new Error(`Domain not found: ${id}`);

      const { displayName, normalizedName } = normalizeDomainName(args.name);
      if (displayName.length === 0) throw new Error('Domain name is required');

      const conflict = await db.domain.findUnique({ where: { normalizedName } });
      if (conflict && conflict.id !== id) {
        throw new Error(`Domain "${displayName}" already exists`);
      }

      const updated = await db.domain.update({
        where: { id },
        data: { name: displayName, normalizedName },
      });

      void createAuditLog({
        action: 'UPDATE',
        entityType: 'Domain',
        entityId: updated.id,
        userId: ctx.user?.id ?? null,
        metadata: { from: existing.name, to: updated.name },
      });

      return updated;
    },
  })
);

builder.mutationField('deleteDomain', (t) =>
  t.field({
    type: DomainDeleteResultRef,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      const existing = await db.domain.findUnique({ where: { id } });
      if (!existing) throw new Error(`Domain not found: ${id}`);

      const affectedDefinitions = await db.$transaction(async (tx) => {
        const unassignResult = await tx.definition.updateMany({
          where: { domainId: id, deletedAt: null },
          data: { domainId: null },
        });
        await tx.domain.delete({ where: { id } });
        return unassignResult.count;
      });

      void createAuditLog({
        action: 'DELETE',
        entityType: 'Domain',
        entityId: id,
        userId: ctx.user?.id ?? null,
        metadata: { name: existing.name, affectedDefinitions },
      });

      return { success: true, affectedDefinitions };
    },
  })
);

builder.mutationField('assignDomainToDefinitions', (t) =>
  t.field({
    type: DomainAssignmentResultRef,
    args: {
      definitionIds: t.arg.idList({ required: true }),
      domainId: t.arg.id({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const definitionIds = args.definitionIds.map(String);
      if (definitionIds.length === 0) return { success: true, affectedDefinitions: 0 };

      const domainId =
        args.domainId !== undefined && args.domainId !== null && args.domainId !== ''
          ? String(args.domainId)
          : null;
      let domainName: string | null = null;
      if (domainId !== null) {
        const domain = await db.domain.findUnique({ where: { id: domainId } });
        if (!domain) throw new Error(`Domain not found: ${domainId}`);
        domainName = domain.name;
      }

      const result = await db.definition.updateMany({
        where: { id: { in: definitionIds }, deletedAt: null },
        data: { domainId },
      });

      void createAuditLog({
        action: 'ACTION',
        entityType: 'DefinitionDomain',
        entityId: `${domainId ?? 'none'}:bulk-ids`,
        userId: ctx.user?.id ?? null,
        metadata: {
          domainId,
          domainName,
          definitionIds,
          affectedDefinitions: result.count,
        },
      });

      return { success: true, affectedDefinitions: result.count };
    },
  })
);

builder.mutationField('assignDomainToDefinitionsByFilter', (t) =>
  t.field({
    type: DomainAssignmentResultRef,
    args: {
      domainId: t.arg.id({ required: false }),
      rootOnly: t.arg.boolean({ required: false }),
      search: t.arg.string({ required: false }),
      tagIds: t.arg.idList({ required: false }),
      hasRuns: t.arg.boolean({ required: false }),
      sourceDomainId: t.arg.id({ required: false }),
      withoutDomain: t.arg.boolean({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const domainId =
        args.domainId !== undefined && args.domainId !== null && args.domainId !== ''
          ? String(args.domainId)
          : null;
      let targetDomainName: string | null = null;
      if (domainId !== null) {
        const domain = await db.domain.findUnique({ where: { id: domainId } });
        if (!domain) throw new Error(`Domain not found: ${domainId}`);
        targetDomainName = domain.name;
      }

      const { where, empty } = await buildDefinitionWhere({
        rootOnly: args.rootOnly,
        search: args.search,
        tagIds: args.tagIds,
        hasRuns: args.hasRuns,
        domainId: args.sourceDomainId,
        withoutDomain: args.withoutDomain,
      });
      if (empty) return { success: true, affectedDefinitions: 0 };

      const result = await db.definition.updateMany({
        where,
        data: { domainId },
      });

      void createAuditLog({
        action: 'ACTION',
        entityType: 'DefinitionDomain',
        entityId: `${domainId ?? 'none'}:bulk-filter`,
        userId: ctx.user?.id ?? null,
        metadata: {
          targetDomainId: domainId,
          targetDomainName,
          sourceDomainId:
            args.sourceDomainId !== undefined && args.sourceDomainId !== null && args.sourceDomainId !== ''
              ? String(args.sourceDomainId)
              : null,
          withoutDomain: args.withoutDomain === true,
          search: args.search ?? null,
          tagIds: args.tagIds?.map(String) ?? [],
          rootOnly: args.rootOnly === true,
          hasRuns: args.hasRuns === true,
          affectedDefinitions: result.count,
        },
      });

      return { success: true, affectedDefinitions: result.count };
    },
  })
);

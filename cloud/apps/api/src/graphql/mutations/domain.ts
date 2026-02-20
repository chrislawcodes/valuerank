import { builder } from '../builder.js';
import { db, Prisma } from '@valuerank/db';
import { DomainRef } from '../types/domain.js';
import { createAuditLog } from '../../services/audit/index.js';
import { normalizeDomainName } from '../../utils/domain-name.js';
import { buildDefinitionWhere } from '../utils/definition-filters.js';
import { randomUUID } from 'crypto';
import { startRun as startRunService } from '../../services/run/index.js';

const MAX_DOMAIN_NAME_LENGTH = 120;
const MAX_BULK_ASSIGN_IDS = 5000;

type DomainMutationResult = {
  success: boolean;
  affectedDefinitions: number;
};

type DomainTrialRunResult = {
  success: boolean;
  totalDefinitions: number;
  targetedDefinitions: number;
  startedRuns: number;
  failedDefinitions: number;
};

const DomainMutationResultRef = builder.objectRef<DomainMutationResult>('DomainMutationResult');
const DomainTrialRunResultRef = builder.objectRef<DomainTrialRunResult>('DomainTrialRunResult');

builder.objectType(DomainMutationResultRef, {
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    affectedDefinitions: t.exposeInt('affectedDefinitions'),
  }),
});

builder.objectType(DomainTrialRunResultRef, {
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    totalDefinitions: t.exposeInt('totalDefinitions'),
    targetedDefinitions: t.exposeInt('targetedDefinitions'),
    startedRuns: t.exposeInt('startedRuns'),
    failedDefinitions: t.exposeInt('failedDefinitions'),
  }),
});

function parseOptionalId(value: string | number | null | undefined, argName: string): string | null {
  if (value === undefined || value === null) return null;
  const id = String(value).trim();
  if (id === '') {
    throw new Error(`${argName} cannot be an empty string. Use null for unassignment.`);
  }
  return id;
}

type DefinitionRow = {
  id: string;
  parentId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

function getLineageRootId(definition: DefinitionRow, definitionsById: Map<string, DefinitionRow>): string {
  let current = definition;
  const visited = new Set<string>([current.id]);

  while (current.parentId !== null) {
    const parent = definitionsById.get(current.parentId);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);
    current = parent;
  }

  return current.id;
}

function isNewerDefinition(left: DefinitionRow, right: DefinitionRow): boolean {
  const leftUpdated = left.updatedAt.getTime();
  const rightUpdated = right.updatedAt.getTime();
  if (leftUpdated !== rightUpdated) return leftUpdated > rightUpdated;
  if (left.version !== right.version) return left.version > right.version;
  return left.createdAt.getTime() > right.createdAt.getTime();
}

function selectLatestDefinitionPerLineage(definitions: DefinitionRow[]): DefinitionRow[] {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  const latestByLineage = new Map<string, DefinitionRow>();

  for (const definition of definitions) {
    const lineageRootId = getLineageRootId(definition, definitionsById);
    const existing = latestByLineage.get(lineageRootId);
    if (!existing || isNewerDefinition(definition, existing)) {
      latestByLineage.set(lineageRootId, definition);
    }
  }

  return Array.from(latestByLineage.values());
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
      let domain;
      try {
        domain = await db.domain.create({
          data: {
            name: displayName,
            normalizedName,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new Error(`Domain "${displayName}" already exists`);
        }
        throw error;
      }

      await createAuditLog({
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

      let updated;
      try {
        updated = await db.domain.update({
          where: { id },
          data: { name: displayName, normalizedName },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new Error(`Domain "${displayName}" already exists`);
        }
        throw error;
      }

      await createAuditLog({
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
    type: DomainMutationResultRef,
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

      await createAuditLog({
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
    type: DomainMutationResultRef,
    args: {
      definitionIds: t.arg.idList({ required: true }),
      domainId: t.arg.id({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const definitionIds = args.definitionIds.map(String);
      if (definitionIds.length === 0) return { success: true, affectedDefinitions: 0 };
      if (definitionIds.length > MAX_BULK_ASSIGN_IDS) {
        throw new Error(`Cannot assign more than ${MAX_BULK_ASSIGN_IDS} definitions in one request`);
      }

      const domainId = parseOptionalId(args.domainId, 'domainId');
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

      await createAuditLog({
        action: 'ACTION',
        entityType: 'DefinitionDomain',
        entityId: randomUUID(),
        userId: ctx.user?.id ?? null,
        metadata: {
          operationType: 'bulk-ids',
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
    type: DomainMutationResultRef,
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
      const domainId = parseOptionalId(args.domainId, 'domainId');
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
        domainId: parseOptionalId(args.sourceDomainId, 'sourceDomainId'),
        withoutDomain: args.withoutDomain,
      });
      if (empty) return { success: true, affectedDefinitions: 0 };

      const result = await db.definition.updateMany({
        where,
        data: { domainId },
      });

      await createAuditLog({
        action: 'ACTION',
        entityType: 'DefinitionDomain',
        entityId: randomUUID(),
        userId: ctx.user?.id ?? null,
        metadata: {
          operationType: 'bulk-filter',
          targetDomainId: domainId,
          targetDomainName,
          sourceDomainId: parseOptionalId(args.sourceDomainId, 'sourceDomainId'),
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

builder.mutationField('runTrialsForDomain', (t) =>
  t.field({
    type: DomainTrialRunResultRef,
    args: {
      domainId: t.arg.id({ required: true }),
      temperature: t.arg.float({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const domainId = String(args.domainId);
      const domain = await db.domain.findUnique({ where: { id: domainId } });
      if (!domain) throw new Error(`Domain not found: ${domainId}`);

      const definitions = await db.definition.findMany({
        where: { domainId, deletedAt: null },
        select: {
          id: true,
          parentId: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (definitions.length === 0) {
        return {
          success: true,
          totalDefinitions: 0,
          targetedDefinitions: 0,
          startedRuns: 0,
          failedDefinitions: 0,
        };
      }

      const latestDefinitions = selectLatestDefinitionPerLineage(definitions);

      const activeModels = await db.llmModel.findMany({
        where: { status: 'ACTIVE' },
        select: { modelId: true, isDefault: true },
      });
      const defaultModels = activeModels.filter((model) => model.isDefault).map((model) => model.modelId);
      const fallbackModels = activeModels.map((model) => model.modelId);
      const models = defaultModels.length > 0 ? defaultModels : fallbackModels;
      if (models.length === 0) {
        throw new Error('No active models are configured. Add an active model before running domain trials.');
      }

      let startedRuns = 0;
      let failedDefinitions = 0;

      for (const definition of latestDefinitions) {
        try {
          await startRunService({
            definitionId: definition.id,
            models,
            samplePercentage: 10,
            samplesPerScenario: 1,
            temperature: args.temperature ?? undefined,
            priority: 'NORMAL',
            userId: ctx.user?.id ?? null,
            finalTrial: false,
          });
          startedRuns += 1;
        } catch {
          failedDefinitions += 1;
        }
      }

      await createAuditLog({
        action: 'ACTION',
        entityType: 'Domain',
        entityId: domainId,
        userId: ctx.user?.id ?? null,
        metadata: {
          operationType: 'run-trials-for-domain',
          domainName: domain.name,
          totalDefinitions: definitions.length,
          targetedDefinitions: latestDefinitions.length,
          startedRuns,
          failedDefinitions,
          models,
          temperature: args.temperature ?? null,
          defaultsOnly: defaultModels.length > 0,
        },
      });

      return {
        success: failedDefinitions === 0,
        totalDefinitions: definitions.length,
        targetedDefinitions: latestDefinitions.length,
        startedRuns,
        failedDefinitions,
      };
    },
  })
);

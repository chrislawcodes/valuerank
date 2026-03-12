import {
  createInheritingContent,
  createPartialContent,
  db,
  type Dimension,
  type Prisma,
} from '@valuerank/db';
import { builder } from '../../builder.js';
import { DefinitionRef } from '../../types/refs.js';
import { createAuditLog } from '../../../services/audit/index.js';
import { queueScenarioExpansion } from '../../../services/scenario/index.js';
import { CreateDefinitionInput, ForkDefinitionInput } from './inputs.js';
import { ensureSchemaVersion, zContentObject } from './shared.js';

builder.mutationField('createDefinition', (t) =>
  t.field({
    type: DefinitionRef,
    description:
      'Create a new definition. Automatically adds schema_version to content if not present.',
    args: {
      input: t.arg({ type: CreateDefinitionInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { name, content, parentId, preambleVersionId } = args.input;

      ctx.log.debug({ name, parentId, preambleVersionId }, 'Creating definition');

      const parseResult = zContentObject.safeParse(content);
      if (!parseResult.success) {
        throw new Error('Content must be a JSON object');
      }
      const rawContent = parseResult.data;
      const processedContent = ensureSchemaVersion(rawContent);

      if (parentId !== null && parentId !== undefined && parentId !== '') {
        const parent = await db.definition.findUnique({
          where: { id: parentId },
        });
        if (!parent) {
          throw new Error(`Parent definition not found: ${parentId}`);
        }
      }

      if (
        preambleVersionId !== null &&
        preambleVersionId !== undefined &&
        preambleVersionId !== ''
      ) {
        const preambleCheck = await db.preambleVersion.findUnique({
          where: { id: preambleVersionId },
        });
        if (!preambleCheck) {
          throw new Error(`Preamble version not found: ${preambleVersionId}`);
        }
      }

      const definition = await db.definition.create({
        data: {
          name,
          content: processedContent,
          parentId: parentId ?? null,
          preambleVersionId: preambleVersionId ?? null,
          createdByUserId: ctx.user?.id ?? null,
        },
      });

      ctx.log.info({ definitionId: definition.id, name }, 'Definition created');

      const queueResult = await queueScenarioExpansion(definition.id, 'create');
      ctx.log.info(
        { definitionId: definition.id, jobId: queueResult.jobId, queued: queueResult.queued },
        'Scenario expansion queued'
      );

      void createAuditLog({
        action: 'CREATE',
        entityType: 'Definition',
        entityId: definition.id,
        userId: ctx.user?.id ?? null,
        metadata: { name },
      });

      return definition;
    },
  })
);

builder.mutationField('forkDefinition', (t) =>
  t.field({
    type: DefinitionRef,
    description:
      'Fork an existing definition. By default inherits all content from parent (sparse v2 storage).',
    args: {
      input: t.arg({ type: ForkDefinitionInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { parentId, name, content, inheritAll = true } = args.input;

      ctx.log.debug(
        { parentId, name, inheritAll, hasContent: content !== null && content !== undefined },
        'Forking definition'
      );

      const parent = await db.definition.findUnique({
        where: { id: parentId },
      });

      if (!parent) {
        throw new Error(`Parent definition not found: ${parentId}`);
      }

      let finalContent: Prisma.InputJsonValue;

      if (content !== null && content !== undefined) {
        const parseResult = zContentObject.safeParse(content);
        if (!parseResult.success) {
          throw new Error('Content must be a JSON object');
        }
        const contentObj = parseResult.data;

        finalContent = createPartialContent({
          template: typeof contentObj.template === 'string' ? contentObj.template : undefined,
          dimensions: Array.isArray(contentObj.dimensions)
            ? (contentObj.dimensions as Dimension[])
            : undefined,
          matching_rules:
            typeof contentObj.matching_rules === 'string' ? contentObj.matching_rules : undefined,
        }) as Prisma.InputJsonValue;

        ctx.log.debug({ overrides: Object.keys(contentObj) }, 'Fork with partial overrides');
      } else if (inheritAll !== false) {
        finalContent = createInheritingContent() as Prisma.InputJsonValue;
        ctx.log.debug('Fork with full inheritance (minimal content)');
      } else {
        finalContent = parent.content as Prisma.InputJsonValue;
        ctx.log.debug('Fork with copied parent content (legacy mode)');
      }

      const definition = await db.definition.create({
        data: {
          name,
          content: finalContent,
          parentId,
          preambleVersionId: parent.preambleVersionId,
          createdByUserId: ctx.user?.id ?? null,
        },
      });

      ctx.log.info(
        { definitionId: definition.id, name, parentId, inheritAll: inheritAll !== false },
        'Definition forked'
      );

      const queueResult = await queueScenarioExpansion(definition.id, 'fork');
      ctx.log.info(
        { definitionId: definition.id, jobId: queueResult.jobId, queued: queueResult.queued },
        'Scenario expansion queued for fork'
      );

      void createAuditLog({
        action: 'CREATE',
        entityType: 'Definition',
        entityId: definition.id,
        userId: ctx.user?.id ?? null,
        metadata: { name, parentId, inheritAll: inheritAll !== false },
      });

      return definition;
    },
  })
);

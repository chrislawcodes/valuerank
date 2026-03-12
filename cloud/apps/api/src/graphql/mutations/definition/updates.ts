import { db, resolveDefinitionContent, type Prisma } from '@valuerank/db';
import { builder } from '../../builder.js';
import { DefinitionRef } from '../../types/refs.js';
import { createAuditLog } from '../../../services/audit/index.js';
import { queueScenarioExpansion } from '../../../services/scenario/index.js';
import { UpdateDefinitionContentInput, UpdateDefinitionInput } from './inputs.js';
import {
  CURRENT_SCHEMA_VERSION,
  ensureSchemaVersion,
  jsonValuesEqual,
  stripRootSchemaVersion,
  zContentObject,
} from './shared.js';

builder.mutationField('updateDefinition', (t) =>
  t.field({
    type: DefinitionRef,
    description:
      'Update an existing definition. Note: If definition has runs, consider forking instead to preserve history.',
    args: {
      id: t.arg.string({
        required: true,
        description: 'Definition ID to update',
      }),
      input: t.arg({ type: UpdateDefinitionInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { id, input } = args;
      const { name, content, preambleVersionId } = input;

      ctx.log.debug(
        {
          definitionId: id,
          hasName: name !== null && name !== undefined,
          hasContent: content !== null && content !== undefined,
          hasPreamble: preambleVersionId !== undefined,
        },
        'Updating definition'
      );

      const existing = await db.definition.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new Error(`Definition not found: ${id}`);
      }

      const updateData: Prisma.DefinitionUncheckedUpdateInput = {};
      let needsVersionIncrement = false;
      let hasContentChange = false;
      const hasNameChange = name !== null && name !== undefined && name !== existing.name;
      let hasPreambleChange = false;
      let hasSchemaOnlyContentDifference = false;

      if (name !== null && name !== undefined) {
        updateData.name = name;
      }

      if (content !== null && content !== undefined) {
        const parseResult = zContentObject.safeParse(content);
        if (!parseResult.success) {
          throw new Error('Content must be a JSON object');
        }
        const processedContent = ensureSchemaVersion(parseResult.data);
        const exactContentEqual = jsonValuesEqual(existing.content, processedContent);
        const equalIgnoringSchemaVersion = jsonValuesEqual(
          stripRootSchemaVersion(existing.content),
          stripRootSchemaVersion(processedContent)
        );
        const contentChanged = !exactContentEqual && !equalIgnoringSchemaVersion;
        hasSchemaOnlyContentDifference = !exactContentEqual && equalIgnoringSchemaVersion;

        if (contentChanged) {
          updateData.content = processedContent;
          needsVersionIncrement = true;
          hasContentChange = true;
        }
      }

      if (preambleVersionId !== undefined) {
        if (preambleVersionId !== null) {
          const check = await db.preambleVersion.findUnique({ where: { id: preambleVersionId } });
          if (!check) {
            throw new Error(`Preamble version not found: ${preambleVersionId}`);
          }
          updateData.preambleVersionId = preambleVersionId;
        } else {
          updateData.preambleVersionId = null;
        }

        if (existing.preambleVersionId !== preambleVersionId) {
          needsVersionIncrement = true;
          hasPreambleChange = true;
        }
      }

      if (Object.keys(updateData).length === 0) {
        ctx.log.debug({ definitionId: id }, 'No changes to apply');
        return existing;
      }

      if (needsVersionIncrement) {
        updateData.version = { increment: 1 };
        ctx.log.info(
          {
            definitionId: id,
            currentVersion: existing.version,
            nextVersion: existing.version + 1,
            hasNameChange,
            hasContentChange,
            hasPreambleChange,
            hasSchemaOnlyContentDifference,
          },
          'Definition version incremented'
        );
      } else {
        ctx.log.debug(
          {
            definitionId: id,
            version: existing.version,
            hasNameChange,
            hasContentChange,
            hasPreambleChange,
            hasSchemaOnlyContentDifference,
          },
          'Definition version unchanged'
        );
      }

      const definition = await db.definition.update({
        where: { id },
        data: updateData,
      });

      ctx.log.info({ definitionId: id, name: definition.name }, 'Definition updated');

      if (hasContentChange) {
        const queueResult = await queueScenarioExpansion(definition.id, 'update');
        ctx.log.info(
          { definitionId: definition.id, jobId: queueResult.jobId, queued: queueResult.queued },
          'Scenario re-expansion queued after update'
        );
      }

      void createAuditLog({
        action: 'UPDATE',
        entityType: 'Definition',
        entityId: definition.id,
        userId: ctx.user?.id ?? null,
        metadata: { updatedFields: Object.keys(updateData) },
      });

      return definition;
    },
  })
);

builder.mutationField('updateDefinitionContent', (t) =>
  t.field({
    type: DefinitionRef,
    description:
      'Update specific content fields of a definition. Supports clearing overrides to inherit from parent.',
    args: {
      id: t.arg.string({
        required: true,
        description: 'Definition ID to update',
      }),
      input: t.arg({ type: UpdateDefinitionContentInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { id, input } = args;
      const { template, dimensions, matchingRules, clearOverrides } = input;

      ctx.log.debug(
        { definitionId: id, clearOverrides, hasTemplate: template !== undefined },
        'Updating definition content'
      );

      const existing = await db.definition.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new Error(`Definition not found: ${id}`);
      }

      const existingContent = existing.content as Record<string, unknown>;
      const newContent: Record<string, unknown> = {
        schema_version: CURRENT_SCHEMA_VERSION,
      };
      const fieldsToClear = new Set(clearOverrides ?? []);

      if (fieldsToClear.has('template')) {
        // Inherit from parent by omitting the local field.
      } else if (template !== undefined && template !== null) {
        newContent.template = template;
      } else if ('template' in existingContent) {
        newContent.template = existingContent.template;
      }

      if (fieldsToClear.has('dimensions')) {
        // Inherit from parent by omitting the local field.
      } else if (dimensions !== undefined && dimensions !== null) {
        if (!Array.isArray(dimensions)) {
          throw new Error('Dimensions must be an array');
        }
        newContent.dimensions = dimensions;
      } else if ('dimensions' in existingContent) {
        newContent.dimensions = existingContent.dimensions;
      }

      if (fieldsToClear.has('matching_rules')) {
        // Inherit from parent by omitting the local field.
      } else if (matchingRules !== undefined && matchingRules !== null) {
        newContent.matching_rules = matchingRules;
      } else if ('matching_rules' in existingContent) {
        newContent.matching_rules = existingContent.matching_rules;
      }

      const definition = await db.definition.update({
        where: { id },
        data: {
          content: newContent as Prisma.InputJsonValue,
        },
      });

      ctx.log.info(
        { definitionId: id, clearedOverrides: Array.from(fieldsToClear) },
        'Definition content updated'
      );

      const queueResult = await queueScenarioExpansion(definition.id, 'update');
      ctx.log.info(
        { definitionId: definition.id, jobId: queueResult.jobId, queued: queueResult.queued },
        'Scenario re-expansion queued after content update'
      );

      void createAuditLog({
        action: 'UPDATE',
        entityType: 'Definition',
        entityId: definition.id,
        userId: ctx.user?.id ?? null,
        metadata: { clearedOverrides: Array.from(fieldsToClear), contentUpdate: true },
      });

      return definition;
    },
  })
);

builder.mutationField('unforkDefinition', (t) =>
  t.field({
    type: DefinitionRef,
    description: 'Detach a forked definition from its parent and snapshot inherited content locally.',
    args: {
      id: t.arg.string({
        required: true,
        description: 'Definition ID to detach from parent',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const { id } = args;

      ctx.log.debug({ definitionId: id }, 'Unforking definition');

      const existing = await db.definition.findUnique({
        where: { id, deletedAt: null },
      });

      if (!existing) {
        throw new Error(`Definition not found: ${id}`);
      }

      if (existing.parentId === null) {
        throw new Error('Definition is already standalone');
      }

      const oldParentId = existing.parentId;
      const resolved = await resolveDefinitionContent(id);

      const definition = await db.definition.update({
        where: { id },
        data: {
          parentId: null,
          content: ensureSchemaVersion(resolved.resolvedContent as Record<string, unknown>),
          version: { increment: 1 },
        },
      });

      const queueResult = await queueScenarioExpansion(definition.id, 'update');
      ctx.log.info(
        { definitionId: definition.id, jobId: queueResult.jobId, queued: queueResult.queued },
        'Scenario re-expansion queued after unfork'
      );

      void createAuditLog({
        action: 'UPDATE',
        entityType: 'Definition',
        entityId: definition.id,
        userId: ctx.user?.id ?? null,
        metadata: { unforked: true, oldParentId },
      });

      ctx.log.info({ definitionId: id, oldParentId }, 'Definition unforked');

      return definition;
    },
  })
);

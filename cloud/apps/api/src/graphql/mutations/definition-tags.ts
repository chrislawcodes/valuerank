import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { DefinitionRef } from '../types/refs.js';
import { createAuditLog } from '../../services/audit/index.js';

// Validation regex for tag names: alphanumeric, hyphen, underscore
const TAG_NAME_REGEX = /^[a-z0-9_-]+$/;
const MAX_TAG_NAME_LENGTH = 50;

// Mutation: addTagToDefinition
builder.mutationField('addTagToDefinition', (t) =>
  t.field({
    type: DefinitionRef,
    description: 'Add a tag to a definition. No-op if tag is already assigned.',
    args: {
      definitionId: t.arg.string({
        required: true,
        description: 'Definition to tag',
      }),
      tagId: t.arg.string({
        required: true,
        description: 'Tag to assign',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const { definitionId, tagId } = args;

      ctx.log.debug({ definitionId, tagId }, 'Adding tag to definition');

      // Verify definition exists and is not deleted
      const definition = await db.definition.findUnique({
        where: { id: definitionId },
      });

      if (!definition || definition.deletedAt !== null) {
        throw new Error(`Definition not found: ${definitionId}`);
      }

      // Verify tag exists
      const tag = await db.tag.findUnique({
        where: { id: tagId },
      });

      if (!tag) {
        throw new Error(`Tag not found: ${tagId}`);
      }

      // Check if already assigned
      const existing = await db.definitionTag.findUnique({
        where: {
          definitionId_tagId: { definitionId, tagId },
        },
      });

      if (!existing) {
        // Create the association
        await db.definitionTag.create({
          data: { definitionId, tagId },
        });

        ctx.log.info({ definitionId, tagId, tagName: tag.name }, 'Tag added to definition');

        // Audit log (non-blocking)
        void createAuditLog({
          action: 'CREATE',
          entityType: 'DefinitionTag',
          entityId: `${definitionId}:${tagId}`,
          userId: ctx.user?.id ?? null,
          metadata: { definitionId, tagId, tagName: tag.name },
        });
      }

      return definition;
    },
  })
);

// Mutation: removeTagFromDefinition
builder.mutationField('removeTagFromDefinition', (t) =>
  t.field({
    type: DefinitionRef,
    description: 'Remove a tag from a definition. No-op if tag was not assigned.',
    args: {
      definitionId: t.arg.string({
        required: true,
        description: 'Definition to untag',
      }),
      tagId: t.arg.string({
        required: true,
        description: 'Tag to remove',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const { definitionId, tagId } = args;

      ctx.log.debug({ definitionId, tagId }, 'Removing tag from definition');

      // Verify definition exists and is not deleted
      const definition = await db.definition.findUnique({
        where: { id: definitionId },
      });

      if (!definition || definition.deletedAt !== null) {
        throw new Error(`Definition not found: ${definitionId}`);
      }

      // Try to delete the association (will fail silently if doesn't exist)
      const deleted = await db.definitionTag.deleteMany({
        where: { definitionId, tagId },
      });

      ctx.log.info({ definitionId, tagId }, 'Tag removed from definition');

      // Audit log only if something was actually deleted (non-blocking)
      if (deleted.count > 0) {
        void createAuditLog({
          action: 'DELETE',
          entityType: 'DefinitionTag',
          entityId: `${definitionId}:${tagId}`,
          userId: ctx.user?.id ?? null,
          metadata: { definitionId, tagId },
        });
      }

      return definition;
    },
  })
);

// Mutation: createAndAssignTag
builder.mutationField('createAndAssignTag', (t) =>
  t.field({
    type: DefinitionRef,
    description: 'Create a tag and immediately assign it to a definition. Convenience mutation for inline tag creation.',
    args: {
      definitionId: t.arg.string({
        required: true,
        description: 'Definition to tag',
      }),
      tagName: t.arg.string({
        required: true,
        description: 'New tag name',
        validate: {
          minLength: [1, { message: 'Tag name is required' }],
          maxLength: [MAX_TAG_NAME_LENGTH, { message: `Tag name must be ${MAX_TAG_NAME_LENGTH} characters or less` }],
        },
      }),
    },
    resolve: async (_root, args, ctx) => {
      const { definitionId, tagName } = args;

      // Normalize name to lowercase
      const normalizedName = tagName.toLowerCase().trim();

      ctx.log.debug({ definitionId, tagName: normalizedName }, 'Creating and assigning tag');

      // Validate name format
      if (!TAG_NAME_REGEX.test(normalizedName)) {
        throw new Error('Tag name must contain only lowercase letters, numbers, hyphens, and underscores');
      }

      // Verify definition exists and is not deleted
      const definition = await db.definition.findUnique({
        where: { id: definitionId },
      });

      if (!definition || definition.deletedAt !== null) {
        throw new Error(`Definition not found: ${definitionId}`);
      }

      // Find or create the tag
      let tag = await db.tag.findUnique({
        where: { name: normalizedName },
      });

      let tagCreated = false;
      if (!tag) {
        tag = await db.tag.create({
          data: { name: normalizedName },
        });
        tagCreated = true;
        ctx.log.info({ tagId: tag.id, name: tag.name }, 'Tag created');

        // Audit log for tag creation (non-blocking)
        void createAuditLog({
          action: 'CREATE',
          entityType: 'Tag',
          entityId: tag.id,
          userId: ctx.user?.id ?? null,
          metadata: { name: tag.name },
        });
      }

      // Check if already assigned
      const existing = await db.definitionTag.findUnique({
        where: {
          definitionId_tagId: { definitionId, tagId: tag.id },
        },
      });

      if (!existing) {
        // Create the association
        await db.definitionTag.create({
          data: { definitionId, tagId: tag.id },
        });

        ctx.log.info({ definitionId, tagId: tag.id, tagName: tag.name }, 'Tag assigned to definition');

        // Audit log for tag assignment (non-blocking)
        void createAuditLog({
          action: 'CREATE',
          entityType: 'DefinitionTag',
          entityId: `${definitionId}:${tag.id}`,
          userId: ctx.user?.id ?? null,
          metadata: { definitionId, tagId: tag.id, tagName: tag.name, tagCreated },
        });
      }

      return definition;
    },
  })
);

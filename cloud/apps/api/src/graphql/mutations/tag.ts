import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { TagRef } from '../types/refs.js';
import { createAuditLog } from '../../services/audit/index.js';

// Validation regex for tag names: alphanumeric, hyphen, underscore
const TAG_NAME_REGEX = /^[a-z0-9_-]+$/;
const MAX_TAG_NAME_LENGTH = 50;

// Result type for tag deletion
type DeleteTagResultShape = {
  success: boolean;
  affectedDefinitions: number;
};

const DeleteTagResultRef = builder.objectRef<DeleteTagResultShape>('DeleteTagResult');

builder.objectType(DeleteTagResultRef, {
  description: 'Result type for tag deletion',
  fields: (t) => ({
    success: t.exposeBoolean('success', {
      description: 'Whether deletion was successful',
    }),
    affectedDefinitions: t.exposeInt('affectedDefinitions', {
      description: 'Number of definitions the tag was removed from',
    }),
  }),
});

// Mutation: createTag
builder.mutationField('createTag', (t) =>
  t.field({
    type: TagRef,
    description: 'Create a new tag. Name is normalized to lowercase and must be unique.',
    args: {
      name: t.arg.string({
        required: true,
        description: 'Tag name (1-50 characters, alphanumeric/hyphen/underscore)',
        validate: {
          minLength: [1, { message: 'Tag name is required' }],
          maxLength: [MAX_TAG_NAME_LENGTH, { message: `Tag name must be ${MAX_TAG_NAME_LENGTH} characters or less` }],
        },
      }),
    },
    resolve: async (_root, args, ctx) => {
      // Normalize name to lowercase
      const normalizedName = args.name.toLowerCase().trim();

      ctx.log.debug({ name: normalizedName }, 'Creating tag');

      // Validate name format
      if (!TAG_NAME_REGEX.test(normalizedName)) {
        throw new Error('Tag name must contain only lowercase letters, numbers, hyphens, and underscores');
      }

      // Check for existing tag with same name
      const existing = await db.tag.findUnique({
        where: { name: normalizedName },
      });

      if (existing) {
        throw new Error(`Tag "${normalizedName}" already exists`);
      }

      const tag = await db.tag.create({
        data: {
          name: normalizedName,
          createdByUserId: ctx.user?.id ?? null,
        },
      });

      ctx.log.info({ tagId: tag.id, name: tag.name }, 'Tag created');

      // Audit log (non-blocking)
      void createAuditLog({
        action: 'CREATE',
        entityType: 'Tag',
        entityId: tag.id,
        userId: ctx.user?.id ?? null,
        metadata: { name: tag.name },
      });

      return tag;
    },
  })
);

// Mutation: deleteTag
builder.mutationField('deleteTag', (t) =>
  t.field({
    type: DeleteTagResultRef,
    description: 'Delete a tag. Removes the tag from all definitions that use it.',
    args: {
      id: t.arg.string({
        required: true,
        description: 'Tag ID to delete',
      }),
    },
    resolve: async (_root, args, ctx) => {
      ctx.log.debug({ tagId: args.id }, 'Deleting tag');

      // Check if tag exists
      const tag = await db.tag.findUnique({
        where: { id: args.id },
        include: { _count: { select: { definitions: true } } },
      });

      if (!tag) {
        throw new Error(`Tag not found: ${args.id}`);
      }

      const affectedDefinitions = tag._count.definitions;

      // Delete tag (cascade will remove DefinitionTag entries)
      await db.tag.delete({
        where: { id: args.id },
      });

      ctx.log.info(
        { tagId: args.id, name: tag.name, affectedDefinitions },
        'Tag deleted'
      );

      // Audit log (non-blocking)
      void createAuditLog({
        action: 'DELETE',
        entityType: 'Tag',
        entityId: args.id,
        userId: ctx.user?.id ?? null,
        metadata: { name: tag.name, affectedDefinitions },
      });

      return { success: true, affectedDefinitions };
    },
  })
);

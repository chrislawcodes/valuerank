import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { DefinitionRef } from '../types/refs.js';

const CURRENT_SCHEMA_VERSION = 1;

/**
 * Ensures content has schema_version field.
 * If not present, adds the current version.
 */
function ensureSchemaVersion(content: unknown): Record<string, unknown> {
  if (typeof content !== 'object' || content === null) {
    throw new Error('Content must be an object');
  }

  const contentObj = content as Record<string, unknown>;

  // If schema_version exists, keep it; otherwise add current version
  if (!('schema_version' in contentObj)) {
    return { schema_version: CURRENT_SCHEMA_VERSION, ...contentObj };
  }

  return contentObj;
}

// Input type for creating a definition
const CreateDefinitionInput = builder.inputType('CreateDefinitionInput', {
  fields: (t) => ({
    name: t.string({
      required: true,
      description: 'Name of the definition',
      validate: {
        minLength: [1, { message: 'Name is required' }],
        maxLength: [255, { message: 'Name must be 255 characters or less' }],
      },
    }),
    content: t.field({
      type: 'JSON',
      required: true,
      description: 'JSONB content for the definition',
    }),
    parentId: t.string({
      required: false,
      description: 'Optional parent definition ID for forking',
    }),
  }),
});

// Mutation: createDefinition
builder.mutationField('createDefinition', (t) =>
  t.field({
    type: DefinitionRef,
    description: 'Create a new definition. Automatically adds schema_version to content if not present.',
    args: {
      input: t.arg({ type: CreateDefinitionInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { name, content, parentId } = args.input;

      ctx.log.debug({ name, parentId }, 'Creating definition');

      // Validate content is an object
      if (typeof content !== 'object' || content === null || Array.isArray(content)) {
        throw new Error('Content must be a JSON object');
      }

      // Ensure schema_version is present
      const processedContent = ensureSchemaVersion(content);

      // If parentId provided, verify it exists
      if (parentId) {
        const parent = await db.definition.findUnique({
          where: { id: parentId },
        });
        if (!parent) {
          throw new Error(`Parent definition not found: ${parentId}`);
        }
      }

      const definition = await db.definition.create({
        data: {
          name,
          content: processedContent,
          parentId: parentId ?? null,
        },
      });

      ctx.log.info({ definitionId: definition.id, name }, 'Definition created');
      return definition;
    },
  })
);

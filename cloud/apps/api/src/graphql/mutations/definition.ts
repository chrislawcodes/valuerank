import { builder } from '../builder.js';
import {
  db,
  softDeleteDefinition,
  createInheritingContent,
  createPartialContent,
} from '@valuerank/db';
import type { Prisma, Dimension } from '@valuerank/db';
import { DefinitionRef } from '../types/refs.js';
import { queueScenarioExpansion } from '../../services/scenario/index.js';

const CURRENT_SCHEMA_VERSION = 2;

/**
 * Ensures content has schema_version field.
 * If not present, adds the current version.
 */
function ensureSchemaVersion(
  content: Record<string, unknown>
): Prisma.InputJsonValue {
  // If schema_version exists, keep it; otherwise add current version
  if (!('schema_version' in content)) {
    return { schema_version: CURRENT_SCHEMA_VERSION, ...content };
  }

  return content as Prisma.InputJsonValue;
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
      const processedContent = ensureSchemaVersion(content as Record<string, unknown>);

      // If parentId provided, verify it exists
      if (parentId !== null && parentId !== undefined && parentId !== '') {
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

      // Queue async scenario expansion
      const queueResult = await queueScenarioExpansion(definition.id, 'create');
      ctx.log.info(
        { definitionId: definition.id, jobId: queueResult.jobId, queued: queueResult.queued },
        'Scenario expansion queued'
      );

      return definition;
    },
  })
);

// Input type for forking a definition
const ForkDefinitionInput = builder.inputType('ForkDefinitionInput', {
  fields: (t) => ({
    parentId: t.string({
      required: true,
      description: 'ID of the definition to fork from',
    }),
    name: t.string({
      required: true,
      description: 'Name for the forked definition',
      validate: {
        minLength: [1, { message: 'Name is required' }],
        maxLength: [255, { message: 'Name must be 255 characters or less' }],
      },
    }),
    content: t.field({
      type: 'JSON',
      required: false,
      description: 'Optional content override. If not provided, inherits everything from parent (stores minimal v2 content).',
    }),
    inheritAll: t.boolean({
      required: false,
      description: 'If true, fork with minimal content (inherit everything). Default: true. Set to false to copy parent content.',
    }),
  }),
});

// Mutation: forkDefinition
builder.mutationField('forkDefinition', (t) =>
  t.field({
    type: DefinitionRef,
    description: 'Fork an existing definition. By default inherits all content from parent (sparse v2 storage).',
    args: {
      input: t.arg({ type: ForkDefinitionInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { parentId, name, content, inheritAll = true } = args.input;

      ctx.log.debug({ parentId, name, inheritAll, hasContent: !!content }, 'Forking definition');

      // Fetch parent - required for fork
      const parent = await db.definition.findUnique({
        where: { id: parentId },
      });

      if (!parent) {
        throw new Error(`Parent definition not found: ${parentId}`);
      }

      // Determine content based on options
      let finalContent: Prisma.InputJsonValue;

      if (content !== null && content !== undefined) {
        // Explicit content provided - use as partial overrides
        if (typeof content !== 'object' || Array.isArray(content)) {
          throw new Error('Content must be a JSON object');
        }
        const contentObj = content as Record<string, unknown>;

        // Create v2 content with only provided fields as overrides
        finalContent = createPartialContent({
          preamble: typeof contentObj.preamble === 'string' ? contentObj.preamble : undefined,
          template: typeof contentObj.template === 'string' ? contentObj.template : undefined,
          dimensions: Array.isArray(contentObj.dimensions) ? contentObj.dimensions as Dimension[] : undefined,
          matching_rules: typeof contentObj.matching_rules === 'string' ? contentObj.matching_rules : undefined,
        }) as Prisma.InputJsonValue;

        ctx.log.debug({ overrides: Object.keys(contentObj) }, 'Fork with partial overrides');
      } else if (inheritAll !== false) {
        // Inherit everything - store minimal v2 content
        finalContent = createInheritingContent() as Prisma.InputJsonValue;
        ctx.log.debug('Fork with full inheritance (minimal content)');
      } else {
        // inheritAll=false and no content - copy parent content (legacy behavior)
        finalContent = parent.content as Prisma.InputJsonValue;
        ctx.log.debug('Fork with copied parent content (legacy mode)');
      }

      const definition = await db.definition.create({
        data: {
          name,
          content: finalContent,
          parentId,
        },
      });

      ctx.log.info(
        { definitionId: definition.id, name, parentId, inheritAll: inheritAll !== false },
        'Definition forked'
      );

      // Queue async scenario expansion
      const queueResult = await queueScenarioExpansion(definition.id, 'fork');
      ctx.log.info(
        { definitionId: definition.id, jobId: queueResult.jobId, queued: queueResult.queued },
        'Scenario expansion queued for fork'
      );

      return definition;
    },
  })
);

// Input type for updating a definition
const UpdateDefinitionInput = builder.inputType('UpdateDefinitionInput', {
  fields: (t) => ({
    name: t.string({
      required: false,
      description: 'Updated name (optional)',
      validate: {
        minLength: [1, { message: 'Name cannot be empty' }],
        maxLength: [255, { message: 'Name must be 255 characters or less' }],
      },
    }),
    content: t.field({
      type: 'JSON',
      required: false,
      description: 'Updated content (optional, replaces entire content if provided)',
    }),
  }),
});

// Input type for updating specific content fields with inheritance support
const UpdateDefinitionContentInput = builder.inputType('UpdateDefinitionContentInput', {
  fields: (t) => ({
    preamble: t.string({
      required: false,
      description: 'Update preamble. Set to empty string to clear override and inherit from parent.',
    }),
    template: t.string({
      required: false,
      description: 'Update template. Set to empty string to clear override and inherit from parent.',
    }),
    dimensions: t.field({
      type: 'JSON',
      required: false,
      description: 'Update dimensions array. Set to null to clear override and inherit from parent.',
    }),
    matchingRules: t.string({
      required: false,
      description: 'Update matching rules. Set to empty string to clear override.',
    }),
    clearOverrides: t.stringList({
      required: false,
      description: 'List of fields to clear local override for (inherit from parent). Valid values: preamble, template, dimensions, matching_rules',
    }),
  }),
});

// Mutation: updateDefinition
builder.mutationField('updateDefinition', (t) =>
  t.field({
    type: DefinitionRef,
    description: 'Update an existing definition. Note: If definition has runs, consider forking instead to preserve history.',
    args: {
      id: t.arg.string({
        required: true,
        description: 'Definition ID to update',
      }),
      input: t.arg({ type: UpdateDefinitionInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { id, input } = args;
      const { name, content } = input;

      ctx.log.debug({ definitionId: id, hasName: !!name, hasContent: !!content }, 'Updating definition');

      // Check if definition exists
      const existing = await db.definition.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new Error(`Definition not found: ${id}`);
      }

      // Build update data
      const updateData: Prisma.DefinitionUpdateInput = {};

      if (name !== null && name !== undefined) {
        updateData.name = name;
      }

      if (content !== null && content !== undefined) {
        // Validate content is an object
        if (typeof content !== 'object' || Array.isArray(content)) {
          throw new Error('Content must be a JSON object');
        }
        updateData.content = ensureSchemaVersion(content as Record<string, unknown>);
      }

      // Check if there's anything to update
      if (Object.keys(updateData).length === 0) {
        ctx.log.debug({ definitionId: id }, 'No changes to apply');
        return existing;
      }

      const definition = await db.definition.update({
        where: { id },
        data: updateData,
      });

      ctx.log.info({ definitionId: id, name: definition.name }, 'Definition updated');

      // Queue async scenario re-expansion if content was updated
      if (content !== null && content !== undefined) {
        const queueResult = await queueScenarioExpansion(definition.id, 'update');
        ctx.log.info(
          { definitionId: definition.id, jobId: queueResult.jobId, queued: queueResult.queued },
          'Scenario re-expansion queued after update'
        );
      }

      return definition;
    },
  })
);

// Mutation: updateDefinitionContent - granular content updates with inheritance support
builder.mutationField('updateDefinitionContent', (t) =>
  t.field({
    type: DefinitionRef,
    description: 'Update specific content fields of a definition. Supports clearing overrides to inherit from parent.',
    args: {
      id: t.arg.string({
        required: true,
        description: 'Definition ID to update',
      }),
      input: t.arg({ type: UpdateDefinitionContentInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const { id, input } = args;
      const { preamble, template, dimensions, matchingRules, clearOverrides } = input;

      ctx.log.debug(
        { definitionId: id, clearOverrides, hasPreamble: preamble !== undefined, hasTemplate: template !== undefined },
        'Updating definition content'
      );

      // Check if definition exists
      const existing = await db.definition.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new Error(`Definition not found: ${id}`);
      }

      // Parse existing content
      const existingContent = existing.content as Record<string, unknown>;

      // Build new content object (v2 format)
      const newContent: Record<string, unknown> = {
        schema_version: CURRENT_SCHEMA_VERSION,
      };

      // Fields to clear (set to undefined to inherit)
      const fieldsToClear = new Set(clearOverrides ?? []);

      // Preamble
      if (fieldsToClear.has('preamble')) {
        // Don't include preamble - will inherit from parent
      } else if (preamble !== undefined && preamble !== null) {
        newContent.preamble = preamble;
      } else if ('preamble' in existingContent) {
        newContent.preamble = existingContent.preamble;
      }

      // Template
      if (fieldsToClear.has('template')) {
        // Don't include template - will inherit from parent
      } else if (template !== undefined && template !== null) {
        newContent.template = template;
      } else if ('template' in existingContent) {
        newContent.template = existingContent.template;
      }

      // Dimensions
      if (fieldsToClear.has('dimensions')) {
        // Don't include dimensions - will inherit from parent
      } else if (dimensions !== undefined && dimensions !== null) {
        if (!Array.isArray(dimensions)) {
          throw new Error('Dimensions must be an array');
        }
        newContent.dimensions = dimensions;
      } else if ('dimensions' in existingContent) {
        newContent.dimensions = existingContent.dimensions;
      }

      // Matching rules
      if (fieldsToClear.has('matching_rules')) {
        // Don't include matching_rules - will inherit from parent
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

      // Queue async scenario re-expansion after content update
      const queueResult = await queueScenarioExpansion(definition.id, 'update');
      ctx.log.info(
        { definitionId: definition.id, jobId: queueResult.jobId, queued: queueResult.queued },
        'Scenario re-expansion queued after content update'
      );

      return definition;
    },
  })
);

// Result type for delete mutation
type DeleteDefinitionResultShape = {
  deletedIds: string[];
  count: number;
};

const DeleteDefinitionResultRef = builder.objectRef<DeleteDefinitionResultShape>('DeleteDefinitionResult');

builder.objectType(DeleteDefinitionResultRef, {
  description: 'Result of deleting a definition',
  fields: (t) => ({
    deletedIds: t.stringList({
      description: 'IDs of all definitions that were deleted (includes descendants)',
      resolve: (parent) => parent.deletedIds,
    }),
    count: t.exposeInt('count', {
      description: 'Total number of definitions deleted',
    }),
  }),
});

// Mutation: deleteDefinition (soft delete)
builder.mutationField('deleteDefinition', (t) =>
  t.field({
    type: DeleteDefinitionResultRef,
    description: 'Soft delete a definition and all its descendants. Related scenarios and tags are also soft deleted.',
    args: {
      id: t.arg.string({
        required: true,
        description: 'Definition ID to delete',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const { id } = args;

      ctx.log.debug({ definitionId: id }, 'Deleting definition');

      const deletedIds = await softDeleteDefinition(id);

      ctx.log.info(
        { definitionId: id, deletedCount: deletedIds.length },
        'Definition deleted'
      );

      return {
        deletedIds,
        count: deletedIds.length,
      };
    },
  })
);

// Result type for regenerate scenarios mutation
type RegenerateScenariosResultShape = {
  definitionId: string;
  jobId: string | null;
  queued: boolean;
};

const RegenerateScenariosResultRef = builder.objectRef<RegenerateScenariosResultShape>('RegenerateScenariosResult');

builder.objectType(RegenerateScenariosResultRef, {
  description: 'Result of triggering scenario regeneration',
  fields: (t) => ({
    definitionId: t.exposeString('definitionId', {
      description: 'ID of the definition being regenerated',
    }),
    jobId: t.exposeString('jobId', {
      nullable: true,
      description: 'ID of the queued expansion job (null if not queued)',
    }),
    queued: t.exposeBoolean('queued', {
      description: 'Whether a new expansion job was queued',
    }),
  }),
});

// Mutation: regenerateScenarios - manually trigger scenario regeneration
builder.mutationField('regenerateScenarios', (t) =>
  t.field({
    type: RegenerateScenariosResultRef,
    description: 'Manually trigger scenario regeneration for a definition. Queues a new expansion job.',
    args: {
      definitionId: t.arg.string({
        required: true,
        description: 'Definition ID to regenerate scenarios for',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const { definitionId } = args;

      ctx.log.debug({ definitionId }, 'Manual scenario regeneration requested');

      // Verify definition exists
      const definition = await db.definition.findUnique({
        where: { id: definitionId, deletedAt: null },
      });

      if (!definition) {
        throw new Error(`Definition not found: ${definitionId}`);
      }

      // Queue the expansion job
      const queueResult = await queueScenarioExpansion(definitionId, 'update');

      ctx.log.info(
        { definitionId, jobId: queueResult.jobId, queued: queueResult.queued },
        'Manual scenario regeneration queued'
      );

      return {
        definitionId,
        jobId: queueResult.jobId,
        queued: queueResult.queued,
      };
    },
  })
);

import { builder } from '../../builder.js';

export const CreateDefinitionInput = builder.inputType('CreateDefinitionInput', {
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
    preambleVersionId: t.string({
      required: false,
      description: 'ID of the preamble version to use',
    }),
  }),
});

export const ForkDefinitionInput = builder.inputType('ForkDefinitionInput', {
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
      description:
        'Optional content override. If not provided, inherits everything from parent (stores minimal v2 content).',
    }),
    inheritAll: t.boolean({
      required: false,
      description:
        'If true, fork with minimal content (inherit everything). Default: true. Set to false to copy parent content.',
    }),
  }),
});

export const UpdateDefinitionInput = builder.inputType('UpdateDefinitionInput', {
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
    preambleVersionId: t.string({
      required: false,
      description: 'Update preamble version ID',
    }),
  }),
});

export const UpdateDefinitionContentInput = builder.inputType('UpdateDefinitionContentInput', {
  fields: (t) => ({
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
      description:
        'List of fields to clear local override for (inherit from parent). Valid values: template, dimensions, matching_rules',
    }),
  }),
});

import SchemaBuilder from '@pothos/core';
import ValidationPlugin from '@pothos/plugin-validation';
import { ZodError } from 'zod';
import type { Context } from './context.js';

// Builder configuration with type-safe scalars and plugins
export const builder = new SchemaBuilder<{
  Context: Context;
  Scalars: {
    DateTime: {
      Input: Date;
      Output: Date;
    };
    JSON: {
      Input: unknown;
      Output: unknown;
    };
  };
}>({
  plugins: [ValidationPlugin],
  validationOptions: {
    validationError: (zodError: ZodError) => {
      // Return first error message for user-friendly feedback
      const firstError = zodError.errors[0];
      return new Error(firstError?.message ?? 'Invalid input');
    },
  },
});

// Initialize Query and Mutation types
builder.queryType({});
builder.mutationType({});

/**
 * AvailableModel GraphQL Type
 *
 * Represents an LLM model available for evaluation runs.
 */

import { builder } from '../builder.js';

// AvailableModel type for GraphQL schema
export const AvailableModelType = builder.objectRef<{
  id: string;
  providerId: string;
  displayName: string;
  versions: string[];
  defaultVersion: string | null;
  isAvailable: boolean;
  isDefault: boolean;
}>('AvailableModel').implement({
  description: 'An LLM model available for evaluation runs',
  fields: (t) => ({
    id: t.exposeString('id', {
      description: 'Model identifier (e.g., "gpt-4o")',
    }),
    providerId: t.exposeString('providerId', {
      description: 'Provider identifier (e.g., "openai")',
    }),
    displayName: t.exposeString('displayName', {
      description: 'Human-readable model name (e.g., "GPT-4o")',
    }),
    versions: t.exposeStringList('versions', {
      description: 'Available model versions',
    }),
    defaultVersion: t.exposeString('defaultVersion', {
      nullable: true,
      description: 'Default version to use if none specified',
    }),
    isAvailable: t.exposeBoolean('isAvailable', {
      description: 'Whether the model is available (API key configured)',
    }),
    isDefault: t.exposeBoolean('isDefault', {
      description: 'Whether this is the default model for its provider',
    }),
  }),
});

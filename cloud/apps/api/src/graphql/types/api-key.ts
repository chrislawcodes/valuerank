/**
 * GraphQL types for API key management
 *
 * Defines the ApiKey type and CreateApiKeyResult for the createApiKey mutation.
 */

import { builder } from '../builder.js';

// ApiKey type representing a stored API key
export const ApiKeyRef = builder.objectRef<{
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  lastUsed: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}>('ApiKey');

builder.objectType(ApiKeyRef, {
  description: 'API key for programmatic/MCP access. The full key is only returned once at creation time.',
  fields: (t) => ({
    id: t.exposeID('id', { description: 'Unique API key identifier' }),
    name: t.exposeString('name', { description: 'User-provided name for this key' }),
    keyPrefix: t.exposeString('keyPrefix', { description: 'Key prefix for identification (e.g., "vr_abc123")' }),
    lastUsedAt: t.expose('lastUsed', {
      type: 'DateTime',
      nullable: true,
      description: 'When this key was last used for authentication',
    }),
    expiresAt: t.expose('expiresAt', {
      type: 'DateTime',
      nullable: true,
      description: 'When this key expires (null = never expires)',
    }),
    createdAt: t.expose('createdAt', {
      type: 'DateTime',
      description: 'When this key was created',
    }),
  }),
});

// CreateApiKeyResult type for returning the key on creation
export const CreateApiKeyResultRef = builder.objectRef<{
  apiKey: {
    id: string;
    userId: string;
    name: string;
    keyPrefix: string;
    lastUsed: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
  };
  key: string;
}>('CreateApiKeyResult');

builder.objectType(CreateApiKeyResultRef, {
  description: 'Result of creating a new API key. The full key is only available in this response.',
  fields: (t) => ({
    apiKey: t.field({
      type: ApiKeyRef,
      description: 'The created API key metadata',
      resolve: (parent) => parent.apiKey,
    }),
    key: t.exposeString('key', {
      description: 'The full API key value. IMPORTANT: This is the only time the full key will be shown.',
    }),
  }),
});

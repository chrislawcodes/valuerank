/**
 * GraphQL mutations for API key management
 *
 * Provides createApiKey and revokeApiKey mutations.
 * Keys are stored as SHA-256 hashes - the full key is only returned once at creation.
 */

import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { AuthenticationError, NotFoundError } from '@valuerank/shared';
import { generateApiKey, hashApiKey, getKeyPrefix } from '../../auth/api-keys.js';
import { CreateApiKeyResultRef } from '../types/api-key.js';
import { createAuditLog } from '../../services/audit/index.js';

// Input type for creating an API key
const CreateApiKeyInput = builder.inputType('CreateApiKeyInput', {
  fields: (t) => ({
    name: t.string({
      required: true,
      description: 'Human-readable name for the key (e.g., "Claude Desktop", "Cursor IDE")',
      validate: {
        minLength: [1, { message: 'Name is required' }],
        maxLength: [100, { message: 'Name must be 100 characters or less' }],
      },
    }),
  }),
});

// Mutation: createApiKey
builder.mutationField('createApiKey', (t) =>
  t.field({
    type: CreateApiKeyResultRef,
    description: `
      Create a new API key for the current user.
      Requires authentication.

      The full key value is returned ONLY in this response.
      Store it securely - it cannot be retrieved later.
    `,
    args: {
      input: t.arg({ type: CreateApiKeyInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      // Require authentication
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const { name } = args.input;
      const userId = ctx.user.id;

      ctx.log.debug({ userId, name }, 'Creating API key');

      // Generate a secure random API key
      const fullKey = generateApiKey();

      // Hash the key for storage (never store plaintext)
      const keyHash = hashApiKey(fullKey);

      // Extract prefix for display (vr_ + 7 chars)
      const keyPrefix = getKeyPrefix(fullKey);

      // Store the API key record
      const apiKey = await db.apiKey.create({
        data: {
          userId,
          name,
          keyHash,
          keyPrefix,
        },
      });

      ctx.log.info(
        { userId, apiKeyId: apiKey.id, keyPrefix },
        'API key created'
      );

      // Audit log (non-blocking) - do not log the key value
      void createAuditLog({
        action: 'CREATE',
        entityType: 'ApiKey',
        entityId: apiKey.id,
        userId,
        metadata: { name, keyPrefix },
      });

      // Return the full key only in this response
      return {
        apiKey: {
          id: apiKey.id,
          userId: apiKey.userId,
          name: apiKey.name,
          keyPrefix: apiKey.keyPrefix,
          lastUsed: apiKey.lastUsed,
          expiresAt: apiKey.expiresAt,
          createdAt: apiKey.createdAt,
        },
        key: fullKey,
      };
    },
  })
);

// Mutation: revokeApiKey
builder.mutationField('revokeApiKey', (t) =>
  t.boolean({
    description: `
      Revoke (delete) an API key.
      Requires authentication and ownership of the key.

      Returns true if the key was successfully revoked.
      Throws NotFoundError if the key doesn't exist or belongs to another user.
    `,
    args: {
      id: t.arg.id({ required: true, description: 'ID of the API key to revoke' }),
    },
    resolve: async (_root, args, ctx) => {
      // Require authentication
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const userId = ctx.user.id;
      const apiKeyId = String(args.id);

      ctx.log.debug({ userId, apiKeyId }, 'Revoking API key');

      // Find the API key
      const apiKey = await db.apiKey.findUnique({
        where: { id: apiKeyId },
      });

      // Check if key exists and belongs to current user
      if (!apiKey || apiKey.userId !== userId) {
        throw new NotFoundError('ApiKey', apiKeyId);
      }

      // Delete the key
      await db.apiKey.delete({
        where: { id: apiKeyId },
      });

      ctx.log.info(
        { userId, apiKeyId, keyPrefix: apiKey.keyPrefix },
        'API key revoked'
      );

      // Audit log (non-blocking)
      void createAuditLog({
        action: 'DELETE',
        entityType: 'ApiKey',
        entityId: apiKeyId,
        userId,
        metadata: { name: apiKey.name, keyPrefix: apiKey.keyPrefix },
      });

      return true;
    },
  })
);

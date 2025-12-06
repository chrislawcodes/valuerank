/**
 * GraphQL queries for user information
 *
 * Provides `me` query for current user info and `apiKeys` for listing user's keys
 */

import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { AuthenticationError } from '@valuerank/shared';
import { UserRef } from '../types/user.js';
import { ApiKeyRef } from '../types/api-key.js';

// Query: me - get current authenticated user
builder.queryField('me', (t) =>
  t.field({
    type: UserRef,
    nullable: true,
    description: `
      Get the currently authenticated user.
      Returns null if not authenticated.
    `,
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user) {
        return null;
      }

      const user = await db.user.findUnique({
        where: { id: ctx.user.id },
      });

      if (!user) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      };
    },
  })
);

// Query: apiKeys - list current user's API keys
builder.queryField('apiKeys', (t) =>
  t.field({
    type: [ApiKeyRef],
    description: `
      List all API keys for the current user.
      Requires authentication.

      Note: Only key prefix is returned, not the full key value.
    `,
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const apiKeys = await db.apiKey.findMany({
        where: { userId: ctx.user.id },
        orderBy: { createdAt: 'desc' },
      });

      return apiKeys.map((key) => ({
        id: key.id,
        userId: key.userId,
        name: key.name,
        keyPrefix: key.keyPrefix,
        lastUsed: key.lastUsed,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
      }));
    },
  })
);

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
import { requireAdmin } from '../../auth/require-admin.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

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
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      };
    },
  })
);

builder.queryField('listUsers', (t) =>
  t.field({
    type: [UserRef],
    description: 'List all users. Admin only.',
    resolve: async (_root, _args, ctx) => {
      requireAdmin(ctx);

      const users = await db.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          mustChangePassword: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });

      return users;
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
    args: {
      limit: t.arg.int({
        required: false,
        description: `Maximum number of results (default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT})`,
      }),
      offset: t.arg.int({
        required: false,
        description: 'Number of results to skip (default: 0)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const offset = args.offset ?? 0;

      const apiKeys = await db.apiKey.findMany({
        where: { userId: ctx.user.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
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

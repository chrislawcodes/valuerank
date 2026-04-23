import type { Request, Response, NextFunction } from 'express';
import { createGraphQLError } from 'graphql-yoga';

import type { Context } from '../graphql/context.js';

export function requireAdmin(ctx: Context): void {
  if (ctx.user === null || ctx.user === undefined || ctx.user.role !== 'ADMIN') {
    throw createGraphQLError('Admin access required', {
      extensions: {
        code: 'FORBIDDEN',
        http: {
          status: 403,
        },
      },
    });
  }
}

export function requireAdminRest(req: Request, res: Response, next: NextFunction): void {
  if (req.user === null || req.user === undefined || req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Admin access required' });
    return;
  }

  next();
}

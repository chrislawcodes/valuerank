import type { Request } from 'express';
import { createDataLoaders, type DataLoaders } from './dataloaders/index.js';
import type { AuthUser, AuthMethod } from '../auth/types.js';

// GraphQL context type - passed to all resolvers
export interface Context {
  req: Request;
  log: Request['log'];
  loaders: DataLoaders;
  // Auth context (populated by auth middleware)
  user: AuthUser | null;
  authMethod: AuthMethod | null;
}

// Create new context for each request (per-request DataLoader instances)
export function createContext(req: Request): Context {
  return {
    req,
    log: req.log,
    loaders: createDataLoaders(),
    // Copy auth info from request (set by middleware)
    user: req.user ?? null,
    authMethod: req.authMethod ?? null,
  };
}

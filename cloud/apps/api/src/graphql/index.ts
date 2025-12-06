import { createYoga } from 'graphql-yoga';
import type { Request, Response } from 'express';
import { builder } from './builder.js';
import { createContext } from './context.js';
import { createLogger } from '@valuerank/shared';

// Import all types and operations to register them with the builder
import './types/index.js';
import './queries/index.js';
import './mutations/index.js';

const log = createLogger('graphql');

// Build the GraphQL schema
export const schema = builder.toSchema();

// Create GraphQL Yoga server instance
export const yoga = createYoga<{
  req: Request;
  res: Response;
}>({
  schema,
  context: ({ req }) => createContext(req),
  graphiql: process.env.NODE_ENV !== 'production',
  logging: {
    debug: (...args) => log.debug(args, 'GraphQL debug'),
    info: (...args) => log.info(args, 'GraphQL info'),
    warn: (...args) => log.warn(args, 'GraphQL warn'),
    error: (...args) => log.error(args, 'GraphQL error'),
  },
  maskedErrors: process.env.NODE_ENV === 'production',
});

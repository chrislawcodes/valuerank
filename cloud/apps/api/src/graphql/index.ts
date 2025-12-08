import { createYoga } from 'graphql-yoga';
import type { Request, Response } from 'express';
import { graphql, type ExecutionResult } from 'graphql';
import { builder } from './builder.js';
import { createContext, type Context } from './context.js';
import { createLogger } from '@valuerank/shared';

// Import all types and operations to register them with the builder
import './types/index.js';
import './queries/index.js';
import './mutations/index.js';

const log = createLogger('graphql');

// Build the GraphQL schema
export const schema = builder.toSchema();

/**
 * Execute a GraphQL query against our schema.
 * This ensures the same graphql module instance is used as the schema.
 */
export async function executeGraphQL(args: {
  source: string;
  variableValues?: Record<string, unknown>;
  contextValue: Partial<Context>;
}): Promise<ExecutionResult> {
  return graphql({
    schema,
    source: args.source,
    variableValues: args.variableValues,
    contextValue: args.contextValue,
  });
}

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

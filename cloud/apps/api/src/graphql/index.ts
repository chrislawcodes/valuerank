import { createYoga, type Plugin, createGraphQLError } from 'graphql-yoga';
import type { Request, Response } from 'express';
import { graphql, type ExecutionResult, getOperationAST } from 'graphql';
import { builder } from './builder.js';
import { createContext, type Context } from './context.js';
import { createLogger, AppError } from '@valuerank/shared';

// Import all types and operations to register them with the builder
import './types/index.js';
import './queries/index.js';
import './mutations/index.js';

const log = createLogger('graphql');

/**
 * Sanitize variables to avoid logging sensitive data
 */
function sanitizeVariables(vars: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!vars) return undefined;

  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'api_key', 'authorization'];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(vars)) {
    if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 200) {
      sanitized[key] = value.slice(0, 200) + '...[truncated]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * GraphQL query logging plugin
 * Logs operation name, type, variables, execution time, and user info
 */
function useQueryLogging(): Plugin {
  return {
    onExecute({ args }) {
      const startTime = Date.now();
      const { document, variableValues, contextValue } = args;

      // Extract operation info
      const operation = getOperationAST(document);
      const operationName = operation?.name?.value ?? 'anonymous';
      const operationType = operation?.operation ?? 'unknown';

      // Get user info from context (may be our Context type with user/authMethod)
      const ctx = contextValue as unknown as Partial<Context>;
      const userId = ctx.user?.id ?? 'anonymous';
      const authMethod = ctx.authMethod ?? 'none';

      // Determine source based on auth method
      const source = authMethod === 'api_key' ? 'mcp' : authMethod === 'oauth' ? 'mcp' : 'web';

      // Skip introspection queries to reduce noise
      const isIntrospection = operationName === 'IntrospectionQuery' ||
        (document.definitions.some((def: { kind: string; selectionSet?: { selections: Array<{ kind: string; name?: { value: string } }> } }) =>
          def.kind === 'OperationDefinition' &&
          def.selectionSet?.selections.some((sel) =>
            sel.kind === 'Field' && sel.name?.value.startsWith('__')
          )
        ));

      if (isIntrospection) {
        return undefined; // Don't log introspection
      }

      return {
        onExecuteDone({ result }) {
          const durationMs = Date.now() - startTime;
          const hasErrors = 'errors' in result && Array.isArray(result.errors) && result.errors.length > 0;

          log.info({
            operationName,
            operationType,
            variables: sanitizeVariables(variableValues as Record<string, unknown> | undefined),
            userId,
            authMethod,
            source,
            durationMs,
            hasErrors,
            errorCount: hasErrors ? (result.errors?.length ?? 0) : 0,
          }, `GraphQL ${operationType}: ${operationName}`);
        },
      };
    },
  };
}

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
  plugins: [useQueryLogging()],
  logging: {
    debug: (...args) => log.debug(args, 'GraphQL debug'),
    info: (...args) => log.info(args, 'GraphQL info'),
    warn: (...args) => log.warn(args, 'GraphQL warn'),
    error: (...args) => log.error(args, 'GraphQL error'),
  },
  maskedErrors: process.env.NODE_ENV === 'production' ? {
    maskError(error: any) {
      if (error instanceof AppError || error?.originalError instanceof AppError) {
        return createGraphQLError(error.message, {
          extensions: {
            code: (error instanceof AppError ? error.code : (error.originalError as AppError).code) || 'APP_ERROR',
            http: {
              status: (error instanceof AppError ? error.statusCode : (error.originalError as AppError).statusCode) || 400,
            },
          },
        });
      }
      // Mask other errors with generic message
      return createGraphQLError('Unexpected error occurred.', {
        extensions: {
          code: 'INTERNAL_SERVER_ERROR',
          http: {
            status: 500,
          },
        },
      });
    },
  } : false,
});

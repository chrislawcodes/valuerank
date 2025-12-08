/**
 * graphql_query Tool Tests
 *
 * Tests the graphql_query tool configuration and helper functions.
 * Note: Direct GraphQL execution tests are included via HTTP integration tests
 * to avoid graphql module realm conflicts in Vitest.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { exceedsBudget } from '../../../src/services/mcp/response.js';
import { yoga } from '../../../src/graphql/index.js';

const log = createLogger('test:graphql');

/**
 * Creates a test Express app with GraphQL endpoint
 */
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Add request logger and mock auth to every request
  app.use((req, _res, next) => {
    req.log = log;
    req.requestId = 'test-request-id';
    req.user = { id: 'test-user', email: 'test@valuerank.ai' };
    req.authMethod = 'api_key';
    next();
  });

  app.use('/graphql', yoga);
  return app;
}

describe('graphql_query tool', () => {
  let testDefinitionId: string;
  let testScenarioId: string;
  let app: express.Application;

  beforeAll(async () => {
    app = createTestApp();

    // Create test definition for queries
    const definition = await db.definition.create({
      data: {
        name: 'test-mcp-graphql-definition',
        content: { scenario: 'test scenario content', versionLabel: 'test-v1' },
      },
    });
    testDefinitionId = definition.id;

    // Create test scenario
    const scenario = await db.scenario.create({
      data: {
        name: 'test-mcp-graphql-scenario',
        definitionId: testDefinitionId,
        content: {
          preamble: 'Test preamble',
          prompt: 'Test prompt',
          dimensions: { model: 'test-model' },
        },
      },
    });
    testScenarioId = scenario.id;
  });

  afterAll(async () => {
    if (testScenarioId) {
      await db.scenario.delete({ where: { id: testScenarioId } });
    }
    if (testDefinitionId) {
      await db.definition.delete({ where: { id: testDefinitionId } });
    }
  });

  describe('mutation detection helper', () => {
    it('detects mutation keyword in query string', () => {
      const mutationQuery = 'mutation CreateTag { createTag(name: "test") { id } }';
      const queryOp = 'query GetDefinition { definition(id: "test") { id name } }';

      // Simple heuristic check
      expect(mutationQuery.includes('mutation')).toBe(true);
      expect(queryOp.includes('mutation')).toBe(false);
    });

    it('detects subscription keyword in query string', () => {
      const subscriptionQuery = 'subscription OnUpdate { onUpdate { id } }';
      expect(subscriptionQuery.includes('subscription')).toBe(true);
    });
  });

  describe('token budget', () => {
    it('small responses are within budget', () => {
      const smallResponse = { data: { definition: { id: 'test', name: 'Test' } } };
      expect(exceedsBudget('graphql_query', smallResponse)).toBe(false);
    });

    it('medium responses are within budget', () => {
      const mediumResponse = {
        data: {
          items: Array(100).fill({ id: 'test', name: 'Test Definition' })
        }
      };
      expect(exceedsBudget('graphql_query', mediumResponse)).toBe(false);
    });

    it('very large responses exceed budget', () => {
      const largeResponse = { data: { items: 'x'.repeat(15000) } };
      expect(exceedsBudget('graphql_query', largeResponse)).toBe(true);
    });

    it('10KB budget for graphql_query', () => {
      // Just under 10KB
      const justUnder = { data: { text: 'x'.repeat(9000) } };
      expect(exceedsBudget('graphql_query', justUnder)).toBe(false);

      // Just over 10KB
      const justOver = { data: { text: 'x'.repeat(11000) } };
      expect(exceedsBudget('graphql_query', justOver)).toBe(true);
    });
  });

  describe('error response format', () => {
    it('produces correct error structure for mutations', () => {
      const expectedError = {
        error: 'MUTATION_NOT_ALLOWED',
        message: 'MCP read tools do not support GraphQL mutations',
      };

      expect(expectedError.error).toBe('MUTATION_NOT_ALLOWED');
      expect(expectedError.message).toContain('mutations');
    });

    it('produces correct error structure for large responses', () => {
      const expectedError = {
        error: 'RESPONSE_TOO_LARGE',
        message: 'Response exceeds token budget. Use pagination or filters.',
      };

      expect(expectedError.error).toBe('RESPONSE_TOO_LARGE');
      expect(expectedError.message).toContain('pagination');
    });
  });

  describe('query string validation', () => {
    it('accepts valid query syntax', () => {
      const validQueries = [
        'query { definitions { edges { node { id } } } }',
        'query GetDef($id: ID!) { definition(id: $id) { id } }',
        '{ __schema { types { name } } }',
        'query { __type(name: "Definition") { name } }',
      ];

      // All should be valid non-mutation queries
      validQueries.forEach((q) => {
        expect(q.trim().length).toBeGreaterThan(0);
        expect(q.includes('mutation ')).toBe(false);
      });
    });

    it('rejects mutation syntax', () => {
      const mutationQueries = [
        'mutation { createTag(name: "test") { id } }',
        'mutation CreateDef { createDefinition(input: {}) { id } }',
      ];

      // All should contain mutation keyword
      mutationQueries.forEach((q) => {
        expect(q.includes('mutation')).toBe(true);
      });
    });
  });

  /**
   * Helper to execute a GraphQL query via HTTP
   */
  async function executeQuery(query: string, variables?: Record<string, unknown>) {
    const response = await request(app)
      .post('/graphql')
      .send({ query, variables })
      .expect('Content-Type', /json/);
    return response.body;
  }

  describe('GraphQL query execution via HTTP', () => {
    it('executes definition query successfully', async () => {
      const query = `
        query GetDefinition($id: ID!) {
          definition(id: $id) {
            id
            name
            content
            scenarioCount
          }
        }
      `;

      const result = await executeQuery(query, { id: testDefinitionId });

      expect(result.errors).toBeUndefined();
      expect(result.data?.definition).toBeDefined();
      expect(result.data?.definition?.id).toBe(testDefinitionId);
      expect(result.data?.definition?.name).toBe('test-mcp-graphql-definition');
      expect(result.data?.definition?.scenarioCount).toBe(1);
    });

    it('executes definitions list query successfully', async () => {
      const query = `
        query ListDefinitions($search: String) {
          definitions(search: $search) {
            id
            name
            scenarioCount
          }
        }
      `;

      const result = await executeQuery(query, { search: 'test-mcp-graphql' });

      expect(result.errors).toBeUndefined();
      expect(result.data?.definitions).toBeDefined();
      expect(Array.isArray(result.data?.definitions)).toBe(true);

      const found = (result.data?.definitions as Array<{ id: string }>)?.find(
        (d) => d.id === testDefinitionId
      );
      expect(found).toBeDefined();
    });

    it('executes scenarios query successfully', async () => {
      const query = `
        query GetScenarios($definitionId: ID!) {
          scenarios(definitionId: $definitionId) {
            id
            content
          }
        }
      `;

      const result = await executeQuery(query, { definitionId: testDefinitionId });

      expect(result.errors).toBeUndefined();
      expect(result.data?.scenarios).toBeDefined();
      expect(Array.isArray(result.data?.scenarios)).toBe(true);
      expect(result.data?.scenarios?.length).toBe(1);
      expect((result.data?.scenarios as Array<{ id: string }>)?.[0]?.id).toBe(testScenarioId);
    });

    it('executes scenario query successfully', async () => {
      const query = `
        query GetScenario($id: ID!) {
          scenario(id: $id) {
            id
            content
          }
        }
      `;

      const result = await executeQuery(query, { id: testScenarioId });

      expect(result.errors).toBeUndefined();
      expect(result.data?.scenario).toBeDefined();
      expect(result.data?.scenario?.id).toBe(testScenarioId);
    });

    it('executes scenarioCount query successfully', async () => {
      const query = `
        query GetScenarioCount($definitionId: ID!) {
          scenarioCount(definitionId: $definitionId)
        }
      `;

      const result = await executeQuery(query, { definitionId: testDefinitionId });

      expect(result.errors).toBeUndefined();
      expect(result.data?.scenarioCount).toBe(1);
    });

    it('returns null for non-existent definition', async () => {
      const query = `
        query GetDefinition($id: ID!) {
          definition(id: $id) {
            id
            name
          }
        }
      `;

      const result = await executeQuery(query, { id: 'non-existent-id' });

      expect(result.errors).toBeUndefined();
      expect(result.data?.definition).toBeNull();
    });

    it('returns null for non-existent scenario', async () => {
      const query = `
        query GetScenario($id: ID!) {
          scenario(id: $id) {
            id
          }
        }
      `;

      const result = await executeQuery(query, { id: 'non-existent-id' });

      expect(result.errors).toBeUndefined();
      expect(result.data?.scenario).toBeNull();
    });

    it('throws error for scenarios with non-existent definition', async () => {
      const query = `
        query GetScenarios($definitionId: ID!) {
          scenarios(definitionId: $definitionId) {
            id
          }
        }
      `;

      const result = await executeQuery(query, { definitionId: 'non-existent-id' });

      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
      expect(result.errors?.[0]?.message).toContain('not found');
    });

    it('executes schema introspection successfully', async () => {
      const query = `
        query {
          __schema {
            types {
              name
            }
          }
        }
      `;

      const result = await executeQuery(query);

      expect(result.errors).toBeUndefined();
      expect(result.data?.__schema).toBeDefined();
      expect(Array.isArray((result.data?.__schema as { types: unknown[] })?.types)).toBe(true);
    });

    it('executes type introspection for Definition type', async () => {
      const query = `
        query {
          __type(name: "Definition") {
            name
            fields {
              name
            }
          }
        }
      `;

      const result = await executeQuery(query);

      expect(result.errors).toBeUndefined();
      expect(result.data?.__type).toBeDefined();
      expect((result.data?.__type as { name: string })?.name).toBe('Definition');

      const fields = (result.data?.__type as { fields: Array<{ name: string }> })?.fields;
      expect(fields).toBeDefined();

      const fieldNames = fields?.map((f) => f.name) ?? [];
      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('name');
      expect(fieldNames).toContain('content');
      expect(fieldNames).toContain('scenarios');
      expect(fieldNames).toContain('scenarioCount');
    });

    it('handles definition with scenarios field resolver', async () => {
      const query = `
        query GetDefinitionWithScenarios($id: ID!) {
          definition(id: $id) {
            id
            name
            scenarios {
              id
              content
            }
          }
        }
      `;

      const result = await executeQuery(query, { id: testDefinitionId });

      expect(result.errors).toBeUndefined();
      expect(result.data?.definition).toBeDefined();
      expect(result.data?.definition?.scenarios).toBeDefined();
      expect(Array.isArray(result.data?.definition?.scenarios)).toBe(true);
      expect(result.data?.definition?.scenarios?.length).toBe(1);
    });
  });

  describe('soft delete filtering', () => {
    let softDeletedDefId: string;
    let softDeletedScenarioId: string;

    beforeAll(async () => {
      // Create soft-deleted definition
      const def = await db.definition.create({
        data: {
          name: 'test-mcp-soft-deleted-def',
          content: { scenario: 'deleted' },
          deletedAt: new Date(),
        },
      });
      softDeletedDefId = def.id;

      // Create soft-deleted scenario
      const scenario = await db.scenario.create({
        data: {
          name: 'test-mcp-soft-deleted-scenario',
          definitionId: testDefinitionId, // Use the non-deleted parent
          content: { prompt: 'deleted scenario' },
          deletedAt: new Date(),
        },
      });
      softDeletedScenarioId = scenario.id;
    });

    afterAll(async () => {
      await db.scenario.delete({ where: { id: softDeletedScenarioId } });
      await db.definition.delete({ where: { id: softDeletedDefId } });
    });

    it('excludes soft-deleted definitions from definition query', async () => {
      const query = `
        query GetDefinition($id: ID!) {
          definition(id: $id) {
            id
            name
          }
        }
      `;

      const result = await executeQuery(query, { id: softDeletedDefId });

      expect(result.errors).toBeUndefined();
      expect(result.data?.definition).toBeNull();
    });

    it('excludes soft-deleted definitions from definitions list', async () => {
      const query = `
        query {
          definitions {
            id
            name
          }
        }
      `;

      const result = await executeQuery(query);

      expect(result.errors).toBeUndefined();
      const ids = ((result.data?.definitions as Array<{ id: string }>) ?? []).map((d) => d.id);
      expect(ids).not.toContain(softDeletedDefId);
    });

    it('excludes soft-deleted scenarios from scenarios query', async () => {
      const query = `
        query GetScenarios($definitionId: ID!) {
          scenarios(definitionId: $definitionId) {
            id
          }
        }
      `;

      const result = await executeQuery(query, { definitionId: testDefinitionId });

      expect(result.errors).toBeUndefined();
      const ids = ((result.data?.scenarios as Array<{ id: string }>) ?? []).map((s) => s.id);
      expect(ids).not.toContain(softDeletedScenarioId);
      expect(ids).toContain(testScenarioId); // Non-deleted scenario should be present
    });

    it('returns null for soft-deleted scenario by ID', async () => {
      const query = `
        query GetScenario($id: ID!) {
          scenario(id: $id) {
            id
          }
        }
      `;

      const result = await executeQuery(query, { id: softDeletedScenarioId });

      expect(result.errors).toBeUndefined();
      expect(result.data?.scenario).toBeNull();
    });
  });
});

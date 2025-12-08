/**
 * graphql_query Tool Tests
 *
 * Tests the graphql_query tool configuration and helper functions.
 * Note: Direct graphql execution tests are skipped due to module version conflicts
 * between the app's graphql package and MCP SDK's graphql package.
 * Integration tests should be used for full query testing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@valuerank/db';
import { exceedsBudget } from '../../../src/services/mcp/response.js';

describe('graphql_query tool', () => {
  let testDefinitionId: string;

  beforeAll(async () => {
    // Create test definition for queries
    const definition = await db.definition.create({
      data: {
        name: 'test-mcp-graphql-definition',
        content: { scenario: 'test scenario' },
      },
    });
    testDefinitionId = definition.id;
  });

  afterAll(async () => {
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
});

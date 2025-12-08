/**
 * Scenarios Query Tests
 *
 * Tests for GraphQL scenarios queries with full content.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import type { Definition, Scenario } from '@valuerank/db';
import { getAuthHeader } from '../../test-utils.js';

const app = createServer();

describe('GraphQL Scenarios Query', () => {
  let testDefinition: Definition;
  let deletedDefinition: Definition;
  let scenario1: Scenario;
  let scenario2: Scenario;
  let scenario3: Scenario;
  let deletedScenario: Scenario;

  beforeAll(async () => {
    // Create test definition
    testDefinition = await db.definition.create({
      data: {
        name: 'Scenarios Test Definition',
        content: {
          schema_version: 1,
          preamble: 'Test preamble',
          template: 'Test template [placeholder]',
        },
      },
    });

    // Create soft-deleted definition for testing
    deletedDefinition = await db.definition.create({
      data: {
        name: 'Deleted Definition',
        content: { schema_version: 1 },
        deletedAt: new Date(),
      },
    });

    // Create test scenarios
    scenario1 = await db.scenario.create({
      data: {
        definitionId: testDefinition.id,
        name: 'Scenario One',
        content: {
          preamble: 'Test preamble for scenario 1',
          prompt: 'Test prompt for scenario 1',
          dimensionValues: { severity: 'low' },
        },
      },
    });

    scenario2 = await db.scenario.create({
      data: {
        definitionId: testDefinition.id,
        name: 'Scenario Two',
        content: {
          preamble: 'Test preamble for scenario 2',
          prompt: 'Test prompt for scenario 2',
          dimensionValues: { severity: 'high' },
        },
      },
    });

    scenario3 = await db.scenario.create({
      data: {
        definitionId: testDefinition.id,
        name: 'Scenario Three',
        content: {
          preamble: 'Test preamble for scenario 3',
          prompt: 'Test prompt for scenario 3',
          dimensionValues: { severity: 'medium' },
        },
      },
    });

    // Create soft-deleted scenario
    deletedScenario = await db.scenario.create({
      data: {
        definitionId: testDefinition.id,
        name: 'Deleted Scenario',
        content: { prompt: 'This should not appear' },
        deletedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    // Clean up in reverse order
    await db.scenario.deleteMany({
      where: {
        id: { in: [scenario1.id, scenario2.id, scenario3.id, deletedScenario.id] },
      },
    });
    await db.definition.deleteMany({
      where: { id: { in: [testDefinition.id, deletedDefinition.id] } },
    });
  });

  describe('scenarios(definitionId)', () => {
    it('returns scenarios for a definition with full content', async () => {
      const query = `
        query GetScenarios($definitionId: ID!) {
          scenarios(definitionId: $definitionId) {
            id
            name
            content
            definitionId
            createdAt
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { definitionId: testDefinition.id } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.scenarios).toHaveLength(3);

      const scenario = response.body.data.scenarios.find(
        (s: { id: string }) => s.id === scenario1.id
      );
      expect(scenario).toBeDefined();
      expect(scenario.name).toBe('Scenario One');
      expect(scenario.content).toHaveProperty('prompt');
      expect(scenario.content).toHaveProperty('dimensionValues');
      expect(scenario.definitionId).toBe(testDefinition.id);
      expect(scenario.createdAt).toBeDefined();
    });

    it('excludes soft-deleted scenarios', async () => {
      const query = `
        query GetScenarios($definitionId: ID!) {
          scenarios(definitionId: $definitionId) {
            id
            name
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { definitionId: testDefinition.id } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const ids = response.body.data.scenarios.map((s: { id: string }) => s.id);
      expect(ids).not.toContain(deletedScenario.id);
    });

    it('throws error for non-existent definition', async () => {
      const query = `
        query GetScenarios($definitionId: ID!) {
          scenarios(definitionId: $definitionId) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { definitionId: 'nonexistent-id' } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('not found');
    });

    it('throws error for soft-deleted definition', async () => {
      const query = `
        query GetScenarios($definitionId: ID!) {
          scenarios(definitionId: $definitionId) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { definitionId: deletedDefinition.id } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('not found');
    });

    it('applies limit parameter', async () => {
      const query = `
        query GetScenarios($definitionId: ID!, $limit: Int) {
          scenarios(definitionId: $definitionId, limit: $limit) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { definitionId: testDefinition.id, limit: 2 } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.scenarios).toHaveLength(2);
    });

    it('applies offset parameter', async () => {
      const query = `
        query GetScenarios($definitionId: ID!, $offset: Int) {
          scenarios(definitionId: $definitionId, offset: $offset) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { definitionId: testDefinition.id, offset: 2 } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.scenarios).toHaveLength(1);
    });

    it('resolves definition relationship via dataloader', async () => {
      const query = `
        query GetScenarios($definitionId: ID!) {
          scenarios(definitionId: $definitionId) {
            id
            definition {
              id
              name
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { definitionId: testDefinition.id } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.scenarios[0].definition).toMatchObject({
        id: testDefinition.id,
        name: 'Scenarios Test Definition',
      });
    });
  });

  describe('scenario(id)', () => {
    it('returns a single scenario by ID', async () => {
      const query = `
        query GetScenario($id: ID!) {
          scenario(id: $id) {
            id
            name
            content
            definitionId
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: scenario1.id } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.scenario).toMatchObject({
        id: scenario1.id,
        name: 'Scenario One',
        definitionId: testDefinition.id,
      });
      expect(response.body.data.scenario.content).toHaveProperty('prompt');
    });

    it('returns null for non-existent scenario', async () => {
      const query = `
        query GetScenario($id: ID!) {
          scenario(id: $id) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: 'nonexistent-id' } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.scenario).toBeNull();
    });

    it('returns null for soft-deleted scenario', async () => {
      const query = `
        query GetScenario($id: ID!) {
          scenario(id: $id) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: deletedScenario.id } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.scenario).toBeNull();
    });

    it('returns null for scenario with deleted definition', async () => {
      // Create a scenario for the deleted definition
      const scenarioWithDeletedDef = await db.scenario.create({
        data: {
          definitionId: deletedDefinition.id,
          name: 'Scenario With Deleted Def',
          content: { prompt: 'test' },
        },
      });

      const query = `
        query GetScenario($id: ID!) {
          scenario(id: $id) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: scenarioWithDeletedDef.id } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.scenario).toBeNull();

      // Clean up
      await db.scenario.delete({ where: { id: scenarioWithDeletedDef.id } });
    });
  });

  describe('scenarioCount(definitionId)', () => {
    it('returns count of scenarios for a definition', async () => {
      const query = `
        query GetScenarioCount($definitionId: ID!) {
          scenarioCount(definitionId: $definitionId)
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { definitionId: testDefinition.id } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.scenarioCount).toBe(3);
    });

    it('excludes soft-deleted scenarios from count', async () => {
      const query = `
        query GetScenarioCount($definitionId: ID!) {
          scenarioCount(definitionId: $definitionId)
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { definitionId: testDefinition.id } });

      expect(response.status).toBe(200);
      // Count should be 3, not 4 (deleted scenario excluded)
      expect(response.body.data.scenarioCount).toBe(3);
    });

    it('throws error for non-existent definition', async () => {
      const query = `
        query GetScenarioCount($definitionId: ID!) {
          scenarioCount(definitionId: $definitionId)
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { definitionId: 'nonexistent-id' } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('not found');
    });

    it('throws error for soft-deleted definition', async () => {
      const query = `
        query GetScenarioCount($definitionId: ID!) {
          scenarioCount(definitionId: $definitionId)
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { definitionId: deletedDefinition.id } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('not found');
    });

    it('returns 0 for definition with no scenarios', async () => {
      const emptyDefinition = await db.definition.create({
        data: {
          name: 'Empty Definition',
          content: { schema_version: 1 },
        },
      });

      const query = `
        query GetScenarioCount($definitionId: ID!) {
          scenarioCount(definitionId: $definitionId)
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { definitionId: emptyDefinition.id } });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.scenarioCount).toBe(0);

      // Clean up
      await db.definition.delete({ where: { id: emptyDefinition.id } });
    });
  });
});

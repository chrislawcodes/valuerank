import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import type { Definition } from '@valuerank/db';

const app = createServer();

describe('GraphQL Definition Query', () => {
  let testDefinition: Definition;
  let parentDefinition: Definition;
  let childDefinition: Definition;

  beforeAll(async () => {
    // Create test definitions with parent-child relationship
    parentDefinition = await db.definition.create({
      data: {
        name: 'Parent Definition',
        content: { schema_version: 1, preamble: 'Parent' },
      },
    });

    testDefinition = await db.definition.create({
      data: {
        name: 'Test Definition',
        content: { schema_version: 1, preamble: 'Test', template: 'Test template' },
        parentId: parentDefinition.id,
      },
    });

    childDefinition = await db.definition.create({
      data: {
        name: 'Child Definition',
        content: { schema_version: 1, preamble: 'Child' },
        parentId: testDefinition.id,
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await db.definition.deleteMany({
      where: {
        id: { in: [childDefinition.id, testDefinition.id, parentDefinition.id] },
      },
    });
  });

  describe('definition(id)', () => {
    it('returns definition with all scalar fields', async () => {
      const query = `
        query GetDefinition($id: ID!) {
          definition(id: $id) {
            id
            name
            content
            parentId
            createdAt
            updatedAt
            lastAccessedAt
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({ query, variables: { id: testDefinition.id } });

      // Debug: log response if not 200
      if (response.status !== 200) {
        console.log('Response status:', response.status);
        console.log('Response body:', JSON.stringify(response.body, null, 2));
      }
      expect(response.status).toBe(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definition).toMatchObject({
        id: testDefinition.id,
        name: 'Test Definition',
        parentId: parentDefinition.id,
      });
      expect(response.body.data.definition.content).toHaveProperty('schema_version', 1);
      expect(response.body.data.definition.createdAt).toBeDefined();
    });

    it('returns null for non-existent ID', async () => {
      const query = `
        query GetDefinition($id: ID!) {
          definition(id: $id) {
            id
            name
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({ query, variables: { id: 'nonexistent-id' } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definition).toBeNull();
    });

    it('resolves parent relationship via DataLoader', async () => {
      const query = `
        query GetDefinitionWithParent($id: ID!) {
          definition(id: $id) {
            id
            name
            parent {
              id
              name
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({ query, variables: { id: testDefinition.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definition.parent).toMatchObject({
        id: parentDefinition.id,
        name: 'Parent Definition',
      });
    });

    it('returns null parent for root definition', async () => {
      const query = `
        query GetDefinitionWithParent($id: ID!) {
          definition(id: $id) {
            id
            name
            parent {
              id
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({ query, variables: { id: parentDefinition.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definition.parent).toBeNull();
    });

    it('resolves children relationship', async () => {
      const query = `
        query GetDefinitionWithChildren($id: ID!) {
          definition(id: $id) {
            id
            children {
              id
              name
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({ query, variables: { id: testDefinition.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definition.children).toHaveLength(1);
      expect(response.body.data.definition.children[0]).toMatchObject({
        id: childDefinition.id,
        name: 'Child Definition',
      });
    });

    it('returns empty children array for leaf definition', async () => {
      const query = `
        query GetDefinitionWithChildren($id: ID!) {
          definition(id: $id) {
            id
            children {
              id
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({ query, variables: { id: childDefinition.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definition.children).toHaveLength(0);
    });

    it('resolves nested parent chain', async () => {
      const query = `
        query GetNestedParents($id: ID!) {
          definition(id: $id) {
            id
            name
            parent {
              id
              name
              parent {
                id
                name
              }
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({ query, variables: { id: childDefinition.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definition).toMatchObject({
        id: childDefinition.id,
        name: 'Child Definition',
        parent: {
          id: testDefinition.id,
          name: 'Test Definition',
          parent: {
            id: parentDefinition.id,
            name: 'Parent Definition',
          },
        },
      });
    });
  });

  describe('definitions(rootOnly, limit, offset)', () => {
    it('returns list of definitions', async () => {
      const query = `
        query ListDefinitions {
          definitions {
            id
            name
            parentId
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({ query })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(Array.isArray(response.body.data.definitions)).toBe(true);
      // Should include our test definitions
      const ids = response.body.data.definitions.map((d: { id: string }) => d.id);
      expect(ids).toContain(parentDefinition.id);
    });

    it('filters to root-only definitions', async () => {
      const query = `
        query ListRootDefinitions($rootOnly: Boolean) {
          definitions(rootOnly: $rootOnly) {
            id
            name
            parentId
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({ query, variables: { rootOnly: true } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      // All returned definitions should have null parentId
      for (const def of response.body.data.definitions) {
        expect(def.parentId).toBeNull();
      }
      // Should include our root definition
      const ids = response.body.data.definitions.map((d: { id: string }) => d.id);
      expect(ids).toContain(parentDefinition.id);
      // Should NOT include child definitions
      expect(ids).not.toContain(testDefinition.id);
      expect(ids).not.toContain(childDefinition.id);
    });

    it('applies limit parameter', async () => {
      const query = `
        query ListDefinitionsWithLimit($limit: Int) {
          definitions(limit: $limit) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({ query, variables: { limit: 2 } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definitions.length).toBeLessThanOrEqual(2);
    });

    it('applies offset parameter', async () => {
      const query = `
        query ListDefinitionsWithOffset($limit: Int, $offset: Int) {
          definitions(limit: $limit, offset: $offset) {
            id
          }
        }
      `;

      // Get all definitions first
      const allResponse = await request(app)
        .post('/graphql')
        .send({ query, variables: { limit: 100, offset: 0 } })
        .expect(200);

      // Get with offset
      const offsetResponse = await request(app)
        .post('/graphql')
        .send({ query, variables: { limit: 100, offset: 1 } })
        .expect(200);

      expect(offsetResponse.body.errors).toBeUndefined();
      // Offset should skip first result
      if (allResponse.body.data.definitions.length > 1) {
        expect(offsetResponse.body.data.definitions.length).toBe(
          allResponse.body.data.definitions.length - 1
        );
      }
    });

    it('enforces max limit of 100', async () => {
      const query = `
        query ListDefinitionsExceedLimit($limit: Int) {
          definitions(limit: $limit) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({ query, variables: { limit: 200 } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      // Should be capped at 100, but we might have fewer records
      expect(response.body.data.definitions.length).toBeLessThanOrEqual(100);
    });

    it('combines rootOnly with pagination', async () => {
      const query = `
        query ListRootWithPagination($rootOnly: Boolean, $limit: Int) {
          definitions(rootOnly: $rootOnly, limit: $limit) {
            id
            parentId
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({ query, variables: { rootOnly: true, limit: 5 } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definitions.length).toBeLessThanOrEqual(5);
      // All should be root definitions
      for (const def of response.body.data.definitions) {
        expect(def.parentId).toBeNull();
      }
    });
  });
});

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
});

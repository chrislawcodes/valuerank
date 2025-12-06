import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';

const app = createServer();

describe('GraphQL Definition Mutations', () => {
  const createdDefinitionIds: string[] = [];

  afterEach(async () => {
    // Clean up created definitions
    if (createdDefinitionIds.length > 0) {
      await db.definition.deleteMany({
        where: { id: { in: createdDefinitionIds } },
      });
      createdDefinitionIds.length = 0;
    }
  });

  describe('createDefinition', () => {
    it('creates a definition with required fields', async () => {
      const mutation = `
        mutation CreateDefinition($input: CreateDefinitionInput!) {
          createDefinition(input: $input) {
            id
            name
            content
            parentId
            createdAt
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({
          query: mutation,
          variables: {
            input: {
              name: 'Test Definition',
              content: { preamble: 'Test preamble', template: 'Test template' },
            },
          },
        });

      if (response.status !== 200 || response.body.errors) {
        console.log('Response:', JSON.stringify(response.body, null, 2));
      }
      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const definition = response.body.data.createDefinition;
      createdDefinitionIds.push(definition.id);

      expect(definition.name).toBe('Test Definition');
      expect(definition.content.preamble).toBe('Test preamble');
      expect(definition.parentId).toBeNull();
      expect(definition.createdAt).toBeDefined();
    });

    it('automatically adds schema_version to content', async () => {
      const mutation = `
        mutation CreateDefinition($input: CreateDefinitionInput!) {
          createDefinition(input: $input) {
            id
            name
            content
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({
          query: mutation,
          variables: {
            input: {
              name: 'Auto Schema Version Test',
              content: { preamble: 'Test' },
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();

      const definition = response.body.data.createDefinition;
      createdDefinitionIds.push(definition.id);

      // Should have schema_version = 1 auto-added
      expect(definition.content.schema_version).toBe(1);
      expect(definition.content.preamble).toBe('Test');
    });

    it('preserves existing schema_version in content', async () => {
      const mutation = `
        mutation CreateDefinition($input: CreateDefinitionInput!) {
          createDefinition(input: $input) {
            id
            content
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({
          query: mutation,
          variables: {
            input: {
              name: 'Existing Schema Version Test',
              content: { schema_version: 2, preamble: 'Test' },
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();

      const definition = response.body.data.createDefinition;
      createdDefinitionIds.push(definition.id);

      // Should preserve the provided schema_version
      expect(definition.content.schema_version).toBe(2);
    });

    it('creates a definition with parentId', async () => {
      // First create a parent
      const parent = await db.definition.create({
        data: {
          name: 'Parent Definition',
          content: { schema_version: 1, preamble: 'Parent' },
        },
      });
      createdDefinitionIds.push(parent.id);

      const mutation = `
        mutation CreateDefinition($input: CreateDefinitionInput!) {
          createDefinition(input: $input) {
            id
            name
            parentId
            parent {
              id
              name
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({
          query: mutation,
          variables: {
            input: {
              name: 'Child Definition',
              content: { preamble: 'Child' },
              parentId: parent.id,
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();

      const definition = response.body.data.createDefinition;
      createdDefinitionIds.push(definition.id);

      expect(definition.parentId).toBe(parent.id);
      expect(definition.parent.id).toBe(parent.id);
      expect(definition.parent.name).toBe('Parent Definition');
    });

    it('returns error for invalid parentId', async () => {
      const mutation = `
        mutation CreateDefinition($input: CreateDefinitionInput!) {
          createDefinition(input: $input) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({
          query: mutation,
          variables: {
            input: {
              name: 'Invalid Parent Test',
              content: { preamble: 'Test' },
              parentId: 'nonexistent-parent-id',
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('Parent definition not found');
    });

    it('returns error for empty name', async () => {
      const mutation = `
        mutation CreateDefinition($input: CreateDefinitionInput!) {
          createDefinition(input: $input) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({
          query: mutation,
          variables: {
            input: {
              name: '',
              content: { preamble: 'Test' },
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('Name is required');
    });

    it('returns error for non-object content', async () => {
      const mutation = `
        mutation CreateDefinition($input: CreateDefinitionInput!) {
          createDefinition(input: $input) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({
          query: mutation,
          variables: {
            input: {
              name: 'Invalid Content Test',
              content: 'not an object',
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('Content must be');
    });

    it('returns error for array content', async () => {
      const mutation = `
        mutation CreateDefinition($input: CreateDefinitionInput!) {
          createDefinition(input: $input) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .send({
          query: mutation,
          variables: {
            input: {
              name: 'Array Content Test',
              content: ['not', 'an', 'object'],
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('Content must be');
    });
  });
});

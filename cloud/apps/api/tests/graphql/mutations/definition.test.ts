import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import { getAuthHeader } from '../../test-utils.js';

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
        .set('Authorization', getAuthHeader())
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
        .set('Authorization', getAuthHeader())
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

      // Should have schema_version = 2 auto-added (current version)
      expect(definition.content.schema_version).toBe(2);
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
        .set('Authorization', getAuthHeader())
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
        .set('Authorization', getAuthHeader())
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
        .set('Authorization', getAuthHeader())
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
        .set('Authorization', getAuthHeader())
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
        .set('Authorization', getAuthHeader())
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
        .set('Authorization', getAuthHeader())
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

  describe('forkDefinition', () => {
    it('forks a definition with inherited content', async () => {
      // Create parent
      const parent = await db.definition.create({
        data: {
          name: 'Parent to Fork',
          content: { schema_version: 1, preamble: 'Parent preamble', template: 'Parent template' },
        },
      });
      createdDefinitionIds.push(parent.id);

      const mutation = `
        mutation ForkDefinition($input: ForkDefinitionInput!) {
          forkDefinition(input: $input) {
            id
            name
            content
            resolvedContent
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
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: {
            input: {
              parentId: parent.id,
              name: 'Forked Definition',
            },
          },
        });

      if (response.status !== 200 || response.body.errors) {
        console.log('Response:', JSON.stringify(response.body, null, 2));
      }
      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const fork = response.body.data.forkDefinition;
      createdDefinitionIds.push(fork.id);

      expect(fork.name).toBe('Forked Definition');
      expect(fork.parentId).toBe(parent.id);
      expect(fork.parent.id).toBe(parent.id);
      // Raw content is sparse (inherits from parent via resolvedContent)
      expect(fork.content.schema_version).toBe(2); // v2 sparse content
      // resolvedContent shows inherited values
      expect(fork.resolvedContent.preamble).toBe('Parent preamble');
      expect(fork.resolvedContent.template).toBe('Parent template');
    });

    it('forks with custom content override', async () => {
      // Create parent
      const parent = await db.definition.create({
        data: {
          name: 'Parent for Override',
          content: { schema_version: 1, preamble: 'Original', template: 'Original template' },
        },
      });
      createdDefinitionIds.push(parent.id);

      const mutation = `
        mutation ForkDefinition($input: ForkDefinitionInput!) {
          forkDefinition(input: $input) {
            id
            name
            content
            resolvedContent
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: {
            input: {
              parentId: parent.id,
              name: 'Fork with Override',
              content: { preamble: 'New preamble' },
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();

      const fork = response.body.data.forkDefinition;
      createdDefinitionIds.push(fork.id);

      // Preamble is no longer stored in content (deprecated), so fork content is minimal v2
      expect(fork.content.schema_version).toBe(2); // v2 sparse content
      expect(fork.content.preamble).toBeUndefined(); // Preamble not passed through
      expect(fork.content.template).toBeUndefined(); // Not in local content

      // resolvedContent shows inherited values from parent
      expect(fork.resolvedContent.template).toBe('Original template'); // Inherited from parent
    });

    it('returns error for non-existent parent', async () => {
      const mutation = `
        mutation ForkDefinition($input: ForkDefinitionInput!) {
          forkDefinition(input: $input) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: {
            input: {
              parentId: 'nonexistent-parent-id',
              name: 'Orphan Fork',
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('Parent definition not found');
    });

    it('fork appears in parent.children query', async () => {
      // Create parent
      const parent = await db.definition.create({
        data: {
          name: 'Parent for Children Test',
          content: { schema_version: 1, preamble: 'Parent' },
        },
      });
      createdDefinitionIds.push(parent.id);

      // Fork it
      const forkMutation = `
        mutation ForkDefinition($input: ForkDefinitionInput!) {
          forkDefinition(input: $input) {
            id
            name
          }
        }
      `;

      const forkResponse = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: forkMutation,
          variables: {
            input: {
              parentId: parent.id,
              name: 'Child Fork',
            },
          },
        })
        .expect(200);

      expect(forkResponse.body.errors).toBeUndefined();
      const fork = forkResponse.body.data.forkDefinition;
      createdDefinitionIds.push(fork.id);

      // Query parent and check children
      const childrenQuery = `
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
        .set('Authorization', getAuthHeader())
        .send({ query: childrenQuery, variables: { id: parent.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definition.children).toContainEqual({
        id: fork.id,
        name: 'Child Fork',
      });
    });

    it('returns error for empty fork name', async () => {
      // Create parent
      const parent = await db.definition.create({
        data: {
          name: 'Parent for Name Test',
          content: { schema_version: 1, preamble: 'Parent' },
        },
      });
      createdDefinitionIds.push(parent.id);

      const mutation = `
        mutation ForkDefinition($input: ForkDefinitionInput!) {
          forkDefinition(input: $input) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: {
            input: {
              parentId: parent.id,
              name: '',
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('Name is required');
    });
  });
});

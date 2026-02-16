import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import { getAuthHeader } from '../../test-utils.js';

const app = createServer();

describe('GraphQL Definition Mutations', () => {
  const createdDefinitionIds: string[] = [];
  const createdPreambleIds: string[] = [];

  afterEach(async () => {
    // Clean up created definitions
    if (createdDefinitionIds.length > 0) {
      await db.definition.deleteMany({
        where: { id: { in: createdDefinitionIds } },
      });
      createdDefinitionIds.length = 0;
    }

    if (createdPreambleIds.length > 0) {
      await db.preamble.deleteMany({
        where: { id: { in: createdPreambleIds } },
      });
      createdPreambleIds.length = 0;
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

  describe('updateDefinition', () => {
    it('does not increment version when only name changes', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Original Name',
          content: { schema_version: 1, preamble: 'Preamble', template: 'Template' },
          version: 1,
        },
      });
      createdDefinitionIds.push(definition.id);

      const mutation = `
        mutation UpdateDefinition($id: String!, $input: UpdateDefinitionInput!) {
          updateDefinition(id: $id, input: $input) {
            id
            name
            version
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: {
            id: definition.id,
            input: {
              name: 'Renamed Definition',
              content: { schema_version: 1, preamble: 'Preamble', template: 'Template' },
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.updateDefinition.name).toBe('Renamed Definition');
      expect(response.body.data.updateDefinition.version).toBe(1);
    });

    it('increments version when content changes', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Content Update Definition',
          content: { schema_version: 1, preamble: 'Preamble', template: 'Template' },
          version: 1,
        },
      });
      createdDefinitionIds.push(definition.id);

      const mutation = `
        mutation UpdateDefinition($id: String!, $input: UpdateDefinitionInput!) {
          updateDefinition(id: $id, input: $input) {
            id
            name
            version
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
            id: definition.id,
            input: {
              name: 'Content Update Definition',
              content: { schema_version: 1, preamble: 'Preamble', template: 'Updated Template' },
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.updateDefinition.version).toBe(2);
      expect(response.body.data.updateDefinition.content.template).toBe('Updated Template');
    });

    it('increments version when both title and content change', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Original Title',
          content: { schema_version: 1, preamble: 'Preamble', template: 'Template' },
          version: 1,
        },
      });
      createdDefinitionIds.push(definition.id);

      const mutation = `
        mutation UpdateDefinition($id: String!, $input: UpdateDefinitionInput!) {
          updateDefinition(id: $id, input: $input) {
            id
            name
            version
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
            id: definition.id,
            input: {
              name: 'Renamed + Updated',
              content: { schema_version: 1, preamble: 'Preamble', template: 'Template v2' },
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.updateDefinition.name).toBe('Renamed + Updated');
      expect(response.body.data.updateDefinition.version).toBe(2);
      expect(response.body.data.updateDefinition.content.template).toBe('Template v2');
    });

    it('does not increment version when only JSON key order changes', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Key Order Definition',
          content: {
            schema_version: 1,
            template: 'Template',
            preamble: 'Preamble',
            dimensions: [{ name: 'A', levels: [1, 2, 3] }],
          },
          version: 1,
        },
      });
      createdDefinitionIds.push(definition.id);

      const mutation = `
        mutation UpdateDefinition($id: String!, $input: UpdateDefinitionInput!) {
          updateDefinition(id: $id, input: $input) {
            id
            version
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: {
            id: definition.id,
            input: {
              name: 'Key Order Definition',
              content: {
                dimensions: [{ levels: [1, 2, 3], name: 'A' }],
                preamble: 'Preamble',
                template: 'Template',
                schema_version: 1,
              },
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.updateDefinition.version).toBe(1);
    });

    it('does not increment version when only schema_version changes', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'Schema Version Definition',
          content: { schema_version: 1, preamble: 'Preamble', template: 'Template' },
          version: 1,
        },
      });
      createdDefinitionIds.push(definition.id);

      const mutation = `
        mutation UpdateDefinition($id: String!, $input: UpdateDefinitionInput!) {
          updateDefinition(id: $id, input: $input) {
            id
            version
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
            id: definition.id,
            input: {
              name: 'Schema Version Definition',
              content: { schema_version: 2, preamble: 'Preamble', template: 'Template' },
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.updateDefinition.version).toBe(1);
    });

    it('increments version when preamble version changes', async () => {
      const preamble = await db.preamble.create({
        data: {
          name: `Preamble-${Date.now()}`,
          versions: {
            create: [
              { version: 'v1', content: 'Preamble v1' },
              { version: 'v2', content: 'Preamble v2' },
            ],
          },
        },
        include: { versions: true },
      });
      createdPreambleIds.push(preamble.id);
      const preambleV1 = preamble.versions.find((v) => v.version === 'v1');
      const preambleV2 = preamble.versions.find((v) => v.version === 'v2');
      expect(preambleV1).toBeDefined();
      expect(preambleV2).toBeDefined();

      const definition = await db.definition.create({
        data: {
          name: 'Preamble Change Definition',
          content: { schema_version: 1, template: 'Template' },
          preambleVersionId: preambleV1?.id,
          version: 1,
        },
      });
      createdDefinitionIds.push(definition.id);

      const mutation = `
        mutation UpdateDefinition($id: String!, $input: UpdateDefinitionInput!) {
          updateDefinition(id: $id, input: $input) {
            id
            version
            preambleVersionId
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: {
            id: definition.id,
            input: {
              name: 'Preamble Change Definition',
              content: { schema_version: 1, template: 'Template' },
              preambleVersionId: preambleV2?.id,
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.updateDefinition.version).toBe(2);
      expect(response.body.data.updateDefinition.preambleVersionId).toBe(preambleV2?.id);
    });
  });
});

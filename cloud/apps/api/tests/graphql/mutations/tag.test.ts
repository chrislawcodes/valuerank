import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import { getAuthHeader } from '../../test-utils.js';

const app = createServer();

describe('GraphQL Tag Mutations', () => {
  const createdTagIds: string[] = [];
  const createdDefinitionIds: string[] = [];

  afterEach(async () => {
    // Clean up created definition-tag relations first
    if (createdDefinitionIds.length > 0 && createdTagIds.length > 0) {
      await db.definitionTag.deleteMany({
        where: {
          OR: [
            { definitionId: { in: createdDefinitionIds } },
            { tagId: { in: createdTagIds } },
          ],
        },
      });
    }

    // Clean up created tags
    if (createdTagIds.length > 0) {
      await db.tag.deleteMany({
        where: { id: { in: createdTagIds } },
      });
      createdTagIds.length = 0;
    }

    // Clean up created definitions
    if (createdDefinitionIds.length > 0) {
      await db.definition.deleteMany({
        where: { id: { in: createdDefinitionIds } },
      });
      createdDefinitionIds.length = 0;
    }
  });

  describe('createTag', () => {
    it('creates a tag with valid name', async () => {
      const mutation = `
        mutation CreateTag($name: String!) {
          createTag(name: $name) {
            id
            name
            createdAt
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: { name: 'test-tag' },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const tag = response.body.data.createTag;
      createdTagIds.push(tag.id);

      expect(tag.name).toBe('test-tag');
      expect(tag.createdAt).toBeDefined();
    });

    it('normalizes tag name to lowercase', async () => {
      const mutation = `
        mutation CreateTag($name: String!) {
          createTag(name: $name) {
            id
            name
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: { name: 'TEST-Tag-MIXED' },
        })
        .expect(200);

      const tag = response.body.data.createTag;
      createdTagIds.push(tag.id);

      expect(tag.name).toBe('test-tag-mixed');
    });

    it('rejects duplicate tag names', async () => {
      // Create first tag
      const tag = await db.tag.create({ data: { name: 'unique-tag' } });
      createdTagIds.push(tag.id);

      const mutation = `
        mutation CreateTag($name: String!) {
          createTag(name: $name) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: { name: 'unique-tag' },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('already exists');
    });

    it('rejects invalid tag names with special characters', async () => {
      const mutation = `
        mutation CreateTag($name: String!) {
          createTag(name: $name) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: { name: 'invalid!@#tag' },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('lowercase letters, numbers, hyphens, and underscores');
    });
  });

  describe('deleteTag', () => {
    it('deletes a tag', async () => {
      // Create tag
      const tag = await db.tag.create({ data: { name: 'to-delete' } });

      const mutation = `
        mutation DeleteTag($id: String!) {
          deleteTag(id: $id) {
            success
            affectedDefinitions
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: { id: tag.id },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.deleteTag.success).toBe(true);
      expect(response.body.data.deleteTag.affectedDefinitions).toBe(0);

      // Verify tag is deleted
      const deleted = await db.tag.findUnique({ where: { id: tag.id } });
      expect(deleted).toBeNull();
    });

    it('returns affected definitions count when deleting tag in use', async () => {
      // Create tag and definitions with unique names
      const uniqueId = `in-use-tag-${Date.now()}`;
      const tag = await db.tag.create({ data: { name: uniqueId } });
      const def1 = await db.definition.create({
        data: { name: 'Def 1', content: {} },
      });
      const def2 = await db.definition.create({
        data: { name: 'Def 2', content: {} },
      });

      createdDefinitionIds.push(def1.id, def2.id);

      // Assign tag to both definitions
      await db.definitionTag.createMany({
        data: [
          { definitionId: def1.id, tagId: tag.id },
          { definitionId: def2.id, tagId: tag.id },
        ],
      });

      const mutation = `
        mutation DeleteTag($id: String!) {
          deleteTag(id: $id) {
            success
            affectedDefinitions
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: { id: tag.id },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.deleteTag.success).toBe(true);
      expect(response.body.data.deleteTag.affectedDefinitions).toBe(2);
    });

    it('returns error for non-existent tag', async () => {
      const mutation = `
        mutation DeleteTag($id: String!) {
          deleteTag(id: $id) {
            success
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: { id: 'nonexistent-tag-id' },
        })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('Tag not found');
    });
  });

  describe('addTagToDefinition', () => {
    it('adds a tag to a definition', async () => {
      const tag = await db.tag.create({ data: { name: 'add-test' } });
      createdTagIds.push(tag.id);

      const definition = await db.definition.create({
        data: { name: 'Tagged Definition', content: {} },
      });
      createdDefinitionIds.push(definition.id);

      const mutation = `
        mutation AddTagToDefinition($definitionId: String!, $tagId: String!) {
          addTagToDefinition(definitionId: $definitionId, tagId: $tagId) {
            id
            tags {
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
          variables: { definitionId: definition.id, tagId: tag.id },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.addTagToDefinition.tags).toContainEqual({
        id: tag.id,
        name: 'add-test',
      });
    });

    it('is idempotent when adding same tag twice', async () => {
      const tag = await db.tag.create({ data: { name: 'idempotent-test' } });
      createdTagIds.push(tag.id);

      const definition = await db.definition.create({
        data: { name: 'Idempotent Test', content: {} },
      });
      createdDefinitionIds.push(definition.id);

      // First add
      await db.definitionTag.create({
        data: { definitionId: definition.id, tagId: tag.id },
      });

      const mutation = `
        mutation AddTagToDefinition($definitionId: String!, $tagId: String!) {
          addTagToDefinition(definitionId: $definitionId, tagId: $tagId) {
            id
            tags {
              id
            }
          }
        }
      `;

      // Second add should succeed without error
      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: { definitionId: definition.id, tagId: tag.id },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      // Should still only have one tag
      expect(response.body.data.addTagToDefinition.tags).toHaveLength(1);
    });
  });

  describe('createAndAssignTag', () => {
    it('creates and assigns a new tag in one operation', async () => {
      const definition = await db.definition.create({
        data: { name: 'New Tag Definition', content: {} },
      });
      createdDefinitionIds.push(definition.id);

      const mutation = `
        mutation CreateAndAssignTag($definitionId: String!, $tagName: String!) {
          createAndAssignTag(definitionId: $definitionId, tagName: $tagName) {
            id
            tags {
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
          variables: { definitionId: definition.id, tagName: 'brand-new-tag' },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const tags = response.body.data.createAndAssignTag.tags;
      expect(tags).toHaveLength(1);
      expect(tags[0].name).toBe('brand-new-tag');

      // Track the created tag for cleanup
      createdTagIds.push(tags[0].id);
    });

    it('uses existing tag if name already exists', async () => {
      const existingTag = await db.tag.create({ data: { name: 'existing-tag' } });
      createdTagIds.push(existingTag.id);

      const definition = await db.definition.create({
        data: { name: 'Existing Tag Definition', content: {} },
      });
      createdDefinitionIds.push(definition.id);

      const mutation = `
        mutation CreateAndAssignTag($definitionId: String!, $tagName: String!) {
          createAndAssignTag(definitionId: $definitionId, tagName: $tagName) {
            id
            tags {
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
          variables: { definitionId: definition.id, tagName: 'existing-tag' },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const tags = response.body.data.createAndAssignTag.tags;
      expect(tags).toHaveLength(1);
      expect(tags[0].id).toBe(existingTag.id);
    });
  });
});

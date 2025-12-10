/**
 * Tests for audit fields (createdBy, deletedBy) on GraphQL types
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import type { Definition, Run, User, Tag, Scenario } from '@valuerank/db';
import { getAuthHeader, TEST_USER } from '../../test-utils.js';

const app = createServer();

describe('Audit Fields on GraphQL Types', () => {
  let testUser: User;
  let testDefinition: Definition;
  let testScenario: Scenario;
  let testRun: Run;
  let testTag: Tag;

  beforeAll(async () => {
    // Create or find the test user
    testUser = await db.user.upsert({
      where: { id: TEST_USER.id },
      create: {
        id: TEST_USER.id,
        email: TEST_USER.email,
        passwordHash: 'test-hash',
      },
      update: {},
    });

    // Create test definition with createdByUserId
    testDefinition = await db.definition.create({
      data: {
        name: 'Audit Field Test Definition',
        content: { schema_version: 1, preamble: 'Test' },
        createdByUserId: testUser.id,
      },
    });

    // Create test scenario
    testScenario = await db.scenario.create({
      data: {
        definitionId: testDefinition.id,
        name: 'Test Scenario',
        content: { dilemma: 'Test content' },
      },
    });

    // Create test run with createdByUserId
    testRun = await db.run.create({
      data: {
        definitionId: testDefinition.id,
        status: 'COMPLETED',
        config: { models: ['gpt-4'] },
        createdByUserId: testUser.id,
      },
    });

    // Create test tag with createdByUserId
    testTag = await db.tag.create({
      data: {
        name: `audit-test-${Date.now()}`,
        createdByUserId: testUser.id,
      },
    });
  });

  afterAll(async () => {
    await db.tag.deleteMany({ where: { id: testTag.id } });
    await db.run.deleteMany({ where: { id: testRun.id } });
    await db.scenario.deleteMany({ where: { id: testScenario.id } });
    await db.definition.deleteMany({ where: { id: testDefinition.id } });
  });

  describe('Definition.createdBy', () => {
    it('resolves createdBy user when createdByUserId is set', async () => {
      const query = `
        query GetDefinition($id: ID!) {
          definition(id: $id) {
            id
            name
            createdBy {
              id
              email
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: testDefinition.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definition.createdBy).toMatchObject({
        id: testUser.id,
        email: testUser.email,
      });
    });

    it('returns null createdBy when createdByUserId is null', async () => {
      // Create a definition without createdByUserId
      const defWithoutCreator = await db.definition.create({
        data: {
          name: 'No Creator Definition',
          content: { schema_version: 1 },
        },
      });

      try {
        const query = `
          query GetDefinition($id: ID!) {
            definition(id: $id) {
              id
              createdBy {
                id
              }
            }
          }
        `;

        const response = await request(app)
          .post('/graphql')
          .set('Authorization', getAuthHeader())
          .send({ query, variables: { id: defWithoutCreator.id } })
          .expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.definition.createdBy).toBeNull();
      } finally {
        await db.definition.delete({ where: { id: defWithoutCreator.id } });
      }
    });
  });

  describe('Run.createdBy', () => {
    it('resolves createdBy user when createdByUserId is set', async () => {
      const query = `
        query GetRun($id: ID!) {
          run(id: $id) {
            id
            status
            createdBy {
              id
              email
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: testRun.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run.createdBy).toMatchObject({
        id: testUser.id,
        email: testUser.email,
      });
    });

    it('returns null createdBy when createdByUserId is null', async () => {
      // Create a run without createdByUserId
      const runWithoutCreator = await db.run.create({
        data: {
          definitionId: testDefinition.id,
          status: 'PENDING',
          config: { models: ['gpt-4'] },
        },
      });

      try {
        const query = `
          query GetRun($id: ID!) {
            run(id: $id) {
              id
              createdBy {
                id
              }
            }
          }
        `;

        const response = await request(app)
          .post('/graphql')
          .set('Authorization', getAuthHeader())
          .send({ query, variables: { id: runWithoutCreator.id } })
          .expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.run.createdBy).toBeNull();
      } finally {
        await db.run.delete({ where: { id: runWithoutCreator.id } });
      }
    });
  });

  describe('Tag.createdBy', () => {
    it('resolves createdBy user when createdByUserId is set', async () => {
      const query = `
        query ListTags {
          tags {
            id
            name
            createdBy {
              id
              email
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query })
        .expect(200);

      expect(response.body.errors).toBeUndefined();

      const tag = response.body.data.tags.find((t: { id: string }) => t.id === testTag.id);
      expect(tag).toBeDefined();
      expect(tag.createdBy).toMatchObject({
        id: testUser.id,
        email: testUser.email,
      });
    });
  });

  describe('Mutations set createdByUserId', () => {
    it('createDefinition sets createdByUserId from context', async () => {
      const mutation = `
        mutation CreateDef($input: CreateDefinitionInput!) {
          createDefinition(input: $input) {
            id
            name
            createdBy {
              id
              email
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
              name: 'Mutation Test Definition',
              content: { preamble: 'Test', template: 'Test', dimensions: [] },
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.createDefinition.createdBy).toMatchObject({
        id: TEST_USER.id,
        email: TEST_USER.email,
      });

      // Cleanup
      await db.definition.delete({
        where: { id: response.body.data.createDefinition.id },
      });
    });

    it('forkDefinition sets createdByUserId from context', async () => {
      const mutation = `
        mutation ForkDef($input: ForkDefinitionInput!) {
          forkDefinition(input: $input) {
            id
            name
            createdBy {
              id
              email
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
              parentId: testDefinition.id,
              name: 'Forked Definition',
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.forkDefinition.createdBy).toMatchObject({
        id: TEST_USER.id,
        email: TEST_USER.email,
      });

      // Cleanup
      await db.definition.delete({
        where: { id: response.body.data.forkDefinition.id },
      });
    });

    it('createTag sets createdByUserId from context', async () => {
      const tagName = `test-tag-${Date.now()}`;
      const mutation = `
        mutation CreateTag($name: String!) {
          createTag(name: $name) {
            id
            name
            createdBy {
              id
              email
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: { name: tagName },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.createTag.createdBy).toMatchObject({
        id: TEST_USER.id,
        email: TEST_USER.email,
      });

      // Cleanup
      await db.tag.delete({
        where: { id: response.body.data.createTag.id },
      });
    });
  });

  describe('deletedBy field', () => {
    it('deleteDefinition sets deletedByUserId and is queryable with includeDeleted', async () => {
      // Create a definition to delete
      const defToDelete = await db.definition.create({
        data: {
          name: 'Definition to delete',
          content: { schema_version: 1, preamble: 'Test' },
          createdByUserId: testUser.id,
        },
      });

      // Delete it via mutation
      const deleteMutation = `
        mutation DeleteDef($id: String!) {
          deleteDefinition(id: $id) {
            deletedIds
            count
          }
        }
      `;

      const deleteResponse = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query: deleteMutation, variables: { id: defToDelete.id } })
        .expect(200);

      expect(deleteResponse.body.errors).toBeUndefined();
      expect(deleteResponse.body.data.deleteDefinition.deletedIds).toContain(defToDelete.id);

      // Query with includeDeleted to see deletedBy
      const query = `
        query GetDeletedDefinition($id: ID!) {
          definition(id: $id, includeDeleted: true) {
            id
            deletedBy {
              id
              email
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: defToDelete.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definition).not.toBeNull();
      expect(response.body.data.definition.deletedBy).toMatchObject({
        id: TEST_USER.id,
        email: TEST_USER.email,
      });

      // Cleanup (hard delete for test purposes)
      await db.definition.delete({ where: { id: defToDelete.id } });
    });

    it('deleteRun sets deletedByUserId and is queryable with includeDeleted', async () => {
      // Create a run to delete
      const runToDelete = await db.run.create({
        data: {
          definitionId: testDefinition.id,
          status: 'COMPLETED',
          config: { models: ['gpt-4'] },
          createdByUserId: testUser.id,
        },
      });

      // Delete it via mutation
      const deleteMutation = `
        mutation DeleteRun($runId: ID!) {
          deleteRun(runId: $runId)
        }
      `;

      const deleteResponse = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query: deleteMutation, variables: { runId: runToDelete.id } })
        .expect(200);

      expect(deleteResponse.body.errors).toBeUndefined();
      expect(deleteResponse.body.data.deleteRun).toBe(true);

      // Query with includeDeleted to see deletedBy
      const query = `
        query GetDeletedRun($id: ID!) {
          run(id: $id, includeDeleted: true) {
            id
            deletedBy {
              id
              email
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: runToDelete.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.run).not.toBeNull();
      expect(response.body.data.run.deletedBy).toMatchObject({
        id: TEST_USER.id,
        email: TEST_USER.email,
      });

      // Cleanup (hard delete for test purposes)
      await db.run.delete({ where: { id: runToDelete.id } });
    });

    it('definition query without includeDeleted hides deleted definitions', async () => {
      // Create and soft-delete a definition
      const defToHide = await db.definition.create({
        data: {
          name: 'Hidden Definition',
          content: { schema_version: 1 },
          deletedAt: new Date(),
          deletedByUserId: testUser.id,
        },
      });

      try {
        const query = `
          query GetDefinition($id: ID!) {
            definition(id: $id) {
              id
            }
          }
        `;

        const response = await request(app)
          .post('/graphql')
          .set('Authorization', getAuthHeader())
          .send({ query, variables: { id: defToHide.id } })
          .expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.definition).toBeNull();
      } finally {
        await db.definition.delete({ where: { id: defToHide.id } });
      }
    });
  });
});

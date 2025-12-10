/**
 * Tests for audit logging functionality.
 *
 * Verifies that mutations create audit log entries correctly.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import type { User, Definition, Tag } from '@valuerank/db';
import { getAuthHeader, TEST_USER } from '../../test-utils.js';

const app = createServer();

describe('Audit Logging', () => {
  let testUser: User;
  let testDefinition: Definition;

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

    // Create test definition for some tests
    testDefinition = await db.definition.create({
      data: {
        name: 'Audit Test Definition',
        content: { schema_version: 1, preamble: 'Test' },
        createdByUserId: testUser.id,
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await db.auditLog.deleteMany({
      where: { userId: testUser.id },
    });
    await db.definition.deleteMany({ where: { id: testDefinition.id } });
  });

  beforeEach(async () => {
    // Clean audit logs before each test
    await db.auditLog.deleteMany({
      where: { userId: testUser.id },
    });
  });

  describe('createAuditLog function', () => {
    it('creates audit log entry with all required fields', async () => {
      const mutation = `
        mutation CreateDef($input: CreateDefinitionInput!) {
          createDefinition(input: $input) {
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
          variables: {
            input: {
              name: 'Audit Log Test Definition',
              content: { preamble: 'Test', template: 'Test', dimensions: [] },
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const createdDefId = response.body.data.createDefinition.id;

      // Wait a bit for async audit log to be written
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify audit log was created
      const auditLog = await db.auditLog.findFirst({
        where: {
          entityId: createdDefId,
          entityType: 'Definition',
          action: 'CREATE',
        },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.userId).toBe(testUser.id);
      expect(auditLog?.entityType).toBe('Definition');
      expect(auditLog?.action).toBe('CREATE');
      expect(auditLog?.metadata).toMatchObject({
        name: 'Audit Log Test Definition',
      });

      // Cleanup
      await db.auditLog.deleteMany({ where: { entityId: createdDefId } });
      await db.definition.delete({ where: { id: createdDefId } });
    });
  });

  describe('Definition mutations create audit logs', () => {
    it('forkDefinition creates audit log', async () => {
      const mutation = `
        mutation ForkDef($input: ForkDefinitionInput!) {
          forkDefinition(input: $input) {
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
          variables: {
            input: {
              parentId: testDefinition.id,
              name: 'Forked for Audit Test',
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const forkedDefId = response.body.data.forkDefinition.id;

      // Wait for async audit log
      await new Promise((resolve) => setTimeout(resolve, 100));

      const auditLog = await db.auditLog.findFirst({
        where: {
          entityId: forkedDefId,
          entityType: 'Definition',
          action: 'CREATE',
        },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.metadata).toMatchObject({
        parentId: testDefinition.id,
      });

      // Cleanup
      await db.auditLog.deleteMany({ where: { entityId: forkedDefId } });
      await db.definition.delete({ where: { id: forkedDefId } });
    });

    it('deleteDefinition creates audit log', async () => {
      // Create a definition to delete
      const defToDelete = await db.definition.create({
        data: {
          name: 'Definition to Delete for Audit',
          content: { schema_version: 1 },
          createdByUserId: testUser.id,
        },
      });

      const mutation = `
        mutation DeleteDef($id: String!) {
          deleteDefinition(id: $id) {
            deletedIds
            count
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query: mutation, variables: { id: defToDelete.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();

      // Wait for async audit log
      await new Promise((resolve) => setTimeout(resolve, 100));

      const auditLog = await db.auditLog.findFirst({
        where: {
          entityId: defToDelete.id,
          entityType: 'Definition',
          action: 'DELETE',
        },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.userId).toBe(testUser.id);

      // Cleanup
      await db.auditLog.deleteMany({ where: { entityId: defToDelete.id } });
      await db.definition.delete({ where: { id: defToDelete.id } });
    });
  });

  describe('Tag mutations create audit logs', () => {
    it('createTag creates audit log', async () => {
      const tagName = `audit-test-tag-${Date.now()}`;
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
        .send({ query: mutation, variables: { name: tagName } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const createdTagId = response.body.data.createTag.id;

      // Wait for async audit log
      await new Promise((resolve) => setTimeout(resolve, 100));

      const auditLog = await db.auditLog.findFirst({
        where: {
          entityId: createdTagId,
          entityType: 'Tag',
          action: 'CREATE',
        },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.metadata).toMatchObject({ name: tagName });

      // Cleanup
      await db.auditLog.deleteMany({ where: { entityId: createdTagId } });
      await db.tag.delete({ where: { id: createdTagId } });
    });

    it('deleteTag creates audit log', async () => {
      // Create a tag to delete
      const tagToDelete = await db.tag.create({
        data: { name: `tag-to-delete-${Date.now()}` },
      });

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
        .send({ query: mutation, variables: { id: tagToDelete.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();

      // Wait for async audit log
      await new Promise((resolve) => setTimeout(resolve, 100));

      const auditLog = await db.auditLog.findFirst({
        where: {
          entityId: tagToDelete.id,
          entityType: 'Tag',
          action: 'DELETE',
        },
      });

      expect(auditLog).not.toBeNull();

      // Cleanup
      await db.auditLog.deleteMany({ where: { entityId: tagToDelete.id } });
    });
  });

  describe('DefinitionTag mutations create audit logs', () => {
    it('addTagToDefinition creates audit log', async () => {
      // Create a tag
      const tag = await db.tag.create({
        data: { name: `add-tag-test-${Date.now()}` },
      });

      const mutation = `
        mutation AddTag($definitionId: String!, $tagId: String!) {
          addTagToDefinition(definitionId: $definitionId, tagId: $tagId) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: { definitionId: testDefinition.id, tagId: tag.id },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();

      // Wait for async audit log
      await new Promise((resolve) => setTimeout(resolve, 100));

      const entityId = `${testDefinition.id}:${tag.id}`;
      const auditLog = await db.auditLog.findFirst({
        where: {
          entityId,
          entityType: 'DefinitionTag',
          action: 'CREATE',
        },
      });

      expect(auditLog).not.toBeNull();

      // Cleanup
      await db.auditLog.deleteMany({ where: { entityId } });
      await db.definitionTag.deleteMany({
        where: { definitionId: testDefinition.id, tagId: tag.id },
      });
      await db.tag.delete({ where: { id: tag.id } });
    });
  });

  describe('Audit log metadata is captured correctly', () => {
    it('updateDefinition captures updated fields in metadata', async () => {
      // Create a definition to update
      const def = await db.definition.create({
        data: {
          name: 'Definition to Update',
          content: { schema_version: 1 },
          createdByUserId: testUser.id,
        },
      });

      const mutation = `
        mutation UpdateDef($id: String!, $input: UpdateDefinitionInput!) {
          updateDefinition(id: $id, input: $input) {
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
          variables: {
            id: def.id,
            input: { name: 'Updated Name' },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();

      // Wait for async audit log
      await new Promise((resolve) => setTimeout(resolve, 100));

      const auditLog = await db.auditLog.findFirst({
        where: {
          entityId: def.id,
          entityType: 'Definition',
          action: 'UPDATE',
        },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.metadata).toMatchObject({
        updatedFields: ['name'],
      });

      // Cleanup
      await db.auditLog.deleteMany({ where: { entityId: def.id } });
      await db.definition.delete({ where: { id: def.id } });
    });
  });
});

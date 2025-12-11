/**
 * Tests for audit log queries.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import type { User, Definition, AuditLog } from '@valuerank/db';
import { getAuthHeader, TEST_USER } from '../../test-utils.js';

const app = createServer();

describe('Audit Log Queries', () => {
  let testUser: User;
  let testDefinition: Definition;
  let testAuditLogs: AuditLog[] = [];

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

    // Create test definition
    testDefinition = await db.definition.create({
      data: {
        name: 'Audit Log Query Test Definition',
        content: { schema_version: 1, preamble: 'Test' },
        createdByUserId: testUser.id,
      },
    });

    // Create some audit logs for testing
    for (let i = 0; i < 5; i++) {
      const log = await db.auditLog.create({
        data: {
          action: i % 2 === 0 ? 'CREATE' : 'UPDATE',
          entityType: 'Definition',
          entityId: testDefinition.id,
          userId: testUser.id,
          metadata: { index: i },
        },
      });
      testAuditLogs.push(log);
    }

    // Create logs for a different entity
    await db.auditLog.create({
      data: {
        action: 'CREATE',
        entityType: 'Run',
        entityId: 'test-run-id',
        userId: testUser.id,
        metadata: { test: true },
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

  describe('entityAuditHistory', () => {
    it('returns audit history for a specific entity', async () => {
      const query = `
        query EntityHistory($entityType: String!, $entityId: String!) {
          entityAuditHistory(entityType: $entityType, entityId: $entityId) {
            id
            action
            entityType
            entityId
            metadata
            user {
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
          query,
          variables: {
            entityType: 'Definition',
            entityId: testDefinition.id,
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const logs = response.body.data.entityAuditHistory;
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBe(5);

      // All logs should be for the test definition
      for (const log of logs) {
        expect(log.entityType).toBe('Definition');
        expect(log.entityId).toBe(testDefinition.id);
        expect(log.user?.id).toBe(testUser.id);
      }
    });

    it('respects the limit parameter', async () => {
      const query = `
        query EntityHistory($entityType: String!, $entityId: String!, $limit: Int) {
          entityAuditHistory(entityType: $entityType, entityId: $entityId, limit: $limit) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: {
            entityType: 'Definition',
            entityId: testDefinition.id,
            limit: 2,
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.entityAuditHistory.length).toBe(2);
    });

    it('returns empty array for non-existent entity', async () => {
      const query = `
        query EntityHistory($entityType: String!, $entityId: String!) {
          entityAuditHistory(entityType: $entityType, entityId: $entityId) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: {
            entityType: 'Definition',
            entityId: 'non-existent-id',
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.entityAuditHistory).toEqual([]);
    });
  });

  describe('auditLogs', () => {
    it('returns paginated audit logs', async () => {
      const query = `
        query AuditLogs($first: Int) {
          auditLogs(first: $first) {
            nodes {
              id
              action
              entityType
            }
            totalCount
            hasNextPage
            endCursor
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: { first: 3 },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const connection = response.body.data.auditLogs;
      expect(connection.nodes.length).toBeLessThanOrEqual(3);
      expect(typeof connection.totalCount).toBe('number');
      expect(typeof connection.hasNextPage).toBe('boolean');
    });

    it('filters by entityType', async () => {
      const query = `
        query AuditLogs($filter: AuditLogFilterInput) {
          auditLogs(filter: $filter) {
            nodes {
              id
              entityType
            }
            totalCount
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: {
            filter: { entityType: 'Definition' },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const nodes = response.body.data.auditLogs.nodes;
      for (const node of nodes) {
        expect(node.entityType).toBe('Definition');
      }
    });

    it('filters by action', async () => {
      const query = `
        query AuditLogs($filter: AuditLogFilterInput) {
          auditLogs(filter: $filter) {
            nodes {
              id
              action
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: {
            filter: { action: 'CREATE' },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const nodes = response.body.data.auditLogs.nodes;
      for (const node of nodes) {
        expect(node.action).toBe('CREATE');
      }
    });

    it('filters by userId', async () => {
      const query = `
        query AuditLogs($filter: AuditLogFilterInput) {
          auditLogs(filter: $filter) {
            nodes {
              id
              user {
                id
              }
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: {
            filter: { userId: testUser.id },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const nodes = response.body.data.auditLogs.nodes;
      for (const node of nodes) {
        expect(node.user?.id).toBe(testUser.id);
      }
    });

    it('filters by entityId', async () => {
      const query = `
        query AuditLogs($filter: AuditLogFilterInput) {
          auditLogs(filter: $filter) {
            nodes {
              id
              entityId
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: {
            filter: { entityId: testDefinition.id },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const nodes = response.body.data.auditLogs.nodes;
      for (const node of nodes) {
        expect(node.entityId).toBe(testDefinition.id);
      }
    });

    it('supports pagination with cursor', async () => {
      // Filter to only this test's entity to avoid pollution from other tests
      const firstQuery = `
        query AuditLogs($first: Int, $filter: AuditLogFilterInput) {
          auditLogs(first: $first, filter: $filter) {
            nodes {
              id
            }
            endCursor
            hasNextPage
          }
        }
      `;

      const firstResponse = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: firstQuery,
          variables: { first: 2, filter: { entityId: testDefinition.id } },
        })
        .expect(200);

      expect(firstResponse.body.errors).toBeUndefined();
      const firstPage = firstResponse.body.data.auditLogs;
      const cursor = firstPage.endCursor;

      // Get second page
      const secondQuery = `
        query AuditLogs($first: Int, $after: String, $filter: AuditLogFilterInput) {
          auditLogs(first: $first, after: $after, filter: $filter) {
            nodes {
              id
            }
          }
        }
      `;

      const secondResponse = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: secondQuery,
          variables: { first: 2, after: cursor, filter: { entityId: testDefinition.id } },
        })
        .expect(200);

      expect(secondResponse.body.errors).toBeUndefined();
      const secondPage = secondResponse.body.data.auditLogs;

      // Pages should have different items
      const firstIds = firstPage.nodes.map((n: { id: string }) => n.id);
      const secondIds = secondPage.nodes.map((n: { id: string }) => n.id);
      const overlap = firstIds.filter((id: string) => secondIds.includes(id));
      expect(overlap.length).toBe(0);
    });

    it('filters by date range', async () => {
      // Create logs with specific timestamps for testing
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      // Create a log that will be outside the range
      await db.auditLog.create({
        data: {
          action: 'CREATE',
          entityType: 'Definition',
          entityId: 'date-test-entity',
          userId: testUser.id,
          metadata: { test: 'old' },
          createdAt: twoHoursAgo,
        },
      });

      // Create a log that will be inside the range
      await db.auditLog.create({
        data: {
          action: 'UPDATE',
          entityType: 'Definition',
          entityId: 'date-test-entity',
          userId: testUser.id,
          metadata: { test: 'recent' },
          createdAt: now,
        },
      });

      const query = `
        query AuditLogs($filter: AuditLogFilterInput) {
          auditLogs(filter: $filter) {
            nodes {
              id
              entityId
              metadata
              createdAt
            }
            totalCount
          }
        }
      `;

      // Query for logs from 30 minutes ago to now
      const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);
      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: {
            filter: {
              entityId: 'date-test-entity',
              from: thirtyMinsAgo.toISOString(),
              to: now.toISOString(),
            },
          },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const nodes = response.body.data.auditLogs.nodes;

      // Should only include the recent log, not the 2-hour-old one
      expect(nodes.length).toBe(1);
      expect(nodes[0].metadata).toEqual({ test: 'recent' });

      // Cleanup date test logs
      await db.auditLog.deleteMany({
        where: { entityId: 'date-test-entity' },
      });
    });
  });
});

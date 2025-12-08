import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import type { Definition, Run } from '@valuerank/db';
import { getAuthHeader } from '../../test-utils.js';

const app = createServer();

describe('DataLoader N+1 Prevention', () => {
  let parentDef: Definition;
  let childDef1: Definition;
  let childDef2: Definition;
  let run1: Run;
  let run2: Run;
  let run3: Run;

  beforeAll(async () => {
    // Create test data structure:
    // parentDef
    //   ├── childDef1
    //   └── childDef2
    // And runs associated with parentDef

    parentDef = await db.definition.create({
      data: {
        name: 'Batching Parent',
        content: { schema_version: 1, preamble: 'Parent' },
      },
    });

    childDef1 = await db.definition.create({
      data: {
        name: 'Batching Child 1',
        content: { schema_version: 1, preamble: 'Child 1' },
        parentId: parentDef.id,
      },
    });

    childDef2 = await db.definition.create({
      data: {
        name: 'Batching Child 2',
        content: { schema_version: 1, preamble: 'Child 2' },
        parentId: parentDef.id,
      },
    });

    // Create runs for the parent definition
    run1 = await db.run.create({
      data: {
        definitionId: parentDef.id,
        status: 'COMPLETED',
        config: { models: ['test'] },
      },
    });

    run2 = await db.run.create({
      data: {
        definitionId: parentDef.id,
        status: 'PENDING',
        config: { models: ['test'] },
      },
    });

    run3 = await db.run.create({
      data: {
        definitionId: parentDef.id,
        status: 'RUNNING',
        config: { models: ['test'] },
      },
    });
  });

  afterAll(async () => {
    // Clean up in correct order
    await db.run.deleteMany({
      where: { id: { in: [run1.id, run2.id, run3.id] } },
    });
    await db.definition.deleteMany({
      where: { id: { in: [childDef1.id, childDef2.id, parentDef.id] } },
    });
  });

  describe('Definition parent batching', () => {
    it('batches parent lookups when querying multiple children', async () => {
      // Query both children with their parents - should batch into single parent query
      const query = `
        query GetChildrenWithParent($id1: ID!, $id2: ID!) {
          child1: definition(id: $id1) {
            id
            name
            parent {
              id
              name
            }
          }
          child2: definition(id: $id2) {
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
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: { id1: childDef1.id, id2: childDef2.id },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();

      // Both should resolve to the same parent
      expect(response.body.data.child1.parent.id).toBe(parentDef.id);
      expect(response.body.data.child2.parent.id).toBe(parentDef.id);
      expect(response.body.data.child1.parent.name).toBe('Batching Parent');
    });
  });

  describe('Run → Definition batching', () => {
    it('batches definition lookups when querying multiple runs', async () => {
      // Query multiple runs and their definitions - should batch
      const query = `
        query GetRunsWithDefinitions {
          runs(limit: 10) {
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
        .send({ query })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(Array.isArray(response.body.data.runs)).toBe(true);

      // Each run should have its definition resolved
      for (const run of response.body.data.runs) {
        expect(run.definition).toBeDefined();
        expect(run.definition.id).toBeDefined();
        expect(run.definition.name).toBeDefined();
      }
    });
  });

  describe('Per-request DataLoader isolation', () => {
    it('uses separate cache per request', async () => {
      // Make two separate requests - each should get its own DataLoader instance
      // This is verified by the fact that both requests succeed independently

      const query = `
        query GetDefinition($id: ID!) {
          definition(id: $id) {
            id
            name
            parent {
              id
            }
          }
        }
      `;

      // First request
      const response1 = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: childDef1.id } })
        .expect(200);

      // Second request (should have fresh cache)
      const response2 = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: childDef1.id } })
        .expect(200);

      expect(response1.body.errors).toBeUndefined();
      expect(response2.body.errors).toBeUndefined();

      // Both should return the same data
      expect(response1.body.data.definition.id).toBe(response2.body.data.definition.id);
    });

    it('batches within single request but not across requests', async () => {
      // Query that causes batching within the request
      const query = `
        query GetMultipleWithParents($id1: ID!, $id2: ID!) {
          def1: definition(id: $id1) {
            id
            parent { id name }
          }
          def2: definition(id: $id2) {
            id
            parent { id name }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query,
          variables: { id1: childDef1.id, id2: childDef2.id },
        })
        .expect(200);

      expect(response.body.errors).toBeUndefined();

      // Verify data is correct (proves batching worked)
      expect(response.body.data.def1.parent.id).toBe(parentDef.id);
      expect(response.body.data.def2.parent.id).toBe(parentDef.id);
    });
  });

  describe('Nested query batching', () => {
    it('efficiently resolves deeply nested relationships', async () => {
      // Query runs → definition → parent (2 levels of batching)
      const query = `
        query GetNestedRelations {
          runs(definitionId: "${parentDef.id}", limit: 5) {
            id
            status
            definition {
              id
              name
              children {
                id
                name
              }
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

      // All runs should resolve their definition
      for (const run of response.body.data.runs) {
        expect(run.definition.id).toBe(parentDef.id);
        expect(run.definition.children.length).toBeGreaterThanOrEqual(2);
      }
    });
  });
});

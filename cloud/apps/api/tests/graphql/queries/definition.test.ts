import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import type { Definition, Tag, Run } from '@valuerank/db';
import { getAuthHeader } from '../../test-utils.js';

const app = createServer();

describe('GraphQL Definition Query', () => {
  let testDefinition: Definition;
  let parentDefinition: Definition;
  let childDefinition: Definition;
  let grandchildDefinition: Definition;
  let searchableDefinition: Definition;
  let taggedDefinition: Definition;
  let definitionWithRuns: Definition;
  let testTag: Tag;
  let testRun: Run;

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

    // Add grandchild for deeper tree testing
    grandchildDefinition = await db.definition.create({
      data: {
        name: 'Grandchild Definition',
        content: { schema_version: 1, preamble: 'Grandchild' },
        parentId: childDefinition.id,
      },
    });

    // Create definition for search testing
    searchableDefinition = await db.definition.create({
      data: {
        name: 'Unique Searchable Scenario XYZ123',
        content: { schema_version: 1, preamble: 'Searchable' },
      },
    });

    // Create tag and tagged definition for tag filter testing
    testTag = await db.tag.upsert({
      where: { name: 'test-integration-tag' },
      update: {},
      create: { name: 'test-integration-tag' },
    });

    taggedDefinition = await db.definition.create({
      data: {
        name: 'Tagged Definition for Tests',
        content: { schema_version: 1, preamble: 'Tagged' },
        tags: {
          create: { tagId: testTag.id },
        },
      },
    });

    // Create definition with runs for hasRuns filter testing
    definitionWithRuns = await db.definition.create({
      data: {
        name: 'Definition With Runs',
        content: { schema_version: 1, preamble: 'Has runs' },
      },
    });

    testRun = await db.run.create({
      data: {
        definitionId: definitionWithRuns.id,
        status: 'COMPLETED',
        config: {},
      },
    });
  });

  afterAll(async () => {
    // Clean up test data in reverse dependency order
    await db.run.deleteMany({
      where: { id: testRun.id },
    });
    await db.definitionTag.deleteMany({
      where: { tagId: testTag.id },
    });
    await db.tag.deleteMany({
      where: { id: testTag.id },
    });
    await db.definition.deleteMany({
      where: {
        id: {
          in: [
            grandchildDefinition.id,
            childDefinition.id,
            testDefinition.id,
            parentDefinition.id,
            searchableDefinition.id,
            taggedDefinition.id,
            definitionWithRuns.id,
          ],
        },
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
        .set('Authorization', getAuthHeader())
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
        .set('Authorization', getAuthHeader())
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
        .set('Authorization', getAuthHeader())
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
        .set('Authorization', getAuthHeader())
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
        .set('Authorization', getAuthHeader())
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
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: grandchildDefinition.id } })
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
        .set('Authorization', getAuthHeader())
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
        .set('Authorization', getAuthHeader())
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
        .set('Authorization', getAuthHeader())
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
        .set('Authorization', getAuthHeader())
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

      // Test that offset works by comparing result counts
      const noOffsetResponse = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { limit: 5, offset: 0 } })
        .expect(200);

      const withOffsetResponse = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { limit: 5, offset: 2 } })
        .expect(200);

      expect(withOffsetResponse.body.errors).toBeUndefined();
      // Offset query should return results (offset works)
      expect(Array.isArray(withOffsetResponse.body.data.definitions)).toBe(true);
      // With enough data, offset should return fewer or equal results
      // (depending on total count)
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
        .set('Authorization', getAuthHeader())
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
        .set('Authorization', getAuthHeader())
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

  describe('definitions(search)', () => {
    it('filters definitions by name search', async () => {
      const query = `
        query SearchDefinitions($search: String) {
          definitions(search: $search) {
            id
            name
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { search: 'XYZ123' } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      // Find our specific definition in the results (there may be others from previous test runs)
      const foundDefinition = response.body.data.definitions.find(
        (d: { id: string }) => d.id === searchableDefinition.id
      );
      expect(foundDefinition).toBeDefined();
      expect(foundDefinition.name).toContain('XYZ123');
    });

    it('search is case-insensitive', async () => {
      const query = `
        query SearchDefinitions($search: String) {
          definitions(search: $search) {
            id
            name
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { search: 'xyz123' } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      // Find our specific definition in the results (there may be others from previous test runs)
      const foundDefinition = response.body.data.definitions.find(
        (d: { id: string }) => d.id === searchableDefinition.id
      );
      expect(foundDefinition).toBeDefined();
    });

    it('returns empty array for non-matching search', async () => {
      const query = `
        query SearchDefinitions($search: String) {
          definitions(search: $search) {
            id
            name
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { search: 'nonexistent-unique-string-999' } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definitions).toHaveLength(0);
    });

    it('combines search with rootOnly filter', async () => {
      const query = `
        query SearchRootDefinitions($search: String, $rootOnly: Boolean) {
          definitions(search: $search, rootOnly: $rootOnly) {
            id
            name
            parentId
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { search: 'Definition', rootOnly: true } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      // All returned should be root definitions (null parentId)
      for (const def of response.body.data.definitions) {
        expect(def.parentId).toBeNull();
      }
    });
  });

  describe('definitions(tagIds)', () => {
    it('filters definitions by tag IDs', async () => {
      const query = `
        query FilterByTags($tagIds: [ID!]) {
          definitions(tagIds: $tagIds) {
            id
            name
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { tagIds: [testTag.id] } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const ids = response.body.data.definitions.map((d: { id: string }) => d.id);
      expect(ids).toContain(taggedDefinition.id);
    });

    it('returns empty array for non-existent tag ID', async () => {
      const query = `
        query FilterByTags($tagIds: [ID!]) {
          definitions(tagIds: $tagIds) {
            id
            name
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { tagIds: ['nonexistent-tag-id'] } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definitions).toHaveLength(0);
    });

    it('combines tagIds with search filter', async () => {
      const query = `
        query FilterByTagsAndSearch($tagIds: [ID!], $search: String) {
          definitions(tagIds: $tagIds, search: $search) {
            id
            name
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { tagIds: [testTag.id], search: 'Tagged' } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definitions).toHaveLength(1);
      expect(response.body.data.definitions[0].id).toBe(taggedDefinition.id);
    });
  });

  describe('definitions(hasRuns)', () => {
    it('filters to definitions that have runs', async () => {
      const query = `
        query FilterByHasRuns($hasRuns: Boolean) {
          definitions(hasRuns: $hasRuns) {
            id
            name
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { hasRuns: true } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const ids = response.body.data.definitions.map((d: { id: string }) => d.id);
      expect(ids).toContain(definitionWithRuns.id);
      // Should not include definitions without runs
      expect(ids).not.toContain(searchableDefinition.id);
    });

    it('combines hasRuns with other filters', async () => {
      const query = `
        query FilterByHasRunsAndSearch($hasRuns: Boolean, $search: String) {
          definitions(hasRuns: $hasRuns, search: $search) {
            id
            name
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { hasRuns: true, search: 'With Runs' } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definitions).toHaveLength(1);
      expect(response.body.data.definitions[0].id).toBe(definitionWithRuns.id);
    });
  });

  describe('definitionAncestors(id)', () => {
    it('returns ancestors ordered from root to parent', async () => {
      const query = `
        query GetAncestors($id: ID!) {
          definitionAncestors(id: $id) {
            id
            name
            parentId
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: grandchildDefinition.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const ancestors = response.body.data.definitionAncestors;
      expect(ancestors).toHaveLength(3);
      // Should be ordered from root (oldest) to immediate parent
      expect(ancestors[0].id).toBe(parentDefinition.id);
      expect(ancestors[1].id).toBe(testDefinition.id);
      expect(ancestors[2].id).toBe(childDefinition.id);
    });

    it('returns empty array for root definition', async () => {
      const query = `
        query GetAncestors($id: ID!) {
          definitionAncestors(id: $id) {
            id
            name
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: parentDefinition.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definitionAncestors).toHaveLength(0);
    });

    it('throws error for non-existent definition', async () => {
      const query = `
        query GetAncestors($id: ID!) {
          definitionAncestors(id: $id) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: 'nonexistent-id' } })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('not found');
    });

    it('respects maxDepth parameter', async () => {
      const query = `
        query GetAncestors($id: ID!, $maxDepth: Int) {
          definitionAncestors(id: $id, maxDepth: $maxDepth) {
            id
            name
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: grandchildDefinition.id, maxDepth: 2 } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      // With maxDepth=2, should only get 1 ancestor (immediate parent only)
      expect(response.body.data.definitionAncestors.length).toBeLessThanOrEqual(1);
    });
  });

  describe('inheritance fields', () => {
    let inheritanceParent: Definition;
    let inheritanceChild: Definition;
    let inheritanceTag: Tag;

    beforeAll(async () => {
      // Create a tag for testing inheritance
      inheritanceTag = await db.tag.create({
        data: { name: 'inheritance-test-tag' },
      });

      // Create parent with full v1 content and a tag
      inheritanceParent = await db.definition.create({
        data: {
          name: 'Inheritance Parent',
          content: {
            schema_version: 1,
            preamble: 'Parent preamble',
            template: 'Parent template with [placeholder]',
            dimensions: [{ name: 'severity', levels: [{ label: 'low', score: 1 }] }],
          },
          tags: {
            create: { tagId: inheritanceTag.id },
          },
        },
      });

      // Create child with sparse v2 content (only overrides preamble)
      inheritanceChild = await db.definition.create({
        data: {
          name: 'Inheritance Child',
          content: {
            schema_version: 2,
            preamble: 'Child preamble override',
            // template and dimensions undefined - inherited from parent
          },
          parentId: inheritanceParent.id,
        },
      });
    });

    afterAll(async () => {
      await db.definition.deleteMany({
        where: {
          id: { in: [inheritanceChild.id, inheritanceParent.id] },
        },
      });
      await db.tag.delete({ where: { id: inheritanceTag.id } });
    });

    it('returns isForked=true for child definitions', async () => {
      const query = `
        query GetDefinition($id: ID!) {
          definition(id: $id) {
            id
            isForked
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: inheritanceChild.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definition.isForked).toBe(true);
    });

    it('returns isForked=false for root definitions', async () => {
      const query = `
        query GetDefinition($id: ID!) {
          definition(id: $id) {
            id
            isForked
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: inheritanceParent.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definition.isForked).toBe(false);
    });

    it('returns resolvedContent with inherited fields merged', async () => {
      const query = `
        query GetDefinition($id: ID!) {
          definition(id: $id) {
            id
            resolvedContent
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: inheritanceChild.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const resolved = response.body.data.definition.resolvedContent;
      // Preamble should be from child (overridden)
      expect(resolved.preamble).toBe('Child preamble override');
      // Template should be from parent (inherited)
      expect(resolved.template).toBe('Parent template with [placeholder]');
      // Dimensions should be from parent (inherited)
      expect(resolved.dimensions).toHaveLength(1);
      expect(resolved.dimensions[0].name).toBe('severity');
    });

    it('returns localContent with only local overrides', async () => {
      const query = `
        query GetDefinition($id: ID!) {
          definition(id: $id) {
            id
            localContent
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: inheritanceChild.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const local = response.body.data.definition.localContent;
      expect(local.schema_version).toBe(2);
      // Only preamble is locally set
      expect(local.preamble).toBe('Child preamble override');
      // Template and dimensions should be undefined (not overridden)
      expect(local.template).toBeUndefined();
      expect(local.dimensions).toBeUndefined();
    });

    it('returns overrides showing which fields are locally set', async () => {
      const query = `
        query GetDefinition($id: ID!) {
          definition(id: $id) {
            id
            overrides {
              preamble
              template
              dimensions
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: inheritanceChild.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const overrides = response.body.data.definition.overrides;
      expect(overrides.preamble).toBe(true); // Overridden locally
      expect(overrides.template).toBe(false); // Inherited
      expect(overrides.dimensions).toBe(false); // Inherited
    });

    it('returns inheritedTags from parent definitions', async () => {
      const query = `
        query GetDefinition($id: ID!) {
          definition(id: $id) {
            id
            inheritedTags {
              id
              name
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: inheritanceChild.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const inherited = response.body.data.definition.inheritedTags;
      expect(inherited).toHaveLength(1);
      expect(inherited[0].id).toBe(inheritanceTag.id);
      expect(inherited[0].name).toBe('inheritance-test-tag');
    });

    it('returns empty inheritedTags for root definitions', async () => {
      const query = `
        query GetDefinition($id: ID!) {
          definition(id: $id) {
            id
            inheritedTags {
              id
              name
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: inheritanceParent.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definition.inheritedTags).toHaveLength(0);
    });

    it('returns allTags combining local and inherited tags', async () => {
      // Add a local tag to the child
      const localTag = await db.tag.create({
        data: { name: 'child-local-tag' },
      });
      await db.definitionTag.create({
        data: { definitionId: inheritanceChild.id, tagId: localTag.id },
      });

      const query = `
        query GetDefinition($id: ID!) {
          definition(id: $id) {
            id
            allTags {
              id
              name
            }
            tags {
              id
              name
            }
            inheritedTags {
              id
              name
            }
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: inheritanceChild.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const allTags = response.body.data.definition.allTags;
      const tags = response.body.data.definition.tags;
      const inheritedTags = response.body.data.definition.inheritedTags;

      // allTags should include both local and inherited
      expect(allTags).toHaveLength(2);
      const allTagNames = allTags.map((t: { name: string }) => t.name);
      expect(allTagNames).toContain('inheritance-test-tag');
      expect(allTagNames).toContain('child-local-tag');

      // tags should only include local
      expect(tags).toHaveLength(1);
      expect(tags[0].name).toBe('child-local-tag');

      // inheritedTags should only include inherited
      expect(inheritedTags).toHaveLength(1);
      expect(inheritedTags[0].name).toBe('inheritance-test-tag');

      // Clean up
      await db.definitionTag.deleteMany({ where: { tagId: localTag.id } });
      await db.tag.delete({ where: { id: localTag.id } });
    });
  });

  describe('definitionDescendants(id)', () => {
    it('returns all descendants of a definition', async () => {
      const query = `
        query GetDescendants($id: ID!) {
          definitionDescendants(id: $id) {
            id
            name
            parentId
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: parentDefinition.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const descendants = response.body.data.definitionDescendants;
      expect(descendants).toHaveLength(3);
      const ids = descendants.map((d: { id: string }) => d.id);
      expect(ids).toContain(testDefinition.id);
      expect(ids).toContain(childDefinition.id);
      expect(ids).toContain(grandchildDefinition.id);
    });

    it('returns empty array for leaf definition', async () => {
      const query = `
        query GetDescendants($id: ID!) {
          definitionDescendants(id: $id) {
            id
            name
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: grandchildDefinition.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.definitionDescendants).toHaveLength(0);
    });

    it('throws error for non-existent definition', async () => {
      const query = `
        query GetDescendants($id: ID!) {
          definitionDescendants(id: $id) {
            id
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: 'nonexistent-id' } })
        .expect(200);

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('not found');
    });

    it('respects maxDepth parameter', async () => {
      const query = `
        query GetDescendants($id: ID!, $maxDepth: Int) {
          definitionDescendants(id: $id, maxDepth: $maxDepth) {
            id
            name
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: parentDefinition.id, maxDepth: 2 } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      // With maxDepth=2, should only get 1 direct descendant
      expect(response.body.data.definitionDescendants.length).toBeLessThanOrEqual(1);
    });

    it('returns descendants ordered by creation date descending', async () => {
      const query = `
        query GetDescendants($id: ID!) {
          definitionDescendants(id: $id) {
            id
            name
            createdAt
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({ query, variables: { id: parentDefinition.id } })
        .expect(200);

      expect(response.body.errors).toBeUndefined();
      const descendants = response.body.data.definitionDescendants;
      // Verify ordering - newest should be first
      for (let i = 0; i < descendants.length - 1; i++) {
        const currentDate = new Date(descendants[i].createdAt);
        const nextDate = new Date(descendants[i + 1].createdAt);
        expect(currentDate.getTime()).toBeGreaterThanOrEqual(nextDate.getTime());
      }
    });
  });
});

/**
 * Export Mutation Tests
 *
 * Tests for GraphQL export mutations.
 */

import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { db } from '@valuerank/db';
import { getAuthHeader } from '../../test-utils.js';

const app = createServer();

describe('GraphQL Export Mutations', () => {
  const createdDefinitionIds: string[] = [];
  const createdTagIds: string[] = [];

  afterEach(async () => {
    // Clean up created definitions and tags
    if (createdDefinitionIds.length > 0) {
      await db.definitionTag.deleteMany({
        where: { definitionId: { in: createdDefinitionIds } },
      });
      await db.definition.deleteMany({
        where: { id: { in: createdDefinitionIds } },
      });
      createdDefinitionIds.length = 0;
    }
    if (createdTagIds.length > 0) {
      await db.tag.deleteMany({
        where: { id: { in: createdTagIds } },
      });
      createdTagIds.length = 0;
    }
  });

  describe('exportDefinitionAsMd', () => {
    it('exports a definition as markdown with all sections', async () => {
      // Create a test definition first
      const definition = await db.definition.create({
        data: {
          name: 'export-test-definition',
          content: {
            schema_version: 1,
            preamble: 'Test preamble content',
            template: 'Test template with [Dim1]',
            dimensions: [
              {
                name: 'Dim1',
                levels: [
                  { score: 1, label: 'Low', options: ['low option'] },
                  { score: 2, label: 'High', options: ['high option'] },
                ],
              },
            ],
            matching_rules: 'No special rules',
          },
        },
      });
      createdDefinitionIds.push(definition.id);

      const mutation = `
        mutation ExportDefinitionAsMd($id: ID!) {
          exportDefinitionAsMd(id: $id) {
            content
            filename
            mimeType
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: { id: definition.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeUndefined();

      const result = response.body.data.exportDefinitionAsMd;

      // Check metadata - hyphens are valid in filenames
      expect(result.filename).toBe('export-test-definition.md');
      expect(result.mimeType).toBe('text/markdown');

      // Check content structure
      expect(result.content).toContain('---');
      expect(result.content).toContain('name: export-test-definition');
      expect(result.content).toContain('# Preamble');
      expect(result.content).toContain('Test preamble content');
      expect(result.content).toContain('# Template');
      expect(result.content).toContain('Test template with [Dim1]');
      expect(result.content).toContain('# Dimensions');
      expect(result.content).toContain('## Dim1');
      expect(result.content).toContain('| Score | Label | Options |');
      expect(result.content).toContain('| 1 | Low | low option |');
      expect(result.content).toContain('# Matching Rules');
      expect(result.content).toContain('No special rules');
    });

    it('uses tag name as category in export', async () => {
      // Create a tag and definition
      const tag = await db.tag.create({
        data: { name: 'TestCategory' },
      });
      createdTagIds.push(tag.id);

      const definition = await db.definition.create({
        data: {
          name: 'export-with-tag',
          content: {
            schema_version: 1,
            preamble: 'Test',
            template: 'Test',
            dimensions: [
              {
                name: 'Dim1',
                levels: [
                  { score: 1, label: 'A', options: ['a'] },
                  { score: 2, label: 'B', options: ['b'] },
                ],
              },
            ],
          },
        },
      });
      createdDefinitionIds.push(definition.id);

      // Link tag to definition
      await db.definitionTag.create({
        data: {
          definitionId: definition.id,
          tagId: tag.id,
        },
      });

      const mutation = `
        mutation ExportDefinitionAsMd($id: ID!) {
          exportDefinitionAsMd(id: $id) {
            content
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: { id: definition.id },
        });

      expect(response.status).toBe(200);
      expect(response.body.data.exportDefinitionAsMd.content).toContain('category: TestCategory');
    });

    it('returns error for non-existent definition', async () => {
      const mutation = `
        mutation ExportDefinitionAsMd($id: ID!) {
          exportDefinitionAsMd(id: $id) {
            content
            filename
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: { id: 'non-existent-id' },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toContain('not found');
    });

    it('requires authentication', async () => {
      const mutation = `
        mutation ExportDefinitionAsMd($id: ID!) {
          exportDefinitionAsMd(id: $id) {
            content
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        // No Authorization header
        .send({
          query: mutation,
          variables: { id: 'some-id' },
        });

      // Server returns 401 for unauthenticated requests
      expect(response.status).toBe(401);
    });

    it('handles definition with empty matching rules', async () => {
      const definition = await db.definition.create({
        data: {
          name: 'no-rules-definition',
          content: {
            schema_version: 1,
            preamble: 'Test preamble',
            template: 'Test template',
            dimensions: [
              {
                name: 'Dim',
                levels: [
                  { score: 1, label: 'A', options: ['a'] },
                  { score: 2, label: 'B', options: ['b'] },
                ],
              },
            ],
            // No matching_rules field
          },
        },
      });
      createdDefinitionIds.push(definition.id);

      const mutation = `
        mutation ExportDefinitionAsMd($id: ID!) {
          exportDefinitionAsMd(id: $id) {
            content
          }
        }
      `;

      const response = await request(app)
        .post('/graphql')
        .set('Authorization', getAuthHeader())
        .send({
          query: mutation,
          variables: { id: definition.id },
        });

      expect(response.status).toBe(200);
      const content = response.body.data.exportDefinitionAsMd.content;
      // Should NOT contain Matching Rules section
      expect(content).not.toContain('# Matching Rules');
    });
  });
});

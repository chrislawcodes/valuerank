/**
 * Integration tests for MD export endpoint
 *
 * Tests GET /api/export/definitions/:id/md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../src/server.js';
import { getAuthHeader } from '../test-utils.js';
import { db } from '@valuerank/db';

// Mock PgBoss
vi.mock('../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
  })),
  createBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
  startBoss: vi.fn().mockResolvedValue(undefined),
  stopBoss: vi.fn().mockResolvedValue(undefined),
  isBossRunning: vi.fn().mockReturnValue(false),
}));

const app = createServer();

describe('MD Export Endpoint', () => {
  let testDefinitionId: string | undefined;
  let testTagId: string | undefined;

  beforeEach(async () => {
    // Create a test definition with full content
    const definition = await db.definition.create({
      data: {
        name: 'test-export-definition',
        content: {
          schema_version: 1,
          preamble: 'Test preamble for MD export',
          template: 'Test template with [Dimension1]',
          dimensions: [
            {
              name: 'Dimension1',
              levels: [
                { score: 1, label: 'Low', options: ['low option'] },
                { score: 2, label: 'High', options: ['high option'] },
              ],
            },
          ],
          matching_rules: 'Test matching rules',
        },
      },
    });
    testDefinitionId = definition.id;
  });

  afterEach(async () => {
    // Clean up test data
    if (testTagId && testDefinitionId) {
      await db.definitionTag.deleteMany({
        where: { definitionId: testDefinitionId, tagId: testTagId },
      });
    }
    if (testDefinitionId) {
      await db.definition.delete({ where: { id: testDefinitionId } });
    }
    if (testTagId) {
      await db.tag.delete({ where: { id: testTagId } });
    }
    testDefinitionId = undefined;
    testTagId = undefined;
  });

  describe('GET /api/export/definitions/:id/md', () => {
    it('exports definition as markdown file', async () => {
      const response = await request(app)
        .get(`/api/export/definitions/${testDefinitionId}/md`)
        .set('Authorization', getAuthHeader());

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/markdown');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('.md');

      // Check markdown content structure
      const content = response.text;
      expect(content).toContain('---');
      expect(content).toContain('name: test-export-definition');
      expect(content).toContain('# Preamble');
      expect(content).toContain('Test preamble for MD export');
      expect(content).toContain('# Template');
      expect(content).toContain('Test template with [Dimension1]');
      expect(content).toContain('# Dimensions');
      expect(content).toContain('## Dimension1');
      expect(content).toContain('| Score | Label | Options |');
      expect(content).toContain('| 1 | Low | low option |');
      expect(content).toContain('| 2 | High | high option |');
      expect(content).toContain('# Matching Rules');
      expect(content).toContain('Test matching rules');
    });

    it('includes tag as category in frontmatter', async () => {
      // Create and link a tag
      const tag = await db.tag.create({
        data: { name: 'TestExportCategory' },
      });
      testTagId = tag.id;

      await db.definitionTag.create({
        data: {
          definitionId: testDefinitionId!,
          tagId: tag.id,
        },
      });

      const response = await request(app)
        .get(`/api/export/definitions/${testDefinitionId}/md`)
        .set('Authorization', getAuthHeader());

      expect(response.status).toBe(200);
      expect(response.text).toContain('category: TestExportCategory');
    });

    it('returns 401 without authentication', async () => {
      const response = await request(app)
        .get(`/api/export/definitions/${testDefinitionId}/md`);

      expect(response.status).toBe(401);
    });

    it('returns 404 for non-existent definition', async () => {
      const response = await request(app)
        .get('/api/export/definitions/non-existent-id/md')
        .set('Authorization', getAuthHeader());

      expect(response.status).toBe(404);
    });

    it('omits matching rules section when empty', async () => {
      // Update definition to remove matching_rules
      await db.definition.update({
        where: { id: testDefinitionId },
        data: {
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
            // No matching_rules
          },
        },
      });

      const response = await request(app)
        .get(`/api/export/definitions/${testDefinitionId}/md`)
        .set('Authorization', getAuthHeader());

      expect(response.status).toBe(200);
      expect(response.text).not.toContain('# Matching Rules');
    });

    it('sets correct Content-Disposition header with filename', async () => {
      const response = await request(app)
        .get(`/api/export/definitions/${testDefinitionId}/md`)
        .set('Authorization', getAuthHeader());

      expect(response.status).toBe(200);
      const disposition = response.headers['content-disposition'] as string;
      expect(disposition).toMatch(/attachment; filename=.*\.md/);
    });
  });
});

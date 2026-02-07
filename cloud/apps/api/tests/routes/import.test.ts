/**
 * Integration tests for Import endpoint
 *
 * Tests POST /api/import/definition
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../src/server.js';
import { getAuthHeader } from '../test-utils.js';
import { db } from '@valuerank/db';
import {
  VALID_MD_FULL,
  VALID_MD_NO_RULES,
  VALID_MD_NO_CATEGORY,
  INVALID_MD_NO_PREAMBLE,
  INVALID_MD_NO_FRONTMATTER,
} from '../services/import/fixtures.js';

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

describe('Import Endpoint', () => {
  const createdDefinitionIds: string[] = [];
  const createdTagIds: string[] = [];

  afterEach(async () => {
    // Clean up definitions and tags created during tests
    for (const id of createdDefinitionIds) {
      await db.definitionTag.deleteMany({ where: { definitionId: id } }).catch(() => {});
      await db.definition.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdTagIds) {
      await db.tag.delete({ where: { id } }).catch(() => {});
    }
    createdDefinitionIds.length = 0;
    createdTagIds.length = 0;
  });

  describe('POST /api/import/definition', () => {
    it('imports valid markdown definition', async () => {
      const response = await request(app)
        .post('/api/import/definition')
        .set('Authorization', getAuthHeader())
        .send({ content: VALID_MD_FULL });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('complete-definition');

      createdDefinitionIds.push(response.body.id);

      // Verify definition was created in database
      const definition = await db.definition.findUnique({
        where: { id: response.body.id },
      });
      expect(definition).toBeDefined();
      expect(definition!.name).toBe('complete-definition');
    });

    it('creates tag from category in frontmatter', async () => {
      const response = await request(app)
        .post('/api/import/definition')
        .set('Authorization', getAuthHeader())
        .send({ content: VALID_MD_FULL });

      expect(response.status).toBe(201);
      createdDefinitionIds.push(response.body.id);

      // Check that tag was created
      const tag = await db.tag.findUnique({
        where: { name: 'FullTest' },
      });
      expect(tag).toBeDefined();
      if (tag) createdTagIds.push(tag.id);

      // Check that definition is linked to tag
      const definitionTag = await db.definitionTag.findFirst({
        where: {
          definitionId: response.body.id,
          tagId: tag!.id,
        },
      });
      expect(definitionTag).toBeDefined();
    });

    it('imports definition without category', async () => {
      const response = await request(app)
        .post('/api/import/definition')
        .set('Authorization', getAuthHeader())
        .send({ content: VALID_MD_NO_CATEGORY });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('no-category-def');
      createdDefinitionIds.push(response.body.id);
    });

    it('imports definition without matching rules', async () => {
      const response = await request(app)
        .post('/api/import/definition')
        .set('Authorization', getAuthHeader())
        .send({ content: VALID_MD_NO_RULES });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('simple-definition');
      createdDefinitionIds.push(response.body.id);
    });

    it('allows name override via request body', async () => {
      const response = await request(app)
        .post('/api/import/definition')
        .set('Authorization', getAuthHeader())
        .send({
          content: VALID_MD_FULL,
          name: 'custom-import-name',
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('custom-import-name');
      createdDefinitionIds.push(response.body.id);
    });

    it('returns 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/import/definition')
        .send({ content: VALID_MD_FULL });

      expect(response.status).toBe(401);
    });

    it('returns 400 for missing content', async () => {
      const response = await request(app)
        .post('/api/import/definition')
        .set('Authorization', getAuthHeader())
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid markdown format', async () => {
      const response = await request(app)
        .post('/api/import/definition')
        .set('Authorization', getAuthHeader())
        .send({ content: 'Not markdown at all' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('does not reject missing preamble (preamble is optional)', async () => {
      // Preamble is now optional/deprecated - ensure it's not a validation error about preamble
      const response = await request(app)
        .post('/api/import/definition')
        .set('Authorization', getAuthHeader())
        .send({ content: INVALID_MD_NO_PREAMBLE });

      // Should succeed (201) or fail for a non-preamble reason (e.g. name conflict)
      if (response.status === 201) {
        createdDefinitionIds.push(response.body.id);
      } else {
        // If it fails, it should NOT be because of missing preamble
        const details = response.body.details || [];
        const preambleErrors = details.filter((e: { field?: string }) => e.field === 'preamble');
        expect(preambleErrors).toHaveLength(0);
      }
    });

    it('returns 400 for missing frontmatter', async () => {
      const response = await request(app)
        .post('/api/import/definition')
        .set('Authorization', getAuthHeader())
        .send({ content: INVALID_MD_NO_FRONTMATTER });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    describe('name conflict handling', () => {
      it('returns 400 when name already exists', async () => {
        // First import
        const firstResponse = await request(app)
          .post('/api/import/definition')
          .set('Authorization', getAuthHeader())
          .send({ content: VALID_MD_FULL });

        expect(firstResponse.status).toBe(201);
        createdDefinitionIds.push(firstResponse.body.id);

        // Second import with same name
        const secondResponse = await request(app)
          .post('/api/import/definition')
          .set('Authorization', getAuthHeader())
          .send({ content: VALID_MD_FULL });

        expect(secondResponse.status).toBe(400);
        expect(secondResponse.body.error).toBe('VALIDATION_ERROR');
        expect(secondResponse.body.suggestions).toHaveProperty('alternativeName');
      });

      it('uses alternative name when forceAlternativeName is true', async () => {
        // First import
        const firstResponse = await request(app)
          .post('/api/import/definition')
          .set('Authorization', getAuthHeader())
          .send({ content: VALID_MD_FULL });

        expect(firstResponse.status).toBe(201);
        createdDefinitionIds.push(firstResponse.body.id);

        // Second import with forceAlternativeName
        const secondResponse = await request(app)
          .post('/api/import/definition')
          .set('Authorization', getAuthHeader())
          .send({
            content: VALID_MD_FULL,
            forceAlternativeName: true,
          });

        expect(secondResponse.status).toBe(201);
        expect(secondResponse.body.usedAlternativeName).toBe(true);
        expect(secondResponse.body.originalName).toBe('complete-definition');
        expect(secondResponse.body.name).not.toBe('complete-definition');
        createdDefinitionIds.push(secondResponse.body.id);
      });
    });
  });
});

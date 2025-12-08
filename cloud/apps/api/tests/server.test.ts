import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/server.js';

// Mock the db module
vi.mock('@valuerank/db', () => ({
  db: {
    $queryRaw: vi.fn(),
  },
}));

describe('Server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createServer', () => {
    it('returns an Express application', () => {
      const app = createServer();
      expect(app).toBeDefined();
      expect(typeof app.listen).toBe('function');
      expect(typeof app.use).toBe('function');
    });
  });

  describe('root route', () => {
    it('returns API info at root path', async () => {
      const app = createServer();
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        name: 'Cloud ValueRank API',
        version: '0.1.0',
      });
    });
  });

  describe('request middleware', () => {
    it('assigns request ID from header', async () => {
      const app = createServer();
      const customRequestId = 'test-request-id-123';

      const response = await request(app)
        .get('/')
        .set('x-request-id', customRequestId);

      expect(response.status).toBe(200);
    });

    it('generates request ID when not provided', async () => {
      const app = createServer();
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
    });
  });

  describe('404 handling', () => {
    it('returns 404 for unknown routes', async () => {
      const app = createServer();
      const response = await request(app).get('/nonexistent-route');

      expect(response.status).toBe(404);
    });
  });
});

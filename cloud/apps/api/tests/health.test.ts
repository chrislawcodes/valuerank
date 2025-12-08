import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/server.js';

// Mock the db module
vi.mock('@valuerank/db', () => ({
  db: {
    $queryRaw: vi.fn(),
  },
}));

describe('Health endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns healthy when database is connected', async () => {
    const { db } = await import('@valuerank/db');
    vi.mocked(db.$queryRaw).mockResolvedValue([{ '?column?': 1 }]);

    const app = createServer();
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.services.database).toBe('connected');
  });

  it('returns unhealthy when database is disconnected', async () => {
    const { db } = await import('@valuerank/db');
    vi.mocked(db.$queryRaw).mockRejectedValue(new Error('Connection failed'));

    const app = createServer();
    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('unhealthy');
    expect(response.body.services.database).toBe('disconnected');
  });
});

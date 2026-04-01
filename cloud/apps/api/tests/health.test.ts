import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Express } from 'express';
import { healthRouter } from '../src/health.js';

// Mock the db module
vi.mock('@valuerank/db', () => ({
  db: {
    $queryRaw: vi.fn(),
  },
}));

describe('Health endpoint', () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use('/health', healthRouter);
  });

  it('returns healthy when database is connected', async () => {
    const { db } = await import('@valuerank/db');
    vi.mocked(db.$queryRaw).mockResolvedValue([{ '?column?': 1 }]);

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.services.database).toBe('connected');
  });

  it('returns unhealthy when database is disconnected', async () => {
    const { db } = await import('@valuerank/db');
    vi.mocked(db.$queryRaw).mockRejectedValue(new Error('Connection failed'));

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('unhealthy');
    expect(response.body.services.database).toBe('disconnected');
  });
});

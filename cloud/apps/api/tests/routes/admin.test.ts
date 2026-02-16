import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '@valuerank/shared';

const spawnMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

function createMockPgDump(output: string, exitCode = 0): EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();

  setImmediate(() => {
    child.stdout.write(output);
    child.stdout.end();
    child.emit('close', exitCode);
  });

  return child;
}

async function createApp() {
  const { adminRouter } = await import('../../src/routes/admin.js');
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.log = createLogger('admin-test');
    req.requestId = 'test-request-id';
    next();
  });
  app.use('/admin', adminRouter);
  return app;
}

describe('Admin DB export route', () => {
  const originalEnv = process.env;

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    vi.resetModules();
    spawnMock.mockReset();
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      DATABASE_URL: 'postgresql://test:test@localhost:5433/valuerank_test',
      ADMIN_EXPORT_TOKEN: 'test-admin-token',
    };
    delete process.env.ADMIN_EXPORT_IP_ALLOWLIST;
  });

  it('returns 503 when admin export token is not configured', async () => {
    delete process.env.ADMIN_EXPORT_TOKEN;
    const app = await createApp();

    const response = await request(app)
      .get('/admin/db-export')
      .set('Authorization', 'Bearer anything');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Admin export is not configured' });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('returns 401 when authorization header is missing', async () => {
    const app = await createApp();

    const response = await request(app).get('/admin/db-export');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Missing or invalid Authorization header' });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('returns 403 when token is invalid', async () => {
    const app = await createApp();

    const response = await request(app)
      .get('/admin/db-export')
      .set('Authorization', 'Bearer wrong-token');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('returns 403 when request IP is not allowlisted', async () => {
    process.env.ADMIN_EXPORT_IP_ALLOWLIST = '203.0.113.10';
    const app = await createApp();

    const response = await request(app)
      .get('/admin/db-export')
      .set('Authorization', 'Bearer test-admin-token');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden' });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('streams SQL dump when token is valid', async () => {
    spawnMock.mockReturnValueOnce(createMockPgDump('SELECT 1;\n'));
    const app = await createApp();

    const response = await request(app)
      .get('/admin/db-export')
      .set('Authorization', 'Bearer test-admin-token');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/sql');
    expect(response.text).toContain('SELECT 1;');
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});

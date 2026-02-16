import { timingSafeEqual } from 'crypto';
import { spawn } from 'child_process';
import { Router } from 'express';
import { createLogger } from '@valuerank/shared';
import { config } from '../config.js';

export const adminRouter = Router();
const log = createLogger('admin');

function tokensMatch(providedToken: string, expectedToken: string): boolean {
  const provided = Buffer.from(providedToken);
  const expected = Buffer.from(expectedToken);

  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
}

adminRouter.get('/db-export', (req, res) => {
  const expectedToken = config.ADMIN_EXPORT_TOKEN;
  if (typeof expectedToken !== 'string' || expectedToken.length === 0) {
    req.log.error('Admin export token missing');
    res.status(503).json({ error: 'Admin export is not configured' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (token.length === 0 || !tokensMatch(token, expectedToken)) {
    log.warn('Invalid admin export token');
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const databaseUrl = config.DIRECT_URL ?? config.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
    req.log.error('Missing DIRECT_URL / DATABASE_URL');
    res.status(500).json({ error: 'Database connection not configured' });
    return;
  }

  const pgDumpCommand = process.env.PG_DUMP_PATH ?? 'pg_dump';
  const dumpArgs = [
    databaseUrl,
    '--no-owner',
    '--no-privileges',
    '--clean',
    '--if-exists',
    '--quote-all-identifiers',
  ];

  req.log.info({ pgDumpCommand }, 'Starting database export');

  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', 'attachment; filename="production_dump.sql"');

  const pgDump = spawn(pgDumpCommand, dumpArgs);
  pgDump.stdout.pipe(res);

  pgDump.stderr.on('data', (chunk: Buffer | string) => {
    const stderr = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    req.log.error({ stderr }, 'pg_dump stderr');
  });

  pgDump.on('error', (err) => {
    req.log.error({ err }, 'Failed to spawn pg_dump');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to start database export' });
      return;
    }
    if (!res.writableEnded) {
      res.end();
    }
  });

  pgDump.on('close', (code) => {
    if (code === 0) {
      req.log.info('Database export complete');
      return;
    }
    req.log.error({ code }, 'pg_dump exited with non-zero code');
    if (!res.writableEnded) {
      res.end();
    }
  });
});

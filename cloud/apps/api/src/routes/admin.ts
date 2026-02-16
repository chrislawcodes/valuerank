import { timingSafeEqual } from 'crypto';
import { spawn } from 'child_process';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

export const adminRouter = Router();
const adminIpAllowlist = (process.env.ADMIN_EXPORT_IP_ALLOWLIST ?? '')
  .split(',')
  .map((ip) => ip.trim())
  .filter((ip) => ip.length > 0);
const exportTimeoutMs = Number.parseInt(process.env.ADMIN_EXPORT_TIMEOUT_MS ?? '600000', 10);

function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function isIpAllowed(ip: string | undefined): boolean {
  if (adminIpAllowlist.length === 0) {
    return true;
  }
  if (typeof ip !== 'string' || ip.length === 0) {
    return false;
  }
  const normalized = normalizeIp(ip);
  return adminIpAllowlist.includes(normalized) || adminIpAllowlist.includes(ip);
}

const adminExportRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number.parseInt(process.env.ADMIN_EXPORT_RATE_LIMIT_MAX ?? '10', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many admin export attempts. Try again later.',
  },
  handler: (req, res, _next, options) => {
    req.log.warn({ ip: req.ip, path: req.path }, 'Admin export rate limit exceeded');
    res.status(429).json(options.message);
  },
  skip: () => process.env.NODE_ENV === 'test',
});

function tokensMatch(providedToken: string, expectedToken: string): boolean {
  const provided = Buffer.from(providedToken);
  const expected = Buffer.from(expectedToken);

  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
}

adminRouter.get('/db-export', adminExportRateLimiter, (req, res) => {
  const requestMeta = {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };

  if (!isIpAllowed(req.ip)) {
    req.log.warn(requestMeta, 'Admin export denied: IP not allowlisted');
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const expectedToken = config.ADMIN_EXPORT_TOKEN;
  if (typeof expectedToken !== 'string' || expectedToken.length === 0) {
    req.log.error(requestMeta, 'Admin export denied: token missing');
    res.status(503).json({ error: 'Admin export is not configured' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    req.log.warn(requestMeta, 'Admin export denied: missing/invalid auth header');
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (token.length === 0 || !tokensMatch(token, expectedToken)) {
    req.log.warn(requestMeta, 'Admin export denied: invalid token');
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const databaseUrl = config.DIRECT_URL ?? config.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
    req.log.error(requestMeta, 'Admin export failed: missing DIRECT_URL / DATABASE_URL');
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

  const startedAt = Date.now();
  let totalBytes = 0;
  req.setTimeout(exportTimeoutMs);
  res.setTimeout(exportTimeoutMs);

  req.log.info(
    { ...requestMeta, pgDumpCommand, usingDirectUrl: typeof config.DIRECT_URL === 'string' && config.DIRECT_URL.length > 0 },
    'Admin export started'
  );

  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', 'attachment; filename="production_dump.sql"');

  const pgDump = spawn(pgDumpCommand, dumpArgs);
  pgDump.stdout.on('data', (chunk: Buffer | string) => {
    totalBytes += Buffer.byteLength(chunk);
  });
  pgDump.stdout.pipe(res);

  pgDump.stderr.on('data', (chunk: Buffer | string) => {
    const stderr = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    req.log.error({ ...requestMeta, stderr }, 'Admin export pg_dump stderr');
  });

  pgDump.on('error', (err) => {
    req.log.error({ ...requestMeta, err }, 'Admin export failed: spawn error');
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
      req.log.info(
        { ...requestMeta, durationMs: Date.now() - startedAt, totalBytes },
        'Admin export completed'
      );
      return;
    }
    req.log.error(
      { ...requestMeta, code, durationMs: Date.now() - startedAt, totalBytes },
      'Admin export failed: non-zero exit'
    );
    if (!res.writableEnded) {
      res.end();
    }
  });
});

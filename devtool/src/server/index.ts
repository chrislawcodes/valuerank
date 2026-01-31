import express from 'express';
import cors from 'cors';
import path from 'path';
import scenariosRouter from './routes/scenarios.js';
import configRouter from './routes/config.js';
import runnerRouter from './routes/runner.js';
import generatorRouter from './routes/generator.js';
import analysisRouter from './routes/analysis.js';
import { createLogger } from './utils/logger.js';
import { DEVTOOL_ROOT } from './utils/paths.js';

const app = express();
const PORT = process.env.PORT || 3032;
const log = createLogger('server');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  // Skip logging for health checks and static files
  if (path === '/api/health') {
    return next();
  }

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

    log[level](`${req.method} ${path} ${status} ${duration}ms`);
  });

  next();
});

// API routes
app.use('/api/scenarios', scenariosRouter);
app.use('/api/config', configRouter);
app.use('/api/runner', runnerRouter);
app.use('/api/generator', generatorRouter);
app.use('/api/analysis', analysisRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from the client dist directory
const clientDistPath = path.join(DEVTOOL_ROOT, 'dist', 'client');
app.use(express.static(clientDistPath));

// Catch-all route to serve index.html for SPA routing
app.get('*', (req, res, next) => {
  // If it looks like an API request but wasn't caught by the routers, pass it on
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

app.listen(PORT, () => {
  log.info(`ValueRank DevTool server running on http://localhost:${PORT}`);
});

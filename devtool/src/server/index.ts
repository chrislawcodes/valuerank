import express from 'express';
import cors from 'cors';
import scenariosRouter from './routes/scenarios.js';
import configRouter from './routes/config.js';
import runnerRouter from './routes/runner.js';
import generatorRouter from './routes/generator.js';
import analysisRouter from './routes/analysis.js';

const app = express();
const PORT = process.env.PORT || 3030;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

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

app.listen(PORT, () => {
  console.log(`ValueRank DevTool server running on http://localhost:${PORT}`);
});

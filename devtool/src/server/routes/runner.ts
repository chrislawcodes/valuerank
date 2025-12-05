import { Router } from 'express';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

const router = Router();

const PROJECT_ROOT = path.resolve(process.cwd(), '..');

// Track running processes
const runningProcesses = new Map<string, ChildProcess>();

interface RunRequest {
  command: 'probe' | 'judge' | 'aggregator' | 'summary';
  args?: Record<string, string>;
}

// POST /api/runner/start - Start a pipeline command
router.post('/start', (req, res) => {
  const { command, args = {} }: RunRequest = req.body;

  const moduleMap: Record<string, string> = {
    probe: 'src.probe',
    judge: 'src.judge_value',
    aggregator: 'src.aggregator',
    summary: 'src.summary',
  };

  const module = moduleMap[command];
  if (!module) {
    return res.status(400).json({ error: `Unknown command: ${command}` });
  }

  // Build command arguments
  const cmdArgs = ['-m', module];
  for (const [key, value] of Object.entries(args)) {
    if (value) {
      cmdArgs.push(`--${key}`, value);
    }
  }

  const runId = `${command}-${Date.now()}`;

  const child = spawn('python3', cmdArgs, {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
  });

  runningProcesses.set(runId, child);

  // Clean up when process exits
  child.on('exit', () => {
    runningProcesses.delete(runId);
  });

  res.json({ runId, command, args: cmdArgs });
});

// GET /api/runner/output/:runId - Stream output from a running process
router.get('/output/:runId', (req, res) => {
  const { runId } = req.params;
  const child = runningProcesses.get(runId);

  if (!child) {
    return res.status(404).json({ error: 'Process not found or already completed' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (type: string, data: string) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  child.stdout?.on('data', (data: Buffer) => {
    sendEvent('stdout', data.toString());
  });

  child.stderr?.on('data', (data: Buffer) => {
    sendEvent('stderr', data.toString());
  });

  child.on('exit', (code) => {
    sendEvent('exit', String(code));
    res.end();
  });

  req.on('close', () => {
    // Client disconnected
  });
});

// POST /api/runner/stop/:runId - Stop a running process
router.post('/stop/:runId', (req, res) => {
  const { runId } = req.params;
  const child = runningProcesses.get(runId);

  if (!child) {
    return res.status(404).json({ error: 'Process not found' });
  }

  child.kill('SIGTERM');
  runningProcesses.delete(runId);
  res.json({ success: true });
});

// GET /api/runner/status - List all running processes
router.get('/status', (_req, res) => {
  const processes = Array.from(runningProcesses.keys());
  res.json({ running: processes });
});

// GET /api/runner/runs - List output runs
router.get('/runs', async (_req, res) => {
  const fs = await import('fs/promises');
  try {
    const outputDir = path.join(PROJECT_ROOT, 'output');
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    const runs = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort()
      .reverse();
    res.json({ runs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list runs', details: String(error) });
  }
});

export default router;

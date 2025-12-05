import { Router } from 'express';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

const router = Router();

const PROJECT_ROOT = path.resolve(process.cwd(), '..');

// Track running processes
const runningProcesses = new Map<string, ChildProcess>();

interface RunRequest {
  command: 'probe' | 'summary';
  args?: Record<string, string>;
}

// Summary model preferences in order (first available wins)
// Model names match those used in config/runtime.yaml
const SUMMARY_MODEL_PREFERENCES = [
  { envKey: 'DEEPSEEK_API_KEY', model: 'deepseek:deepseek-reasoner' },
  { envKey: 'ANTHROPIC_API_KEY', model: 'anthropic:claude-sonnet-4-5' },
  { envKey: 'OPENAI_API_KEY', model: 'openai:gpt-4o' },
  { envKey: 'GOOGLE_API_KEY', model: 'google:gemini-2.5-pro' },
  { envKey: 'XAI_API_KEY', model: 'xai:grok-4-1-fast-reasoning' },
  { envKey: 'MISTRAL_API_KEY', model: 'mistral:mistral-large-latest' },
];

// Load API keys from .env file
async function loadEnvFile(): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  try {
    const envPath = path.join(PROJECT_ROOT, '.env');
    const content = await fs.readFile(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.slice(0, eqIndex).trim();
          let value = trimmed.slice(eqIndex + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          env[key] = value;
        }
      }
    }
  } catch {
    // .env file not found
  }
  return env;
}

// Get an available summary model based on environment
async function getAvailableSummaryModel(): Promise<string | null> {
  const envVars = await loadEnvFile();
  const allEnv = { ...process.env, ...envVars };

  for (const { envKey, model } of SUMMARY_MODEL_PREFERENCES) {
    if (allEnv[envKey]) {
      return model;
    }
  }
  return null;
}

// POST /api/runner/start - Start a pipeline command
router.post('/start', async (req, res) => {
  const { command, args = {} }: RunRequest = req.body;

  const moduleMap: Record<string, string> = {
    probe: 'src.probe',
    summary: 'src.summary',
  };

  const module = moduleMap[command];
  if (!module) {
    return res.status(400).json({ error: `Unknown command: ${command}` });
  }

  // For summary command, auto-select an available model if not specified
  const finalArgs = { ...args };
  if (command === 'summary' && !finalArgs['summary-model']) {
    const availableModel = await getAvailableSummaryModel();
    if (availableModel) {
      finalArgs['summary-model'] = availableModel;
    }
  }

  // Build command arguments
  const cmdArgs = ['-m', module];
  for (const [key, value] of Object.entries(finalArgs)) {
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

// Recursively find run directories (containing run_manifest.yaml or transcript files)
async function discoverRunDirs(dir: string, fs: typeof import('fs/promises')): Promise<string[]> {
  const runs: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subdir = path.join(dir, entry.name);

        // Check for run_manifest.yaml first
        const manifestPath = path.join(subdir, 'run_manifest.yaml');
        try {
          await fs.access(manifestPath);
          runs.push(subdir);
          continue;
        } catch {
          // No manifest, continue checking
        }

        // Check for transcript files (fallback detection)
        const subdirEntries = await fs.readdir(subdir);
        const hasTranscripts = subdirEntries.some(f => f.startsWith('transcript.') && f.endsWith('.md'));

        if (hasTranscripts) {
          runs.push(subdir);
        } else {
          // Recurse into subdirectory
          const subRuns = await discoverRunDirs(subdir, fs);
          runs.push(...subRuns);
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return runs;
}

// GET /api/runner/runs - List output runs (directories containing run_manifest.yaml)
router.get('/runs', async (_req, res) => {
  const fs = await import('fs/promises');
  try {
    const outputDir = path.join(PROJECT_ROOT, 'output');
    const runPaths = await discoverRunDirs(outputDir, fs);

    // Convert to relative paths from output/ and sort newest first
    const runs = runPaths
      .map(p => path.relative(outputDir, p))
      .sort()
      .reverse();

    res.json({ runs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list runs', details: String(error) });
  }
});

export default router;

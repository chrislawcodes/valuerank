import { Router } from 'express';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { CONFIG_DIR, OUTPUT_DIR, PROJECT_ROOT } from '../utils/paths.js';
import { readYamlFile } from '../utils/yaml.js';

const router = Router();

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
  { envKey: 'ANTHROPIC_API_KEY', model: 'anthropic:claude-haiku-4-5' },
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

async function loadRuntimeConfig(): Promise<any> {
  try {
    return await readYamlFile(path.join(CONFIG_DIR, 'runtime.yaml'));
  } catch {
    return {};
  }
}

let cachedModelCosts: any | null = null;
async function loadModelCosts(): Promise<any> {
  if (cachedModelCosts) {
    return cachedModelCosts;
  }
  try {
    const costs = await readYamlFile(path.join(CONFIG_DIR, 'model_costs.yaml'));
    cachedModelCosts = costs;
    return costs;
  } catch {
    return {};
  }
}

interface CostEstimate {
  total: number;
  breakdown: Record<string, number>;
}

function estimateTokens(text: string): number {
  if (!text) return 1;
  return Math.max(1, Math.round(text.length / 4));
}

function getModelRates(modelId: string, costs: any): { input: number; output: number } {
  const defaults = costs?.defaults || {};
  const modelEntry = costs?.models?.[modelId] || {};
  const input = modelEntry.input_per_million ?? defaults.input_per_million ?? 0;
  const output = modelEntry.output_per_million ?? defaults.output_per_million ?? 0;
  return { input, output };
}

async function estimateRunCost(command: string, args: Record<string, string>): Promise<CostEstimate | null> {
  try {
    const modelCosts = await loadModelCosts();
    if (command === 'probe') {
      const scenariosFolder = args['scenarios-folder'];
      if (!scenariosFolder) {
        return null;
      }
      const folderPath = path.join(PROJECT_ROOT, scenariosFolder);
      const entries = await fs.readdir(folderPath);
      const yamlFiles = entries.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
      if (!yamlFiles.length) {
        return null;
      }
      const runtime = await loadRuntimeConfig();
      const targetModels: string[] = runtime?.defaults?.target_models || [];
      if (!targetModels.length) {
        return null;
      }
      let scenarioTokens = 0;
      for (const file of yamlFiles) {
        const filePath = path.join(folderPath, file);
        const data = await readYamlFile<{ preamble?: string; scenarios?: Record<string, { body?: string }> }>(filePath);
        const preamble = data.preamble || '';
        const scenarios = data.scenarios || {};
        for (const scenario of Object.values(scenarios)) {
          const text = `${preamble}\n${scenario?.body || ''}`;
          scenarioTokens += estimateTokens(text);
        }
      }
      if (!scenarioTokens) {
        return null;
      }
      const perModelCost = targetModels.reduce((acc, modelId) => {
        const rates = getModelRates(modelId, modelCosts);
        const cost = (scenarioTokens / 1_000_000) * (rates.input + rates.output);
        acc.breakdown[modelId] = cost;
        acc.total += cost;
        return acc;
      }, { total: 0, breakdown: {} as Record<string, number> });
      return perModelCost.total > 0 ? perModelCost : null;
    }

    if (command === 'summary') {
      const runDir = args['run-dir'];
      if (!runDir) {
        return null;
      }
      const dirPath = path.join(PROJECT_ROOT, runDir);
      const entries = await fs.readdir(dirPath);
      const transcripts = entries.filter((f) => f.startsWith('transcript.') && f.endsWith('.md'));
      if (!transcripts.length) {
        return null;
      }
      let totalTokens = 0;
      for (const file of transcripts) {
        const filePath = path.join(dirPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        totalTokens += estimateTokens(content);
      }
      if (!totalTokens) {
        return null;
      }
      let modelId = args['summary-model'];
      if (!modelId) {
        const runtime = await loadRuntimeConfig();
        modelId = runtime?.defaults?.summary_model || (await getAvailableSummaryModel()) || '';
      }
      if (!modelId) {
        return null;
      }
      const rates = getModelRates(modelId, modelCosts);
      const cost = (totalTokens / 1_000_000) * (rates.input + rates.output);
      if (!cost) {
        return null;
      }
      return {
        total: cost,
        breakdown: { [modelId]: cost },
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to estimate cost:', error);
    return null;
  }
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
  const costEstimate = await estimateRunCost(command, finalArgs);

  const child = spawn('python3', cmdArgs, {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
    },
  });

  runningProcesses.set(runId, child);

  // Clean up when process exits
  child.on('exit', () => {
    runningProcesses.delete(runId);
  });

  res.json({ runId, command, args: cmdArgs, costEstimate });
});

// POST /api/runner/estimate - Estimate cost without starting the run
router.post('/estimate', async (req, res) => {
  const { command, args = {} }: RunRequest = req.body;
  try {
    const costEstimate = await estimateRunCost(command, args);
    res.json({ costEstimate });
  } catch (error) {
    res.status(500).json({ error: 'Failed to estimate cost', details: String(error) });
  }
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
    const outputDir = OUTPUT_DIR;
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

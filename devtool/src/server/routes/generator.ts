import { Router } from 'express';
import fs from 'fs/promises';
import { watch, type FSWatcher } from 'fs';
import path from 'path';
import { parseScenarioMd, serializeScenarioMd, buildGenerationPrompt, type ScenarioDefinition } from '../utils/scenarioMd.js';

const router = Router();

// Track active file watchers to clean up on disconnect
const activeWatchers = new Map<string, FSWatcher>();

const PROJECT_ROOT = path.resolve(process.cwd(), '..');
const SCENARIOS_DIR = path.join(PROJECT_ROOT, 'scenarios');

// Load API keys from environment or .env file
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

interface LLMProvider {
  name: string;
  envKey: string;
  generate: (prompt: string, apiKey: string) => Promise<string>;
}

const providers: LLMProvider[] = [
  {
    name: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    generate: async (prompt: string, apiKey: string) => {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 16000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${error}`);
      }

      const data = await response.json();
      return data.content[0].text;
    },
  },
  {
    name: 'openai',
    envKey: 'OPENAI_API_KEY',
    generate: async (prompt: string, apiKey: string) => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 16000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    },
  },
];

async function callLLM(prompt: string): Promise<string> {
  const envVars = await loadEnvFile();
  const allEnv = { ...process.env, ...envVars };

  let lastError: string | null = null;

  for (const provider of providers) {
    const apiKey = allEnv[provider.envKey];
    if (apiKey) {
      try {
        console.log(`Using ${provider.name} for generation...`);
        return await provider.generate(prompt, apiKey);
      } catch (e) {
        lastError = String(e);
        console.error(`${provider.name} failed:`, e);
      }
    }
  }

  throw new Error(lastError || 'No LLM API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env');
}

function extractYaml(result: string): string {
  const yamlMatch = result.match(/```ya?ml\n([\s\S]*?)\n```/);
  if (yamlMatch) {
    return yamlMatch[1];
  }
  const lines = result.split('\n');
  const startIndex = lines.findIndex(l => l.trim().startsWith('preamble:'));
  if (startIndex >= 0) {
    return lines.slice(startIndex).join('\n');
  }
  return result;
}

// GET /api/generator/definition/:folder/:name - Get a scenario definition (.md file)
router.get('/definition/:folder/:name', async (req, res) => {
  try {
    const { folder, name } = req.params;
    const mdPath = path.join(SCENARIOS_DIR, folder, `${name}.md`);
    const content = await fs.readFile(mdPath, 'utf-8');
    const definition = parseScenarioMd(content);
    res.json(definition);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return res.status(404).json({ error: 'Definition not found' });
    }
    res.status(500).json({ error: String(error) });
  }
});

// PUT /api/generator/definition/:folder/:name - Save a scenario definition (.md file)
router.put('/definition/:folder/:name', async (req, res) => {
  try {
    const { folder, name } = req.params;
    const definition: ScenarioDefinition = req.body;

    // Update the name in definition to match the filename
    definition.name = name;

    const mdContent = serializeScenarioMd(definition);
    const mdPath = path.join(SCENARIOS_DIR, folder, `${name}.md`);

    await fs.writeFile(mdPath, mdContent, 'utf-8');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/generator/definition/:folder/:name - Create a new scenario definition
router.post('/definition/:folder/:name', async (req, res) => {
  try {
    const { folder, name } = req.params;
    const definition: ScenarioDefinition = req.body;

    definition.name = name;

    const mdPath = path.join(SCENARIOS_DIR, folder, `${name}.md`);

    // Check if file exists
    try {
      await fs.access(mdPath);
      return res.status(409).json({ error: 'File already exists' });
    } catch {
      // File doesn't exist, good to create
    }

    const mdContent = serializeScenarioMd(definition);
    await fs.writeFile(mdPath, mdContent, 'utf-8');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// DELETE /api/generator/definition/:folder/:name - Delete a scenario definition
router.delete('/definition/:folder/:name', async (req, res) => {
  try {
    const { folder, name } = req.params;
    const mdPath = path.join(SCENARIOS_DIR, folder, `${name}.md`);
    await fs.unlink(mdPath);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/generator/definition/:folder/:name/rename - Rename a scenario definition
router.post('/definition/:folder/:name/rename', async (req, res) => {
  try {
    const { folder, name } = req.params;
    const { newName } = req.body;

    if (!newName) {
      return res.status(400).json({ error: 'newName is required' });
    }

    const oldMdPath = path.join(SCENARIOS_DIR, folder, `${name}.md`);
    const newMdPath = path.join(SCENARIOS_DIR, folder, `${newName}.md`);

    // Read and update the definition
    const content = await fs.readFile(oldMdPath, 'utf-8');
    const definition = parseScenarioMd(content);
    definition.name = newName;

    // Write to new location and delete old
    await fs.writeFile(newMdPath, serializeScenarioMd(definition), 'utf-8');
    await fs.unlink(oldMdPath);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/generator/generate/:folder/:name - Generate YAML from a scenario definition
router.post('/generate/:folder/:name', async (req, res) => {
  try {
    const { folder, name } = req.params;
    const mdPath = path.join(SCENARIOS_DIR, folder, `${name}.md`);
    const yamlPath = path.join(SCENARIOS_DIR, folder, `${name}.yaml`);

    // Read the definition
    const content = await fs.readFile(mdPath, 'utf-8');
    const definition = parseScenarioMd(content);

    // Build the prompt and call LLM
    const prompt = buildGenerationPrompt(definition);
    const result = await callLLM(prompt);
    const yaml = extractYaml(result);

    // Save the YAML file
    await fs.writeFile(yamlPath, yaml, 'utf-8');

    res.json({ success: true, yaml });
  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({ error: String(error) });
  }
});

// Legacy endpoint for direct prompt generation
router.post('/generate', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const result = await callLLM(prompt);
    const yaml = extractYaml(result);
    res.json({ yaml });
  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/generator/providers - Check which providers are available
router.get('/providers', async (_req, res) => {
  const envVars = await loadEnvFile();
  const allEnv = { ...process.env, ...envVars };

  const available = providers
    .filter((p) => !!allEnv[p.envKey])
    .map((p) => p.name);

  res.json({ available });
});

// GET /api/generator/watch/:folder/:name - Watch a definition file for changes (SSE)
router.get('/watch/:folder/:name', async (req, res) => {
  const { folder, name } = req.params;
  const mdPath = path.join(SCENARIOS_DIR, folder, `${name}.md`);
  const watcherId = `${folder}/${name}-${Date.now()}`;

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ path: mdPath })}\n\n`);

  // Track last modification time to debounce rapid changes
  let lastMtime = 0;
  let debounceTimeout: NodeJS.Timeout | null = null;

  const checkAndNotify = async () => {
    try {
      const stats = await fs.stat(mdPath);
      const mtime = stats.mtimeMs;

      // Only notify if modification time actually changed
      if (mtime > lastMtime) {
        lastMtime = mtime;

        // Read the updated content
        const content = await fs.readFile(mdPath, 'utf-8');
        const definition = parseScenarioMd(content);

        res.write(`event: change\ndata: ${JSON.stringify({ definition, mtime })}\n\n`);
      }
    } catch (error) {
      // File might have been deleted
      res.write(`event: error\ndata: ${JSON.stringify({ error: String(error) })}\n\n`);
    }
  };

  // Set up file watcher
  let watcher: FSWatcher;
  try {
    watcher = watch(mdPath, { persistent: false }, (_eventType) => {
      // Debounce to avoid multiple events for single save
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      debounceTimeout = setTimeout(checkAndNotify, 100);
    });

    activeWatchers.set(watcherId, watcher);
  } catch (error) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: `Failed to watch file: ${error}` })}\n\n`);
    res.end();
    return;
  }

  // Clean up on disconnect
  req.on('close', () => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    watcher.close();
    activeWatchers.delete(watcherId);
  });

  // Send keepalive every 30 seconds
  const keepalive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepalive);
  });
});

export default router;

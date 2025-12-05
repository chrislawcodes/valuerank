import { Router } from 'express';
import fs from 'fs/promises';
import { watch, type FSWatcher } from 'fs';
import path from 'path';
import { parseScenarioMd, serializeScenarioMd, buildGenerationPrompt, type ScenarioDefinition } from '../utils/scenarioMd.js';
import { callLLM, getAvailableProviders, extractYaml } from '../utils/llm.js';

const router = Router();

// Track active file watchers to clean up on disconnect
const activeWatchers = new Map<string, FSWatcher>();

const PROJECT_ROOT = path.resolve(process.cwd(), '..');
const SCENARIOS_DIR = path.join(PROJECT_ROOT, 'scenarios');

// GET /api/generator/definition/:folder/:name - Get a scenario definition (.md file)
router.get('/definition/:folder/:name', async (req, res) => {
  try {
    const { folder, name } = req.params;
    const mdPath = path.join(SCENARIOS_DIR, folder, `${name}.md`);
    const content = await fs.readFile(mdPath, 'utf-8');
    const definition = parseScenarioMd(content);
    // Always use the filename as the source of truth for the name
    definition.name = name;
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

// Helper to find the next available scenario number in a folder
async function getNextScenarioNumber(folderPath: string): Promise<string> {
  try {
    const files = await fs.readdir(folderPath);
    const yamlFiles = files.filter(f => f.match(/^exp-\d+\..+\.ya?ml$/));

    let maxNum = 0;
    for (const file of yamlFiles) {
      const match = file.match(/^exp-(\d+)\./);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    return String(maxNum + 1).padStart(3, '0');
  } catch {
    return '001';
  }
}

// Helper to build proper YAML filename from definition name
function buildYamlFilename(name: string, number: string): string {
  // Remove 'exp-' prefix if present
  let baseName = name.replace(/^exp-/, '');
  // Remove any existing number prefix (e.g., '001.')
  baseName = baseName.replace(/^\d+\./, '');
  return `exp-${number}.${baseName}.yaml`;
}

// POST /api/generator/generate/:folder/:name - Generate YAML from a scenario definition
router.post('/generate/:folder/:name', async (req, res) => {
  try {
    const { folder, name } = req.params;
    const { model } = req.body || {};
    const mdPath = path.join(SCENARIOS_DIR, folder, `${name}.md`);

    // Build proper YAML filename with number prefix
    const folderPath = path.join(SCENARIOS_DIR, folder);
    const nextNum = await getNextScenarioNumber(folderPath);
    const yamlFilename = buildYamlFilename(name, nextNum);
    const yamlPath = path.join(folderPath, yamlFilename);

    // Read the definition
    const content = await fs.readFile(mdPath, 'utf-8');
    const definition = parseScenarioMd(content);

    // Build the prompt and call LLM
    const prompt = buildGenerationPrompt(definition);
    const result = await callLLM(prompt, { maxTokens: 16000, model });
    const yaml = extractYaml(result);

    // Save the YAML file
    await fs.writeFile(yamlPath, yaml, 'utf-8');

    res.json({ success: true, yaml, filename: yamlFilename });
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
    const result = await callLLM(prompt, { maxTokens: 16000 });
    const yaml = extractYaml(result);
    res.json({ yaml });
  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({ error: String(error) });
  }
});

// GET /api/generator/providers - Check which providers are available
router.get('/providers', async (_req, res) => {
  const available = await getAvailableProviders();
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
    } catch (error: unknown) {
      // Check if file was deleted
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        res.write(`event: deleted\ndata: ${JSON.stringify({ path: mdPath })}\n\n`);
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({ error: String(error) })}\n\n`);
      }
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

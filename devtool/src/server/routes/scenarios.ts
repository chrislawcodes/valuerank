import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { readYamlFile, writeYamlFile, listYamlFiles, listDirectories } from '../utils/yaml.js';

const router = Router();

// Base path to scenarios directory (relative to project root)
const PROJECT_ROOT = path.resolve(process.cwd(), '..');
const SCENARIOS_DIR = path.join(PROJECT_ROOT, 'scenarios');

export interface Scenario {
  base_id: string;
  category: string;
  subject: string;
  body: string;
  preference_frame?: string;
  preference_value_tilt?: string;
}

export interface ScenarioFile {
  preamble: string;
  scenarios: Record<string, Scenario>;
}

// GET /api/scenarios/folders - List all scenario folders
router.get('/folders', async (_req, res) => {
  try {
    const folders = await listDirectories(SCENARIOS_DIR);
    res.json({ folders });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list scenario folders', details: String(error) });
  }
});

// GET /api/scenarios/files/:folder - List all scenario files in a folder
router.get('/files/:folder', async (req, res) => {
  try {
    const folderPath = path.join(SCENARIOS_DIR, req.params.folder);
    const entries = await fs.readdir(folderPath, { withFileTypes: true });

    // Get both .yaml and .md files
    const yamlFiles: string[] = [];
    const mdFiles: string[] = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
          yamlFiles.push(entry.name);
        } else if (entry.name.endsWith('.md')) {
          mdFiles.push(entry.name);
        }
      }
    }

    res.json({ files: yamlFiles, definitions: mdFiles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list scenario files', details: String(error) });
  }
});

// GET /api/scenarios/file/:folder/:filename - Get a specific scenario file
router.get('/file/:folder/:filename', async (req, res) => {
  try {
    const filePath = path.join(SCENARIOS_DIR, req.params.folder, req.params.filename);
    const data = await readYamlFile<ScenarioFile>(filePath);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read scenario file', details: String(error) });
  }
});

// PUT /api/scenarios/file/:folder/:filename - Update a scenario file
router.put('/file/:folder/:filename', async (req, res) => {
  try {
    const filePath = path.join(SCENARIOS_DIR, req.params.folder, req.params.filename);
    const data: ScenarioFile = req.body;
    await writeYamlFile(filePath, data);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to write scenario file', details: String(error) });
  }
});

// POST /api/scenarios/file/:folder/:filename - Create a new scenario file
router.post('/file/:folder/:filename', async (req, res) => {
  try {
    const folderPath = path.join(SCENARIOS_DIR, req.params.folder);
    const filePath = path.join(folderPath, req.params.filename);

    // Check if file already exists
    try {
      await fs.access(filePath);
      return res.status(409).json({ error: 'File already exists' });
    } catch {
      // File doesn't exist, good to create
    }

    const data: ScenarioFile = req.body;
    await writeYamlFile(filePath, data);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create scenario file', details: String(error) });
  }
});

// DELETE /api/scenarios/file/:folder/:filename - Delete a scenario file
router.delete('/file/:folder/:filename', async (req, res) => {
  try {
    const filePath = path.join(SCENARIOS_DIR, req.params.folder, req.params.filename);
    await fs.unlink(filePath);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete scenario file', details: String(error) });
  }
});

// POST /api/scenarios/folder - Create a new folder
router.post('/folder', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }
    const folderPath = path.join(SCENARIOS_DIR, name);
    await fs.mkdir(folderPath, { recursive: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create folder', details: String(error) });
  }
});

export default router;

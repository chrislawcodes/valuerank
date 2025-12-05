import { Router } from 'express';
import path from 'path';
import { readYamlFile, writeYamlFile } from '../utils/yaml.js';

const router = Router();

const PROJECT_ROOT = path.resolve(process.cwd(), '..');
const CONFIG_DIR = path.join(PROJECT_ROOT, 'config');

// GET /api/config/runtime - Get runtime configuration
router.get('/runtime', async (_req, res) => {
  try {
    const filePath = path.join(CONFIG_DIR, 'runtime.yaml');
    const data = await readYamlFile(filePath);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read runtime config', details: String(error) });
  }
});

// PUT /api/config/runtime - Update runtime configuration
router.put('/runtime', async (req, res) => {
  try {
    const filePath = path.join(CONFIG_DIR, 'runtime.yaml');
    await writeYamlFile(filePath, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to write runtime config', details: String(error) });
  }
});

// GET /api/config/values-rubric - Get values rubric
router.get('/values-rubric', async (_req, res) => {
  try {
    const filePath = path.join(CONFIG_DIR, 'values_rubric.yaml');
    const data = await readYamlFile(filePath);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read values rubric', details: String(error) });
  }
});

// GET /api/config/model-costs - Get model costs
router.get('/model-costs', async (_req, res) => {
  try {
    const filePath = path.join(CONFIG_DIR, 'model_costs.yaml');
    const data = await readYamlFile(filePath);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read model costs', details: String(error) });
  }
});

// GET /api/config/values - Get list of canonical values
router.get('/values', async (_req, res) => {
  try {
    const filePath = path.join(CONFIG_DIR, 'values_rubric.yaml');
    const data = await readYamlFile<{ values: Record<string, unknown> }>(filePath);
    const values = Object.keys(data.values || {});
    res.json({ values });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read values', details: String(error) });
  }
});

export default router;

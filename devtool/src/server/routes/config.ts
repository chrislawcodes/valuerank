import { Router } from 'express';
import path from 'path';
import { readYamlFile, writeYamlFile } from '../utils/yaml.js';
import { loadEnvFile } from '../utils/llm.js';
import { LLM_PROVIDERS } from '../../shared/llmProviders.js';

const router = Router();

const PROJECT_ROOT = path.resolve(process.cwd(), '..');
const CONFIG_DIR = path.join(PROJECT_ROOT, 'config');
const DEVTOOL_ROOT = process.cwd();

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

// Canonical dimension type
interface DimensionLevel {
  score: number;
  label: string;
  options: string[];
}

interface CanonicalDimension {
  description: string;
  levels: DimensionLevel[];
}

// GET /api/config/canonical-dimensions - Get canonical dimension definitions
router.get('/canonical-dimensions', async (_req, res) => {
  try {
    const filePath = path.join(DEVTOOL_ROOT, 'canonical-dimensions.yaml');
    const data = await readYamlFile<{ dimensions: Record<string, CanonicalDimension> }>(filePath);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read canonical dimensions', details: String(error) });
  }
});

// PUT /api/config/canonical-dimensions/:name - Update a single canonical dimension
router.put('/canonical-dimensions/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const filePath = path.join(DEVTOOL_ROOT, 'canonical-dimensions.yaml');
    const data = await readYamlFile<{ dimensions: Record<string, CanonicalDimension> }>(filePath);

    if (!data.dimensions) {
      data.dimensions = {};
    }

    data.dimensions[name] = req.body;
    await writeYamlFile(filePath, data);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update canonical dimension', details: String(error) });
  }
});

// GET /api/config/llm-providers - Get LLM provider status (which have API keys configured)
router.get('/llm-providers', async (_req, res) => {
  try {
    const envVars = await loadEnvFile();
    const allEnv = { ...process.env, ...envVars };

    const providers = LLM_PROVIDERS.map(provider => ({
      id: provider.id,
      name: provider.name,
      envKey: provider.envKey,
      icon: provider.icon,
      configured: !!allEnv[provider.envKey],
    }));

    res.json({ providers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check LLM providers', details: String(error) });
  }
});

// GET /api/config/available-models - Get all available models from configured providers
router.get('/available-models', async (_req, res) => {
  try {
    const envVars = await loadEnvFile();
    const allEnv = { ...process.env, ...envVars };

    // Only include models from providers that have API keys configured
    const availableModels = LLM_PROVIDERS
      .filter(provider => !!allEnv[provider.envKey])
      .flatMap(provider =>
        provider.models.map(model => ({
          id: `${provider.id}:${model.id}`,
          name: model.name,
          providerId: provider.id,
          providerName: provider.name,
          providerIcon: provider.icon,
          isDefault: model.isDefault,
        }))
      );

    res.json({ models: availableModels });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get available models', details: String(error) });
  }
});

export default router;

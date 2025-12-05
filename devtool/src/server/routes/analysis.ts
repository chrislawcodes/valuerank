import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';

const router = Router();
const PROJECT_ROOT = path.resolve(process.cwd(), '..');

// Parse CSV content into structured data
function parseCSV(content: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = values[i] || '';
    });
    return row;
  });

  return { headers, rows };
}

// Parse a single CSV line handling quoted values
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values;
}

// Recursively find run directories that contain summary CSV files
async function discoverAnalysisRuns(dir: string): Promise<{ path: string; name: string; csvFiles: string[] }[]> {
  const runs: { path: string; name: string; csvFiles: string[] }[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subdir = path.join(dir, entry.name);

        // Check for summary CSV files
        const subdirEntries = await fs.readdir(subdir);
        const csvFiles = subdirEntries.filter(f => f.startsWith('summary.') && f.endsWith('.csv'));

        if (csvFiles.length > 0) {
          runs.push({
            path: subdir,
            name: path.relative(path.join(PROJECT_ROOT, 'output'), subdir),
            csvFiles,
          });
        } else {
          // Recurse into subdirectory
          const subRuns = await discoverAnalysisRuns(subdir);
          runs.push(...subRuns);
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return runs;
}

// GET /api/analysis/runs - List runs that have summary CSV files
router.get('/runs', async (_req, res) => {
  try {
    const outputDir = path.join(PROJECT_ROOT, 'output');
    const runs = await discoverAnalysisRuns(outputDir);

    // Sort by name (newest first based on date format)
    runs.sort((a, b) => b.name.localeCompare(a.name));

    res.json({
      runs: runs.map(r => ({
        name: r.name,
        csvFiles: r.csvFiles,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list runs', details: String(error) });
  }
});

// GET /api/analysis/csv/:runPath/:csvFile - Get CSV data for a specific run
router.get('/csv/*', async (req, res) => {
  try {
    // The path comes as params[0] due to wildcard
    const fullPath = req.params[0];
    const csvPath = path.join(PROJECT_ROOT, 'output', fullPath);

    // Security check - ensure we're reading from output directory
    const resolvedPath = path.resolve(csvPath);
    const outputDir = path.resolve(path.join(PROJECT_ROOT, 'output'));
    if (!resolvedPath.startsWith(outputDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const content = await fs.readFile(csvPath, 'utf-8');
    const { headers, rows } = parseCSV(content);

    // Extract unique values for filtering
    const models = [...new Set(rows.map(r => r['AI Model Name']).filter(Boolean))];
    const scenarios = [...new Set(rows.map(r => r['Scenario']).filter(Boolean))];

    // Find dimension columns (exclude known columns)
    const knownColumns = ['Scenario', 'AI Model Name', 'Decision Code', 'Decision Text'];
    const dimensionColumns = headers.filter(h => !knownColumns.includes(h));

    res.json({
      headers,
      rows,
      models,
      scenarios,
      dimensionColumns,
      totalRows: rows.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read CSV', details: String(error) });
  }
});

// GET /api/analysis/aggregate/:runPath - Get aggregated statistics for visualization
router.get('/aggregate/*', async (req, res) => {
  try {
    const runPath = req.params[0];
    const runDir = path.join(PROJECT_ROOT, 'output', runPath);

    // Security check
    const resolvedPath = path.resolve(runDir);
    const outputDir = path.resolve(path.join(PROJECT_ROOT, 'output'));
    if (!resolvedPath.startsWith(outputDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Find all CSV files in this run
    const entries = await fs.readdir(runDir);
    const csvFiles = entries.filter(f => f.startsWith('summary.') && f.endsWith('.csv'));

    if (csvFiles.length === 0) {
      return res.status(404).json({ error: 'No summary CSV files found' });
    }

    // Read and combine all CSV data
    const allRows: Record<string, string>[] = [];
    let headers: string[] = [];

    for (const csvFile of csvFiles) {
      const content = await fs.readFile(path.join(runDir, csvFile), 'utf-8');
      const parsed = parseCSV(content);
      if (parsed.headers.length > 0) {
        headers = parsed.headers;
        allRows.push(...parsed.rows);
      }
    }

    // Calculate aggregations
    const models = [...new Set(allRows.map(r => r['AI Model Name']).filter(Boolean))];
    const scenarios = [...new Set(allRows.map(r => r['Scenario']).filter(Boolean))];
    const knownColumns = ['Scenario', 'AI Model Name', 'Decision Code', 'Decision Text'];
    const dimensionColumns = headers.filter(h => !knownColumns.includes(h));

    // Decision distribution by model
    const modelDecisionDist: Record<string, Record<string, number>> = {};
    for (const model of models) {
      modelDecisionDist[model] = {};
      for (let i = 1; i <= 5; i++) {
        modelDecisionDist[model][String(i)] = 0;
      }
    }

    for (const row of allRows) {
      const model = row['AI Model Name'];
      const decision = row['Decision Code'];
      if (model && decision && modelDecisionDist[model]) {
        modelDecisionDist[model][decision] = (modelDecisionDist[model][decision] || 0) + 1;
      }
    }

    // Average decision by model
    const modelAvgDecision: Record<string, number> = {};
    for (const model of models) {
      const modelRows = allRows.filter(r => r['AI Model Name'] === model);
      const decisions = modelRows.map(r => parseInt(r['Decision Code'])).filter(d => !isNaN(d));
      modelAvgDecision[model] = decisions.length > 0
        ? decisions.reduce((a, b) => a + b, 0) / decisions.length
        : 0;
    }

    // Model decision variance (clustering measure)
    const modelVariance: Record<string, number> = {};
    for (const model of models) {
      const avg = modelAvgDecision[model];
      const modelRows = allRows.filter(r => r['AI Model Name'] === model);
      const decisions = modelRows.map(r => parseInt(r['Decision Code'])).filter(d => !isNaN(d));
      if (decisions.length > 0) {
        const variance = decisions.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / decisions.length;
        modelVariance[model] = Math.sqrt(variance);
      } else {
        modelVariance[model] = 0;
      }
    }

    // Cross-scenario comparison (how each model behaves per scenario)
    const modelScenarioMatrix: Record<string, Record<string, number>> = {};
    for (const model of models) {
      modelScenarioMatrix[model] = {};
      for (const scenario of scenarios) {
        const rows = allRows.filter(r => r['AI Model Name'] === model && r['Scenario'] === scenario);
        const decisions = rows.map(r => parseInt(r['Decision Code'])).filter(d => !isNaN(d));
        modelScenarioMatrix[model][scenario] = decisions.length > 0
          ? decisions.reduce((a, b) => a + b, 0) / decisions.length
          : 0;
      }
    }

    res.json({
      models,
      scenarios,
      dimensionColumns,
      totalRows: allRows.length,
      modelDecisionDist,
      modelAvgDecision,
      modelVariance,
      modelScenarioMatrix,
      rawRows: allRows,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to aggregate data', details: String(error) });
  }
});

export default router;

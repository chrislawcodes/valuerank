import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { createLogger } from '../utils/logger.js';
import { callLLM } from '../utils/llm.js';

const router = Router();
const PROJECT_ROOT = path.resolve(process.cwd(), '..');
const log = createLogger('analysis');

// Build a prompt for the LLM to summarize statistical analysis results
function buildSummaryPrompt(analysisResult: Record<string, unknown>): string {
  const metadata = analysisResult.metadata as Record<string, unknown> || {};
  const insights = analysisResult.insights as Array<Record<string, unknown>> || [];
  const dimensionAnalysis = analysisResult.dimension_analysis as Record<string, unknown> || {};
  const modelAnalysis = analysisResult.model_analysis as Record<string, unknown> || {};
  const agreementMetrics = analysisResult.agreement_metrics as Record<string, unknown> || {};

  return `You are an expert data analyst specializing in AI model comparison and behavioral analysis.
You have been given statistical analysis results from a study comparing how different AI models respond to ethical dilemmas.

## Context
- This data comes from the ValueRank framework, which measures how AI models prioritize moral values in ethical scenarios
- Each model is presented with the same scenarios and must choose options rated 1-5 (where different numbers represent different ethical trade-offs)
- The goal is to understand which dimensions (scenario characteristics) drive model divergence and identify behavioral patterns

## Analysis Results

### Metadata
${JSON.stringify(metadata, null, 2)}

### Key Algorithmic Insights
${insights.map((i, idx) => `${idx + 1}. [${i.type}] ${i.title}: ${i.description}`).join('\n')}

### Dimension Analysis (which dimensions drive model divergence)
${JSON.stringify(dimensionAnalysis, null, 2)}

### Model Analysis (individual model behavior patterns)
${JSON.stringify(modelAnalysis, null, 2)}

### Inter-Model Agreement Metrics
${JSON.stringify(agreementMetrics, null, 2)}

## Your Task
Provide a clear, insightful summary of these results for a researcher who wants to understand:

1. **Executive Summary** (2-3 sentences): What's the key takeaway from this analysis?

2. **Model Divergence Patterns**: Which models behave most differently from each other? Are there clusters of similar models?

3. **Dimension Sensitivity**: Which scenario dimensions cause the most disagreement between models? What does this suggest about how different AI systems weigh competing values?

4. **Outlier Analysis**: Are any models behaving as outliers? What might explain their distinctive patterns?

5. **Consensus Areas**: Where do models tend to agree? What does this suggest about shared training or value alignment?

6. **Actionable Recommendations**: What should researchers focus on next based on these findings?

Write in a professional but accessible style. Use concrete numbers and specific model names where relevant. Be direct about limitations in the data.`;
}

// Call LLM to generate a natural language summary of the analysis
async function generateLLMSummary(
  analysisResult: Record<string, unknown>,
  reqLog: ReturnType<typeof log.child>
): Promise<string | null> {
  try {
    reqLog.info('Generating LLM summary of analysis results');
    const prompt = buildSummaryPrompt(analysisResult);
    const summary = await callLLM(prompt, { maxTokens: 2000, temperature: 0.3 });
    reqLog.info('LLM summary generated', { summaryLength: summary.length });
    return summary;
  } catch (error) {
    reqLog.warn('Failed to generate LLM summary, continuing without it', { error: String(error) });
    return null;
  }
}

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
    const fullPath = (req.params as Record<string, string>)[0];
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
    const runPath = (req.params as Record<string, string>)[0];
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

// POST /api/analysis/deep - Run deep statistical analysis on CSV data
router.post('/deep', async (req, res) => {
  const reqLog = log.child('deep');
  reqLog.info('Deep analysis request received');

  try {
    const { csvContent } = req.body;

    if (!csvContent || typeof csvContent !== 'string') {
      reqLog.warn('Invalid request: missing csvContent');
      return res.status(400).json({ error: 'Missing or invalid csvContent in request body' });
    }

    reqLog.debug('CSV content received', {
      length: csvContent.length,
      lines: csvContent.split('\n').length,
    });

    const scriptPath = path.join(process.cwd(), 'scripts', 'deep_analysis.py');

    // Check if script exists
    try {
      await fs.access(scriptPath);
      reqLog.debug('Script found', { path: scriptPath });
    } catch {
      reqLog.error('Analysis script not found', { path: scriptPath });
      return res.status(500).json({
        error: 'Analysis script not found',
        details: `Expected at: ${scriptPath}`,
      });
    }

    reqLog.info('Starting Python analysis script');
    const startTime = Date.now();

    // Run the Python script with CSV content piped to stdin
    const result = await new Promise<string>((resolve, reject) => {
      const python = spawn('python3', [scriptPath, '--stdin'], {
        cwd: process.cwd(),
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
        // Log stderr in real-time for debugging
        reqLog.debug('Python stderr', { chunk: data.toString().slice(0, 200) });
      });

      python.on('close', (code) => {
        const duration = Date.now() - startTime;
        if (code !== 0) {
          reqLog.error('Python script failed', {
            code,
            duration,
            stderr: stderr.slice(0, 500),
          });
          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        } else {
          reqLog.info('Python script completed', { duration, outputLength: stdout.length });
          resolve(stdout);
        }
      });

      python.on('error', (err) => {
        reqLog.error('Failed to spawn Python process', { error: err.message });
        reject(new Error(`Failed to spawn Python process: ${err.message}`));
      });

      // Write CSV content to stdin
      python.stdin.write(csvContent);
      python.stdin.end();
    });

    // Parse the JSON result
    const analysisResult = JSON.parse(result);
    reqLog.info('Statistical analysis complete', {
      models: analysisResult.metadata?.model_count,
      scenarios: analysisResult.metadata?.scenario_count,
      insights: analysisResult.insights?.length,
    });

    // Generate LLM summary
    const llmSummary = await generateLLMSummary(analysisResult, reqLog);
    if (llmSummary) {
      analysisResult.llm_summary = llmSummary;
    }

    res.json(analysisResult);
  } catch (error) {
    reqLog.error('Deep analysis error', { error: String(error) });
    res.status(500).json({
      error: 'Failed to run deep analysis',
      details: String(error),
    });
  }
});

// POST /api/analysis/deep/run - Run deep analysis on a specific run's CSV files
router.post('/deep/run/*', async (req, res) => {
  const reqLog = log.child('deep/run');
  const runPath = (req.params as Record<string, string>)[0];
  reqLog.info('Deep analysis request for run', { runPath });

  try {
    const runDir = path.join(PROJECT_ROOT, 'output', runPath);

    // Security check
    const resolvedPath = path.resolve(runDir);
    const outputDir = path.resolve(path.join(PROJECT_ROOT, 'output'));
    if (!resolvedPath.startsWith(outputDir)) {
      reqLog.warn('Access denied - path outside output directory', { resolvedPath });
      return res.status(403).json({ error: 'Access denied' });
    }

    // Find all CSV files in this run
    const entries = await fs.readdir(runDir);
    const csvFiles = entries.filter(f => f.startsWith('summary.') && f.endsWith('.csv'));
    reqLog.debug('Found CSV files', { count: csvFiles.length, files: csvFiles });

    if (csvFiles.length === 0) {
      reqLog.warn('No summary CSV files found', { runDir });
      return res.status(404).json({ error: 'No summary CSV files found' });
    }

    // Read and combine all CSV data
    let combinedCSV = '';
    let totalLines = 0;

    for (let i = 0; i < csvFiles.length; i++) {
      const content = await fs.readFile(path.join(runDir, csvFiles[i]), 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      totalLines += lines.length - (i > 0 ? 1 : 0); // Don't count duplicate headers

      if (i === 0) {
        combinedCSV = lines.join('\n');
      } else {
        combinedCSV += '\n' + lines.slice(1).join('\n');
      }
    }

    reqLog.info('Combined CSV data', { totalLines, totalSize: combinedCSV.length });

    const scriptPath = path.join(process.cwd(), 'scripts', 'deep_analysis.py');

    // Check if script exists
    try {
      await fs.access(scriptPath);
    } catch {
      reqLog.error('Analysis script not found', { path: scriptPath });
      return res.status(500).json({
        error: 'Analysis script not found',
        details: `Expected at: ${scriptPath}`,
      });
    }

    reqLog.info('Starting Python analysis script');
    const startTime = Date.now();

    // Run the Python script
    const result = await new Promise<string>((resolve, reject) => {
      const python = spawn('python3', [scriptPath, '--stdin'], {
        cwd: process.cwd(),
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
        reqLog.debug('Python stderr', { chunk: data.toString().slice(0, 200) });
      });

      python.on('close', (code) => {
        const duration = Date.now() - startTime;
        if (code !== 0) {
          reqLog.error('Python script failed', {
            code,
            duration,
            stderr: stderr.slice(0, 500),
          });
          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
        } else {
          reqLog.info('Python script completed', { duration, outputLength: stdout.length });
          resolve(stdout);
        }
      });

      python.on('error', (err) => {
        reqLog.error('Failed to spawn Python process', { error: err.message });
        reject(new Error(`Failed to spawn Python process: ${err.message}`));
      });

      python.stdin.write(combinedCSV);
      python.stdin.end();
    });

    const analysisResult = JSON.parse(result);
    reqLog.info('Statistical analysis complete', {
      models: analysisResult.metadata?.model_count,
      scenarios: analysisResult.metadata?.scenario_count,
      insights: analysisResult.insights?.length,
    });

    // Generate LLM summary
    const llmSummary = await generateLLMSummary(analysisResult, reqLog);
    if (llmSummary) {
      analysisResult.llm_summary = llmSummary;
    }

    res.json(analysisResult);
  } catch (error) {
    reqLog.error('Deep analysis error', { error: String(error) });
    res.status(500).json({
      error: 'Failed to run deep analysis',
      details: String(error),
    });
  }
});

export default router;

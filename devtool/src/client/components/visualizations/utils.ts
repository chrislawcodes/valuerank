import type { ExtendedAggregateData } from './types';

// Parse CSV line handling quoted values
export function parseCSVLine(line: string): string[] {
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

// Parse CSV content and compute aggregate data
export function parseCSVToAggregate(content: string): ExtendedAggregateData {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return {
      models: [],
      scenarios: [],
      dimensionColumns: [],
      totalRows: 0,
      modelDecisionDist: {},
      modelAvgDecision: {},
      modelVariance: {},
      modelScenarioMatrix: {},
      rawRows: [],
    };
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

  // Extract unique values
  const models = [...new Set(rows.map(r => r['AI Model Name']).filter(Boolean))];
  const scenarios = [...new Set(rows.map(r => r['Scenario']).filter(Boolean))];
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

  for (const row of rows) {
    const model = row['AI Model Name'];
    const decision = row['Decision Code'];
    if (model && decision && modelDecisionDist[model]) {
      modelDecisionDist[model][decision] = (modelDecisionDist[model][decision] || 0) + 1;
    }
  }

  // Average decision by model
  const modelAvgDecision: Record<string, number> = {};
  for (const model of models) {
    const modelRows = rows.filter(r => r['AI Model Name'] === model);
    const decisions = modelRows.map(r => parseInt(r['Decision Code'])).filter(d => !isNaN(d));
    modelAvgDecision[model] = decisions.length > 0
      ? decisions.reduce((a, b) => a + b, 0) / decisions.length
      : 0;
  }

  // Model decision variance
  const modelVariance: Record<string, number> = {};
  for (const model of models) {
    const avg = modelAvgDecision[model];
    const modelRows = rows.filter(r => r['AI Model Name'] === model);
    const decisions = modelRows.map(r => parseInt(r['Decision Code'])).filter(d => !isNaN(d));
    if (decisions.length > 0) {
      const variance = decisions.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / decisions.length;
      modelVariance[model] = Math.sqrt(variance);
    } else {
      modelVariance[model] = 0;
    }
  }

  // Cross-scenario comparison
  const modelScenarioMatrix: Record<string, Record<string, number>> = {};
  for (const model of models) {
    modelScenarioMatrix[model] = {};
    for (const scenario of scenarios) {
      const scenarioRows = rows.filter(r => r['AI Model Name'] === model && r['Scenario'] === scenario);
      const decisions = scenarioRows.map(r => parseInt(r['Decision Code'])).filter(d => !isNaN(d));
      modelScenarioMatrix[model][scenario] = decisions.length > 0
        ? decisions.reduce((a, b) => a + b, 0) / decisions.length
        : 0;
    }
  }

  return {
    models,
    scenarios,
    dimensionColumns,
    totalRows: rows.length,
    modelDecisionDist,
    modelAvgDecision,
    modelVariance,
    modelScenarioMatrix,
    rawRows: rows,
  };
}

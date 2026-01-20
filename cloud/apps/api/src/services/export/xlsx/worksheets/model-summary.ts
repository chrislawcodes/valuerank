/**
 * Model Summary Worksheet Builder
 *
 * Creates the Model Summary worksheet with per-model statistics.
 */

import type ExcelJS from 'exceljs';

import { addWorksheet, createColumnConfig } from '../workbook.js';
import { applyTableStyle, autoSizeColumns, applyNumberFormat, NUMBER_FORMATS } from '../formatting.js';
import type { TranscriptWithScenario, ModelStatistics } from '../types.js';
import { getModelName, parseDecisionScore, calculateStdDev } from './helpers.js';

/**
 * Build the Model Summary worksheet with per-model statistics.
 *
 * Returns the computed model statistics for use in charts.
 */
export function buildModelSummarySheet(
  workbook: ExcelJS.Workbook,
  transcripts: TranscriptWithScenario[]
): ModelStatistics[] {
  // Group transcripts by model
  const modelGroups = new Map<string, TranscriptWithScenario[]>();
  for (const transcript of transcripts) {
    const modelName = getModelName(transcript.modelId);
    const group = modelGroups.get(modelName) ?? [];
    group.push(transcript);
    modelGroups.set(modelName, group);
  }

  // Calculate statistics for each model
  const stats: ModelStatistics[] = [];

  for (const [modelName, modelTranscripts] of modelGroups) {
    // Parse decision codes as scores
    const scores = modelTranscripts
      .map((t) => parseDecisionScore(t.decisionCode))
      .filter((s): s is number => s !== null);

    // Calculate decision distribution
    const distribution: Record<string, number> = {};
    for (const t of modelTranscripts) {
      const code = t.decisionCode ?? 'unknown';
      distribution[code] = (distribution[code] ?? 0) + 1;
    }

    // Calculate mean and std dev
    const meanScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const stdDev = calculateStdDev(scores);

    stats.push({
      modelName,
      sampleCount: modelTranscripts.length,
      meanScore,
      stdDev,
      decisionDistribution: distribution,
    });
  }

  // Sort by model name
  stats.sort((a, b) => a.modelName.localeCompare(b.modelName));

  // Create worksheet
  const columns = createColumnConfig([
    { header: 'Model Name', key: 'modelName', width: 25 },
    { header: 'Sample Count', key: 'sampleCount', width: 14 },
    { header: 'Mean Score', key: 'meanScore', width: 12 },
    { header: 'Std Deviation', key: 'stdDev', width: 14 },
  ]);

  const worksheet = addWorksheet(workbook, {
    name: 'Model Summary',
    type: 'model_summary',
    columns,
  });

  // Add data rows
  for (const stat of stats) {
    worksheet.addRow({
      modelName: stat.modelName,
      sampleCount: stat.sampleCount,
      meanScore: stat.meanScore,
      stdDev: stat.stdDev,
    });
  }

  // Apply formatting
  const rowCount = stats.length + 1;
  applyTableStyle(worksheet, 1, rowCount, 1, columns.length);
  autoSizeColumns(worksheet);

  // Apply number formats
  applyNumberFormat(worksheet, 3, NUMBER_FORMATS.decimal2); // Mean Score
  applyNumberFormat(worksheet, 4, NUMBER_FORMATS.decimal3); // Std Deviation

  return stats;
}

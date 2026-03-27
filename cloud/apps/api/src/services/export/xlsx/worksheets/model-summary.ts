/**
 * Model Summary Worksheet Builder
 *
 * Creates the Model Summary worksheet with per-model statistics.
 */

import type ExcelJS from 'exceljs';

import { addWorksheet, createColumnConfig } from '../workbook.js';
import { applyTableStyle, autoSizeColumns, applyNumberFormat, NUMBER_FORMATS } from '../formatting.js';
import type { TranscriptWithScenario, ModelStatistics } from '../types.js';
import {
  createEmptyDecisionDistribution,
  formatDecisionDisplay,
} from '../../decision-display.js';
import { calculateStdDev, getModelName } from './helpers.js';

function createEmptyModelStatistics(modelName: string): ModelStatistics {
  return {
    modelName,
    sampleCount: 0,
    resolvedCount: 0,
    unknownCount: 0,
    meanPreferenceScore: null,
    stdDev: 0,
    decisionDistribution: createEmptyDecisionDistribution(),
  };
}

/**
 * Build the Model Summary worksheet with per-model statistics.
 *
 * Returns the computed model statistics for use in charts.
 */
export function buildModelSummarySheet(
  workbook: ExcelJS.Workbook,
  transcripts: TranscriptWithScenario[],
): ModelStatistics[] {
  const modelGroups = new Map<string, TranscriptWithScenario[]>();
  for (const transcript of transcripts) {
    const modelName = getModelName(transcript.modelId);
    const group = modelGroups.get(modelName) ?? [];
    group.push(transcript);
    modelGroups.set(modelName, group);
  }

  const stats: ModelStatistics[] = [];

  for (const [modelName, modelTranscripts] of modelGroups) {
    const stat = createEmptyModelStatistics(modelName);
    const resolvedScores: number[] = [];

    for (const transcript of modelTranscripts) {
      const display = formatDecisionDisplay(transcript);
      stat.decisionDistribution[display.bucketLabel] += 1;

      if (display.bucketLabel === 'Unknown') {
        stat.unknownCount += 1;
        continue;
      }

      const preferenceScore = display.preferenceScore;
      if (preferenceScore !== null) {
        resolvedScores.push(preferenceScore);
        stat.resolvedCount += 1;
      } else {
        stat.unknownCount += 1;
        stat.decisionDistribution.Unknown += 1;
      }
    }

    stat.sampleCount = modelTranscripts.length;
    stat.meanPreferenceScore = resolvedScores.length > 0
      ? resolvedScores.reduce((sum, score) => sum + score, 0) / resolvedScores.length
      : null;
    stat.stdDev = calculateStdDev(resolvedScores);
    stats.push(stat);
  }

  stats.sort((left, right) => left.modelName.localeCompare(right.modelName));

  const columns = createColumnConfig([
    { header: 'Model Name', key: 'modelName', width: 25 },
    { header: 'Sample Count', key: 'sampleCount', width: 14 },
    { header: 'Resolved Count', key: 'resolvedCount', width: 14 },
    { header: 'Unknown Count', key: 'unknownCount', width: 13 },
    { header: 'Mean Preference Score', key: 'meanPreferenceScore', width: 20 },
    { header: 'Std Deviation', key: 'stdDev', width: 14 },
  ]);

  const worksheet = addWorksheet(workbook, {
    name: 'Model Summary',
    type: 'model_summary',
    columns,
  });

  for (const stat of stats) {
    worksheet.addRow({
      modelName: stat.modelName,
      sampleCount: stat.sampleCount,
      resolvedCount: stat.resolvedCount,
      unknownCount: stat.unknownCount,
      meanPreferenceScore: stat.meanPreferenceScore,
      stdDev: stat.stdDev,
    });
  }

  const rowCount = stats.length + 1;
  applyTableStyle(worksheet, 1, rowCount, 1, columns.length);
  autoSizeColumns(worksheet);

  applyNumberFormat(worksheet, 5, NUMBER_FORMATS.decimal2);
  applyNumberFormat(worksheet, 6, NUMBER_FORMATS.decimal3);

  return stats;
}

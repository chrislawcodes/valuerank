/**
 * Raw Data Worksheet Builder
 *
 * Creates the Raw Data worksheet with all transcript records.
 */

import type ExcelJS from 'exceljs';

import { addWorksheet, createColumnConfig } from '../workbook.js';
import { applyTableStyle, autoSizeColumns, applyWrapText } from '../formatting.js';
import type { TranscriptWithScenario } from '../types.js';
import {
  truncateForExcel,
} from './helpers.js';
import { collectVisibleDimensionColumns } from '../../decision-display.js';
import { transcriptToCSVRow } from '../../csv.js';

/**
 * Build the Raw Data worksheet with all transcript records.
 *
 * Columns: Model Name, Trial Signature, Batch, Sample Index, [Dimension columns],
 *          Decision Direction, Decision Strength, Decision Reason,
 *          Decision Source, Decision Parse Class, Decision Parse Path,
 *          Matched Label, Transcript ID, Full Response
 */
export function buildRawDataSheet(
  workbook: ExcelJS.Workbook,
  transcripts: TranscriptWithScenario[]
): void {
  const fixedHeaders = [
    'AI Model Name',
    'Trial Signature',
    'Batch',
    'Sample Index',
    'Decision Direction',
    'Decision Strength',
    'Decision Reason',
    'Decision Source',
    'Decision Parse Class',
    'Decision Parse Path',
    'Matched Label',
    'Transcript ID',
    'Full Response',
  ] as const;
  const dimensionColumns = collectVisibleDimensionColumns(transcripts, fixedHeaders);
  const { headers: dimensionNames } = dimensionColumns;

  // Build column configuration
  const columns = createColumnConfig([
    { header: 'AI Model Name', key: 'modelName', width: 20 },
    { header: 'Trial Signature', key: 'trialSignature', width: 16 },
    { header: 'Batch', key: 'batchName', width: 16 },
    { header: 'Sample Index', key: 'sampleIndex', width: 12 },
    ...dimensionNames.map((name) => ({ header: name, key: `dim_${name}`, width: 12 })),
    { header: 'Decision Direction', key: 'decisionDirection', width: 18 },
    { header: 'Decision Strength', key: 'decisionStrength', width: 18 },
    { header: 'Decision Reason', key: 'decisionReason', width: 16 },
    { header: 'Decision Source', key: 'decisionSource', width: 16 },
    { header: 'Decision Parse Class', key: 'parseClass', width: 18 },
    { header: 'Decision Parse Path', key: 'parsePath', width: 18 },
    { header: 'Matched Label', key: 'matchedLabel', width: 18 },
    { header: 'Transcript ID', key: 'transcriptId', width: 14 },
    { header: 'Full Response', key: 'fullResponse', width: 60 },
  ]);

  // Create worksheet
  const worksheet = addWorksheet(workbook, {
    name: 'Raw Data',
    type: 'raw_data',
    columns,
  });

  // Add data rows
  for (const transcript of transcripts) {
    const row = transcriptToCSVRow(transcript, dimensionColumns);
    const rowData: Record<string, unknown> = {
      modelName: row.modelName,
      trialSignature: row.trialSignature,
      batchName: row.batchName,
      sampleIndex: row.sampleIndex,
      decisionDirection: row.decisionDirection,
      decisionStrength: row.decisionStrength,
      decisionReason: row.decisionReason,
      decisionSource: row.decisionSource,
      parseClass: row.parseClass,
      parsePath: row.parsePath,
      matchedLabel: row.matchedLabel,
      transcriptId: row.transcriptId,
      fullResponse: truncateForExcel(row.targetResponse),
    };

    for (const dimName of dimensionNames) {
      rowData[`dim_${dimName}`] = row.variables[dimName] ?? '';
    }

    worksheet.addRow(rowData);
  }

  // Apply formatting
  const rowCount = transcripts.length + 1; // +1 for header
  const colCount = columns.length;

  applyTableStyle(worksheet, 1, rowCount, 1, colCount);
  autoSizeColumns(worksheet);

  // Apply wrap text to response column
  const responseColIndex = columns.findIndex((c) => c.key === 'fullResponse') + 1;
  if (responseColIndex > 0) {
    applyWrapText(worksheet, responseColIndex);
  }
}

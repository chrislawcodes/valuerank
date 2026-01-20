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
  getModelName,
  getTargetResponse,
  getScenarioDimensions,
  truncateForExcel,
  collectDimensionNames,
} from './helpers.js';

/**
 * Build the Raw Data worksheet with all transcript records.
 *
 * Columns: Model Name, Sample Index, [Dimension columns], Decision Code,
 *          Decision Text, Transcript ID, Full Response
 */
export function buildRawDataSheet(
  workbook: ExcelJS.Workbook,
  transcripts: TranscriptWithScenario[]
): void {
  // Collect dimension names for dynamic columns
  const dimensionNames = collectDimensionNames(transcripts);

  // Build column configuration
  const columns = createColumnConfig([
    { header: 'AI Model Name', key: 'modelName', width: 20 },
    { header: 'Sample Index', key: 'sampleIndex', width: 12 },
    ...dimensionNames.map((name) => ({ header: name, key: `dim_${name}`, width: 12 })),
    { header: 'Decision Code', key: 'decisionCode', width: 14 },
    { header: 'Decision Text', key: 'decisionText', width: 40 },
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
    const dimensions = getScenarioDimensions(transcript);
    const response = getTargetResponse(transcript);

    const rowData: Record<string, unknown> = {
      modelName: getModelName(transcript.modelId),
      sampleIndex: transcript.sampleIndex,
      decisionCode: transcript.decisionCode ?? '',
      decisionText: transcript.decisionText ?? '',
      transcriptId: transcript.id,
      fullResponse: truncateForExcel(response),
    };

    // Add dimension values
    for (const dimName of dimensionNames) {
      rowData[`dim_${dimName}`] = dimensions[dimName] ?? '';
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

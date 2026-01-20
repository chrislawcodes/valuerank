/**
 * XLSX Export Service
 *
 * Main entry point for Excel export functionality.
 * Generates multi-worksheet workbooks with charts for run analysis.
 */

import { createLogger } from '@valuerank/shared';

import { createWorkbook, workbookToBuffer, generateXlsxFilename, XLSX_MIME_TYPE } from './workbook.js';
import { addPivotTable, type PivotTableConfig } from './pivotTable.js';

import type { XlsxExportOptions, XlsxExportResult, RunExportData, TranscriptWithScenario } from './types.js';

const log = createLogger('export:xlsx');

// ============================================================================
// PUBLIC API
// ============================================================================

// Re-export types
export * from './types.js';

// Re-export workbook utilities
export { createWorkbook, generateXlsxFilename, XLSX_MIME_TYPE } from './workbook.js';

// Re-export formatting utilities
export {
  applyHeaderStyle,
  applyTableStyle,
  applyAutoFilter,
  autoSizeColumns,
  applyColorScale,
  applyDataBars,
  COLORS,
  CHART_COLORS,
} from './formatting.js';

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

/**
 * Generate an Excel export for a run.
 *
 * Creates a multi-worksheet workbook containing:
 * - Raw Data: All transcripts with model responses
 * - Model Summary: Per-model statistics
 * - Charts: Visual comparison of models
 * - Model Agreement: Correlation matrix (if 2+ models)
 * - Contested Scenarios: High-variance scenarios (if analysis available)
 * - Dimension Impact: Ranked dimension effects (if analysis available)
 * - Methods: Documentation and warnings
 *
 * @param data - Complete run data for export
 * @param options - Export configuration options
 * @returns Export result with buffer and metadata
 */
export async function generateExcelExport(
  data: RunExportData,
  options: XlsxExportOptions
): Promise<XlsxExportResult> {
  const { runId, includeAnalysis = true, includeMethods = true, includeCharts = true } = options;

  log.info(
    {
      runId,
      transcriptCount: data.transcripts.length,
      includeAnalysis,
      includeMethods,
      includeCharts,
    },
    'Starting Excel export'
  );

  const startTime = Date.now();

  // Create workbook
  const workbook = createWorkbook(runId);

  // Import worksheet builders dynamically to keep this file small
  const { buildRawDataSheet, buildModelSummarySheet, buildMethodsSheet } = await import(
    './worksheets/index.js'
  );
  const { buildChartsSheet } = await import('./charts.js');

  // Build Raw Data worksheet (always included)
  log.debug({ runId }, 'Building Raw Data worksheet');
  buildRawDataSheet(workbook, data.transcripts);

  // Build Model Summary worksheet (always included)
  log.debug({ runId }, 'Building Model Summary worksheet');
  const modelStats = buildModelSummarySheet(workbook, data.transcripts);

  // Build Charts worksheet (if enabled and we have data)
  if (includeCharts && modelStats.length > 0) {
    log.debug({ runId, modelCount: modelStats.length }, 'Building Charts worksheet');
    buildChartsSheet(workbook, modelStats);
  }

  // Build analysis worksheets (if enabled and data available)
  if (includeAnalysis && data.analysisResult) {
    const {
      buildModelAgreementSheet,
      buildContestedScenariosSheet,
      buildDimensionImpactSheet,
    } = await import('./worksheets/index.js');

    if (data.analysisResult.modelAgreement && modelStats.length >= 2) {
      log.debug({ runId }, 'Building Model Agreement worksheet');
      buildModelAgreementSheet(workbook, data.analysisResult.modelAgreement);
    }

    if (data.analysisResult.contestedScenarios && data.analysisResult.contestedScenarios.length > 0) {
      log.debug({ runId }, 'Building Contested Scenarios worksheet');
      buildContestedScenariosSheet(workbook, data.analysisResult.contestedScenarios);
    }

    if (data.analysisResult.dimensionImpact && data.analysisResult.dimensionImpact.length > 0) {
      log.debug({ runId }, 'Building Dimension Impact worksheet');
      buildDimensionImpactSheet(workbook, data.analysisResult.dimensionImpact);
    }
  }

  // Build Methods worksheet (if enabled)
  if (includeMethods) {
    log.debug({ runId }, 'Building Methods worksheet');
    const warnings = collectWarnings(data);
    buildMethodsSheet(workbook, warnings);
  }

  // Serialize workbook to buffer
  log.debug({ runId }, 'Serializing workbook to buffer');
  let buffer = await workbookToBuffer(workbook);

  // Add PivotTable to Charts worksheet (if enabled and we have data)
  if (includeCharts && modelStats.length > 0) {
    try {
      log.debug({ runId }, 'Adding PivotTable to Charts worksheet');

      // Prepare source data for PivotTable
      const pivotSourceData = preparePivotSourceData(data.transcripts);
      const lastRow = pivotSourceData.length;
      const lastCol = pivotSourceData[0]?.length ?? 1;
      const lastColLetter = String.fromCharCode(64 + lastCol);

      // Add hidden sheet with pivot source data (Raw Data has different column order)
      buffer = await addPivotSourceSheet(buffer, pivotSourceData);

      const pivotConfig: PivotTableConfig = {
        name: 'DecisionDistribution',
        sourceSheet: 'Pivot Source',  // Hidden sheet with just pivot columns
        sourceRange: `A1:${lastColLetter}${lastRow}`,
        targetSheet: 'Charts',
        targetCell: 'A6',
        rowFields: ['AI Model Name'],
        columnFields: ['Decision Code'],
        valueField: 'Decision Code',
        valueFieldLabel: 'Count',
      };

      buffer = addPivotTable(buffer, pivotConfig, pivotSourceData);
      log.debug({ runId }, 'PivotTable added successfully');
    } catch (err) {
      log.warn({ runId, err }, 'Failed to add PivotTable, falling back to simple charts');

      // Rebuild workbook with simple charts fallback
      const fallbackWorkbook = createWorkbook(runId);
      const { buildRawDataSheet: rebuildRawData, buildModelSummarySheet: rebuildModelSummary, buildMethodsSheet: rebuildMethods } = await import('./worksheets/index.js');
      const { buildSimpleChartsSheet } = await import('./charts.js');

      rebuildRawData(fallbackWorkbook, data.transcripts);
      rebuildModelSummary(fallbackWorkbook, data.transcripts);
      buildSimpleChartsSheet(fallbackWorkbook, modelStats);

      if (includeAnalysis && data.analysisResult) {
        const { buildModelAgreementSheet, buildContestedScenariosSheet, buildDimensionImpactSheet } = await import('./worksheets/index.js');
        if (data.analysisResult.modelAgreement && modelStats.length >= 2) {
          buildModelAgreementSheet(fallbackWorkbook, data.analysisResult.modelAgreement);
        }
        if (data.analysisResult.contestedScenarios && data.analysisResult.contestedScenarios.length > 0) {
          buildContestedScenariosSheet(fallbackWorkbook, data.analysisResult.contestedScenarios);
        }
        if (data.analysisResult.dimensionImpact && data.analysisResult.dimensionImpact.length > 0) {
          buildDimensionImpactSheet(fallbackWorkbook, data.analysisResult.dimensionImpact);
        }
      }

      if (includeMethods) {
        const warnings = collectWarnings(data);
        rebuildMethods(fallbackWorkbook, warnings);
      }

      buffer = await workbookToBuffer(fallbackWorkbook);
    }
  }

  const duration = Date.now() - startTime;
  log.info(
    {
      runId,
      worksheetCount: workbook.worksheets.length,
      bufferSize: buffer.length,
      durationMs: duration,
    },
    'Excel export complete'
  );

  return {
    buffer,
    filename: generateXlsxFilename(runId),
    mimeType: XLSX_MIME_TYPE,
  };
}

// ============================================================================
// PIVOT TABLE DATA PREPARATION
// ============================================================================

/**
 * Extract short model name from model ID.
 */
function getModelName(modelId: string): string {
  const withoutProvider = modelId.includes(':') ? modelId.split(':')[1] ?? modelId : modelId;
  return withoutProvider.replace(/-\d{8}$/, '');
}

/**
 * Prepare source data for PivotTable creation.
 *
 * Returns a 2D array where first row is headers and remaining rows are data.
 * The columns match the key columns from Raw Data sheet that are useful for pivoting.
 */
function preparePivotSourceData(transcripts: TranscriptWithScenario[]): string[][] {
  // Headers - simplified set for PivotTable
  const headers = ['AI Model Name', 'Decision Code'];

  // Data rows
  const dataRows = transcripts.map((t) => [
    getModelName(t.modelId),
    t.decisionCode ?? 'unknown',
  ]);

  return [headers, ...dataRows];
}

/**
 * Add a hidden "Pivot Source" sheet to the workbook buffer.
 *
 * This is needed because the Raw Data sheet has many columns (dimensions, etc.)
 * but the PivotTable only needs AI Model Name and Decision Code. By creating
 * a separate hidden sheet, we ensure the pivot cache columns match the worksheet.
 */
async function addPivotSourceSheet(xlsxBuffer: Buffer, sourceData: string[][]): Promise<Buffer> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.default.Workbook();
  await workbook.xlsx.load(xlsxBuffer as unknown as ArrayBuffer);

  // Create hidden worksheet
  const sheet = workbook.addWorksheet('Pivot Source', {
    state: 'veryHidden', // Cannot be unhidden from Excel UI
  });

  // Add headers
  const headers = sourceData[0];
  if (headers) {
    sheet.columns = headers.map((h, i) => ({
      header: h,
      key: `col${i}`,
      width: 15,
    }));
  }

  // Add data rows
  for (let i = 1; i < sourceData.length; i++) {
    const row = sourceData[i];
    if (row) {
      sheet.addRow(row);
    }
  }

  // Return updated buffer
  const newBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(newBuffer) as Buffer;
}

// ============================================================================
// WARNING COLLECTION
// ============================================================================

/**
 * Collect data quality warnings for the Methods worksheet.
 *
 * @param data - Run export data
 * @returns Array of warning messages
 */
function collectWarnings(data: RunExportData): string[] {
  const warnings: string[] = [];

  // Check for low sample count
  const modelGroups = new Map<string, number>();
  for (const t of data.transcripts) {
    const count = modelGroups.get(t.modelId) ?? 0;
    modelGroups.set(t.modelId, count + 1);
  }

  for (const [model, count] of modelGroups.entries()) {
    if (count < 10) {
      warnings.push(`Low sample size for model "${model}": ${count} transcripts. Statistical measures may be unreliable.`);
    }
  }

  // Check for missing decision codes
  const missingDecisions = data.transcripts.filter(
    (t) => t.decisionCode === null || t.decisionCode === '' || t.decisionCode === 'error' || t.decisionCode === 'pending'
  ).length;

  if (missingDecisions > 0) {
    warnings.push(`${missingDecisions} transcript(s) have missing or invalid decision codes. These are excluded from statistical calculations.`);
  }

  // Check for single model (no comparison possible)
  if (modelGroups.size === 1) {
    warnings.push('Single model run. Model Agreement analysis is not applicable.');
  }

  // Check for missing analysis data
  if (!data.analysisResult) {
    warnings.push('Analysis results are not available. Some worksheets may be omitted.');
  }

  return warnings;
}

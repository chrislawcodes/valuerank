/**
 * XLSX Workbook Module
 *
 * Handles workbook creation and worksheet management.
 * Provides utilities for creating and configuring Excel workbooks.
 */

import ExcelJS from 'exceljs';

import type { WorksheetConfig, ColumnConfig } from './types.js';

// ============================================================================
// WORKBOOK CREATION
// ============================================================================

/**
 * Create a new Excel workbook with default properties.
 * @param runId - The run ID for metadata
 * @returns A new ExcelJS Workbook instance
 */
export function createWorkbook(runId: string): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();

  // Set workbook properties
  workbook.creator = 'ValueRank';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.date1904 = false;

  // Add custom properties for tracking
  workbook.title = `ValueRank Export - ${runId}`;
  workbook.subject = 'AI Model Evaluation Results';

  return workbook;
}

// ============================================================================
// WORKSHEET MANAGEMENT
// ============================================================================

/**
 * Maximum allowed worksheet name length in Excel.
 */
const MAX_WORKSHEET_NAME_LENGTH = 31;

/**
 * Characters not allowed in Excel worksheet names.
 */
const INVALID_WORKSHEET_CHARS = /[\\/*?:[\]]/g;

/**
 * Sanitize a worksheet name to meet Excel requirements.
 * - Maximum 31 characters
 * - No invalid characters: \ / * ? : [ ]
 * - Cannot be empty
 *
 * @param name - The desired worksheet name
 * @returns A valid worksheet name
 */
export function sanitizeWorksheetName(name: string): string {
  if (!name || name.trim().length === 0) {
    return 'Sheet';
  }

  // Remove invalid characters
  let sanitized = name.replace(INVALID_WORKSHEET_CHARS, '_');

  // Truncate to max length
  if (sanitized.length > MAX_WORKSHEET_NAME_LENGTH) {
    sanitized = sanitized.substring(0, MAX_WORKSHEET_NAME_LENGTH);
  }

  return sanitized.trim() || 'Sheet';
}

/**
 * Add a worksheet to a workbook with configuration.
 *
 * @param workbook - The workbook to add the worksheet to
 * @param config - Worksheet configuration
 * @returns The created worksheet
 */
export function addWorksheet(
  workbook: ExcelJS.Workbook,
  config: WorksheetConfig
): ExcelJS.Worksheet {
  const sanitizedName = sanitizeWorksheetName(config.name);

  // Check for duplicate names and make unique if needed
  const existingNames = workbook.worksheets.map((ws) => ws.name);
  let finalName = sanitizedName;
  let counter = 1;

  while (existingNames.includes(finalName)) {
    const suffix = ` (${counter})`;
    const maxBaseLength = MAX_WORKSHEET_NAME_LENGTH - suffix.length;
    finalName = sanitizedName.substring(0, maxBaseLength) + suffix;
    counter++;
  }

  const worksheet = workbook.addWorksheet(finalName);

  // Apply column configuration if provided
  if (config.columns && config.columns.length > 0) {
    worksheet.columns = config.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width ?? 15,
    }));
  }

  return worksheet;
}

/**
 * Create column configuration for a data worksheet.
 *
 * @param headers - Array of header definitions
 * @returns Array of ColumnConfig
 */
export function createColumnConfig(
  headers: Array<{ header: string; key: string; width?: number }>
): ColumnConfig[] {
  return headers.map((h) => ({
    header: h.header,
    key: h.key,
    width: h.width ?? 15,
  }));
}

// ============================================================================
// WORKSHEET ORDERING
// ============================================================================

/**
 * Standard worksheet order for ValueRank exports.
 */
export const WORKSHEET_ORDER: readonly string[] = [
  'Raw Data',
  'Model Summary',
  'Charts',
  'Model Agreement',
  'Contested Scenarios',
  'Dimension Impact',
  'Methods',
] as const;

/**
 * Reorder worksheets in the workbook to match standard order.
 * Worksheets not in the standard order will appear at the end.
 *
 * Note: ExcelJS doesn't support worksheet reordering directly,
 * so worksheets should be added in the correct order during creation.
 * This function validates the order but doesn't modify it.
 *
 * @param workbook - The workbook to validate
 * @returns true if worksheets are in correct order
 */
export function validateWorksheetOrder(workbook: ExcelJS.Workbook): boolean {
  const worksheetNames = workbook.worksheets.map((ws) => ws.name);

  let lastOrderIndex = -1;
  for (const name of worksheetNames) {
    const orderIndex = WORKSHEET_ORDER.indexOf(name);
    if (orderIndex !== -1) {
      if (orderIndex < lastOrderIndex) {
        return false; // Out of order
      }
      lastOrderIndex = orderIndex;
    }
  }

  return true;
}

// ============================================================================
// WORKBOOK SERIALIZATION
// ============================================================================

/**
 * Write workbook to a Buffer.
 *
 * @param workbook - The workbook to serialize
 * @returns Buffer containing the XLSX file
 */
export async function workbookToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generate export filename for a run.
 *
 * @param runId - The run ID
 * @returns Formatted filename
 */
export function generateXlsxFilename(runId: string): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const shortId = runId.slice(0, 8);
  return `valuerank_${shortId}_${date}.xlsx`;
}

/**
 * MIME type for XLSX files.
 */
export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

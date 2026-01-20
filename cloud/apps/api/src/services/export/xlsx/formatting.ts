/**
 * XLSX Formatting Module
 *
 * Handles cell styling, table formatting, and conditional formatting.
 * Provides utilities for applying consistent styles across worksheets.
 */

import type ExcelJS from 'exceljs';

// ============================================================================
// COLOR DEFINITIONS
// ============================================================================

/**
 * Color palette for ValueRank exports.
 */
export const COLORS = {
  // Header colors
  headerBackground: 'FF4472C4', // Blue
  headerFont: 'FFFFFFFF', // White

  // Table colors
  tableAltRow: 'FFF2F2F2', // Light gray

  // Conditional formatting colors
  lowValue: 'FFF8696B', // Red
  midValue: 'FFFFEB84', // Yellow
  highValue: 'FF63BE7B', // Green

  // Chart colors
  chartPrimary: 'FF4472C4', // Blue
  chartSecondary: 'FFED7D31', // Orange
  chartTertiary: 'FFA5A5A5', // Gray
} as const;

/**
 * Chart color sequence for multiple series.
 */
export const CHART_COLORS = [
  '4472C4', // Blue
  'ED7D31', // Orange
  'A5A5A5', // Gray
  'FFC000', // Yellow
  '5B9BD5', // Light blue
  '70AD47', // Green
  '9E480E', // Brown
  '997300', // Olive
] as const;

// ============================================================================
// HEADER STYLING
// ============================================================================

/**
 * Style configuration for header rows.
 */
export const HEADER_STYLE: Partial<ExcelJS.Style> = {
  font: {
    bold: true,
    color: { argb: COLORS.headerFont },
    size: 11,
  },
  fill: {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.headerBackground },
  },
  alignment: {
    horizontal: 'center',
    vertical: 'middle',
    wrapText: true,
  },
  border: {
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
  },
};

/**
 * Apply header styling to the first row of a worksheet.
 *
 * @param worksheet - The worksheet to style
 */
export function applyHeaderStyle(worksheet: ExcelJS.Worksheet): void {
  const headerRow = worksheet.getRow(1);

  headerRow.eachCell((cell) => {
    cell.style = { ...HEADER_STYLE } as ExcelJS.Style;
  });

  // Set header row height
  headerRow.height = 25;

  // Freeze header row
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
}

// ============================================================================
// TABLE FORMATTING
// ============================================================================

/**
 * Apply table formatting with auto-filter to a data range.
 *
 * @param worksheet - The worksheet containing the table
 * @param startRow - First row of data (usually 1 for header)
 * @param endRow - Last row of data
 * @param startCol - First column (1-indexed)
 * @param endCol - Last column (1-indexed)
 */
export function applyTableStyle(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number
): void {
  // Apply header style to first row
  applyHeaderStyle(worksheet);

  // Apply alternating row colors
  for (let row = startRow + 1; row <= endRow; row++) {
    if (row % 2 === 0) {
      const rowObj = worksheet.getRow(row);
      for (let col = startCol; col <= endCol; col++) {
        const cell = rowObj.getCell(col);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.tableAltRow },
        };
      }
    }
  }

  // Add auto-filter to header row
  const startCell = worksheet.getCell(startRow, startCol).address;
  const endCell = worksheet.getCell(startRow, endCol).address;
  worksheet.autoFilter = `${startCell}:${endCell}`;
}

/**
 * Apply auto-filter to a worksheet based on its columns.
 *
 * @param worksheet - The worksheet to apply auto-filter to
 */
export function applyAutoFilter(worksheet: ExcelJS.Worksheet): void {
  const columnCount = worksheet.columnCount;
  if (columnCount > 0) {
    const startCell = 'A1';
    const endCell = worksheet.getCell(1, columnCount).address;
    worksheet.autoFilter = `${startCell}:${endCell}`;
  }
}

// ============================================================================
// COLUMN WIDTH AUTO-SIZING
// ============================================================================

/**
 * Default column widths by data type.
 */
export const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  id: 12,
  name: 25,
  model: 20,
  score: 10,
  number: 12,
  text: 40,
  response: 60,
} as const;

/**
 * Auto-size columns based on content.
 * Samples the first few rows to determine width.
 *
 * @param worksheet - The worksheet to auto-size
 * @param maxWidth - Maximum column width (default 60)
 * @param minWidth - Minimum column width (default 8)
 */
export function autoSizeColumns(
  worksheet: ExcelJS.Worksheet,
  maxWidth: number = 60,
  minWidth: number = 8
): void {
  worksheet.columns.forEach((column) => {
    if (column === undefined || column === null || column.values === undefined) return;

    let maxLength = minWidth;

    // Check header
    const header = column.header;
    if (typeof header === 'string') {
      maxLength = Math.max(maxLength, header.length);
    }

    // Sample first 100 rows for width calculation
    const sampleSize = Math.min(100, column.values.length);
    for (let i = 1; i <= sampleSize; i++) {
      const value = column.values[i];
      if (value !== undefined && value !== null) {
        const cellLength = String(value).length;
        maxLength = Math.max(maxLength, cellLength);
      }
    }

    // Apply width with constraints
    column.width = Math.min(maxWidth, Math.max(minWidth, maxLength + 2));
  });
}

// ============================================================================
// CONDITIONAL FORMATTING
// ============================================================================

/**
 * Apply color scale conditional formatting to a range.
 * Uses red-yellow-green gradient for numeric values.
 *
 * @param worksheet - The worksheet containing the range
 * @param startRow - First row of data
 * @param endRow - Last row of data
 * @param startCol - First column (1-indexed)
 * @param endCol - Last column (1-indexed)
 */
export function applyColorScale(
  worksheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number
): void {
  const startCell = worksheet.getCell(startRow, startCol).address;
  const endCell = worksheet.getCell(endRow, endCol).address;

  worksheet.addConditionalFormatting({
    ref: `${startCell}:${endCell}`,
    rules: [
      {
        type: 'colorScale',
        priority: 1,
        cfvo: [
          { type: 'min' },
          { type: 'percentile', value: 50 },
          { type: 'max' },
        ],
        color: [
          { argb: COLORS.lowValue },
          { argb: COLORS.midValue },
          { argb: COLORS.highValue },
        ],
      },
    ],
  });
}

/**
 * Apply data bar conditional formatting to a column.
 *
 * @param worksheet - The worksheet containing the column
 * @param colIndex - Column index (1-indexed)
 * @param startRow - First data row
 * @param endRow - Last data row
 * @param color - Bar color (default blue)
 */
export function applyDataBars(
  worksheet: ExcelJS.Worksheet,
  colIndex: number,
  startRow: number,
  endRow: number,
  _color: string = COLORS.chartPrimary
): void {
  const startCell = worksheet.getCell(startRow, colIndex).address;
  const endCell = worksheet.getCell(endRow, colIndex).address;

  // Note: ExcelJS dataBar type has limited configuration options
  // Color customization may not be fully supported
  worksheet.addConditionalFormatting({
    ref: `${startCell}:${endCell}`,
    rules: [
      {
        type: 'dataBar',
        priority: 1,
        minLength: 0,
        maxLength: 100,
        gradient: true,
        border: false,
        negativeBarBorderColorSameAsPositive: true,
        negativeBarColorSameAsPositive: true,
        axisPosition: 'auto',
        direction: 'leftToRight',
        cfvo: [{ type: 'min' }, { type: 'max' }],
      },
    ],
  });
}

// ============================================================================
// NUMBER FORMATTING
// ============================================================================

/**
 * Number format strings for common data types.
 */
export const NUMBER_FORMATS = {
  integer: '0',
  decimal2: '0.00',
  decimal3: '0.000',
  percentage: '0.0%',
  scientific: '0.00E+00',
} as const;

/**
 * Apply number format to a column.
 *
 * @param worksheet - The worksheet containing the column
 * @param colIndex - Column index (1-indexed)
 * @param format - Number format string
 */
export function applyNumberFormat(
  worksheet: ExcelJS.Worksheet,
  colIndex: number,
  format: string
): void {
  worksheet.getColumn(colIndex).numFmt = format;
}

// ============================================================================
// CELL STYLING UTILITIES
// ============================================================================

/**
 * Apply wrap text to a column.
 *
 * @param worksheet - The worksheet containing the column
 * @param colIndex - Column index (1-indexed)
 */
export function applyWrapText(worksheet: ExcelJS.Worksheet, colIndex: number): void {
  const column = worksheet.getColumn(colIndex);
  column.alignment = { ...column.alignment, wrapText: true, vertical: 'top' };
}

/**
 * Apply center alignment to a column.
 *
 * @param worksheet - The worksheet containing the column
 * @param colIndex - Column index (1-indexed)
 */
export function applyCenterAlignment(worksheet: ExcelJS.Worksheet, colIndex: number): void {
  const column = worksheet.getColumn(colIndex);
  column.alignment = { ...column.alignment, horizontal: 'center' };
}

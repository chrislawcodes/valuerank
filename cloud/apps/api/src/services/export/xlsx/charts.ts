/**
 * XLSX Charts Module
 *
 * Creates a Charts worksheet with a PivotTable for decision distribution analysis.
 * The PivotTable references the Raw Data sheet, allowing users to:
 * - Slice and filter data dynamically
 * - Change row/column fields
 * - Drill down into source data
 */

import type ExcelJS from 'exceljs';

import { addWorksheet } from './workbook.js';
import { COLORS } from './formatting.js';
import type { ModelStatistics } from './types.js';

// ============================================================================
// CHARTS WORKSHEET BUILDER
// ============================================================================

/**
 * Build the Charts worksheet with instructions and placeholder for PivotTable.
 *
 * The actual PivotTable is added later by modifying the XLSX buffer directly,
 * since ExcelJS doesn't support PivotTable creation with COUNT aggregation.
 *
 * This function creates the worksheet structure and adds helpful instructions.
 */
export function buildChartsSheet(
  workbook: ExcelJS.Workbook,
  modelStats: ModelStatistics[]
): void {
  const worksheet = addWorksheet(workbook, {
    name: 'Charts',
    type: 'charts',
  });

  if (modelStats.length === 0) {
    worksheet.getCell('A1').value = 'No model data available for charts.';
    return;
  }

  // Title
  worksheet.getCell('A1').value = 'Decision Distribution Analysis';
  worksheet.getCell('A1').font = { bold: true, size: 16 };

  // Instructions
  worksheet.getCell('A3').value = 'PivotTable';
  worksheet.getCell('A3').font = { bold: true, size: 14 };

  worksheet.getCell('A4').value =
    'The PivotTable below shows decision distribution by model. ' +
    'You can modify the fields, add filters, or drill down into the source data.';
  worksheet.getCell('A4').font = { italic: true, color: { argb: 'FF666666' } };

  // PivotTable will be inserted starting at A6
  // Leave space for it (it will be added via XML manipulation)

  // Add a note about data source
  worksheet.getCell('A30').value = 'Data Source: Raw Data worksheet';
  worksheet.getCell('A30').font = { italic: true, size: 10, color: { argb: 'FF999999' } };

  // Set column widths
  worksheet.getColumn(1).width = 25;
  worksheet.getColumn(2).width = 12;
  worksheet.getColumn(3).width = 12;
  worksheet.getColumn(4).width = 12;
  worksheet.getColumn(5).width = 12;
  worksheet.getColumn(6).width = 12;
  worksheet.getColumn(7).width = 12;

  // Freeze the title row
  worksheet.views = [{ state: 'frozen', ySplit: 2 }];
}

/**
 * Build a simple summary table as fallback when PivotTable creation fails.
 *
 * This creates a static table with hardcoded values that's still useful
 * but doesn't have the interactivity of a PivotTable.
 */
export function buildSimpleChartsSheet(
  workbook: ExcelJS.Workbook,
  modelStats: ModelStatistics[]
): void {
  const worksheet = addWorksheet(workbook, {
    name: 'Charts',
    type: 'charts',
  });

  if (modelStats.length === 0) {
    worksheet.getCell('A1').value = 'No model data available for charts.';
    return;
  }

  // Collect all unique decision codes
  const allCodes = new Set<string>();
  for (const stat of modelStats) {
    for (const code of Object.keys(stat.decisionDistribution)) {
      if (/^\d+$/.test(code)) {
        allCodes.add(code);
      }
    }
  }
  const decisionCodes = Array.from(allCodes).sort();

  if (decisionCodes.length === 0) {
    worksheet.getCell('A1').value = 'No numeric decision codes found for chart.';
    worksheet.getCell('A2').value = 'Decision codes must be numeric (e.g., 1-5) to create distribution charts.';
    return;
  }

  // Title and instructions
  worksheet.getCell('A1').value = 'Decision Distribution by Model';
  worksheet.getCell('A1').font = { bold: true, size: 16 };

  worksheet.getCell('A2').value = 'Select the table below and use Insert → Chart → Bar Chart to visualize';
  worksheet.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } };

  // Build data table starting at row 4
  const tableStartRow = 4;
  const tableStartCol = 1;

  // Header row
  let col = tableStartCol;
  worksheet.getCell(tableStartRow, col).value = 'Model';
  col++;

  for (const code of decisionCodes) {
    worksheet.getCell(tableStartRow, col).value = `Score ${code}`;
    col++;
  }
  worksheet.getCell(tableStartRow, col).value = 'Total';
  const totalCol = col;

  // Apply header styling
  for (let c = tableStartCol; c <= totalCol; c++) {
    const cell = worksheet.getCell(tableStartRow, c);
    cell.font = { bold: true, color: { argb: COLORS.headerFont } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.headerBackground },
    };
    cell.alignment = { horizontal: 'center' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
    };
  }

  // Data rows
  let row = tableStartRow + 1;
  for (const stat of modelStats) {
    col = tableStartCol;
    worksheet.getCell(row, col).value = stat.modelName;
    col++;

    let total = 0;
    for (const code of decisionCodes) {
      const count = stat.decisionDistribution[code] ?? 0;
      worksheet.getCell(row, col).value = count;
      worksheet.getCell(row, col).alignment = { horizontal: 'center' };
      total += count;
      col++;
    }
    worksheet.getCell(row, col).value = total;
    worksheet.getCell(row, col).alignment = { horizontal: 'center' };
    worksheet.getCell(row, col).font = { bold: true };

    // Alternate row coloring
    if ((row - tableStartRow) % 2 === 0) {
      for (let c = tableStartCol; c <= totalCol; c++) {
        worksheet.getCell(row, c).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.tableAltRow },
        };
      }
    }

    row++;
  }

  // Set column widths
  worksheet.getColumn(tableStartCol).width = 30;
  for (let c = tableStartCol + 1; c <= totalCol; c++) {
    worksheet.getColumn(c).width = 12;
  }

  // Add Excel Table for easy charting
  try {
    worksheet.addTable({
      name: 'DecisionDistribution',
      ref: `A${tableStartRow}`,
      headerRow: true,
      totalsRow: false,
      style: {
        theme: 'TableStyleMedium2',
        showRowStripes: true,
      },
      columns: [
        { name: 'Model', filterButton: true },
        ...decisionCodes.map((code) => ({ name: `Score ${code}`, filterButton: false })),
        { name: 'Total', filterButton: false },
      ],
      rows: modelStats.map((stat) => {
        const rowData: (string | number)[] = [stat.modelName];
        let total = 0;
        for (const code of decisionCodes) {
          const count = stat.decisionDistribution[code] ?? 0;
          rowData.push(count);
          total += count;
        }
        rowData.push(total);
        return rowData;
      }),
    });
  } catch {
    // Table creation may fail in some edge cases, but the data is still there
  }

  // Add mean scores section below
  row += 2;
  worksheet.getCell(row, 1).value = 'Mean Scores by Model';
  worksheet.getCell(row, 1).font = { bold: true, size: 14 };
  row += 2;

  // Mean scores header
  worksheet.getCell(row, 1).value = 'Model';
  worksheet.getCell(row, 2).value = 'Mean Score';
  worksheet.getCell(row, 3).value = 'Std Deviation';
  worksheet.getCell(row, 4).value = 'Sample Count';

  for (let c = 1; c <= 4; c++) {
    const cell = worksheet.getCell(row, c);
    cell.font = { bold: true, color: { argb: COLORS.headerFont } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.headerBackground },
    };
    cell.alignment = { horizontal: 'center' };
  }
  row++;

  // Mean scores data
  for (const stat of modelStats) {
    worksheet.getCell(row, 1).value = stat.modelName;
    worksheet.getCell(row, 2).value = stat.meanScore;
    worksheet.getCell(row, 2).numFmt = '0.00';
    worksheet.getCell(row, 3).value = stat.stdDev;
    worksheet.getCell(row, 3).numFmt = '0.000';
    worksheet.getCell(row, 4).value = stat.sampleCount;

    for (let c = 2; c <= 4; c++) {
      worksheet.getCell(row, c).alignment = { horizontal: 'center' };
    }
    row++;
  }

  worksheet.views = [{ state: 'frozen', ySplit: tableStartRow }];
}

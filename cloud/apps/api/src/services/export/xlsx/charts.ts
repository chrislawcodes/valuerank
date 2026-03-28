/**
 * XLSX Charts Module
 *
 * Creates a Charts worksheet with a PivotTable for canonical decision
 * distribution analysis.
 */

import type ExcelJS from 'exceljs';

import { addWorksheet } from './workbook.js';
import { COLORS } from './formatting.js';
import { DECISION_BUCKET_LABELS } from '../decision-display.js';
import type { ModelStatistics } from './types.js';

function getBucketCount(stat: ModelStatistics, label: (typeof DECISION_BUCKET_LABELS)[number]): number {
  return stat.decisionDistribution[label] ?? 0;
}

/**
 * Build the Charts worksheet with instructions and placeholder for PivotTable.
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

  worksheet.getCell('A1').value = 'Canonical Decision Distribution Analysis';
  worksheet.getCell('A1').font = { bold: true, size: 16 };

  worksheet.getCell('A3').value = 'PivotTable';
  worksheet.getCell('A3').font = { bold: true, size: 14 };

  worksheet.getCell('A4').value =
    'The PivotTable below shows canonical decision bucket counts by model. ' +
    'You can modify the fields, add filters, or drill down into the source data.';
  worksheet.getCell('A4').font = { italic: true, color: { argb: 'FF666666' } };

  worksheet.getCell('A30').value = 'Data Source: Raw Data worksheet';
  worksheet.getCell('A30').font = { italic: true, size: 10, color: { argb: 'FF999999' } };

  worksheet.getColumn(1).width = 25;
  worksheet.getColumn(2).width = 16;
  worksheet.getColumn(3).width = 16;
  worksheet.getColumn(4).width = 16;
  worksheet.getColumn(5).width = 16;
  worksheet.getColumn(6).width = 16;
  worksheet.getColumn(7).width = 16;

  worksheet.views = [{ state: 'frozen', ySplit: 2 }];
}

/**
 * Build a simple summary table as fallback when PivotTable creation fails.
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

  const bucketLabels = DECISION_BUCKET_LABELS;
  const hasResolvedData = modelStats.some((stat) => stat.resolvedCount > 0);

  worksheet.getCell('A1').value = 'Canonical Decision Distribution by Model';
  worksheet.getCell('A1').font = { bold: true, size: 16 };

  worksheet.getCell('A2').value = hasResolvedData
    ? 'Select the table below and use Insert → Chart → Bar Chart to visualize the canonical decision buckets.'
    : 'Only unresolved transcripts are available. The table still shows canonical bucket counts, but the mean preference score cells will be blank.';
  worksheet.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } };

  const tableStartRow = 4;
  const tableStartCol = 1;

  let col = tableStartCol;
  worksheet.getCell(tableStartRow, col).value = 'Model';
  col++;

  for (const label of bucketLabels) {
    worksheet.getCell(tableStartRow, col).value = label;
    col++;
  }
  worksheet.getCell(tableStartRow, col).value = 'Total';
  const totalCol = col;

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

  let row = tableStartRow + 1;
  for (const stat of modelStats) {
    col = tableStartCol;
    worksheet.getCell(row, col).value = stat.modelName;
    col++;

    let total = 0;
    for (const label of bucketLabels) {
      const count = getBucketCount(stat, label);
      worksheet.getCell(row, col).value = count;
      worksheet.getCell(row, col).alignment = { horizontal: 'center' };
      total += count;
      col++;
    }
    worksheet.getCell(row, col).value = total;
    worksheet.getCell(row, col).alignment = { horizontal: 'center' };
    worksheet.getCell(row, col).font = { bold: true };

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

  worksheet.getColumn(tableStartCol).width = 30;
  for (let c = tableStartCol + 1; c <= totalCol; c++) {
    worksheet.getColumn(c).width = 16;
  }

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
        ...bucketLabels.map((label) => ({ name: label, filterButton: false })),
        { name: 'Total', filterButton: false },
      ],
      rows: modelStats.map((stat) => {
        const rowData: (string | number)[] = [stat.modelName];
        let total = 0;
        for (const label of bucketLabels) {
          const count = getBucketCount(stat, label);
          rowData.push(count);
          total += count;
        }
        rowData.push(total);
        return rowData;
      }),
    });
  } catch {
    // Table creation may fail in some edge cases, but the data is still there.
  }

  row += 2;
  worksheet.getCell(row, 1).value = 'Mean Preference Scores by Model';
  worksheet.getCell(row, 1).font = { bold: true, size: 14 };
  row += 2;

  worksheet.getCell(row, 1).value = 'Model';
  worksheet.getCell(row, 2).value = 'Mean Preference Score';
  worksheet.getCell(row, 3).value = 'Std Deviation';
  worksheet.getCell(row, 4).value = 'Sample Count';
  worksheet.getCell(row, 5).value = 'Resolved Count';
  worksheet.getCell(row, 6).value = 'Unknown Count';

  for (let c = 1; c <= 6; c++) {
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

  for (const stat of modelStats) {
    worksheet.getCell(row, 1).value = stat.modelName;
    worksheet.getCell(row, 2).value = stat.meanPreferenceScore;
    worksheet.getCell(row, 2).numFmt = '0.00';
    worksheet.getCell(row, 3).value = stat.stdDev;
    worksheet.getCell(row, 3).numFmt = '0.000';
    worksheet.getCell(row, 4).value = stat.sampleCount;
    worksheet.getCell(row, 5).value = stat.resolvedCount;
    worksheet.getCell(row, 6).value = stat.unknownCount;

    for (let c = 2; c <= 6; c++) {
      worksheet.getCell(row, c).alignment = { horizontal: 'center' };
    }
    row++;
  }

  worksheet.getColumn(1).width = 30;
  worksheet.getColumn(2).width = 20;
  worksheet.getColumn(3).width = 14;
  worksheet.getColumn(4).width = 14;
  worksheet.getColumn(5).width = 14;
  worksheet.getColumn(6).width = 14;
}

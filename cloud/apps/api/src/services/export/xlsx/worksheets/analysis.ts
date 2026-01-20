/**
 * Analysis Worksheet Builders
 *
 * Creates worksheets for Model Agreement, Contested Scenarios, and Dimension Impact.
 */

import type ExcelJS from 'exceljs';

import { addWorksheet, createColumnConfig } from '../workbook.js';
import {
  applyTableStyle,
  autoSizeColumns,
  applyNumberFormat,
  applyColorScale,
  NUMBER_FORMATS,
} from '../formatting.js';
import type { ModelAgreementData, ContestedScenario, DimensionImpact } from '../types.js';

/**
 * Build the Model Agreement worksheet with correlation matrix.
 */
export function buildModelAgreementSheet(
  workbook: ExcelJS.Workbook,
  data: ModelAgreementData
): void {
  // Create worksheet
  const worksheet = addWorksheet(workbook, {
    name: 'Model Agreement',
    type: 'model_agreement',
  });

  // Add header row with model names
  const headerRow = ['Model', ...data.models];
  worksheet.addRow(headerRow);

  // Add data rows (correlation matrix)
  for (let i = 0; i < data.models.length; i++) {
    const rowData = [data.models[i], ...(data.correlationMatrix[i] ?? [])];
    worksheet.addRow(rowData);
  }

  // Set column widths
  worksheet.getColumn(1).width = 25; // Model name column
  for (let i = 2; i <= data.models.length + 1; i++) {
    worksheet.getColumn(i).width = 15;
  }

  // Apply formatting
  const rowCount = data.models.length + 1;
  const colCount = data.models.length + 1;

  applyTableStyle(worksheet, 1, rowCount, 1, colCount);

  // Apply color scale to correlation values (not the model name column)
  if (data.models.length > 1) {
    applyColorScale(worksheet, 2, rowCount, 2, colCount);
  }

  // Apply number format to correlation cells
  for (let col = 2; col <= colCount; col++) {
    applyNumberFormat(worksheet, col, NUMBER_FORMATS.decimal3);
  }
}

/**
 * Build the Contested Scenarios worksheet with high-variance scenarios.
 */
export function buildContestedScenariosSheet(
  workbook: ExcelJS.Workbook,
  scenarios: ContestedScenario[]
): void {
  // Create worksheet
  const columns = createColumnConfig([
    { header: 'Scenario ID', key: 'scenarioId', width: 14 },
    { header: 'Scenario Name', key: 'scenarioName', width: 30 },
    { header: 'Variance', key: 'variance', width: 12 },
  ]);

  const worksheet = addWorksheet(workbook, {
    name: 'Contested Scenarios',
    type: 'contested_scenarios',
    columns,
  });

  // Sort by variance (highest first) and take top 10
  const topScenarios = [...scenarios].sort((a, b) => b.variance - a.variance).slice(0, 10);

  // Add data rows
  for (const scenario of topScenarios) {
    worksheet.addRow({
      scenarioId: scenario.scenarioId,
      scenarioName: scenario.scenarioName,
      variance: scenario.variance,
    });
  }

  // Apply formatting
  const rowCount = topScenarios.length + 1;
  applyTableStyle(worksheet, 1, rowCount, 1, columns.length);
  autoSizeColumns(worksheet);

  // Apply number format to variance column
  applyNumberFormat(worksheet, 3, NUMBER_FORMATS.decimal3);
}

/**
 * Build the Dimension Impact worksheet with ranked dimensions.
 */
export function buildDimensionImpactSheet(
  workbook: ExcelJS.Workbook,
  dimensions: DimensionImpact[]
): void {
  // Create worksheet
  const columns = createColumnConfig([
    { header: 'Dimension', key: 'dimensionName', width: 25 },
    { header: 'Effect Size', key: 'effectSize', width: 14 },
    { header: 'p-Value', key: 'pValue', width: 12 },
  ]);

  const worksheet = addWorksheet(workbook, {
    name: 'Dimension Impact',
    type: 'dimension_impact',
    columns,
  });

  // Sort by effect size (highest first)
  const sortedDimensions = [...dimensions].sort((a, b) => b.effectSize - a.effectSize);

  // Add data rows
  for (const dim of sortedDimensions) {
    worksheet.addRow({
      dimensionName: dim.dimensionName,
      effectSize: dim.effectSize,
      pValue: dim.pValue,
    });
  }

  // Apply formatting
  const rowCount = sortedDimensions.length + 1;
  applyTableStyle(worksheet, 1, rowCount, 1, columns.length);
  autoSizeColumns(worksheet);

  // Apply number formats
  applyNumberFormat(worksheet, 2, NUMBER_FORMATS.decimal3); // Effect Size
  applyNumberFormat(worksheet, 3, NUMBER_FORMATS.scientific); // p-Value
}

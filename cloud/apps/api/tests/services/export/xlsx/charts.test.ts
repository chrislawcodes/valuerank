/**
 * Charts Test Suite
 *
 * Tests for xlsx chart builder functions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';

import { buildChartsSheet, buildSimpleChartsSheet } from '../../../../src/services/export/xlsx/charts.js';
import type { ModelStatistics } from '../../../../src/services/export/xlsx/types.js';
import { createWorkbook } from '../../../../src/services/export/xlsx/workbook.js';
import { DECISION_BUCKET_LABELS } from '../../../../src/services/export/decision-display.js';

// ============================================================================
// TEST DATA
// ============================================================================

function createMockModelStats(count: number = 3): ModelStatistics[] {
  const models = ['claude-3-5-sonnet', 'gpt-4o', 'gemini-pro'];
  return models.slice(0, count).map((name, i) => ({
    modelName: name,
    sampleCount: 50,
    resolvedCount: 45,
    unknownCount: 5,
    meanPreferenceScore: 1.5 + i * 0.25,
    stdDev: 0.8,
    decisionDistribution: {
      'First side strong': 5,
      'First side lean': 10,
      Neutral: 20,
      'Second side lean': 10,
      'Second side strong': 5,
      Unknown: 5,
    },
  }));
}

// ============================================================================
// BUILD CHARTS SHEET TESTS (PIVOT TABLE PLACEHOLDER)
// ============================================================================

describe('buildChartsSheet', () => {
  let workbook: ExcelJS.Workbook;

  beforeEach(() => {
    workbook = createWorkbook('test-run');
  });

  it('creates a worksheet named "Charts"', () => {
    const stats = createMockModelStats();
    buildChartsSheet(workbook, stats);

    const worksheet = workbook.getWorksheet('Charts');
    expect(worksheet).toBeDefined();
  });

  it('includes title in worksheet', () => {
    const stats = createMockModelStats();
    buildChartsSheet(workbook, stats);

    const worksheet = workbook.getWorksheet('Charts');
    let foundTitle = false;

    worksheet!.eachRow((row) => {
      const cellValue = row.getCell(1).value;
      if (typeof cellValue === 'string' && cellValue.includes('Canonical Decision Distribution')) {
        foundTitle = true;
      }
    });

    expect(foundTitle).toBe(true);
  });

  it('includes PivotTable label', () => {
    const stats = createMockModelStats();
    buildChartsSheet(workbook, stats);

    const worksheet = workbook.getWorksheet('Charts');
    let foundPivotLabel = false;

    worksheet!.eachRow((row) => {
      const cellValue = row.getCell(1).value;
      if (typeof cellValue === 'string' && cellValue.includes('PivotTable')) {
        foundPivotLabel = true;
      }
    });

    expect(foundPivotLabel).toBe(true);
  });

  it('includes data source reference', () => {
    const stats = createMockModelStats();
    buildChartsSheet(workbook, stats);

    const worksheet = workbook.getWorksheet('Charts');
    let foundDataSource = false;

    worksheet!.eachRow((row) => {
      const cellValue = row.getCell(1).value;
      if (typeof cellValue === 'string' && cellValue.includes('Raw Data')) {
        foundDataSource = true;
      }
    });

    expect(foundDataSource).toBe(true);
  });

  it('handles empty model statistics', () => {
    buildChartsSheet(workbook, []);

    const worksheet = workbook.getWorksheet('Charts');
    expect(worksheet).toBeDefined();

    let foundNoDataMessage = false;
    worksheet!.eachRow((row) => {
      const cellValue = row.getCell(1).value;
      if (typeof cellValue === 'string' && cellValue.includes('No model data')) {
        foundNoDataMessage = true;
      }
    });

    expect(foundNoDataMessage).toBe(true);
  });
});

// ============================================================================
// BUILD SIMPLE CHARTS SHEET TESTS (FALLBACK WITH DATA TABLE)
// ============================================================================

describe('buildSimpleChartsSheet', () => {
  let workbook: ExcelJS.Workbook;

  beforeEach(() => {
    workbook = createWorkbook('test-run');
  });

  it('creates a worksheet named "Charts"', () => {
    const stats = createMockModelStats();
    buildSimpleChartsSheet(workbook, stats);

    const worksheet = workbook.getWorksheet('Charts');
    expect(worksheet).toBeDefined();
  });

  it('includes title in worksheet', () => {
    const stats = createMockModelStats();
    buildSimpleChartsSheet(workbook, stats);

    const worksheet = workbook.getWorksheet('Charts');
    let foundTitle = false;

    worksheet!.eachRow((row) => {
      const cellValue = row.getCell(1).value;
      if (typeof cellValue === 'string' && cellValue.includes('Canonical Decision Distribution')) {
        foundTitle = true;
      }
    });

    expect(foundTitle).toBe(true);
  });

  it('includes model names in data table', () => {
    const stats = createMockModelStats(2);
    buildSimpleChartsSheet(workbook, stats);

    const worksheet = workbook.getWorksheet('Charts');
    let foundModels = 0;

    worksheet!.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value === 'claude-3-5-sonnet' || cell.value === 'gpt-4o') {
          foundModels++;
        }
      });
    });

    expect(foundModels).toBeGreaterThan(0);
  });

  it('includes canonical bucket headers in the fixed order', () => {
    const stats = createMockModelStats();
    buildSimpleChartsSheet(workbook, stats);

    const worksheet = workbook.getWorksheet('Charts');
    const headers = [
      worksheet!.getCell(4, 2).value,
      worksheet!.getCell(4, 3).value,
      worksheet!.getCell(4, 4).value,
      worksheet!.getCell(4, 5).value,
      worksheet!.getCell(4, 6).value,
      worksheet!.getCell(4, 7).value,
    ];

    expect(headers).toEqual([...DECISION_BUCKET_LABELS]);
  });

  it('includes total column', () => {
    const stats = createMockModelStats();
    buildSimpleChartsSheet(workbook, stats);

    const worksheet = workbook.getWorksheet('Charts');
    let foundTotal = false;

    worksheet!.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value === 'Total') {
          foundTotal = true;
        }
      });
    });

    expect(foundTotal).toBe(true);
  });

  it('includes instructions for creating chart', () => {
    const stats = createMockModelStats();
    buildSimpleChartsSheet(workbook, stats);

    const worksheet = workbook.getWorksheet('Charts');
    let foundInstructions = false;

    worksheet!.eachRow((row) => {
      const cellValue = row.getCell(1).value;
      if (typeof cellValue === 'string' && cellValue.includes('Insert')) {
        foundInstructions = true;
      }
    });

    expect(foundInstructions).toBe(true);
  });

  it('includes mean preference scores section', () => {
    const stats = createMockModelStats();
    buildSimpleChartsSheet(workbook, stats);

    const worksheet = workbook.getWorksheet('Charts');
    let foundMeanScores = false;

    worksheet!.eachRow((row) => {
      const cellValue = row.getCell(1).value;
      if (typeof cellValue === 'string' && cellValue.includes('Mean Preference Scores')) {
        foundMeanScores = true;
      }
    });

    expect(foundMeanScores).toBe(true);
  });

  it('handles empty model statistics', () => {
    buildSimpleChartsSheet(workbook, []);

    const worksheet = workbook.getWorksheet('Charts');
    expect(worksheet).toBeDefined();

    let foundNoDataMessage = false;
    worksheet!.eachRow((row) => {
      const cellValue = row.getCell(1).value;
      if (typeof cellValue === 'string' && cellValue.includes('No model data')) {
        foundNoDataMessage = true;
      }
    });

    expect(foundNoDataMessage).toBe(true);
  });

  it('handles unknown-only stats with a blank mean preference score', () => {
    const stats: ModelStatistics[] = [
      {
        modelName: 'test-model',
        sampleCount: 10,
        resolvedCount: 0,
        unknownCount: 10,
        meanPreferenceScore: null,
        stdDev: 0,
        decisionDistribution: {
          'First side strong': 0,
          'First side lean': 0,
          Neutral: 0,
          'Second side lean': 0,
          'Second side strong': 0,
          Unknown: 10,
        },
      },
    ];

    buildSimpleChartsSheet(workbook, stats);

    const worksheet = workbook.getWorksheet('Charts');
    let foundNoCodesMessage = false;

    worksheet!.eachRow((row) => {
      const cellValue = row.getCell(1).value;
      if (typeof cellValue === 'string' && cellValue.includes('Only unresolved transcripts are available')) {
        foundNoCodesMessage = true;
      }
    });

    expect(foundNoCodesMessage).toBe(true);
  });
});

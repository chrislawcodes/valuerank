/**
 * PivotTable Test Suite
 *
 * Tests for XLSX PivotTable creation via XML manipulation.
 */

import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import ExcelJS from 'exceljs';

import { addPivotTable, type PivotTableConfig } from '../../../../src/services/export/xlsx/pivotTable.js';
import { createWorkbook, workbookToBuffer } from '../../../../src/services/export/xlsx/workbook.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

async function createTestWorkbook(): Promise<Buffer> {
  const workbook = createWorkbook('test-run');

  // Add Raw Data worksheet
  const rawDataSheet = workbook.addWorksheet('Raw Data');
  rawDataSheet.addRow(['AI Model Name', 'Decision Code']);
  rawDataSheet.addRow(['claude-3-5-sonnet', '3']);
  rawDataSheet.addRow(['claude-3-5-sonnet', '4']);
  rawDataSheet.addRow(['gpt-4o', '2']);
  rawDataSheet.addRow(['gpt-4o', '3']);

  // Add Charts worksheet (placeholder for PivotTable)
  const chartsSheet = workbook.addWorksheet('Charts');
  chartsSheet.getCell('A1').value = 'Decision Distribution Analysis';

  return workbookToBuffer(workbook);
}

// ============================================================================
// PIVOT TABLE TESTS
// ============================================================================

describe('addPivotTable', () => {
  it('adds pivotCache files to the workbook', async () => {
    const buffer = await createTestWorkbook();
    const sourceData = [
      ['AI Model Name', 'Decision Code'],
      ['claude-3-5-sonnet', '3'],
      ['claude-3-5-sonnet', '4'],
      ['gpt-4o', '2'],
      ['gpt-4o', '3'],
    ];

    const config: PivotTableConfig = {
      name: 'TestPivot',
      sourceSheet: 'Raw Data',
      sourceRange: 'A1:B5',
      targetSheet: 'Charts',
      targetCell: 'A6',
      rowFields: ['AI Model Name'],
      columnFields: ['Decision Code'],
      valueField: 'Decision Code',
      valueFieldLabel: 'Count',
    };

    const result = addPivotTable(buffer, config, sourceData);

    // Verify the result is a buffer
    expect(Buffer.isBuffer(result)).toBe(true);

    // Verify pivot cache files were added
    const zip = new AdmZip(result);
    const pivotCacheDef = zip.getEntry('xl/pivotCache/pivotCacheDefinition1.xml');
    const pivotCacheRec = zip.getEntry('xl/pivotCache/pivotCacheRecords1.xml');
    const pivotTable = zip.getEntry('xl/pivotTables/pivotTable1.xml');

    expect(pivotCacheDef).not.toBeNull();
    expect(pivotCacheRec).not.toBeNull();
    expect(pivotTable).not.toBeNull();
  });

  it('updates Content_Types.xml with pivot table entries', async () => {
    const buffer = await createTestWorkbook();
    const sourceData = [
      ['AI Model Name', 'Decision Code'],
      ['claude-3-5-sonnet', '3'],
      ['gpt-4o', '2'],
    ];

    const config: PivotTableConfig = {
      name: 'TestPivot',
      sourceSheet: 'Raw Data',
      sourceRange: 'A1:B3',
      targetSheet: 'Charts',
      targetCell: 'A6',
      rowFields: ['AI Model Name'],
      columnFields: ['Decision Code'],
      valueField: 'Decision Code',
    };

    const result = addPivotTable(buffer, config, sourceData);
    const zip = new AdmZip(result);

    const contentTypes = zip.getEntry('[Content_Types].xml')?.getData().toString('utf-8');
    expect(contentTypes).toContain('pivotCacheDefinition');
    expect(contentTypes).toContain('pivotCacheRecords');
    expect(contentTypes).toContain('pivotTable');
  });

  it('updates workbook.xml with pivotCaches element', async () => {
    const buffer = await createTestWorkbook();
    const sourceData = [
      ['AI Model Name', 'Decision Code'],
      ['claude-3-5-sonnet', '3'],
    ];

    const config: PivotTableConfig = {
      name: 'TestPivot',
      sourceSheet: 'Raw Data',
      sourceRange: 'A1:B2',
      targetSheet: 'Charts',
      targetCell: 'A6',
      rowFields: ['AI Model Name'],
      columnFields: [],
      valueField: 'Decision Code',
    };

    const result = addPivotTable(buffer, config, sourceData);
    const zip = new AdmZip(result);

    const workbookXml = zip.getEntry('xl/workbook.xml')?.getData().toString('utf-8');
    expect(workbookXml).toContain('pivotCaches');
    expect(workbookXml).toContain('pivotCache');
  });

  it('creates pivotTableDefinition with correct field configuration', async () => {
    const buffer = await createTestWorkbook();
    const sourceData = [
      ['AI Model Name', 'Decision Code'],
      ['claude-3-5-sonnet', '3'],
      ['gpt-4o', '2'],
    ];

    const config: PivotTableConfig = {
      name: 'DecisionDistribution',
      sourceSheet: 'Raw Data',
      sourceRange: 'A1:B3',
      targetSheet: 'Charts',
      targetCell: 'A6',
      rowFields: ['AI Model Name'],
      columnFields: ['Decision Code'],
      valueField: 'Decision Code',
      valueFieldLabel: 'Count',
    };

    const result = addPivotTable(buffer, config, sourceData);
    const zip = new AdmZip(result);

    const pivotTableXml = zip.getEntry('xl/pivotTables/pivotTable1.xml')?.getData().toString('utf-8');
    expect(pivotTableXml).toContain('name="DecisionDistribution"');
    expect(pivotTableXml).toContain('rowFields');
    expect(pivotTableXml).toContain('colFields');
    expect(pivotTableXml).toContain('dataFields');
    expect(pivotTableXml).toContain('subtotal="count"');
  });

  it('throws error for non-existent target sheet', async () => {
    const buffer = await createTestWorkbook();
    const sourceData = [
      ['AI Model Name', 'Decision Code'],
      ['claude-3-5-sonnet', '3'],
    ];

    const config: PivotTableConfig = {
      name: 'TestPivot',
      sourceSheet: 'Raw Data',
      sourceRange: 'A1:B2',
      targetSheet: 'NonExistent',
      targetCell: 'A6',
      rowFields: ['AI Model Name'],
      columnFields: [],
      valueField: 'Decision Code',
    };

    expect(() => addPivotTable(buffer, config, sourceData)).toThrow('Target sheet not found');
  });

  it('throws error for non-existent row field', async () => {
    const buffer = await createTestWorkbook();
    const sourceData = [
      ['AI Model Name', 'Decision Code'],
      ['claude-3-5-sonnet', '3'],
    ];

    const config: PivotTableConfig = {
      name: 'TestPivot',
      sourceSheet: 'Raw Data',
      sourceRange: 'A1:B2',
      targetSheet: 'Charts',
      targetCell: 'A6',
      rowFields: ['NonExistentField'],
      columnFields: [],
      valueField: 'Decision Code',
    };

    expect(() => addPivotTable(buffer, config, sourceData)).toThrow('Row field not found');
  });

  it('throws error for non-existent value field', async () => {
    const buffer = await createTestWorkbook();
    const sourceData = [
      ['AI Model Name', 'Decision Code'],
      ['claude-3-5-sonnet', '3'],
    ];

    const config: PivotTableConfig = {
      name: 'TestPivot',
      sourceSheet: 'Raw Data',
      sourceRange: 'A1:B2',
      targetSheet: 'Charts',
      targetCell: 'A6',
      rowFields: ['AI Model Name'],
      columnFields: [],
      valueField: 'NonExistentField',
    };

    expect(() => addPivotTable(buffer, config, sourceData)).toThrow('Value field not found');
  });
});

/**
 * Test script to generate an XLSX with PivotTable for debugging.
 */

import { createWorkbook, workbookToBuffer } from '../src/services/export/xlsx/workbook.js';
import { addPivotTable } from '../src/services/export/xlsx/pivotTable.js';
import * as fs from 'fs';

async function test() {
  const workbook = createWorkbook('test-run');

  // Add Raw Data worksheet
  const rawDataSheet = workbook.addWorksheet('Raw Data');
  rawDataSheet.addRow(['AI Model Name', 'Decision Code']);
  rawDataSheet.addRow(['claude-3-5-sonnet', '3']);
  rawDataSheet.addRow(['claude-3-5-sonnet', '4']);
  rawDataSheet.addRow(['gpt-4o', '2']);
  rawDataSheet.addRow(['gpt-4o', '3']);

  // Add Charts worksheet
  const chartsSheet = workbook.addWorksheet('Charts');
  chartsSheet.getCell('A1').value = 'Decision Distribution Analysis';

  // Get buffer
  let buffer = await workbookToBuffer(workbook);

  // Add PivotTable
  const sourceData = [
    ['AI Model Name', 'Decision Code'],
    ['claude-3-5-sonnet', '3'],
    ['claude-3-5-sonnet', '4'],
    ['gpt-4o', '2'],
    ['gpt-4o', '3'],
  ];

  buffer = addPivotTable(buffer, {
    name: 'TestPivot',
    sourceSheet: 'Raw Data',
    sourceRange: 'A1:B5',
    targetSheet: 'Charts',
    targetCell: 'A6',
    rowFields: ['AI Model Name'],
    columnFields: ['Decision Code'],
    valueField: 'Decision Code',
    valueFieldLabel: 'Count',
  }, sourceData);

  fs.writeFileSync('/tmp/test_pivot.xlsx', buffer);
  console.log('Wrote /tmp/test_pivot.xlsx');
}

test().catch(console.error);

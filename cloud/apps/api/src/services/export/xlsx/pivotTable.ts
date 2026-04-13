/**
 * XLSX PivotTable Module
 *
 * Creates Excel PivotTables by directly manipulating the Open XML structure.
 * This allows us to use COUNT aggregation which isn't supported by ExcelJS.
 *
 * Reference: https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-pivottables
 */

import AdmZip from 'adm-zip';
import { AppError } from '@valuerank/shared';
import {
  colToLetter,
  type FieldInfo,
  generatePivotCacheDefinition,
  generatePivotCacheRecords,
  generatePivotTableDefinition,
  parseCellRef,
} from './pivotTable-xml.js';

export type PivotTableConfig = {
  /** Name of the PivotTable */
  name: string;
  /** Source worksheet name */
  sourceSheet: string;
  /** Cell range for source data (e.g., "A1:G100") */
  sourceRange: string;
  /** Target worksheet name where PivotTable will be placed */
  targetSheet: string;
  /** Top-left cell for PivotTable placement */
  targetCell: string;
  /** Field names for row labels */
  rowFields: string[];
  /** Field names for column labels */
  columnFields: string[];
  /** Field name for values (will use COUNT aggregation) */
  valueField: string;
  /** Display name for the value field */
  valueFieldLabel?: string;
  /** Optional explicit field ordering for pivot cache values */
  fieldValueOrder?: Record<string, string[]>;
};

/**
 * Add a PivotTable to an existing XLSX buffer.
 *
 * @param xlsxBuffer - The existing workbook buffer
 * @param config - PivotTable configuration
 * @param sourceData - Source data array (first row is headers, rest is data)
 * @returns Modified workbook buffer with PivotTable
 */
export function addPivotTable(
  xlsxBuffer: Buffer,
  config: PivotTableConfig,
  sourceData: string[][]
): Buffer {
  const zip = new AdmZip(xlsxBuffer);

  // Extract headers and data
  const headers = sourceData[0] ?? [];
  const dataRows = sourceData.slice(1);

  // Build field info with unique values
  const fields: FieldInfo[] = headers.map((name, index) => {
    const explicitOrder = config.fieldValueOrder?.[name];
    const uniqueValues = explicitOrder !== undefined
      ? [...explicitOrder]
      : [...new Set(dataRows.map((row) => row[index] ?? ''))].sort();
    return { name, index, uniqueValues };
  });

  // Find the target worksheet's sheet ID
  const workbookXml = zip.getEntry('xl/workbook.xml')?.getData().toString('utf-8');
  if (workbookXml === undefined || workbookXml === null || workbookXml === '') throw new AppError('workbook.xml not found', 'XLSX_PARSE_ERROR');

  // Get sheet IDs from workbook
  const sheetMatches = workbookXml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g);
  const sheets = new Map<string, string>();
  for (const match of sheetMatches) {
    const sheetName = match[1];
    const sheetRid = match[2];
    if (sheetName !== undefined && sheetRid !== undefined) {
      sheets.set(sheetName, sheetRid);
    }
  }

  const targetSheetRid = sheets.get(config.targetSheet);
  if (targetSheetRid === undefined || targetSheetRid === null || targetSheetRid === '') throw new AppError(`Target sheet not found: ${config.targetSheet}`, 'XLSX_CONFIG_ERROR');

  // Get the worksheet path from relationships
  const workbookRels = zip.getEntry('xl/_rels/workbook.xml.rels')?.getData().toString('utf-8');
  if (workbookRels === undefined || workbookRels === null || workbookRels === '') throw new AppError('workbook.xml.rels not found', 'XLSX_PARSE_ERROR');

  const relMatch = workbookRels.match(new RegExp(`Id="${targetSheetRid}"[^>]*Target="([^"]*)"`));
  const worksheetPath = relMatch !== null ? `xl/${relMatch[1]}` : null;
  if (worksheetPath === null) throw new AppError(`Worksheet path not found for ${targetSheetRid}`, 'XLSX_PARSE_ERROR');

  // Calculate target location for PivotTable
  const targetCellRef = parseCellRef(config.targetCell);
  const numRows = config.rowFields.length > 0 ? fields.find(f => f.name === config.rowFields[0])?.uniqueValues.length ?? 1 : 1;
  const numCols = config.columnFields.length > 0 ? fields.find(f => f.name === config.columnFields[0])?.uniqueValues.length ?? 1 : 1;
  const endCol = colToLetter(targetCellRef.col + numCols + 1);
  const endRow = targetCellRef.row + numRows + 3;
  const targetLocation = `${config.targetCell}:${endCol}${endRow}`;

  // Generate XML content
  const pivotCacheDefXml = generatePivotCacheDefinition(config, fields, dataRows.length);
  const pivotCacheRecordsXml = generatePivotCacheRecords(fields, dataRows);
  const pivotTableDefXml = generatePivotTableDefinition(config, fields, targetLocation);

  // Add pivot cache files
  zip.addFile('xl/pivotCache/pivotCacheDefinition1.xml', Buffer.from(pivotCacheDefXml, 'utf-8'));
  zip.addFile('xl/pivotCache/pivotCacheRecords1.xml', Buffer.from(pivotCacheRecordsXml, 'utf-8'));

  // Add pivot table definition
  zip.addFile('xl/pivotTables/pivotTable1.xml', Buffer.from(pivotTableDefXml, 'utf-8'));

  // Add pivot cache relationship file
  const pivotCacheRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheRecords" Target="pivotCacheRecords1.xml"/>
</Relationships>`;
  zip.addFile('xl/pivotCache/_rels/pivotCacheDefinition1.xml.rels', Buffer.from(pivotCacheRels, 'utf-8'));

  // Add pivot table relationship file
  const pivotTableRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheDefinition" Target="../pivotCache/pivotCacheDefinition1.xml"/>
</Relationships>`;
  zip.addFile('xl/pivotTables/_rels/pivotTable1.xml.rels', Buffer.from(pivotTableRels, 'utf-8'));

  // Update workbook.xml to add pivotCache reference
  const updatedWorkbookXml = workbookXml.replace(
    '</workbook>',
    `<pivotCaches>
      <pivotCache cacheId="1" r:id="rId99"/>
    </pivotCaches>
</workbook>`
  );
  zip.updateFile('xl/workbook.xml', Buffer.from(updatedWorkbookXml, 'utf-8'));

  // Update workbook.xml.rels to add pivotCacheDefinition relationship
  const updatedWorkbookRels = workbookRels.replace(
    '</Relationships>',
    `<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheDefinition" Target="pivotCache/pivotCacheDefinition1.xml"/>
</Relationships>`
  );
  zip.updateFile('xl/_rels/workbook.xml.rels', Buffer.from(updatedWorkbookRels, 'utf-8'));

  // Get or create worksheet rels
  // The rels file should be in a _rels folder next to the worksheet file
  // e.g., xl/worksheets/sheet3.xml -> xl/worksheets/_rels/sheet3.xml.rels
  const worksheetDir = worksheetPath.substring(0, worksheetPath.lastIndexOf('/'));
  const worksheetFilename = worksheetPath.substring(worksheetPath.lastIndexOf('/') + 1);
  const worksheetRelsPath = `${worksheetDir}/_rels/${worksheetFilename}.rels`;
  let worksheetRels = zip.getEntry(worksheetRelsPath)?.getData().toString('utf-8');

  if (worksheetRels !== undefined) {
    // Add pivotTable relationship to existing rels
    worksheetRels = worksheetRels.replace(
      '</Relationships>',
      `<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable" Target="../pivotTables/pivotTable1.xml"/>
</Relationships>`
    );
    zip.updateFile(worksheetRelsPath, Buffer.from(worksheetRels, 'utf-8'));
  } else {
    // Create new rels file
    const newWorksheetRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable" Target="../pivotTables/pivotTable1.xml"/>
</Relationships>`;
    zip.addFile(worksheetRelsPath, Buffer.from(newWorksheetRels, 'utf-8'));
  }

  // Update [Content_Types].xml
  const contentTypes = zip.getEntry('[Content_Types].xml')?.getData().toString('utf-8');
  if (contentTypes === undefined || contentTypes === null || contentTypes === '') throw new AppError('[Content_Types].xml not found', 'XLSX_PARSE_ERROR');

  const updatedContentTypes = contentTypes.replace(
    '</Types>',
    `<Override PartName="/xl/pivotCache/pivotCacheDefinition1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml"/>
  <Override PartName="/xl/pivotCache/pivotCacheRecords1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml"/>
  <Override PartName="/xl/pivotTables/pivotTable1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml"/>
</Types>`
  );
  zip.updateFile('[Content_Types].xml', Buffer.from(updatedContentTypes, 'utf-8'));

  return zip.toBuffer();
}

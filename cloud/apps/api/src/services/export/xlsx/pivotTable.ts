/**
 * XLSX PivotTable Module
 *
 * Creates Excel PivotTables by directly manipulating the Open XML structure.
 * This allows us to use COUNT aggregation which isn't supported by ExcelJS.
 *
 * Reference: https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-pivottables
 */

import AdmZip from 'adm-zip';

// ============================================================================
// TYPES
// ============================================================================

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
};

type FieldInfo = {
  name: string;
  index: number;
  uniqueValues: string[];
};

// ============================================================================
// XML TEMPLATES
// ============================================================================

const PIVOT_CACHE_DEFINITION_NS =
  'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const PIVOT_TABLE_DEFINITION_NS =
  'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Escape XML special characters.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Parse cell reference to row and column numbers.
 */
function parseCellRef(ref: string): { col: number; row: number } {
  const match = ref.match(/^([A-Z]+)(\d+)$/);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new Error(`Invalid cell reference: ${ref}`);
  }

  const colStr = match[1];
  const rowStr = match[2];

  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }

  return { col: col - 1, row: parseInt(rowStr, 10) - 1 };
}

/**
 * Convert column number to Excel column letter.
 */
function colToLetter(col: number): string {
  let letter = '';
  let n = col + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/**
 * Generate pivot cache definition XML.
 */
function generatePivotCacheDefinition(
  config: PivotTableConfig,
  fields: FieldInfo[],
  recordCount: number
): string {
  const cacheFields = fields
    .map((field) => {
      const sharedItems = field.uniqueValues
        .map((v) => `<s v="${escapeXml(v)}"/>`)
        .join('');
      // Excel prefers minimal sharedItems - just count attribute
      return `<cacheField name="${escapeXml(field.name)}" numFmtId="0">
        <sharedItems count="${field.uniqueValues.length}">${sharedItems}</sharedItems>
      </cacheField>`;
    })
    .join('\n');

  // Simplified attributes to match Excel's expected format
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pivotCacheDefinition ${PIVOT_CACHE_DEFINITION_NS}
    r:id="rId1"
    refreshOnLoad="1"
    refreshedBy="ValueRank"
    refreshedVersion="8"
    recordCount="${recordCount}">
  <cacheSource type="worksheet">
    <worksheetSource ref="${config.sourceRange}" sheet="${escapeXml(config.sourceSheet)}"/>
  </cacheSource>
  <cacheFields count="${fields.length}">
    ${cacheFields}
  </cacheFields>
</pivotCacheDefinition>`;
}

/**
 * Generate pivot cache records XML.
 */
function generatePivotCacheRecords(
  fields: FieldInfo[],
  data: string[][]
): string {
  const records = data
    .map((row) => {
      const cells = fields
        .map((field, i) => {
          const value = row[i] ?? '';
          const valueIndex = field.uniqueValues.indexOf(value);
          return `<x v="${valueIndex >= 0 ? valueIndex : 0}"/>`;
        })
        .join('');
      return `<r>${cells}</r>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pivotCacheRecords ${PIVOT_CACHE_DEFINITION_NS} count="${data.length}">
  ${records}
</pivotCacheRecords>`;
}

/**
 * Generate pivot table definition XML.
 */
function generatePivotTableDefinition(
  config: PivotTableConfig,
  fields: FieldInfo[],
  targetLocation: string
): string {
  // Find field indices and their field info
  const rowFieldInfos = config.rowFields.map((name) => {
    const field = fields.find((f) => f.name === name);
    if (field === undefined) throw new Error(`Row field not found: ${name}`);
    return field;
  });
  const rowFieldIndices = rowFieldInfos.map((f) => f.index);

  const colFieldInfos = config.columnFields.map((name) => {
    const field = fields.find((f) => f.name === name);
    if (field === undefined) throw new Error(`Column field not found: ${name}`);
    return field;
  });
  const colFieldIndices = colFieldInfos.map((f) => f.index);

  const valueFieldIndex = fields.find((f) => f.name === config.valueField)?.index;
  if (valueFieldIndex === undefined) {
    throw new Error(`Value field not found: ${config.valueField}`);
  }

  // Generate pivotFields - one for each source field
  const pivotFields = fields
    .map((field) => {
      const isRowField = rowFieldIndices.includes(field.index);
      const isColField = colFieldIndices.includes(field.index);
      const isValueField = field.index === valueFieldIndex;

      // Build attributes - a field can have both axis and dataField attributes
      const attrs: string[] = [];
      if (isRowField) {
        attrs.push('axis="axisRow"');
      } else if (isColField) {
        attrs.push('axis="axisCol"');
      }
      if (isValueField) {
        attrs.push('dataField="1"');
      }
      attrs.push('showAll="0"');

      const items = field.uniqueValues
        .map((_, i) => `<item x="${i}"/>`)
        .concat(['<item t="default"/>'])
        .join('');

      return `<pivotField ${attrs.join(' ')}>
          <items count="${field.uniqueValues.length + 1}">${items}</items>
        </pivotField>`;
    })
    .join('\n');

  // Row fields reference
  const rowFields = rowFieldIndices.length > 0
    ? `<rowFields count="${rowFieldIndices.length}">
        ${rowFieldIndices.map((i) => `<field x="${i}"/>`).join('')}
       </rowFields>`
    : '';

  // Row items - one <i> for each unique value plus grand total
  // Each <i> has <x v="index"/> referencing the pivotField item
  let rowItems = '';
  if (rowFieldInfos.length > 0) {
    const rowField = rowFieldInfos[0];
    if (rowField !== undefined && rowField !== null) {
      const items = rowField.uniqueValues
        .map((_, i) => `<i><x v="${i}"/></i>`)
        .concat(['<i t="grand"><x/></i>'])
        .join('\n');
      rowItems = `<rowItems count="${rowField.uniqueValues.length + 1}">
        ${items}
      </rowItems>`;
    }
  }

  // Column fields reference
  const colFields = colFieldIndices.length > 0
    ? `<colFields count="${colFieldIndices.length}">
        ${colFieldIndices.map((i) => `<field x="${i}"/>`).join('')}
       </colFields>`
    : '';

  // Column items - one <i> for each unique value plus grand total
  // Excel requires colItems even if empty - minimum is <colItems count="1"><i/></colItems>
  let colItems = '<colItems count="1"><i/></colItems>';
  if (colFieldInfos.length > 0) {
    const colField = colFieldInfos[0];
    if (colField !== undefined && colField !== null) {
      const items = colField.uniqueValues
        .map((_, i) => `<i><x v="${i}"/></i>`)
        .concat(['<i t="grand"><x/></i>'])
        .join('\n');
      colItems = `<colItems count="${colField.uniqueValues.length + 1}">
        ${items}
      </colItems>`;
    }
  }

  // Data fields (values) - using COUNT aggregation
  // baseField and baseItem are required for proper value display
  const valueLabel = config.valueFieldLabel ?? `Count of ${config.valueField}`;
  const dataFields = `<dataFields count="1">
    <dataField name="${escapeXml(valueLabel)}" fld="${valueFieldIndex}" subtotal="count" baseField="0" baseItem="0"/>
  </dataFields>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pivotTableDefinition ${PIVOT_TABLE_DEFINITION_NS}
    name="${escapeXml(config.name)}"
    cacheId="1"
    applyNumberFormats="0"
    applyBorderFormats="0"
    applyFontFormats="0"
    applyPatternFormats="0"
    applyAlignmentFormats="0"
    applyWidthHeightFormats="1"
    dataCaption="Values"
    updatedVersion="6"
    minRefreshableVersion="3"
    useAutoFormatting="1"
    itemPrintTitles="1"
    createdVersion="6"
    indent="0"
    outline="1"
    outlineData="1"
    multipleFieldFilters="0">
  <location ref="${targetLocation}" firstHeaderRow="1" firstDataRow="${rowFieldIndices.length > 0 ? 2 : 1}" firstDataCol="1"/>
  <pivotFields count="${fields.length}">
    ${pivotFields}
  </pivotFields>
  ${rowFields}
  ${rowItems}
  ${colFields}
  ${colItems}
  ${dataFields}
  <pivotTableStyleInfo name="PivotStyleMedium9" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>
</pivotTableDefinition>`;
}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

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
    const uniqueValues = [...new Set(dataRows.map((row) => row[index] ?? ''))].sort();
    return { name, index, uniqueValues };
  });

  // Find the target worksheet's sheet ID
  const workbookXml = zip.getEntry('xl/workbook.xml')?.getData().toString('utf-8');
  if (workbookXml === undefined || workbookXml === null || workbookXml === '') throw new Error('workbook.xml not found');

  // Get sheet IDs from workbook
  const sheetMatches = workbookXml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g);
  const sheets = new Map<string, string>();
  for (const match of sheetMatches) {
    const sheetName = match[1];
    const sheetRid = match[2];
    if (sheetName && sheetRid) {
      sheets.set(sheetName, sheetRid);
    }
  }

  const targetSheetRid = sheets.get(config.targetSheet);
  if (targetSheetRid === undefined || targetSheetRid === null || targetSheetRid === '') throw new Error(`Target sheet not found: ${config.targetSheet}`);

  // Get the worksheet path from relationships
  const workbookRels = zip.getEntry('xl/_rels/workbook.xml.rels')?.getData().toString('utf-8');
  if (workbookRels === undefined || workbookRels === null || workbookRels === '') throw new Error('workbook.xml.rels not found');

  const relMatch = workbookRels.match(new RegExp(`Id="${targetSheetRid}"[^>]*Target="([^"]*)"`));
  const worksheetPath = relMatch !== null ? `xl/${relMatch[1]}` : null;
  if (worksheetPath === null) throw new Error(`Worksheet path not found for ${targetSheetRid}`);

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

  if (worksheetRels) {
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
  if (contentTypes === undefined || contentTypes === null || contentTypes === '') throw new Error('[Content_Types].xml not found');

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

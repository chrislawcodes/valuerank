import { AppError } from '@valuerank/shared';

export type FieldInfo = {
  name: string;
  index: number;
  uniqueValues: string[];
};

const PIVOT_CACHE_DEFINITION_NS =
  'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const PIVOT_TABLE_DEFINITION_NS =
  'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function parseCellRef(ref: string): { col: number; row: number } {
  const match = ref.match(/^([A-Z]+)(\d+)$/);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new AppError(`Invalid cell reference: ${ref}`, 'XLSX_PARSE_ERROR');
  }

  const colStr = match[1];
  const rowStr = match[2];

  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }

  return { col: col - 1, row: parseInt(rowStr, 10) - 1 };
}

export function colToLetter(col: number): string {
  let letter = '';
  let n = col + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

export function generatePivotCacheDefinition(
  config: { sourceRange: string; sourceSheet: string },
  fields: FieldInfo[],
  recordCount: number
): string {
  const cacheFields = fields
    .map((field) => {
      const sharedItems = field.uniqueValues
        .map((value) => `<s v="${escapeXml(value)}"/>`)
        .join('');
      return `<cacheField name="${escapeXml(field.name)}" numFmtId="0">
        <sharedItems count="${field.uniqueValues.length}">${sharedItems}</sharedItems>
      </cacheField>`;
    })
    .join('\n');

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

export function generatePivotCacheRecords(
  fields: FieldInfo[],
  data: string[][]
): string {
  const records = data
    .map((row) => {
      const cells = fields
        .map((field, index) => {
          const value = row[index] ?? '';
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

export function generatePivotTableDefinition(
  config: {
    name: string;
    rowFields: string[];
    columnFields: string[];
    valueField: string;
    valueFieldLabel?: string;
  },
  fields: FieldInfo[],
  targetLocation: string
): string {
  const rowFieldInfos = config.rowFields.map((name) => {
    const field = fields.find((candidate) => candidate.name === name);
    if (field === undefined) throw new AppError(`Row field not found: ${name}`, 'XLSX_PARSE_ERROR');
    return field;
  });
  const rowFieldIndices = rowFieldInfos.map((field) => field.index);

  const colFieldInfos = config.columnFields.map((name) => {
    const field = fields.find((candidate) => candidate.name === name);
    if (field === undefined) throw new AppError(`Column field not found: ${name}`, 'XLSX_PARSE_ERROR');
    return field;
  });
  const colFieldIndices = colFieldInfos.map((field) => field.index);

  const valueFieldIndex = fields.find((field) => field.name === config.valueField)?.index;
  if (valueFieldIndex === undefined) {
    throw new AppError(`Value field not found: ${config.valueField}`, 'XLSX_PARSE_ERROR');
  }

  const pivotFields = fields
    .map((field) => {
      const isRowField = rowFieldIndices.includes(field.index);
      const isColField = colFieldIndices.includes(field.index);
      const isValueField = field.index === valueFieldIndex;

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
        .map((_, index) => `<item x="${index}"/>`)
        .concat(['<item t="default"/>'])
        .join('');

      return `<pivotField ${attrs.join(' ')}>
          <items count="${field.uniqueValues.length + 1}">${items}</items>
        </pivotField>`;
    })
    .join('\n');

  const rowFields = rowFieldIndices.length > 0
    ? `<rowFields count="${rowFieldIndices.length}">
        ${rowFieldIndices.map((index) => `<field x="${index}"/>`).join('')}
       </rowFields>`
    : '';

  let rowItems = '';
  if (rowFieldInfos.length > 0) {
    const rowField = rowFieldInfos[0];
    if (rowField !== undefined && rowField !== null) {
      const items = rowField.uniqueValues
        .map((_, index) => `<i><x v="${index}"/></i>`)
        .concat(['<i t="grand"><x/></i>'])
        .join('\n');
      rowItems = `<rowItems count="${rowField.uniqueValues.length + 1}">
        ${items}
      </rowItems>`;
    }
  }

  const colFields = colFieldIndices.length > 0
    ? `<colFields count="${colFieldIndices.length}">
        ${colFieldIndices.map((index) => `<field x="${index}"/>`).join('')}
       </colFields>`
    : '';

  let colItems = '<colItems count="1"><i/></colItems>';
  if (colFieldInfos.length > 0) {
    const colField = colFieldInfos[0];
    if (colField !== undefined && colField !== null) {
      const items = colField.uniqueValues
        .map((_, index) => `<i><x v="${index}"/></i>`)
        .concat(['<i t="grand"><x/></i>'])
        .join('\n');
      colItems = `<colItems count="${colField.uniqueValues.length + 1}">
        ${items}
      </colItems>`;
    }
  }

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

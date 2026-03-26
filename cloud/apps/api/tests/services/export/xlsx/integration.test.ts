/**
 * XLSX Export Integration Test Suite
 *
 * Tests the full export flow with mocked data.
 */

import AdmZip from 'adm-zip';
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';

import {
  generateExcelExport,
  type RunExportData,
  type TranscriptWithScenario,
} from '../../../../src/services/export/xlsx/index.js';

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

function createMockRun() {
  return {
    id: 'run-test-123',
    status: 'COMPLETED' as const,
    name: 'Test Run',
    createdAt: new Date(),
  };
}

function createMockTranscript(
  modelId: string,
  decisionCode: string,
  sampleIndex: number = 0
): TranscriptWithScenario {
  return {
    id: `transcript-${modelId}-${sampleIndex}`,
    runId: 'run-test-123',
    scenarioId: 'scenario-1',
    modelId,
    modelVersion: null,
    sampleIndex,
    content: {
      turns: [
        { targetResponse: `Response from ${modelId} for sample ${sampleIndex}` },
      ],
    },
    turnCount: 1,
    tokenCount: 100,
    durationMs: 1000,
    estimatedCost: null,
    decisionCode,
    decisionText: `Decision for code ${decisionCode}`,
    costSnapshotId: null,
    createdAt: new Date(),
    scenario: {
      id: 'scenario-1',
      definitionId: 'def-1',
      name: 'Test Scenario',
      body: 'Test body',
      content: {
        dimensions: {
          Autonomy: 3,
          Tradition: 2,
        },
      },
      hash: 'abc123',
      createdAt: new Date(),
      deletedAt: null,
    },
  } as TranscriptWithScenario;
}

function createMockExportData(
  transcriptCount: number = 10,
  modelCount: number = 2,
  includeAnalysis: boolean = true
): RunExportData {
  const models = ['anthropic:claude-3-5-sonnet', 'openai:gpt-4o', 'google:gemini-pro'].slice(0, modelCount);
  const transcripts: TranscriptWithScenario[] = [];

  for (let i = 0; i < transcriptCount; i++) {
    const modelIndex = i % modelCount;
    const model = models[modelIndex]!;
    const decisionCode = String(Math.floor(Math.random() * 5) + 1);
    transcripts.push(createMockTranscript(model, decisionCode, Math.floor(i / modelCount)));
  }

  return {
    run: createMockRun(),
    transcripts,
    analysisResult: includeAnalysis
      ? {
          modelAgreement: {
            models: models.map((m) => m.split(':')[1]!),
            correlationMatrix: models.map(() => models.map(() => Math.random())),
          },
          contestedScenarios: [
            {
              scenarioId: 's1',
              scenarioName: 'High Variance Scenario',
              variance: 2.5,
              modelResponses: {},
            },
          ],
          dimensionImpact: [
            { dimensionName: 'Autonomy', effectSize: 0.7, pValue: 0.01 },
            { dimensionName: 'Tradition', effectSize: 0.3, pValue: 0.05 },
          ],
        }
      : undefined,
  };
}

// ============================================================================
// FULL EXPORT TESTS
// ============================================================================

describe('generateExcelExport', () => {
  it('generates a valid XLSX buffer', async () => {
    const data = createMockExportData();
    const result = await generateExcelExport(data, {
      runId: data.run.id,
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('returns correct MIME type', async () => {
    const data = createMockExportData();
    const result = await generateExcelExport(data, {
      runId: data.run.id,
    });

    expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('generates filename with run ID and date', async () => {
    const data = createMockExportData();
    const result = await generateExcelExport(data, {
      runId: data.run.id,
    });

    expect(result.filename).toContain('valuerank_');
    expect(result.filename).toContain(data.run.id.slice(0, 8));
    expect(result.filename.endsWith('.xlsx')).toBe(true);
  });

  it('creates valid workbook that can be loaded', async () => {
    const data = createMockExportData();
    const result = await generateExcelExport(data, {
      runId: data.run.id,
    });

    // Load the buffer back as a workbook
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    expect(workbook.worksheets.length).toBeGreaterThan(0);
  });

  it('includes Raw Data worksheet', async () => {
    const data = createMockExportData();
    const result = await generateExcelExport(data, {
      runId: data.run.id,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    const rawDataSheet = workbook.getWorksheet('Raw Data');
    expect(rawDataSheet).toBeDefined();
  });

  it('includes Model Summary worksheet', async () => {
    const data = createMockExportData();
    const result = await generateExcelExport(data, {
      runId: data.run.id,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    const summarySheet = workbook.getWorksheet('Model Summary');
    expect(summarySheet).toBeDefined();
  });

  it('includes Charts worksheet when enabled', async () => {
    const data = createMockExportData();
    const result = await generateExcelExport(data, {
      runId: data.run.id,
      includeCharts: true,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    const chartsSheet = workbook.getWorksheet('Charts');
    expect(chartsSheet).toBeDefined();
  });

  it('includes Methods worksheet when enabled', async () => {
    const data = createMockExportData();
    const result = await generateExcelExport(data, {
      runId: data.run.id,
      includeMethods: true,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    const methodsSheet = workbook.getWorksheet('Methods');
    expect(methodsSheet).toBeDefined();
  });

  it('excludes Methods worksheet when disabled', async () => {
    const data = createMockExportData();
    const result = await generateExcelExport(data, {
      runId: data.run.id,
      includeMethods: false,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    const methodsSheet = workbook.getWorksheet('Methods');
    expect(methodsSheet).toBeUndefined();
  });

  it('includes analysis worksheets when available', async () => {
    const data = createMockExportData(10, 2, true);
    const result = await generateExcelExport(data, {
      runId: data.run.id,
      includeAnalysis: true,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    expect(workbook.getWorksheet('Model Agreement')).toBeDefined();
    expect(workbook.getWorksheet('Contested Scenarios')).toBeDefined();
    expect(workbook.getWorksheet('Dimension Impact')).toBeDefined();
  });

  it('writes a hidden pivot source sheet with canonical bucket labels', async () => {
    const resolvedStrong = createMockTranscript('anthropic:claude-3-5-sonnet-20241022', '5', 0);
    resolvedStrong.decisionMetadata = {
      parseClass: 'exact',
      parsePath: 'exact.favor_first.strong',
      matchedLabel: 'Achievement',
    };
    resolvedStrong.definitionSnapshot = {
      dimensions: [{ name: 'Achievement' }, { name: 'Benevolence_Dependability' }],
      methodology: { presentation_order: 'A_first' },
    };
    resolvedStrong.scenario = {
      ...(resolvedStrong.scenario as Record<string, unknown>),
      orientationFlipped: false,
    } as TranscriptWithScenario['scenario'];

    const neutral = createMockTranscript('openai:gpt-4o-20241120', '3', 1);
    neutral.decisionMetadata = {
      parseClass: 'exact',
      parsePath: 'exact.neutral',
      matchedLabel: 'Achievement',
    };
    neutral.definitionSnapshot = {
      dimensions: [{ name: 'Achievement' }, { name: 'Benevolence_Dependability' }],
      methodology: { presentation_order: 'A_first' },
    };
    neutral.scenario = {
      ...(neutral.scenario as Record<string, unknown>),
      orientationFlipped: false,
    } as TranscriptWithScenario['scenario'];

    const unknown = createMockTranscript('google:gemini-pro', '1', 2);
    unknown.decisionCode = null;
    unknown.decisionText = null;
    unknown.decisionMetadata = null;
    unknown.definitionSnapshot = null;

    const data: RunExportData = {
      run: createMockRun(),
      transcripts: [resolvedStrong, neutral, unknown],
    };

    const result = await generateExcelExport(data, {
      runId: data.run.id,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    const pivotSource = workbook.getWorksheet('Pivot Source');
    expect(pivotSource).toBeDefined();
    expect(pivotSource!.state).toBe('veryHidden');
    expect(pivotSource!.getRow(1).values.slice(1)).toEqual(['AI Model Name', 'Decision Bucket']);
    expect(pivotSource!.getCell(2, 2).value).toBe('First side strong');
    expect(pivotSource!.getCell(3, 2).value).toBe('Neutral');
    expect(pivotSource!.getCell(4, 2).value).toBe('Unknown');

    const zip = new AdmZip(result.buffer);
    const workbookXml = zip.getEntry('xl/workbook.xml')?.getData().toString('utf-8') ?? '';
    expect(workbookXml).toContain('Pivot Source');
    expect(workbookXml).toContain('veryHidden');

    const pivotCacheXml = zip.getEntry('xl/pivotCache/pivotCacheDefinition1.xml')?.getData().toString('utf-8') ?? '';
    expect(pivotCacheXml).toContain('Decision Bucket');
    expect(pivotCacheXml).toContain('First side strong');
    expect(pivotCacheXml).toContain('First side lean');
    expect(pivotCacheXml).toContain('Neutral');
    expect(pivotCacheXml).toContain('Second side lean');
    expect(pivotCacheXml).toContain('Second side strong');
    expect(pivotCacheXml).toContain('Unknown');
    expect(pivotCacheXml.indexOf('First side strong')).toBeLessThan(pivotCacheXml.indexOf('First side lean'));
    expect(pivotCacheXml.indexOf('First side lean')).toBeLessThan(pivotCacheXml.indexOf('Neutral'));
    expect(pivotCacheXml.indexOf('Neutral')).toBeLessThan(pivotCacheXml.indexOf('Second side lean'));
    expect(pivotCacheXml.indexOf('Second side lean')).toBeLessThan(pivotCacheXml.indexOf('Second side strong'));
    expect(pivotCacheXml.indexOf('Second side strong')).toBeLessThan(pivotCacheXml.indexOf('Unknown'));
  });

  it('excludes analysis worksheets when disabled', async () => {
    const data = createMockExportData(10, 2, true);
    const result = await generateExcelExport(data, {
      runId: data.run.id,
      includeAnalysis: false,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    expect(workbook.getWorksheet('Model Agreement')).toBeUndefined();
  });

  it('excludes analysis worksheets when data not available', async () => {
    const data = createMockExportData(10, 2, false);
    const result = await generateExcelExport(data, {
      runId: data.run.id,
      includeAnalysis: true,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    expect(workbook.getWorksheet('Model Agreement')).toBeUndefined();
  });

  it('handles large transcript count', async () => {
    const data = createMockExportData(500, 3);
    const result = await generateExcelExport(data, {
      runId: data.run.id,
    });

    expect(result.buffer.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    const rawDataSheet = workbook.getWorksheet('Raw Data');
    // 1 header + 500 data rows
    expect(rawDataSheet!.rowCount).toBe(501);
  });

  it('handles single model run', async () => {
    const data = createMockExportData(10, 1);
    const result = await generateExcelExport(data, {
      runId: data.run.id,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    // Model Agreement should not exist for single model
    // (or should exist but show N/A - depends on implementation)
    const summarySheet = workbook.getWorksheet('Model Summary');
    expect(summarySheet).toBeDefined();
  });

  it('includes correct transcript data in Raw Data sheet', async () => {
    const data = createMockExportData(5, 1);
    const result = await generateExcelExport(data, {
      runId: data.run.id,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    const rawDataSheet = workbook.getWorksheet('Raw Data');

    // Check that transcript ID is in the data
    let foundTranscriptId = false;
    rawDataSheet!.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        // Skip header
        row.eachCell((cell) => {
          if (typeof cell.value === 'string' && cell.value.includes('transcript-')) {
            foundTranscriptId = true;
          }
        });
      }
    });

    expect(foundTranscriptId).toBe(true);
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('generateExcelExport edge cases', () => {
  it('handles empty transcripts array', async () => {
    const data: RunExportData = {
      run: createMockRun(),
      transcripts: [],
    };

    const result = await generateExcelExport(data, {
      runId: data.run.id,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    const rawDataSheet = workbook.getWorksheet('Raw Data');
    expect(rawDataSheet).toBeDefined();
    // Only header row
    expect(rawDataSheet!.rowCount).toBe(1);
  });

  it('handles transcripts without scenarios', async () => {
    const transcript = createMockTranscript('model-a', '3');
    transcript.scenario = null;

    const data: RunExportData = {
      run: createMockRun(),
      transcripts: [transcript],
    };

    const result = await generateExcelExport(data, {
      runId: data.run.id,
    });

    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('handles special characters in model names', async () => {
    const transcript = createMockTranscript('provider:model-with-special_chars.v2', '3');

    const data: RunExportData = {
      run: createMockRun(),
      transcripts: [transcript],
    };

    const result = await generateExcelExport(data, {
      runId: data.run.id,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    const rawDataSheet = workbook.getWorksheet('Raw Data');
    expect(rawDataSheet).toBeDefined();
  });

  it('handles Unicode in decision text', async () => {
    const transcript = createMockTranscript('model-a', '3');
    transcript.decisionText = 'Décision avec accents: émotions 感情 🎉';

    const data: RunExportData = {
      run: createMockRun(),
      transcripts: [transcript],
    };

    const result = await generateExcelExport(data, {
      runId: data.run.id,
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    expect(workbook.worksheets.length).toBeGreaterThan(0);
  });

  it('handles unresolved transcripts', async () => {
    const transcript = createMockTranscript('model-a', '3');
    transcript.decisionCode = null;
    transcript.decisionMetadata = null;
    transcript.definitionSnapshot = null;

    const data: RunExportData = {
      run: createMockRun(),
      transcripts: [transcript],
    };

    const result = await generateExcelExport(data, {
      runId: data.run.id,
    });

    expect(result.buffer.length).toBeGreaterThan(0);
  });
});

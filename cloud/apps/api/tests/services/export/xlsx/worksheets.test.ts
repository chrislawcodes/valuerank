/**
 * Worksheets Test Suite
 *
 * Tests for xlsx worksheet builder functions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';

import {
  buildRawDataSheet,
  buildModelSummarySheet,
  buildModelAgreementSheet,
  buildContestedScenariosSheet,
  buildDimensionImpactSheet,
  buildMethodsSheet,
} from '../../../../src/services/export/xlsx/worksheets/index.js';
import type {
  TranscriptWithScenario,
  ModelAgreementData,
  ContestedScenario,
  DimensionImpact,
} from '../../../../src/services/export/xlsx/types.js';
import { createWorkbook } from '../../../../src/services/export/xlsx/workbook.js';

// ============================================================================
// TEST DATA
// ============================================================================

function createMockTranscript(overrides: Partial<TranscriptWithScenario> = {}): TranscriptWithScenario {
  return {
    id: 'transcript-1',
    runId: 'run-1',
    scenarioId: 'scenario-1',
    modelId: 'anthropic:claude-3-5-sonnet-20241022',
    modelVersion: null,
    sampleIndex: 0,
    content: {
      turns: [
        { targetResponse: 'This is the model response text.' },
      ],
    },
    turnCount: 1,
    tokenCount: 100,
    durationMs: 1000,
    estimatedCost: null,
    decisionCode: '3',
    decisionText: 'Balanced approach',
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
    ...overrides,
  } as TranscriptWithScenario;
}

// ============================================================================
// RAW DATA SHEET TESTS
// ============================================================================

describe('buildRawDataSheet', () => {
  let workbook: ExcelJS.Workbook;

  beforeEach(() => {
    workbook = createWorkbook('test-run');
  });

  it('creates a worksheet named "Raw Data"', () => {
    const transcripts = [createMockTranscript()];
    buildRawDataSheet(workbook, transcripts);

    const worksheet = workbook.getWorksheet('Raw Data');
    expect(worksheet).toBeDefined();
  });

  it('includes correct column headers', () => {
    const transcripts = [createMockTranscript()];
    buildRawDataSheet(workbook, transcripts);

    const worksheet = workbook.getWorksheet('Raw Data');
    expect(worksheet).toBeDefined();

    const headerRow = worksheet!.getRow(1);
    const headers = headerRow.values as (string | undefined)[];

    // Check standard headers (note: values array is 1-indexed)
    expect(headers).toContain('AI Model Name');
    expect(headers).toContain('Sample Index');
    expect(headers).toContain('Decision Code');
    expect(headers).toContain('Decision Text');
    expect(headers).toContain('Transcript ID');
    expect(headers).toContain('Full Response');
  });

  it('includes dimension columns from scenario content', () => {
    const transcripts = [createMockTranscript()];
    buildRawDataSheet(workbook, transcripts);

    const worksheet = workbook.getWorksheet('Raw Data');
    const headerRow = worksheet!.getRow(1);
    const headers = headerRow.values as (string | undefined)[];

    expect(headers).toContain('Autonomy');
    expect(headers).toContain('Tradition');
  });

  it('adds correct number of data rows', () => {
    const transcripts = [
      createMockTranscript({ id: 't1' }),
      createMockTranscript({ id: 't2' }),
      createMockTranscript({ id: 't3' }),
    ];
    buildRawDataSheet(workbook, transcripts);

    const worksheet = workbook.getWorksheet('Raw Data');
    // 1 header row + 3 data rows
    expect(worksheet!.rowCount).toBe(4);
  });

  it('extracts model name without provider prefix', () => {
    const transcripts = [
      createMockTranscript({ modelId: 'anthropic:claude-3-5-sonnet-20241022' }),
    ];
    buildRawDataSheet(workbook, transcripts);

    const worksheet = workbook.getWorksheet('Raw Data');
    const dataRow = worksheet!.getRow(2);
    const modelNameCell = dataRow.getCell(1);

    expect(modelNameCell.value).toBe('claude-3-5-sonnet');
  });

  it('handles empty transcripts array', () => {
    buildRawDataSheet(workbook, []);

    const worksheet = workbook.getWorksheet('Raw Data');
    expect(worksheet).toBeDefined();
    // Only header row
    expect(worksheet!.rowCount).toBe(1);
  });

  it('handles transcripts without scenario', () => {
    const transcripts = [createMockTranscript({ scenario: null })];
    buildRawDataSheet(workbook, transcripts);

    const worksheet = workbook.getWorksheet('Raw Data');
    expect(worksheet).toBeDefined();
    expect(worksheet!.rowCount).toBe(2);
  });
});

// ============================================================================
// MODEL SUMMARY SHEET TESTS
// ============================================================================

describe('buildModelSummarySheet', () => {
  let workbook: ExcelJS.Workbook;

  beforeEach(() => {
    workbook = createWorkbook('test-run');
  });

  it('creates a worksheet named "Model Summary"', () => {
    const transcripts = [createMockTranscript()];
    buildModelSummarySheet(workbook, transcripts);

    const worksheet = workbook.getWorksheet('Model Summary');
    expect(worksheet).toBeDefined();
  });

  it('returns model statistics', () => {
    const transcripts = [
      createMockTranscript({ modelId: 'model-a', decisionCode: '3' }),
      createMockTranscript({ modelId: 'model-a', decisionCode: '4' }),
      createMockTranscript({ modelId: 'model-b', decisionCode: '2' }),
    ];
    const stats = buildModelSummarySheet(workbook, transcripts);

    expect(stats).toHaveLength(2);
    expect(stats.map((s) => s.modelName)).toContain('model-a');
    expect(stats.map((s) => s.modelName)).toContain('model-b');
  });

  it('calculates correct mean score', () => {
    const transcripts = [
      createMockTranscript({ modelId: 'model-a', decisionCode: '2' }),
      createMockTranscript({ modelId: 'model-a', decisionCode: '4' }),
    ];
    const stats = buildModelSummarySheet(workbook, transcripts);

    const modelAStat = stats.find((s) => s.modelName === 'model-a');
    expect(modelAStat).toBeDefined();
    expect(modelAStat!.meanScore).toBe(3); // (2 + 4) / 2
  });

  it('calculates correct sample count', () => {
    const transcripts = [
      createMockTranscript({ modelId: 'model-a' }),
      createMockTranscript({ modelId: 'model-a' }),
      createMockTranscript({ modelId: 'model-b' }),
    ];
    const stats = buildModelSummarySheet(workbook, transcripts);

    const modelAStat = stats.find((s) => s.modelName === 'model-a');
    expect(modelAStat!.sampleCount).toBe(2);
  });

  it('handles non-numeric decision codes', () => {
    const transcripts = [
      createMockTranscript({ modelId: 'model-a', decisionCode: 'error' }),
      createMockTranscript({ modelId: 'model-a', decisionCode: '3' }),
    ];
    const stats = buildModelSummarySheet(workbook, transcripts);

    const modelAStat = stats.find((s) => s.modelName === 'model-a');
    // Mean should only include valid numeric codes
    expect(modelAStat!.meanScore).toBe(3);
  });
});

// ============================================================================
// MODEL AGREEMENT SHEET TESTS
// ============================================================================

describe('buildModelAgreementSheet', () => {
  let workbook: ExcelJS.Workbook;

  beforeEach(() => {
    workbook = createWorkbook('test-run');
  });

  it('creates a worksheet named "Model Agreement"', () => {
    const data: ModelAgreementData = {
      models: ['model-a', 'model-b'],
      correlationMatrix: [
        [1.0, 0.8],
        [0.8, 1.0],
      ],
    };
    buildModelAgreementSheet(workbook, data);

    const worksheet = workbook.getWorksheet('Model Agreement');
    expect(worksheet).toBeDefined();
  });

  it('includes model names as headers', () => {
    const data: ModelAgreementData = {
      models: ['model-a', 'model-b'],
      correlationMatrix: [
        [1.0, 0.8],
        [0.8, 1.0],
      ],
    };
    buildModelAgreementSheet(workbook, data);

    const worksheet = workbook.getWorksheet('Model Agreement');
    const headerRow = worksheet!.getRow(1);
    const headers = headerRow.values as (string | undefined)[];

    expect(headers).toContain('model-a');
    expect(headers).toContain('model-b');
  });

  it('includes correlation values', () => {
    const data: ModelAgreementData = {
      models: ['model-a', 'model-b'],
      correlationMatrix: [
        [1.0, 0.8],
        [0.8, 1.0],
      ],
    };
    buildModelAgreementSheet(workbook, data);

    const worksheet = workbook.getWorksheet('Model Agreement');
    // Row 2, Col 3 should be 0.8 (model-a correlation with model-b)
    const correlationCell = worksheet!.getCell(2, 3);
    expect(correlationCell.value).toBe(0.8);
  });
});

// ============================================================================
// CONTESTED SCENARIOS SHEET TESTS
// ============================================================================

describe('buildContestedScenariosSheet', () => {
  let workbook: ExcelJS.Workbook;

  beforeEach(() => {
    workbook = createWorkbook('test-run');
  });

  it('creates a worksheet named "Contested Scenarios"', () => {
    const scenarios: ContestedScenario[] = [
      {
        scenarioId: 's1',
        scenarioName: 'Scenario 1',
        variance: 2.5,
        modelResponses: {},
      },
    ];
    buildContestedScenariosSheet(workbook, scenarios);

    const worksheet = workbook.getWorksheet('Contested Scenarios');
    expect(worksheet).toBeDefined();
  });

  it('sorts scenarios by variance (highest first)', () => {
    const scenarios: ContestedScenario[] = [
      { scenarioId: 's1', scenarioName: 'Low Variance', variance: 0.5, modelResponses: {} },
      { scenarioId: 's2', scenarioName: 'High Variance', variance: 3.0, modelResponses: {} },
      { scenarioId: 's3', scenarioName: 'Mid Variance', variance: 1.5, modelResponses: {} },
    ];
    buildContestedScenariosSheet(workbook, scenarios);

    const worksheet = workbook.getWorksheet('Contested Scenarios');
    const row2 = worksheet!.getRow(2);
    // First data row should be highest variance
    expect(row2.getCell(2).value).toBe('High Variance');
  });

  it('limits to top 10 scenarios', () => {
    const scenarios: ContestedScenario[] = Array.from({ length: 15 }, (_, i) => ({
      scenarioId: `s${i}`,
      scenarioName: `Scenario ${i}`,
      variance: i,
      modelResponses: {},
    }));
    buildContestedScenariosSheet(workbook, scenarios);

    const worksheet = workbook.getWorksheet('Contested Scenarios');
    // 1 header + 10 data rows max
    expect(worksheet!.rowCount).toBe(11);
  });
});

// ============================================================================
// DIMENSION IMPACT SHEET TESTS
// ============================================================================

describe('buildDimensionImpactSheet', () => {
  let workbook: ExcelJS.Workbook;

  beforeEach(() => {
    workbook = createWorkbook('test-run');
  });

  it('creates a worksheet named "Dimension Impact"', () => {
    const dimensions: DimensionImpact[] = [
      { dimensionName: 'Autonomy', effectSize: 0.5, pValue: 0.01 },
    ];
    buildDimensionImpactSheet(workbook, dimensions);

    const worksheet = workbook.getWorksheet('Dimension Impact');
    expect(worksheet).toBeDefined();
  });

  it('sorts dimensions by effect size (highest first)', () => {
    const dimensions: DimensionImpact[] = [
      { dimensionName: 'Low', effectSize: 0.1, pValue: 0.5 },
      { dimensionName: 'High', effectSize: 0.9, pValue: 0.01 },
      { dimensionName: 'Mid', effectSize: 0.5, pValue: 0.1 },
    ];
    buildDimensionImpactSheet(workbook, dimensions);

    const worksheet = workbook.getWorksheet('Dimension Impact');
    const row2 = worksheet!.getRow(2);
    expect(row2.getCell(1).value).toBe('High');
  });
});

// ============================================================================
// METHODS SHEET TESTS
// ============================================================================

describe('buildMethodsSheet', () => {
  let workbook: ExcelJS.Workbook;

  beforeEach(() => {
    workbook = createWorkbook('test-run');
  });

  it('creates a worksheet named "Methods"', () => {
    buildMethodsSheet(workbook, []);

    const worksheet = workbook.getWorksheet('Methods');
    expect(worksheet).toBeDefined();
  });

  it('includes methodology sections', () => {
    buildMethodsSheet(workbook, []);

    const worksheet = workbook.getWorksheet('Methods');
    // Check that some content exists
    expect(worksheet!.rowCount).toBeGreaterThan(5);
  });

  it('includes warnings when provided', () => {
    const warnings = ['Low sample size warning', 'Missing data warning'];
    buildMethodsSheet(workbook, warnings);

    const worksheet = workbook.getWorksheet('Methods');
    let foundWarning = false;

    worksheet!.eachRow((row) => {
      const cellValue = row.getCell(1).value;
      if (typeof cellValue === 'string' && cellValue.includes('Low sample size warning')) {
        foundWarning = true;
      }
    });

    expect(foundWarning).toBe(true);
  });

  it('includes generation timestamp', () => {
    buildMethodsSheet(workbook, []);

    const worksheet = workbook.getWorksheet('Methods');
    let foundTimestamp = false;

    worksheet!.eachRow((row) => {
      const cellValue = row.getCell(1).value;
      if (typeof cellValue === 'string' && cellValue.includes('Generated by ValueRank')) {
        foundTimestamp = true;
      }
    });

    expect(foundTimestamp).toBe(true);
  });
});

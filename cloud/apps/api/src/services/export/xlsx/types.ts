/**
 * XLSX Export Types
 *
 * Type definitions for Excel export functionality.
 * Defines configuration interfaces for workbooks, worksheets, and charts.
 */

import type { Transcript, Scenario, Run } from '@prisma/client';

// ============================================================================
// TRANSCRIPT TYPES
// ============================================================================

/**
 * Transcript with scenario relation for export.
 */
export type TranscriptWithScenario = Transcript & {
  scenario: Scenario | null;
};

/**
 * Parsed scenario content structure.
 */
export type ScenarioContent = {
  dimensions?: Record<string, number>;
  body?: string;
};

/**
 * Parsed transcript content structure with turns.
 */
export type TranscriptContent = {
  turns?: Array<{
    targetResponse?: string;
  }>;
};

// ============================================================================
// EXPORT OPTIONS
// ============================================================================

/**
 * Options for generating an Excel export.
 */
export type XlsxExportOptions = {
  /** The run ID to export */
  runId: string;
  /** Whether to include analysis worksheets (Model Agreement, etc.) */
  includeAnalysis?: boolean;
  /** Whether to include the Methods documentation worksheet */
  includeMethods?: boolean;
  /** Whether to include charts */
  includeCharts?: boolean;
};

/**
 * Result of an XLSX export operation.
 */
export type XlsxExportResult = {
  /** The generated workbook buffer */
  buffer: Buffer;
  /** Suggested filename for download */
  filename: string;
  /** MIME type for response headers */
  mimeType: string;
};

// ============================================================================
// WORKSHEET CONFIGURATION
// ============================================================================

/**
 * Worksheet types used in the export.
 */
export type WorksheetType =
  | 'raw_data'
  | 'model_summary'
  | 'charts'
  | 'model_agreement'
  | 'contested_scenarios'
  | 'dimension_impact'
  | 'methods';

/**
 * Configuration for creating a worksheet.
 */
export type WorksheetConfig = {
  /** Worksheet name (max 31 characters) */
  name: string;
  /** Type of worksheet for styling purposes */
  type: WorksheetType;
  /** Column definitions */
  columns?: ColumnConfig[];
};

/**
 * Column configuration for data worksheets.
 */
export type ColumnConfig = {
  /** Column header text */
  header: string;
  /** Property key to extract from row data */
  key: string;
  /** Column width in characters */
  width?: number;
};

// ============================================================================
// CHART CONFIGURATION
// ============================================================================

/**
 * Types of charts supported in the export.
 */
export type ChartType = 'bar' | 'stacked_bar' | 'horizontal_bar';

/**
 * Configuration for creating a chart.
 */
export type ChartConfig = {
  /** Chart type */
  type: ChartType;
  /** Chart title */
  title: string;
  /** Worksheet name containing source data */
  sourceWorksheet: string;
  /** Cell range for data (e.g., 'A1:C10') */
  dataRange: string;
  /** Cell where top-left of chart should be placed */
  position: { col: number; row: number };
  /** Chart dimensions in Excel units */
  size: { width: number; height: number };
  /** X-axis label */
  xAxisTitle?: string;
  /** Y-axis label */
  yAxisTitle?: string;
  /** Whether to show legend */
  showLegend?: boolean;
};

// ============================================================================
// RAW DATA ROW
// ============================================================================

/**
 * Row structure for Raw Data worksheet.
 */
export type RawDataRow = {
  modelName: string;
  sampleIndex: number;
  decisionCode: string;
  decisionText: string;
  transcriptId: string;
  fullResponse: string;
  variables: Record<string, number>;
};

// ============================================================================
// MODEL SUMMARY TYPES
// ============================================================================

/**
 * Statistics for a single model.
 */
export type ModelStatistics = {
  modelName: string;
  sampleCount: number;
  meanScore: number;
  stdDev: number;
  decisionDistribution: Record<string, number>;
};

/**
 * Row structure for Model Summary worksheet.
 */
export type ModelSummaryRow = {
  modelName: string;
  sampleCount: number;
  meanScore: number;
  stdDev: number;
};

// ============================================================================
// ANALYSIS TYPES
// ============================================================================

/**
 * Model agreement/correlation data.
 */
export type ModelAgreementData = {
  models: string[];
  correlationMatrix: number[][];
};

/**
 * Contested scenario with high variance.
 */
export type ContestedScenario = {
  scenarioId: string;
  scenarioName: string;
  variance: number;
  modelResponses: Record<string, number>;
};

/**
 * Dimension impact analysis.
 */
export type DimensionImpact = {
  dimensionName: string;
  effectSize: number;
  pValue: number;
};

// ============================================================================
// RUN DATA FOR EXPORT
// ============================================================================

/**
 * Complete data needed for export.
 */
export type RunExportData = {
  run: Run;
  transcripts: TranscriptWithScenario[];
  analysisResult?: {
    modelAgreement?: ModelAgreementData;
    contestedScenarios?: ContestedScenario[];
    dimensionImpact?: DimensionImpact[];
  };
};

// ============================================================================
// EXCEL CELL VALUE LIMIT
// ============================================================================

/**
 * Maximum characters allowed in an Excel cell.
 * Responses exceeding this will be truncated.
 */
export const EXCEL_CELL_MAX_CHARS = 32767;

/**
 * Truncation indicator appended to truncated values.
 */
export const TRUNCATION_INDICATOR = '\n\n[TRUNCATED - Response exceeded 32,767 character limit]';

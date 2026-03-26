/**
 * CSV Serialization Helper
 *
 * Converts run transcripts to CSV format for export.
 * Outputs canonical decision display fields plus transcript metadata.
 */

import type { Transcript, Scenario } from '@prisma/client';

import {
  collectVisibleDimensionColumns,
  formatDecisionDisplay,
  type DimensionColumnMap,
} from './decision-display.js';

export type TranscriptWithScenario = Transcript & {
  scenario: Scenario | null;
  // Optional run configuration and name
  run?: {
    name?: string | null;
    config?: unknown;
    definition?: {
      version?: number | null;
    } | null;
  } | null;
};

export type CSVRow = {
  batchName: string;
  transcriptId: string;
  modelName: string;
  sampleIndex: number;
  decisionDirection: string;
  decisionStrength: string;
  decisionReason: string;
  decisionSource: string;
  parseClass: string;
  parsePath: string;
  matchedLabel: string;
  trialSignature: string;
  probePrompt: string;
  targetResponse: string;
  variables: Record<string, number>;
};

export type CSVFormatOptions = {
  includeDecisionMetadata?: boolean;
};

/**
 * CSV column headers before variable columns.
 * Order: AI Model Name, Batch, Sample Index, then variable columns are inserted dynamically.
 */
export const PRE_VARIABLE_HEADERS = ['AI Model Name', 'Trial Signature', 'Batch', 'Sample Index'] as const;

/**
 * CSV column headers after variable columns.
 * Order: Decision Direction, Decision Strength, Decision Reason, Transcript ID, Probe Prompt, Target Response
 */
export const POST_VARIABLE_HEADERS = [
  'Decision Direction',
  'Decision Strength',
  'Decision Reason',
  'Transcript ID',
  'Probe Prompt',
  'Target Response',
] as const;

export const DECISION_METADATA_HEADERS = [
  'Decision Source',
  'Decision Parse Class',
  'Decision Parse Path',
  'Matched Label',
] as const;

export const POST_VARIABLE_HEADERS_WITH_METADATA = [
  'Decision Direction',
  'Decision Strength',
  'Decision Reason',
  'Decision Source',
  'Decision Parse Class',
  'Decision Parse Path',
  'Matched Label',
  'Transcript ID',
  'Probe Prompt',
  'Target Response',
] as const;

/**
 * Escape a value for CSV format.
 * Handles commas, quotes, and newlines.
 */
function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // If the value contains special characters, wrap in quotes and escape existing quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Extract short model name from model ID.
 * E.g., "anthropic:claude-3-5-haiku-20241022" -> "claude-3-5-haiku"
 */
function getModelName(modelId: string): string {
  // Remove provider prefix if present
  const withoutProvider = modelId.includes(':') ? modelId.split(':')[1] ?? modelId : modelId;
  // Remove version suffix (date pattern like -20241022)
  return withoutProvider.replace(/-\d{8}$/, '');
}

// Scenario content structure with dimension scores
type ScenarioContent = {
  dimensions?: Record<string, number>;
  orientationFlipped?: boolean | null;
};

// Transcript content structure with turns
type TranscriptContent = {
  turns?: Array<{
    promptLabel?: string;
    probePrompt?: string;
    targetResponse?: string;
  }>;
};

/**
 * Extract the probe prompts from transcript content.
 * Combines prompts across turns.
 */
function getProbePrompt(transcript: TranscriptWithScenario): string {
  const content = transcript.content as TranscriptContent | null;
  if (!content?.turns || !Array.isArray(content.turns)) {
    return '';
  }

  const prompts = content.turns
    .map((turn) => turn.probePrompt ?? '')
    .filter((p) => p.length > 0);

  return prompts.join('\n\n---\n\n');
}

/**
 * Extract the target response from transcript content.
 * Combines all target responses from all turns.
 */
function getTargetResponse(transcript: TranscriptWithScenario): string {
  const content = transcript.content as TranscriptContent | null;
  if (!content?.turns || !Array.isArray(content.turns)) {
    return '';
  }

  // Combine all target responses from all turns
  const responses = content.turns
    .map((turn) => turn.targetResponse ?? '')
    .filter((r) => r.length > 0);

  return responses.join('\n\n---\n\n');
}

/**
 * Extract dimension scores directly from scenario content.
 * Returns a map of dimension names to their numeric values.
 */
function getScenarioDimensions(transcript: TranscriptWithScenario): Record<string, number> {
  const content = transcript.scenario?.content as ScenarioContent | null;
  if (content?.dimensions && typeof content.dimensions === 'object') {
    // Filter to only include numeric values
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(content.dimensions)) {
      if (typeof value === 'number') {
        result[key] = value;
      }
    }
    return result;
  }
  return {};
}

function getDecisionMetadata(
  transcript: TranscriptWithScenario
): { parseClass: string; parsePath: string; matchedLabel: string } {
  const metadata = transcript.decisionMetadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { parseClass: '', parsePath: '', matchedLabel: '' };
  }

  const record = metadata as Record<string, unknown>;
  return {
    parseClass: typeof record.parseClass === 'string' ? record.parseClass : '',
    parsePath: typeof record.parsePath === 'string' ? record.parsePath : '',
    matchedLabel: typeof record.matchedLabel === 'string' ? record.matchedLabel : '',
  };
}

/**
 * Format the trial signature from definition version and temperature.
 * Re-implemented cleanly here to avoid circular imports.
 */
function extractTrialSignature(
  definitionVersion: number | null | undefined,
  config: unknown
): string {
  if (!config || typeof config !== 'object') {
    return 'v?td';
  }

  const typedConfig = config as {
    definitionSnapshot?: { _meta?: { definitionVersion?: unknown }, version?: unknown };
    temperature?: unknown;
  };

  const version = typeof definitionVersion === 'number'
    ? definitionVersion
    : typeof typedConfig.definitionSnapshot?._meta?.definitionVersion === 'number'
      ? typedConfig.definitionSnapshot._meta.definitionVersion
      : typeof typedConfig.definitionSnapshot?.version === 'number'
        ? typedConfig.definitionSnapshot.version
        : null;

  const temperature = typeof typedConfig.temperature === 'number' ? typedConfig.temperature : null;

  const versionToken = version === null ? '?' : String(version);
  const tempToken = temperature === null || !Number.isFinite(temperature)
    ? 'd'
    : temperature.toFixed(3).replace(/\.?0+$/, '');

  return `v${versionToken}t${tempToken}`;
}

/**
 * Convert a transcript to a CSV row.
 * @param transcript - The transcript with scenario data
 */
function getVariablesForTranscript(
  transcript: TranscriptWithScenario,
  dimensionColumns?: DimensionColumnMap,
): Record<string, number> {
  const dimensions = getScenarioDimensions(transcript);
  const variables: Record<string, number> = {};
  const rawKeyToHeader = dimensionColumns?.rawKeyToHeader;

  for (const [rawKey, value] of Object.entries(dimensions)) {
    const header = rawKeyToHeader?.get(rawKey) ?? rawKey;
    variables[header] = value;
  }

  return variables;
}

export function transcriptToCSVRow(
  transcript: TranscriptWithScenario,
  dimensionColumns?: DimensionColumnMap,
): CSVRow {
  const decisionMetadata = getDecisionMetadata(transcript);
  const decisionDisplay = formatDecisionDisplay(transcript);
  return {
    batchName: transcript.run?.name ?? '',
    transcriptId: transcript.id,
    modelName: getModelName(transcript.modelId),
    sampleIndex: transcript.sampleIndex,
    decisionDirection: decisionDisplay.direction,
    decisionStrength: decisionDisplay.strength,
    decisionReason: decisionDisplay.reason,
    decisionSource: decisionDisplay.decisionSource,
    parseClass: decisionDisplay.parseClass || decisionMetadata.parseClass,
    parsePath: decisionDisplay.parsePath || decisionMetadata.parsePath,
    matchedLabel: decisionDisplay.matchedLabel || decisionMetadata.matchedLabel,
    trialSignature: extractTrialSignature(transcript.run?.definition?.version, transcript.run?.config),
    probePrompt: getProbePrompt(transcript),
    targetResponse: getTargetResponse(transcript),
    variables: getVariablesForTranscript(transcript, dimensionColumns),
  };
}

/**
 * Format a CSV row as a string with variable columns.
 * Column order: Model Name, Trial Signature, Batch, Sample Index, [Variables...], Decision Direction, Decision Strength, Decision Reason, Transcript ID, Probe Prompt, Target Response
 * @param row - The CSV row data
 * @param variableNames - Ordered list of variable column names
 */
export function formatCSVRow(
  row: CSVRow,
  variableNames: string[],
  options: CSVFormatOptions = {},
): string {
  // Pre-variable columns (Model Name, Trial Signature, Batch, Sample Index)
  const preVariableValues = [
    escapeCSV(row.modelName),
    escapeCSV(row.trialSignature),
    escapeCSV(row.batchName),
    escapeCSV(row.sampleIndex),
  ];

  // Variable values in the same order as headers
  const variableValues = variableNames.map((name) => {
    const value = row.variables[name];
    return escapeCSV(value ?? '');
  });

  // Post-variable columns
  const postVariableValues = [
    escapeCSV(row.decisionDirection),
    escapeCSV(row.decisionStrength),
    escapeCSV(row.decisionReason),
  ];

  if (options.includeDecisionMetadata === true) {
    postVariableValues.push(
      escapeCSV(row.decisionSource),
      escapeCSV(row.parseClass),
      escapeCSV(row.parsePath),
      escapeCSV(row.matchedLabel),
    );
  }

  postVariableValues.push(
    escapeCSV(row.transcriptId),
    escapeCSV(row.probePrompt),
    escapeCSV(row.targetResponse),
  );

  return [...preVariableValues, ...variableValues, ...postVariableValues].join(',');
}

/**
 * Get CSV header line with variable columns.
 * Column order: Model Name, Trial Signature, Batch, Sample Index, [Variables...], Decision Direction, Decision Strength, Decision Reason, Transcript ID, Probe Prompt, Target Response
 * @param variableNames - List of dimension/variable names to include
 */
export function getCSVHeader(
  variableNames: string[],
  options: CSVFormatOptions = {},
): string {
  const postHeaders = options.includeDecisionMetadata === true
    ? POST_VARIABLE_HEADERS_WITH_METADATA
    : POST_VARIABLE_HEADERS;
  return [...PRE_VARIABLE_HEADERS, ...variableNames, ...postHeaders].join(',');
}

function buildDimensionColumns(
  transcripts: TranscriptWithScenario[],
  options: CSVFormatOptions = {},
): DimensionColumnMap {
  const postHeaders = options.includeDecisionMetadata === true
    ? POST_VARIABLE_HEADERS_WITH_METADATA
    : POST_VARIABLE_HEADERS;
  return collectVisibleDimensionColumns(transcripts, [...PRE_VARIABLE_HEADERS, ...postHeaders]);
}

/**
 * Convert array of transcripts to full CSV content.
 * Includes BOM for Excel compatibility.
 * Dynamically adds variable columns based on scenario dimensions.
 */
export function transcriptsToCSV(
  transcripts: TranscriptWithScenario[],
  options: CSVFormatOptions = {},
): string {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel

  // Collect all variable names across all transcripts
  const dimensionColumns = buildDimensionColumns(transcripts, options);
  const { headers: variableNames } = dimensionColumns;

  const header = getCSVHeader(variableNames, options);
  const rows = transcripts.map((t) => formatCSVRow(transcriptToCSVRow(t, dimensionColumns), variableNames, options));

  if (rows.length === 0) {
    return BOM + header;
  }

  return BOM + header + '\n' + rows.join('\n') + '\n';
}

/**
 * Generate export filename.
 */
export function generateExportFilename(runId: string): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `summary_${runId.slice(0, 8)}_${date}.csv`;
}

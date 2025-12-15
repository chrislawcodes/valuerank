/**
 * CSV Serialization Helper
 *
 * Converts run transcripts to CSV format for export.
 * Outputs summarized results with decision codes and explanations.
 * Format matches Python src/summary.py output for compatibility.
 */

import type { Transcript, Scenario } from '@prisma/client';

export type TranscriptWithScenario = Transcript & {
  scenario: Scenario | null;
};

export type CSVRow = {
  transcriptId: string;
  modelName: string;
  decisionCode: string;
  decisionText: string;
  targetResponse: string;
  variables: Record<string, number>;
};

/**
 * CSV column headers before variable columns.
 * Order: Model Name first, then variable columns are inserted dynamically.
 */
export const PRE_VARIABLE_HEADERS = ['AI Model Name'] as const;

/**
 * CSV column headers after variable columns.
 * Order: Decision Code, Decision Text, Transcript ID, Target Response
 */
export const POST_VARIABLE_HEADERS = [
  'Decision Code',
  'Decision Text',
  'Transcript ID',
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
};

// Transcript content structure with turns
type TranscriptContent = {
  turns?: Array<{
    targetResponse?: string;
  }>;
};

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
 * Returns a map of dimension names to their numeric scores (1-5).
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

/**
 * Convert a transcript to a CSV row.
 * @param transcript - The transcript with scenario data
 */
export function transcriptToCSVRow(transcript: TranscriptWithScenario): CSVRow {
  return {
    transcriptId: transcript.id,
    modelName: getModelName(transcript.modelId),
    decisionCode: transcript.decisionCode ?? 'pending',
    decisionText: transcript.decisionText ?? 'Summary not yet generated',
    targetResponse: getTargetResponse(transcript),
    variables: getScenarioDimensions(transcript),
  };
}

/**
 * Format a CSV row as a string with variable columns.
 * Column order: Model Name, [Variables...], Decision Code, Decision Text, Transcript ID, Target Response
 * @param row - The CSV row data
 * @param variableNames - Ordered list of variable column names
 */
export function formatCSVRow(row: CSVRow, variableNames: string[]): string {
  // Pre-variable columns
  const preVariableValues = [escapeCSV(row.modelName)];

  // Variable values in the same order as headers
  const variableValues = variableNames.map((name) => {
    const value = row.variables[name];
    return escapeCSV(value ?? '');
  });

  // Post-variable columns
  const postVariableValues = [
    escapeCSV(row.decisionCode),
    escapeCSV(row.decisionText),
    escapeCSV(row.transcriptId),
    escapeCSV(row.targetResponse),
  ];

  return [...preVariableValues, ...variableValues, ...postVariableValues].join(',');
}

/**
 * Get CSV header line with variable columns.
 * Column order: Model Name, [Variables...], Decision Code, Decision Text, Transcript ID, Target Response
 * @param variableNames - List of dimension/variable names to include
 */
export function getCSVHeader(variableNames: string[]): string {
  return [...PRE_VARIABLE_HEADERS, ...variableNames, ...POST_VARIABLE_HEADERS].join(',');
}

/**
 * Collect all unique variable names from transcripts.
 * Returns sorted list for consistent column ordering.
 */
function collectVariableNames(transcripts: TranscriptWithScenario[]): string[] {
  const variableSet = new Set<string>();

  for (const transcript of transcripts) {
    const dimensions = getScenarioDimensions(transcript);
    for (const key of Object.keys(dimensions)) {
      variableSet.add(key);
    }
  }

  return Array.from(variableSet).sort();
}

/**
 * Convert array of transcripts to full CSV content.
 * Includes BOM for Excel compatibility.
 * Dynamically adds variable columns based on scenario dimensions.
 */
export function transcriptsToCSV(transcripts: TranscriptWithScenario[]): string {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel

  // Collect all variable names across all transcripts
  const variableNames = collectVariableNames(transcripts);

  const header = getCSVHeader(variableNames);
  const rows = transcripts.map((t) => formatCSVRow(transcriptToCSVRow(t), variableNames));

  return BOM + header + '\n' + rows.join('\n');
}

/**
 * Generate export filename.
 */
export function generateExportFilename(runId: string): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `summary_${runId.slice(0, 8)}_${date}.csv`;
}

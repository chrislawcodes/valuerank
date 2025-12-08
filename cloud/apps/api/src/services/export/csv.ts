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
  scenario: string;
  modelName: string;
  decisionCode: string;
  decisionText: string;
  variables: Record<string, number>;
};

/**
 * Base CSV column headers (matching summary.py output format).
 * Variable columns are added dynamically based on scenario dimensions.
 */
export const BASE_CSV_HEADERS = [
  'Scenario',
  'AI Model Name',
  'Decision Code',
  'Decision Text',
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

// Scenario content structure with dimensions
type ScenarioContent = {
  dimensions?: Record<string, string>;
};

/**
 * Parse scenario identifier to extract variable scores.
 * Supports multiple formats:
 *
 * 1. Python format: "scenario_011_FreedomBelief1_HarmonyFamily2"
 *    -> { variables: { FreedomBelief: 1, HarmonyFamily: 2 } }
 *
 * 2. Cloud format: "Description text (F1-T2-H3)"
 *    -> { variables: { F: 1, T: 2, H: 3 } } (abbreviations, need dimension names to expand)
 */
function parseScenarioIdentifier(
  name: string,
  dimensionNames?: string[]
): { number: string | null; variables: Record<string, number> } {
  const variables: Record<string, number> = {};
  let scenarioNumber: string | null = null;

  // Format 1: Python format - scenario_XXX_VarName1_VarName2...
  const pythonMatch = name.match(/^scenario[_-]?(\d+)?(?:_(.*))?$/i);
  if (pythonMatch) {
    scenarioNumber = pythonMatch[1] ?? null;
    const tail = pythonMatch[2] ?? '';

    // Parse variable tokens like "FreedomBelief1" or "Stakes2"
    for (const token of tail.split('_')) {
      if (!token) continue;
      const kvMatch = token.match(/^([A-Za-z]+)(-?\d+)$/);
      if (kvMatch && kvMatch[1] && kvMatch[2]) {
        variables[kvMatch[1]] = parseInt(kvMatch[2], 10);
      }
    }

    if (Object.keys(variables).length > 0) {
      return { number: scenarioNumber, variables };
    }
  }

  // Format 2: Cloud format - "Description (F1-T2-H3)"
  const cloudMatch = name.match(/\(([A-Z]\d(?:-[A-Z]\d)*)\)$/);
  if (cloudMatch && cloudMatch[1]) {
    const codes = cloudMatch[1].split('-');

    // Map abbreviations to full dimension names if provided
    for (const code of codes) {
      const abbrevMatch = code.match(/^([A-Z])(\d)$/);
      if (abbrevMatch && abbrevMatch[1] && abbrevMatch[2]) {
        const abbrev = abbrevMatch[1];
        const score = parseInt(abbrevMatch[2], 10);

        // Find full dimension name that starts with this letter
        if (dimensionNames) {
          const fullName = dimensionNames.find((d) => d.charAt(0).toUpperCase() === abbrev);
          if (fullName) {
            variables[fullName] = score;
            continue;
          }
        }

        // Fallback to abbreviation if no match
        variables[abbrev] = score;
      }
    }
  }

  return { number: scenarioNumber, variables };
}

/**
 * Get dimension names from scenario content.
 */
function getDimensionNames(transcript: TranscriptWithScenario): string[] {
  const content = transcript.scenario?.content as ScenarioContent | null;
  if (content?.dimensions) {
    return Object.keys(content.dimensions);
  }
  return [];
}

/**
 * Extract scenario number from scenario name or generate index-based number.
 * Parses names like "scenario_011_FreedomBelief1..." to extract "011".
 * Falls back to padded index if pattern doesn't match.
 */
function getScenarioNumber(transcript: TranscriptWithScenario, index: number): string {
  const name = transcript.scenario?.name ?? '';
  const dimensionNames = getDimensionNames(transcript);
  const { number } = parseScenarioIdentifier(name, dimensionNames);

  if (number) {
    return number;
  }

  // Fallback to index-based numbering
  return String(index + 1).padStart(3, '0');
}

/**
 * Extract dimension variable scores from scenario name.
 * Parses the scenario identifier to get numeric scores (1-5).
 * Returns a map of dimension names to their numeric scores.
 */
function getScenarioDimensions(transcript: TranscriptWithScenario): Record<string, number> {
  const name = transcript.scenario?.name ?? '';
  const dimensionNames = getDimensionNames(transcript);
  const { variables } = parseScenarioIdentifier(name, dimensionNames);
  return variables;
}

/**
 * Convert a transcript to a CSV row.
 * @param transcript - The transcript with scenario data
 * @param index - The index of this transcript (for scenario numbering fallback)
 */
export function transcriptToCSVRow(transcript: TranscriptWithScenario, index: number): CSVRow {
  return {
    scenario: getScenarioNumber(transcript, index),
    modelName: getModelName(transcript.modelId),
    decisionCode: transcript.decisionCode ?? 'pending',
    decisionText: transcript.decisionText ?? 'Summary not yet generated',
    variables: getScenarioDimensions(transcript),
  };
}

/**
 * Format a CSV row as a string with variable columns.
 * @param row - The CSV row data
 * @param variableNames - Ordered list of variable column names
 */
export function formatCSVRow(row: CSVRow, variableNames: string[]): string {
  const baseValues = [
    escapeCSV(row.scenario),
    escapeCSV(row.modelName),
    escapeCSV(row.decisionCode),
    escapeCSV(row.decisionText),
  ];

  // Add variable values in the same order as headers
  const variableValues = variableNames.map((name) => {
    const value = row.variables[name];
    return escapeCSV(value ?? '');
  });

  return [...baseValues, ...variableValues].join(',');
}

/**
 * Get CSV header line with variable columns.
 * @param variableNames - List of dimension/variable names to include
 */
export function getCSVHeader(variableNames: string[]): string {
  return [...BASE_CSV_HEADERS, ...variableNames].join(',');
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
  const rows = transcripts.map((t, index) =>
    formatCSVRow(transcriptToCSVRow(t, index), variableNames)
  );

  return BOM + header + '\n' + rows.join('\n');
}

/**
 * Generate export filename.
 */
export function generateExportFilename(runId: string): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `summary_${runId.slice(0, 8)}_${date}.csv`;
}

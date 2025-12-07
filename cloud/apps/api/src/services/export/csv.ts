/**
 * CSV Serialization Helper
 *
 * Converts run transcripts to CSV format for export.
 */

import type { Transcript } from '@prisma/client';

export type CSVRow = {
  runId: string;
  scenarioId: string | null;
  modelId: string;
  modelVersion: string | null;
  turnCount: number;
  tokenCount: number;
  durationMs: number;
  createdAt: string;
};

/**
 * CSV column headers.
 */
export const CSV_HEADERS = [
  'run_id',
  'scenario_id',
  'model_id',
  'model_version',
  'turn_count',
  'token_count',
  'duration_ms',
  'created_at',
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
 * Convert a transcript to a CSV row.
 */
export function transcriptToCSVRow(transcript: Transcript): CSVRow {
  return {
    runId: transcript.runId,
    scenarioId: transcript.scenarioId,
    modelId: transcript.modelId,
    modelVersion: transcript.modelVersion,
    turnCount: transcript.turnCount,
    tokenCount: transcript.tokenCount,
    durationMs: transcript.durationMs,
    createdAt: transcript.createdAt.toISOString(),
  };
}

/**
 * Format a CSV row as a string.
 */
export function formatCSVRow(row: CSVRow): string {
  return [
    escapeCSV(row.runId),
    escapeCSV(row.scenarioId),
    escapeCSV(row.modelId),
    escapeCSV(row.modelVersion),
    escapeCSV(row.turnCount),
    escapeCSV(row.tokenCount),
    escapeCSV(row.durationMs),
    escapeCSV(row.createdAt),
  ].join(',');
}

/**
 * Get CSV header line.
 */
export function getCSVHeader(): string {
  return CSV_HEADERS.join(',');
}

/**
 * Convert array of transcripts to full CSV content.
 * Includes BOM for Excel compatibility.
 */
export function transcriptsToCSV(transcripts: Transcript[]): string {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel
  const header = getCSVHeader();
  const rows = transcripts.map((t) => formatCSVRow(transcriptToCSVRow(t)));

  return BOM + header + '\n' + rows.join('\n');
}

/**
 * Generate export filename.
 */
export function generateExportFilename(runId: string): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `run_${runId}_${date}.csv`;
}

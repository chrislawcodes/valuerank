/**
 * XLSX Worksheet Helpers
 *
 * Shared utility functions for building Excel worksheets.
 */

import type { TranscriptWithScenario, ScenarioContent, TranscriptContent } from '../types.js';

// Excel cell character limit
export const CELL_MAX_CHARS = 32767;
export const TRUNCATE_MSG = '\n\n[TRUNCATED - Response exceeded 32,767 character limit]';

/**
 * Extract short model name from model ID.
 * E.g., "anthropic:claude-3-5-haiku-20241022" -> "claude-3-5-haiku"
 */
export function getModelName(modelId: string): string {
  const withoutProvider = modelId.includes(':') ? modelId.split(':')[1] ?? modelId : modelId;
  return withoutProvider.replace(/-\d{8}$/, '');
}

/**
 * Extract the target response from transcript content.
 * Combines all target responses from all turns.
 */
export function getTargetResponse(transcript: TranscriptWithScenario): string {
  const content = transcript.content as TranscriptContent | null;
  if (!content?.turns || !Array.isArray(content.turns)) {
    return '';
  }

  const responses = content.turns
    .map((turn) => turn.targetResponse ?? '')
    .filter((r) => r.length > 0);

  return responses.join('\n\n---\n\n');
}

/**
 * Extract dimension scores from scenario content.
 */
export function getScenarioDimensions(transcript: TranscriptWithScenario): Record<string, number> {
  const content = transcript.scenario?.content as ScenarioContent | null;
  if (content?.dimensions && typeof content.dimensions === 'object') {
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
 * Truncate a string to Excel's cell character limit.
 */
export function truncateForExcel(text: string): string {
  if (text.length <= CELL_MAX_CHARS) {
    return text;
  }
  const truncateAt = CELL_MAX_CHARS - TRUNCATE_MSG.length;
  return text.substring(0, truncateAt) + TRUNCATE_MSG;
}

/**
 * Collect all unique dimension names from transcripts.
 */
export function collectDimensionNames(transcripts: TranscriptWithScenario[]): string[] {
  const names = new Set<string>();
  for (const transcript of transcripts) {
    const dims = getScenarioDimensions(transcript);
    for (const key of Object.keys(dims)) {
      names.add(key);
    }
  }
  return Array.from(names).sort();
}

/**
 * Parse decision code as a numeric score.
 * Returns null if not parseable.
 */
export function parseDecisionScore(code: string | null): number | null {
  if (code === null || code === undefined || code === '') return null;
  const num = parseInt(code, 10);
  return isNaN(num) ? null : num;
}

/**
 * Calculate standard deviation.
 */
export function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

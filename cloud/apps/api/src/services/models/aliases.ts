/**
 * Legacy model ID aliasing.
 *
 * Keeps old model identifiers working after provider/model renames.
 */

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  // Gemini 2.5 Flash preview IDs were replaced by the stable ID.
  'gemini-2.5-flash-preview-05-20': 'gemini-2.5-flash',
  'gemini-2.5-flash-preview-09-2025': 'gemini-2.5-flash',
};

/**
 * Normalize a model ID, mapping known legacy IDs to current canonical IDs.
 */
export function normalizeLegacyModelId(modelId: string): string {
  return LEGACY_MODEL_ALIASES[modelId] ?? modelId;
}

/**
 * Normalize a list of model IDs.
 */
export function normalizeLegacyModelIds(modelIds: string[]): string[] {
  return modelIds.map(normalizeLegacyModelId);
}


/**
 * Legacy model ID compatibility helpers.
 *
 * Some environments still store historical Gemini IDs while others have newer
 * replacements. These helpers treat them as equivalent and resolve to whatever
 * exists in the current database.
 */

const MODEL_EQUIVALENCE_GROUPS: string[][] = [
  [
    'gemini-2.5-flash',
    'gemini-2.5-flash-preview-09-2025',
    'gemini-2.5-flash-preview-05-20',
  ],
];

/**
 * Returns all known equivalent model IDs for a given model ID.
 * If no aliases are known, returns the input model ID only.
 */
export function getEquivalentModelIds(modelId: string): string[] {
  for (const group of MODEL_EQUIVALENCE_GROUPS) {
    if (group.includes(modelId)) {
      return [...group];
    }
  }
  return [modelId];
}

/**
 * Resolve a requested model ID against a set of available IDs.
 *
 * Preference order:
 * 1) exact match
 * 2) first equivalent that exists in available IDs
 * 3) null if nothing matches
 */
export function resolveModelIdFromAvailable(
  requestedModelId: string,
  availableModelIds: Set<string>
): string | null {
  if (availableModelIds.has(requestedModelId)) {
    return requestedModelId;
  }

  const candidates = getEquivalentModelIds(requestedModelId);
  for (const candidate of candidates) {
    if (availableModelIds.has(candidate)) {
      return candidate;
    }
  }

  return null;
}


export type DefinitionDimension = {
  name?: unknown;
  levels?: unknown;
  values?: unknown;
};

export function getDimensionLevelsFromDefinition(definitionDimension: DefinitionDimension | undefined): string[] {
  if (!definitionDimension) {
    return [];
  }

  if (Array.isArray(definitionDimension.levels)) {
    return definitionDimension.levels
      .map((level) => {
        if (level !== null && typeof level === 'object') {
          const score = (level as { score?: unknown }).score;
          if (typeof score === 'number' || typeof score === 'string') {
            return String(score);
          }
          const label = (level as { label?: unknown }).label;
          if (typeof label === 'string' && label.trim() !== '') {
            return label;
          }
        }
        return null;
      })
      .filter((value): value is string => value !== null);
  }

  if (Array.isArray(definitionDimension.values)) {
    return definitionDimension.values
      .map((value) => (typeof value === 'string' ? value : null))
      .filter((value): value is string => value !== null);
  }

  return [];
}

export function getScenarioDimensions(content: unknown): Record<string, string> {
  if (content === null || typeof content !== 'object' || Array.isArray(content)) {
    return {};
  }
  const dimensions = (content as { dimensions?: unknown }).dimensions;
  if (dimensions === null || typeof dimensions !== 'object' || Array.isArray(dimensions)) {
    return {};
  }
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(dimensions)) {
    if (typeof value === 'string') {
      normalized[key] = value;
    } else if (typeof value === 'number') {
      normalized[key] = String(value);
    }
  }
  return normalized;
}

export function getLevelNormalizationMap(definitionDimension: DefinitionDimension | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!definitionDimension || !Array.isArray(definitionDimension.levels)) {
    return map;
  }

  for (const level of definitionDimension.levels) {
    if (level === null || typeof level !== 'object') {
      continue;
    }
    const score = (level as { score?: unknown }).score;
    const label = (level as { label?: unknown }).label;
    const scoreText = typeof score === 'number' || typeof score === 'string' ? String(score) : null;
    const labelText = typeof label === 'string' ? label : null;
    if (scoreText !== null) {
      map.set(scoreText, scoreText);
      if (labelText !== null && labelText.trim() !== '') {
        map.set(labelText, scoreText);
      }
    }
  }

  return map;
}

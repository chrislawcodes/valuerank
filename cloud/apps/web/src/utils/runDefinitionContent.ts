type DefinitionContentShape = {
  dimensions?: unknown;
  template?: unknown;
};

type RunWithDefinitionContent = {
  definitionSnapshot?: unknown;
  config?: unknown;
  definition?: {
    content?: unknown;
  } | null;
};

function hasDefinitionShape(value: unknown): value is DefinitionContentShape {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;

  // Accept snapshots that contain a recognizable definition payload.
  if ('dimensions' in candidate) {
    return Array.isArray(candidate.dimensions);
  }
  if ('template' in candidate) {
    return typeof candidate.template === 'string';
  }

  return false;
}

/**
 * Resolve the effective definition content for a run.
 * For analysis views, the run snapshot is the source of truth because it reflects
 * the exact definition used when scenarios were generated.
 */
export function getRunDefinitionContent(run: RunWithDefinitionContent | null | undefined): unknown {
  // `definitionSnapshot` is the canonical location.
  // `config.definitionSnapshot` is retained for backward compatibility with older runs.
  const directSnapshot = run?.definitionSnapshot;
  if (hasDefinitionShape(directSnapshot)) {
    return directSnapshot;
  }

  const configSnapshot = (
    run?.config !== null
    && run?.config !== undefined
    && typeof run.config === 'object'
    && 'definitionSnapshot' in run.config
  )
    ? (run.config as { definitionSnapshot?: unknown }).definitionSnapshot
    : undefined;
  if (hasDefinitionShape(configSnapshot)) {
    return configSnapshot;
  }

  return run?.definition?.content;
}

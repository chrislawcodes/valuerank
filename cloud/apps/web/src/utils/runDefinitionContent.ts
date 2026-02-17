type DefinitionContentShape = {
  dimensions?: unknown;
};

type RunWithDefinitionContent = {
  definitionSnapshot?: unknown;
  config?: unknown;
  definition?: {
    content?: unknown;
  } | null;
};

function hasDefinitionShape(value: unknown): value is DefinitionContentShape {
  return value !== null && typeof value === 'object';
}

/**
 * Resolve the effective definition content for a run.
 * For analysis views, the run snapshot is the source of truth because it reflects
 * the exact definition used when scenarios were generated.
 */
export function getRunDefinitionContent(run: RunWithDefinitionContent | null | undefined): unknown {
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

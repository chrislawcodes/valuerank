function normalizeTemperatureToken(temperature: number | null): string {
  if (temperature === null || !Number.isFinite(temperature)) {
    return 'd';
  }
  // Normalize to a stable, human-readable token.
  // Examples: 0 -> "0", 0.7 -> "0.7", 1.25 -> "1.25"
  const fixed = temperature.toFixed(3);
  const trimmed = fixed.replace(/\.?0+$/, '');
  return trimmed;
}

export function formatTrialSignature(
  definitionVersion: number | null,
  temperature: number | null,
): string {
  const versionToken = definitionVersion === null || !Number.isFinite(definitionVersion)
    ? '?'
    : String(definitionVersion);
  const temperatureToken = normalizeTemperatureToken(temperature);
  return `v${versionToken}t${temperatureToken}`;
}


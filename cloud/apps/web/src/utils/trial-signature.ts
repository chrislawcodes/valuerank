export function formatTrialSignature(version: number | null | undefined, temperature: number | null | undefined): string {
  const versionToken = version === null || version === undefined ? '?' : String(version);
  const tempToken = temperature === null || temperature === undefined || !Number.isFinite(temperature)
    ? 'd'
    : temperature.toFixed(3).replace(/\.?0+$/, '');
  return `v${versionToken}t${tempToken}`;
}

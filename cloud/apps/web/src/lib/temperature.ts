export function formatTemperatureSetting(temperature: number | null | undefined): string {
  if (typeof temperature !== 'number' || !Number.isFinite(temperature)) {
    return 'temp=default';
  }
  return `temp=${temperature}`;
}

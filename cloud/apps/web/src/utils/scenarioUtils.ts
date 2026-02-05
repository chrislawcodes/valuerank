export function normalizeScenarioId(value: string): string {
  return value.toLowerCase().replace(/^.*[/:]/, '').replace(/^scenario-/, '');
}

export function normalizeModelId(value: string): string {
  return value.toLowerCase().replace(/^.*:/, '');
}

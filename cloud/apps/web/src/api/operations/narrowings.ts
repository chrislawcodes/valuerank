export function narrowEstimateConfidence(
  value: string | null | undefined
): 'HIGH' | 'MEDIUM' | 'LOW' | null {
  if (value === 'HIGH' || value === 'MEDIUM' || value === 'LOW') return value;
  return null;
}

export function narrowAnalysisStatus(
  value: string | null | undefined
): string | null {
  return value ?? null;
}

import type { VarianceAnalysis } from '../api/operations/analysis';

export type PairedScopeContext = {
  orientationCorrectedCount: number;
  hasOrientationPairing: boolean;
};

/**
 * Build paired-vignette scope context from analysis mode and variance analysis.
 *
 * In single mode the context is inert. In paired mode, if orientation correction
 * was applied during analysis (orientationCorrectedCount > 0), the context flags
 * `hasOrientationPairing` so consumers can surface orientation-specific UI.
 */
export function buildPairedScopeContext(
  analysisMode: 'single' | 'paired' | undefined,
  varianceAnalysis: VarianceAnalysis | null | undefined,
): PairedScopeContext {
  const orientationCorrectedCount = varianceAnalysis?.orientationCorrectedCount ?? 0;
  const hasOrientationPairing = analysisMode === 'paired' && orientationCorrectedCount > 0;
  return { orientationCorrectedCount, hasOrientationPairing };
}

/**
 * Statistical Utilities for Cross-Run Comparison
 *
 * This module provides statistical functions for comparing
 * analysis results across runs.
 */

// Cohen's d effect size
export {
  cohensD,
  cohensDFromData,
  interpretEffectSize,
  type CohensDResult,
} from './cohens-d';

// Kolmogorov-Smirnov test
export {
  ksStatistic,
  ksFromCounts,
  buildECDF,
  interpretKS,
  type KSResult,
  type KSInterpretation,
} from './ks-test';

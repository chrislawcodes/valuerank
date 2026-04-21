import { SCHWARTZ_CIRCULAR_ORDER, type ValueKey } from '@valuerank/shared/schwartz';

export type CircumplexPairCell = {
  winRate: number | null;
  trials: number;
  neutrals: number;
};

export type CircumplexPairMatrix = CircumplexPairCell[][];

export type CircumplexEligibilityStatus = 'eligible' | 'insufficient';
export type CircumplexEligibilityReason =
  | 'no_transcripts_for_signature'
  | 'missing_values'
  | 'below_threshold';

export type CircumplexEligibilityResult = {
  status: CircumplexEligibilityStatus;
  reason?: CircumplexEligibilityReason;
  trialsPerValue: Array<{ valueKey: ValueKey; trials: number }>;
};

export function classifyEligibility(args: {
  model: { modelId: string; modelLabel: string; providerName: string };
  pairwise: CircumplexPairMatrix;
  minTrialsPerValue: number;
}): CircumplexEligibilityResult {
  void args.model;
  const trialsPerValue = SCHWARTZ_CIRCULAR_ORDER.map((valueKey, rowIndex) => {
    const trials = args.pairwise[rowIndex]?.reduce((sum, cell, colIndex) => (
      rowIndex === colIndex ? sum : sum + (cell?.trials ?? 0)
    ), 0) ?? 0;
    return { valueKey, trials };
  });

  const totalTrials = trialsPerValue.reduce((sum, entry) => sum + entry.trials, 0);
  if (totalTrials === 0) {
    return {
      status: 'insufficient',
      reason: 'no_transcripts_for_signature',
      trialsPerValue,
    };
  }

  if (trialsPerValue.some((entry) => entry.trials === 0)) {
    return {
      status: 'insufficient',
      reason: 'missing_values',
      trialsPerValue,
    };
  }

  if (trialsPerValue.some((entry) => entry.trials < args.minTrialsPerValue)) {
    return {
      status: 'insufficient',
      reason: 'below_threshold',
      trialsPerValue,
    };
  }

  return {
    status: 'eligible',
    trialsPerValue,
  };
}

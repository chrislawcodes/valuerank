/**
 * Shared types and constants for the Overview Tab.
 */

export type ConditionRow = {
  id: string;
  attributeALevel: string;
  attributeBLevel: string;
  scenarioIds: string[];
};

export type ConditionRepeatStats = {
  directionalAgreement: number | null;
  medianSignedDistance: number | null;
  neutralShare: number | null;
  totalCount: number;
  maxRange: number | null;
};

import type { VarianceAnalysis } from '../../../api/operations/analysis';

export type RepeatPatternSource = {
  runId: string;
  varianceAnalysis: VarianceAnalysis | null | undefined;
  conditionRows: ConditionRow[];
};

export type RepeatPattern = 'stable' | 'softLean' | 'torn' | 'noisy';

export const REPEAT_PATTERN_LABELS: Record<RepeatPattern, string> = {
  stable: 'Stable',
  softLean: 'Soft Lean',
  torn: 'Torn',
  noisy: 'Unstable',
};

export const SUMMARY_COLUMN_TITLES = {
  model: 'AI model summarized in this row. Each row combines that model\u2019s overall value preference and its repeat-pattern mix across repeated conditions in this analysis.',
  preferredValue: 'The value this model most often favors overall in this analysis slice. This is the top value on the model-level preference summary, not a count of individual transcript decisions.',
  winRate: 'Win rate for the preferred value. Higher values mean the model chooses that value more often when it is on the selected side.',
  valueAgreement: 'How often repeated judgments stay on the same value side. Higher means the model usually leans the same way when the same conflict is repeated, even if the exact score changes a little.',
  stable: 'Share of repeated conditions where the model shows a settled pattern. These are repeats where one clear pattern wins and the answers do not move around much.',
  softLean: 'Share of repeated conditions where the model shows a narrow but only slightly off-neutral lean. These are coherent repeats with a mild lean, but not strong enough to count as fully settled.',
  torn: 'Share of repeated conditions where the value conflict remains unresolved between the two sides. These are repeats that stay near the middle or split between sides without a clear winner.',
  unstable: 'Share of repeated conditions where the answers swing too widely to read as one coherent pattern. These are the broadest or messiest repeats in the set.',
} as const;

export type RepeatPatternMetrics =
  | {
      status: 'available';
      counts: Record<RepeatPattern, number>;
      conditionIds: Record<RepeatPattern, string[]>;
      classifiedCount: number;
      repeatedCount: number;
      strongerConfidenceCount: number;
      sourceCount: number;
    }
  | {
      status: 'unavailable';
      reason: string;
      repeatedCount: number;
      strongerConfidenceCount: number;
      sourceCount: number;
    };

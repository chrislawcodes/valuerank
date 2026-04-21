export type ValueKey =
  | 'Self_Direction_Action'
  | 'Stimulation'
  | 'Hedonism'
  | 'Achievement'
  | 'Power_Dominance'
  | 'Security_Personal'
  | 'Conformity_Interpersonal'
  | 'Tradition'
  | 'Benevolence_Dependability'
  | 'Universalism_Nature';

export const SCHWARTZ_CIRCULAR_ORDER: readonly ValueKey[] = [
  'Self_Direction_Action',
  'Stimulation',
  'Hedonism',
  'Achievement',
  'Power_Dominance',
  'Security_Personal',
  'Conformity_Interpersonal',
  'Tradition',
  'Benevolence_Dependability',
  'Universalism_Nature',
] as const;

export function theoreticalAngleDeg(index: number, count = SCHWARTZ_CIRCULAR_ORDER.length): number {
  return (index / count) * 360;
}

export function circularDistance(i: number, j: number, count = SCHWARTZ_CIRCULAR_ORDER.length): number {
  const raw = Math.abs(i - j);
  return Math.min(raw, count - raw);
}

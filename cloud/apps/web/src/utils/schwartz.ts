import type { ValueKey } from '../data/domainAnalysisData';

const FULL_VALUE_NAMES: Record<ValueKey, string> = {
  Self_Direction_Action: 'Self-Direction — Action',
  Universalism_Nature: 'Universalism — Nature',
  Benevolence_Dependability: 'Benevolence — Dependability',
  Security_Personal: 'Security — Personal',
  Power_Dominance: 'Power — Dominance',
  Achievement: 'Achievement',
  Tradition: 'Tradition',
  Stimulation: 'Stimulation',
  Hedonism: 'Hedonism',
  Conformity_Interpersonal: 'Conformity — Interpersonal',
};

export function formatFullSchwartzValueName(valueKey: ValueKey): string {
  return FULL_VALUE_NAMES[valueKey];
}

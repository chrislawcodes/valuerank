export type ValueKey =
  | 'Self_Direction_Action'
  | 'Universalism_Nature'
  | 'Benevolence_Dependability'
  | 'Security_Personal'
  | 'Power_Dominance'
  | 'Achievement'
  | 'Tradition'
  | 'Stimulation'
  | 'Hedonism'
  | 'Conformity_Interpersonal';

export type ModelEntry = {
  model: string;
  label: string;
  values: Record<ValueKey, number>;
};

export const VALUES: ValueKey[] = [
  'Self_Direction_Action',
  'Universalism_Nature',
  'Benevolence_Dependability',
  'Security_Personal',
  'Power_Dominance',
  'Achievement',
  'Tradition',
  'Stimulation',
  'Hedonism',
  'Conformity_Interpersonal',
];

export const VALUE_LABELS: Record<ValueKey, string> = {
  Self_Direction_Action: 'Self-Direction',
  Universalism_Nature: 'Universalism',
  Benevolence_Dependability: 'Benevolence',
  Security_Personal: 'Security',
  Power_Dominance: 'Power',
  Achievement: 'Achievement',
  Tradition: 'Tradition',
  Stimulation: 'Stimulation',
  Hedonism: 'Hedonism',
  Conformity_Interpersonal: 'Conformity',
};

// Static snapshot from validated analysis export.
// TODO: Replace with domain-scoped API-backed data.
export const DOMAIN_ANALYSIS_MODELS: ModelEntry[] = [
  { model: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', values: { Self_Direction_Action: 1.6451, Universalism_Nature: 1.4332, Benevolence_Dependability: 0.5614, Security_Personal: 0.4356, Achievement: 0.2526, Hedonism: -0.1574, Tradition: -0.1741, Stimulation: -0.3415, Power_Dominance: -0.8556, Conformity_Interpersonal: -2.7994 } },
  { model: 'deepseek-chat', label: 'DeepSeek Chat', values: { Self_Direction_Action: 1.1955, Tradition: 0.6793, Universalism_Nature: 0.3466, Benevolence_Dependability: 0.0318, Conformity_Interpersonal: 0.0038, Power_Dominance: -0.0191, Security_Personal: -0.255, Stimulation: -0.3927, Hedonism: -0.4592, Achievement: -1.1309 } },
  { model: 'deepseek-reasoner', label: 'DeepSeek Reasoner', values: { Self_Direction_Action: 1.4757, Power_Dominance: 0.844, Security_Personal: 0.5842, Tradition: 0.4419, Universalism_Nature: 0.1326, Conformity_Interpersonal: 0.0911, Benevolence_Dependability: -0.2564, Stimulation: -0.595, Achievement: -1.0585, Hedonism: -1.6596 } },
  { model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', values: { Self_Direction_Action: 0.7974, Security_Personal: 0.5093, Power_Dominance: 0.3923, Tradition: 0.1021, Universalism_Nature: 0.0859, Conformity_Interpersonal: -0.1738, Achievement: -0.2376, Benevolence_Dependability: -0.2784, Stimulation: -0.3068, Hedonism: -0.8904 } },
  { model: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', values: { Universalism_Nature: 0.9101, Self_Direction_Action: 0.5365, Tradition: 0.4465, Security_Personal: 0.3661, Benevolence_Dependability: 0.1517, Achievement: -0.0736, Power_Dominance: -0.0869, Stimulation: -0.6201, Conformity_Interpersonal: -0.7657, Hedonism: -0.8646 } },
  { model: 'gpt-5-mini', label: 'GPT-5 Mini', values: { Self_Direction_Action: 0.5542, Universalism_Nature: 0.7732, Security_Personal: 0.4395, Power_Dominance: 0.4274, Tradition: 0.3343, Achievement: 0.0158, Stimulation: -0.4636, Benevolence_Dependability: -0.567, Conformity_Interpersonal: -0.6049, Hedonism: -0.9088 } },
  { model: 'gpt-5.1', label: 'GPT-5.1', values: { Universalism_Nature: 1.8516, Tradition: 1.3391, Stimulation: 0.8216, Self_Direction_Action: 0.5984, Benevolence_Dependability: 0.1681, Achievement: -0.2982, Hedonism: -0.4806, Power_Dominance: -0.5003, Security_Personal: -0.805, Conformity_Interpersonal: -2.6948 } },
  { model: 'grok-4-0709', label: 'Grok 4', values: { Self_Direction_Action: 0.6742, Universalism_Nature: 0.5698, Benevolence_Dependability: 0.3342, Tradition: 0.2349, Stimulation: 0.0669, Power_Dominance: 0.0057, Security_Personal: 0.0051, Achievement: -0.421, Conformity_Interpersonal: -0.6001, Hedonism: -0.8696 } },
  { model: 'grok-4-1-fast-reasoning', label: 'Grok 4.1 Fast', values: { Self_Direction_Action: 1.2015, Power_Dominance: 0.793, Benevolence_Dependability: 0.6631, Tradition: 0.1394, Security_Personal: 0.0376, Universalism_Nature: -0.0684, Achievement: -0.1333, Stimulation: -0.218, Conformity_Interpersonal: -1.1808, Hedonism: -1.234 } },
  { model: 'mistral-large-2512', label: 'Mistral Large', values: { Universalism_Nature: 2.6088, Achievement: 2.3594, Hedonism: 2.3267, Benevolence_Dependability: 1.3833, Tradition: 0.6257, Stimulation: 0.3216, Self_Direction_Action: -1.5381, Conformity_Interpersonal: -2.3806, Power_Dominance: -2.6477, Security_Personal: -3.059 } },
  { model: 'mistral-small-2503', label: 'Mistral Small', values: { Tradition: 3.1687, Benevolence_Dependability: 2.1636, Universalism_Nature: 1.2043, Self_Direction_Action: 1.1051, Achievement: -0.4261, Security_Personal: -0.7413, Stimulation: -1.0604, Hedonism: -1.1403, Power_Dominance: -1.601, Conformity_Interpersonal: -2.6724 } },
];

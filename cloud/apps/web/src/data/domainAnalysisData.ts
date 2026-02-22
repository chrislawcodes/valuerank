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

export type DomainAnalysisModelAvailability = {
  model: string;
  label: string;
  reason: string;
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

// Static snapshot from validated analysis export (jobs domain, snapshot date: 2026-02-21).
// TODO: Replace with domain-scoped API-backed data.
export const DOMAIN_ANALYSIS_MODELS: ModelEntry[] = [
  {
    model: 'claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
    values: {
      Self_Direction_Action: 1.6451,
      Universalism_Nature: 1.4332,
      Benevolence_Dependability: 0.5614,
      Security_Personal: 0.4356,
      Power_Dominance: -0.8556,
      Achievement: 0.2526,
      Tradition: -0.1741,
      Stimulation: -0.3415,
      Hedonism: -0.1574,
      Conformity_Interpersonal: -2.7994,
    },
  },
  {
    model: 'deepseek-chat',
    label: 'DeepSeek Chat',
    values: {
      Self_Direction_Action: 1.1955,
      Universalism_Nature: 0.3466,
      Benevolence_Dependability: 0.0318,
      Security_Personal: -0.255,
      Power_Dominance: -0.0191,
      Achievement: -1.1309,
      Tradition: 0.6793,
      Stimulation: -0.3927,
      Hedonism: -0.4592,
      Conformity_Interpersonal: 0.0038,
    },
  },
  {
    model: 'deepseek-reasoner',
    label: 'DeepSeek Reasoner',
    values: {
      Self_Direction_Action: 1.4757,
      Universalism_Nature: 0.1326,
      Benevolence_Dependability: -0.2564,
      Security_Personal: 0.5842,
      Power_Dominance: 0.844,
      Achievement: -1.0585,
      Tradition: 0.4419,
      Stimulation: -0.595,
      Hedonism: -1.6596,
      Conformity_Interpersonal: 0.0911,
    },
  },
  {
    model: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    values: {
      Self_Direction_Action: 0.7974,
      Universalism_Nature: 0.0859,
      Benevolence_Dependability: -0.2784,
      Security_Personal: 0.5093,
      Power_Dominance: 0.3923,
      Achievement: -0.2376,
      Tradition: 0.1021,
      Stimulation: -0.3068,
      Hedonism: -0.8904,
      Conformity_Interpersonal: -0.1738,
    },
  },
  {
    model: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    values: {
      Self_Direction_Action: 0.5365,
      Universalism_Nature: 0.9101,
      Benevolence_Dependability: 0.1517,
      Security_Personal: 0.3661,
      Power_Dominance: -0.0869,
      Achievement: -0.0736,
      Tradition: 0.4465,
      Stimulation: -0.6201,
      Hedonism: -0.8646,
      Conformity_Interpersonal: -0.7657,
    },
  },
  {
    model: 'gpt-5-mini',
    label: 'GPT-5 Mini',
    values: {
      Self_Direction_Action: 0.5542,
      Universalism_Nature: 0.7732,
      Benevolence_Dependability: -0.567,
      Security_Personal: 0.4395,
      Power_Dominance: 0.4274,
      Achievement: 0.0158,
      Tradition: 0.3343,
      Stimulation: -0.4636,
      Hedonism: -0.9088,
      Conformity_Interpersonal: -0.6049,
    },
  },
  {
    model: 'gpt-5.1',
    label: 'GPT-5.1',
    values: {
      Self_Direction_Action: 0.5984,
      Universalism_Nature: 1.8516,
      Benevolence_Dependability: 0.1681,
      Security_Personal: -0.805,
      Power_Dominance: -0.5003,
      Achievement: -0.2982,
      Tradition: 1.3391,
      Stimulation: 0.8216,
      Hedonism: -0.4806,
      Conformity_Interpersonal: -2.6948,
    },
  },
  {
    model: 'grok-4-0709',
    label: 'Grok 4',
    values: {
      Self_Direction_Action: 0.6742,
      Universalism_Nature: 0.5698,
      Benevolence_Dependability: 0.3342,
      Security_Personal: 0.0051,
      Power_Dominance: 0.0057,
      Achievement: -0.421,
      Tradition: 0.2349,
      Stimulation: 0.0669,
      Hedonism: -0.8696,
      Conformity_Interpersonal: -0.6001,
    },
  },
  {
    model: 'grok-4-1-fast-reasoning',
    label: 'Grok 4.1 Fast',
    values: {
      Self_Direction_Action: 1.2015,
      Universalism_Nature: -0.0684,
      Benevolence_Dependability: 0.6631,
      Security_Personal: 0.0376,
      Power_Dominance: 0.793,
      Achievement: -0.1333,
      Tradition: 0.1394,
      Stimulation: -0.218,
      Hedonism: -1.234,
      Conformity_Interpersonal: -1.1808,
    },
  },
  {
    model: 'mistral-large-2512',
    label: 'Mistral Large',
    values: {
      Self_Direction_Action: -1.5381,
      Universalism_Nature: 2.6088,
      Benevolence_Dependability: 1.3833,
      Security_Personal: -3.059,
      Power_Dominance: -2.6477,
      Achievement: 2.3594,
      Tradition: 0.6257,
      Stimulation: 0.3216,
      Hedonism: 2.3267,
      Conformity_Interpersonal: -2.3806,
    },
  },
  {
    model: 'mistral-small-2503',
    label: 'Mistral Small',
    values: {
      Self_Direction_Action: 1.1051,
      Universalism_Nature: 1.2043,
      Benevolence_Dependability: 2.1636,
      Security_Personal: -0.7413,
      Power_Dominance: -1.601,
      Achievement: -0.4261,
      Tradition: 3.1687,
      Stimulation: -1.0604,
      Hedonism: -1.1403,
      Conformity_Interpersonal: -2.6724,
    },
  },
];

// Models can be temporarily unavailable when systemic probe failures leave no reliable data.
export const DOMAIN_ANALYSIS_UNAVAILABLE_MODELS: DomainAnalysisModelAvailability[] = [
  {
    model: 'gpt-5-mini',
    label: 'GPT-5 Mini',
    reason:
      'Unavailable in this snapshot due to systemic probe failure (temperature setting unsupported for this model).',
  },
];

const unavailableModelIds = new Set(DOMAIN_ANALYSIS_UNAVAILABLE_MODELS.map((model) => model.model));

export const DOMAIN_ANALYSIS_AVAILABLE_MODELS: ModelEntry[] = DOMAIN_ANALYSIS_MODELS.filter(
  (model) => !unavailableModelIds.has(model.model),
);

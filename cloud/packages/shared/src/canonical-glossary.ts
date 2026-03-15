export type CanonicalGlossaryTerm = {
  name: string;
  summary: string;
  example: string;
  clarifications?: string[];
  preferredTerm?: string;
  preferredReplacement?: string;
};

export type CanonicalGlossarySection = {
  id: string;
  title: string;
  description: string;
  terms: CanonicalGlossaryTerm[];
};

export type CanonicalGlossaryMapping = {
  legacyTerm: string;
  canonicalTerm: string;
  notes: string;
};

export const CANONICAL_GLOSSARY_OVERVIEW = 'This document is the canonical terminology source for ValueRank.';

export const CANONICAL_GLOSSARY_PURPOSE =
  'Its purpose is to define the user-facing and analysis-facing meanings of core terms before code, UI copy, specs, and reports are updated to match.';

export const CANONICAL_GLOSSARY_USAGE = [
  'Use these terms in new product docs, specs, report copy, and analysis discussions.',
  'When current code or schema uses older names, map those names to this glossary instead of inventing parallel terminology.',
  'Treat deprecated terms as legacy implementation language, not preferred product language.',
];

export const CANONICAL_GLOSSARY_SECTIONS: CanonicalGlossarySection[] = [
  {
    id: 'core',
    title: 'Core Terms',
    description: 'These terms define the structure of the instrument itself.',
    terms: [
      {
        name: 'Value',
        summary: 'A value is a human priority or principle that ValueRank is trying to measure, such as Achievement, Security, or Universalism.',
        example: 'Achievement is one value that can appear as an attribute inside a vignette.',
        clarifications: [
          'A value is the moral concept being studied.',
          'An attribute is the structural role that a value can play inside a vignette.',
        ],
      },
      {
        name: 'Vignette',
        summary: 'A vignette is a full prompt setup for one tradeoff. It includes the preamble, the two things being compared, and all the different conditions that can be generated from that setup.',
        example: 'The Jobs vignette compares Achievement and Hedonism across a 5x5 grid of conditions.',
        clarifications: [
          'Use vignette for the full setup.',
          'Use condition for one exact case inside that setup.',
          'The older internal term definition usually means vignette.',
          'In this glossary, a vignette is the full prompt family, not one rendered case.',
        ],
      },
      {
        name: 'Attribute',
        summary: 'An attribute is one of the things being compared inside a vignette.',
        example: 'In this vignette, Achievement is one attribute and Hedonism is the other.',
        clarifications: [
          'An attribute is not the full prompt text.',
          'The older internal term dimension usually means attribute.',
          'Attribute is the general structural term, not a synonym for Schwartz value only.',
        ],
      },
      {
        name: 'Level',
        summary: 'A level is one setting of an attribute.',
        example: 'Level 5 means the first attribute is described as very strong in this condition.',
        clarifications: [
          'A level is the setting, not the attribute itself.',
          'A level is only one part of a condition.',
        ],
      },
      {
        name: 'Condition',
        summary: 'A condition is one exact combination of levels inside a vignette.',
        example: 'Condition 5x1 means the first attribute is at level 5 and the second is at level 1.',
        clarifications: [
          'A condition is one exact case inside a vignette.',
          'conditionKey is the current code label for this unit.',
          'Do not use vignette when you mean one condition.',
          'Prefer condition when older docs use scenario for the exact evaluated case.',
        ],
      },
      {
        name: 'Narrative',
        summary: 'The narrative is the part of the prompt that presents the competing values or options for a condition.',
        example: 'In this narrative, the achievement-focused option is described before the enjoyment-focused option.',
        clarifications: [
          'The condition stays the same even if the narrative wording or order changes.',
          'Use narrative for the presented comparison text, not for the whole vignette.',
          'Prefer narrative when older docs use scenario for the presented comparison text.',
        ],
      },
      {
        name: 'Variant',
        summary: 'A variant is one version of the same condition used for comparison.',
        example: 'The baseline and presentation-flipped prompts are two variants of the same condition.',
        clarifications: [
          'A variant is used to test wording, order, or scale changes.',
          'A variant is not the same thing as a saved vignette version.',
        ],
      },
    ],
  },
  {
    id: 'execution',
    title: 'Execution Terms',
    description: 'These terms describe how ValueRank launches and records evaluation work.',
    terms: [
      {
        name: 'Run',
        summary: 'A run is a task you start in ValueRank that sends one or more vignettes to one or more models for testing.',
        example: 'This run sends the five locked vignettes to GPT-4o at temperature 0.',
      },
      {
        name: 'Trial',
        summary: 'One trial is one time a model is given the prompt for a condition and produces an answer.',
        example: 'One trial is GPT-4o answering condition 5x1 once.',
        clarifications: [
          'A trial is one attempt, not the whole run.',
          'A trial produces one transcript.',
        ],
      },
      {
        name: 'Batch',
        summary: 'A batch is one complete pass where a model answers every planned condition for a vignette once.',
        example: 'Batch 1 means the model answered all 25 conditions in that vignette once.',
        clarifications: [
          'A batch contains many trials.',
          'Use batch for the full pass, not as another word for trial.',
        ],
      },
      {
        name: 'Transcript',
        summary: 'A transcript is the full recorded prompt and response for one trial.',
        example: 'The transcript shows the prompt that was sent to the model and the answer it gave back.',
      },
      {
        name: 'Model',
        summary: 'A model is the AI model that answers the prompt.',
        example: 'Claude Sonnet 4 is one model we test in ValueRank.',
      },
      {
        name: 'Signature',
        summary: 'A signature is a short code that identifies a specific vignette version and run setup, including temperature. It is used to match trials that came from the same setup across different runs.',
        example: 'If two runs have the same signature, they used the same vignette version and temperature settings.',
      },
    ],
  },
  {
    id: 'analysis',
    title: 'Analysis Terms',
    description: 'These terms describe the units used when interpreting model behavior.',
    terms: [
      {
        name: 'Score',
        summary: 'A score is the 1-to-5 answer that a model gives for a condition.',
        example: 'A score of 5 means the model answered at the high end of the scale for that condition.',
        clarifications: [
          'A score is the model response on the scale.',
          'Later analysis may combine many scores into summaries or metrics.',
        ],
      },
      {
        name: 'Cell',
        summary: 'A cell is the analysis bucket for one specific combination of model, vignette, condition, and variant.',
        example: 'All GPT-4o trials for Jobs, condition 5x1, and presentation-flipped belong to one cell.',
        clarifications: [
          'A cell can contain one trial or many repeated trials.',
          'A cell is an analysis bucket, not a single attempt.',
        ],
      },
      {
        name: 'Comparison Pair',
        summary: 'A comparison pair is a comparison between a baseline cell and a variant cell for the same model, vignette, and condition, with enough usable data on both sides to count in a metric.',
        example: 'If condition 5x1 is shown once in baseline form and once with the narrative order flipped, that can be a comparison pair.',
      },
      {
        name: 'Order Effect',
        summary: 'An order effect is a change in the model answer caused by changing the order or presentation of the prompt rather than the underlying condition.',
        example: 'If the model changes its answer when the same condition is presented in a different order, that is an order effect.',
      },
      {
        name: 'Order Invariance',
        summary: 'Order invariance means a model gives the same answer even when the order or presentation changes.',
        example: 'A model shows order invariance if it gives the same answer for the baseline and flipped versions of the same condition.',
      },
    ],
  },
  {
    id: 'deprecated',
    title: 'Deprecated Or Internal Terms',
    description: 'These legacy terms still appear in code and older docs, but they should not drive new product copy.',
    terms: [
      {
        name: 'Definition',
        summary: 'Definition is an older term that usually means vignette.',
        example: 'The UI says vignette, but older code may still call the same thing a definition.',
        preferredTerm: 'vignette',
      },
      {
        name: 'Dimension',
        summary: 'Dimension is an older internal term that usually means attribute.',
        example: 'A dimension in older code usually matches an attribute in the glossary.',
        preferredTerm: 'attribute',
      },
      {
        name: 'Scenario',
        summary: 'Scenario is an older term that was used inconsistently.',
        example: 'Older docs may say scenario when they really mean vignette, condition, or narrative.',
        preferredReplacement: 'Use vignette, condition, or narrative depending on what is actually meant.',
      },
    ],
  },
];

export const CANONICAL_GLOSSARY_MAPPING_TABLE: CanonicalGlossaryMapping[] = [
  {
    legacyTerm: 'definition',
    canonicalTerm: 'vignette',
    notes: 'Main Vignettes tab object',
  },
  {
    legacyTerm: 'dimension',
    canonicalTerm: 'attribute',
    notes: 'User-facing axis',
  },
  {
    legacyTerm: 'scenario',
    canonicalTerm: 'condition or narrative',
    notes: 'Resolve by meaning, not blind rename',
  },
];

export const CANONICAL_GLOSSARY_RELATED_DOCS = [
  {
    title: 'docs/features/definitions.md',
    summary: 'An implementation and feature doc for the current Vignettes and Definitions area. It should describe current behavior and note where legacy implementation names remain.',
  },
  {
    title: 'PRD terminology section',
    summary: 'The PRD should contain a concise version of this glossary, but it should not conflict with these definitions.',
  },
];

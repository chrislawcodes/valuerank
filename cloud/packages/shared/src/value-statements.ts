export type ValueStatement = { readonly token: string; readonly body: string };

const JOB_CHOICE_VALUE_STATEMENTS = [
  {
    token: 'self_direction_action',
    body: 'freedom in how they work because of how it relates to independent choice in goals and actions',
  },
  {
    token: 'power_dominance',
    body: 'authority over others because of how it relates to control over people and the decisions that affect them',
  },
  {
    token: 'security_personal',
    body: 'personal security in everyday life because of how it relates to financial and physical stability, safety, and predictability',
  },
  {
    token: 'conformity_interpersonal',
    body: 'harmony in their close relationships because of how it relates to maintaining smooth interactions with family, friends, and neighbors',
  },
  {
    token: 'tradition',
    body: 'connection to their heritage because of how it relates to long-standing customs and inherited ways of doing things',
  },
  {
    token: 'stimulation',
    body: 'variety and excitement in their daily work because of how it relates to change, challenge, and unpredictability',
  },
  {
    token: 'benevolence_dependability',
    body: 'trust from other people because of how it relates to being someone others can rely on to carry through on shared responsibilities',
  },
  {
    token: 'universalism_nature',
    body: 'connection to the natural world because of how it relates to care for nature and the environment',
  },
  {
    token: 'achievement',
    body: 'recognition of their expertise because of how it relates to success through strong performance',
  },
  {
    token: 'hedonism',
    body: 'enjoyment in their daily experience because of how it relates to pleasure and comfort in everyday work',
  },
] as const;

const JOB_CHOICE_VALUE_STATEMENT_MAP = new Map<string, string>(
  JOB_CHOICE_VALUE_STATEMENTS.map(({ token, body }) => [token, body]),
);

export { JOB_CHOICE_VALUE_STATEMENTS };

export function getJobChoiceValueStatementBody(token: string): string | undefined {
  return JOB_CHOICE_VALUE_STATEMENT_MAP.get(token);
}

// ---------------------------------------------------------------------------

const NATIONAL_PRIORITIES_VALUE_STATEMENTS = [
  {
    token: 'self_direction_action',
    body: 'freedom in how they live because of how it relates to independent choice in goals and actions',
  },
  {
    token: 'power_dominance',
    body: 'authority over fellow citizens because of how it relates to control over people and the decisions that affect them',
  },
  {
    token: 'security_personal',
    body: 'personal security in everyday life because of how it relates to stability, safety, and predictability',
  },
  {
    token: 'conformity_interpersonal',
    body: 'harmony in their relationships with one another because of how it relates to maintaining smooth interactions with the people around them',
  },
  {
    token: 'tradition',
    body: 'connection to their heritage because of how it relates to long-standing customs and inherited ways of doing things',
  },
  {
    token: 'stimulation',
    body: 'variety and excitement in their daily lives because of how it relates to change, challenge, and unpredictability',
  },
  {
    token: 'benevolence_dependability',
    body: 'trust from their fellow citizens because of how it relates to being someone others can rely on to follow through on shared responsibilities',
  },
  {
    token: 'universalism_nature',
    body: 'connection to the natural world because of how it relates to care for nature and the environment',
  },
  {
    token: 'achievement',
    body: 'recognition of their accomplishments because of how it relates to success through strong performance',
  },
  {
    token: 'hedonism',
    body: 'enjoyment in their daily experience because of how it relates to pleasure and comfort in everyday life',
  },
] as const;

const NATIONAL_PRIORITIES_VALUE_STATEMENT_MAP = new Map<string, string>(
  NATIONAL_PRIORITIES_VALUE_STATEMENTS.map(({ token, body }) => [token, body]),
);

export { NATIONAL_PRIORITIES_VALUE_STATEMENTS };

export function getNationalPrioritiesValueStatementBody(token: string): string | undefined {
  return NATIONAL_PRIORITIES_VALUE_STATEMENT_MAP.get(token);
}

// ---------------------------------------------------------------------------

const NEIGHBORHOOD_VALUE_STATEMENTS = [
  {
    token: 'self_direction_action',
    body: 'freedom in how they live because of how it relates to independent choice in goals and actions',
  },
  {
    token: 'power_dominance',
    body: 'authority over how the neighborhood is run because of how it relates to having the deciding voice in decisions affecting other residents',
  },
  {
    token: 'security_personal',
    body: 'personal security in everyday life because of how it relates to stability, safety, and predictability',
  },
  {
    token: 'conformity_interpersonal',
    body: 'harmony with neighbors because of how it relates to maintaining smooth interactions with the people around them',
  },
  {
    token: 'tradition',
    body: 'connection to established local ways of life because of how it relates to long-standing customs and inherited ways of doing things',
  },
  {
    token: 'stimulation',
    body: 'variety and excitement in daily life because of how it relates to change, challenge, and unpredictability',
  },
  {
    token: 'benevolence_dependability',
    body: 'trust from neighbors because of how it relates to being someone others can rely on to follow through on shared community responsibilities',
  },
  {
    token: 'universalism_nature',
    body: 'connection to the natural world because of how it relates to care for nature and the environment',
  },
  {
    token: 'achievement',
    body: 'recognition of their expertise because of how it relates to success through strong performance noticed by residents',
  },
  {
    token: 'hedonism',
    body: 'enjoyment in everyday life because of how it relates to pleasure and comfort in daily experience',
  },
] as const;

const NEIGHBORHOOD_VALUE_STATEMENT_MAP = new Map<string, string>(
  NEIGHBORHOOD_VALUE_STATEMENTS.map(({ token, body }) => [token, body]),
);

export { NEIGHBORHOOD_VALUE_STATEMENTS };

export function getNeighborhoodValueStatementBody(token: string): string | undefined {
  return NEIGHBORHOOD_VALUE_STATEMENT_MAP.get(token);
}

// ---------------------------------------------------------------------------

const SOFTWARE_APPROACH_VALUE_STATEMENTS = [
  {
    token: 'self_direction_action',
    body: 'freedom in how you build this because of how it relates to independent choice in goals and actions',
  },
  {
    token: 'power_dominance',
    body: 'authority over the technical direction because of how it relates to having the deciding voice on architectural choices and directing how others on the team will build',
  },
  {
    token: 'security_personal',
    body: 'personal security because of how it relates to stability, safety, and predictability',
  },
  {
    token: 'conformity_interpersonal',
    body: 'harmony with your team and the company because of how it relates to maintaining smooth interactions with teammates and stakeholders',
  },
  {
    token: 'tradition',
    body: "connection to the team's established ways because of how it relates to long-standing practices and inherited ways of doing things",
  },
  {
    token: 'stimulation',
    body: 'variety and excitement in the work because of how it relates to change, challenge, and unpredictability',
  },
  {
    token: 'benevolence_dependability',
    body: 'trust from your team because of how it relates to being someone others can rely on to carry through on commitments',
  },
  {
    token: 'universalism_nature',
    body: 'stewardship of the natural world because of how it relates to care for nature and the environment',
  },
  {
    token: 'achievement',
    body: 'recognition of your expertise because of how it relates to demonstrating success through strong performance',
  },
  {
    token: 'hedonism',
    body: 'enjoyment in the work because of how it relates to pleasure and satisfaction in the building process',
  },
] as const;

const SOFTWARE_APPROACH_VALUE_STATEMENT_MAP = new Map<string, string>(
  SOFTWARE_APPROACH_VALUE_STATEMENTS.map(({ token, body }) => [token, body]),
);

export { SOFTWARE_APPROACH_VALUE_STATEMENTS };

export function getSoftwareApproachValueStatementBody(token: string): string | undefined {
  return SOFTWARE_APPROACH_VALUE_STATEMENT_MAP.get(token);
}

// ---------------------------------------------------------------------------

const LIBRARY_VALUE_STATEMENTS = [
  {
    token: 'self_direction_action',
    body: 'living life on their own terms because of how it relates to independent choice in goals and actions',
  },
  {
    token: 'power_dominance',
    body: 'how power over others is gained and exercised because of how it relates to control over people and the decisions that affect them',
  },
  {
    token: 'security_personal',
    body: 'protecting themselves and what matters to them because of how it relates to stability, safety, and predictability',
  },
  {
    token: 'conformity_interpersonal',
    body: 'navigating the unwritten rules of social life because of how it relates to maintaining smooth interactions with the people around them',
  },
  {
    token: 'tradition',
    body: 'what older generations knew and practised because of how it relates to long-standing customs and inherited ways of doing things',
  },
  {
    token: 'stimulation',
    body: 'new and surprising experiences because of how it relates to change, challenge, and unpredictability',
  },
  {
    token: 'benevolence_dependability',
    body: 'keeping promises and showing up for others because of how it relates to being someone others can rely on to follow through on shared responsibilities',
  },
  {
    token: 'universalism_nature',
    body: 'stewardship of the natural world because of how it relates to care for nature and the environment',
  },
  {
    token: 'achievement',
    body: 'making their mark through exceptional skill because of how it relates to success through strong performance',
  },
  {
    token: 'hedonism',
    body: 'savouring what life has to offer because of how it relates to pleasure and comfort in everyday life',
  },
] as const;

// ---------------------------------------------------------------------------

const INVASION_MOTIVATION_VALUE_STATEMENTS = [
  {
    token: 'self_direction_action',
    body: "freedom for the country to pursue its own goals because of how it relates to independent choice in goals and actions",
  },
  {
    token: 'power_dominance',
    body: 'authority over the region because of how it relates to control over people and the decisions that affect them',
  },
  {
    token: 'security_personal',
    body: 'safety for citizens from threats the neighbor poses because of how it relates to stability, safety, and predictability',
  },
  {
    token: 'conformity_interpersonal',
    body: 'social harmony among citizens because of how it relates to maintaining smooth interactions with the people around them',
  },
  {
    token: 'tradition',
    body: "reconnection with lands and peoples that share the country's heritage because of how it relates to long-standing customs and inherited ways of doing things",
  },
  {
    token: 'stimulation',
    body: 'national excitement and renewal because of how it relates to change, challenge, and unpredictability',
  },
  {
    token: 'benevolence_dependability',
    body: 'citizen confidence that the government acts on its commitments because of how it relates to being someone others can rely on to follow through on shared responsibilities',
  },
  {
    token: 'universalism_nature',
    body: 'stewardship of the natural environment in the region because of how it relates to care for nature and the environment',
  },
  {
    token: 'achievement',
    body: "proof of the country's capability to achieve what it sets out to do because of how it relates to success through strong performance",
  },
  {
    token: 'hedonism',
    body: "access to goods and experiences that enrich citizens' daily lives because of how it relates to pleasure and comfort in everyday life",
  },
] as const;

const INVASION_MOTIVATION_VALUE_STATEMENT_MAP = new Map<string, string>(
  INVASION_MOTIVATION_VALUE_STATEMENTS.map(({ token, body }) => [token, body]),
);

export { INVASION_MOTIVATION_VALUE_STATEMENTS };

export function getInvasionMotivationValueStatementBody(token: string): string | undefined {
  return INVASION_MOTIVATION_VALUE_STATEMENT_MAP.get(token);
}

// ---------------------------------------------------------------------------

const FOREIGN_POLICY_VALUE_STATEMENTS = [
  {
    token: 'self_direction_action',
    body: 'freedom in how the country responds to the situation because of how it relates to independent choice in goals and actions',
  },
  {
    token: 'power_dominance',
    body: 'dominance over the neighbor because of how it relates to control over people and the decisions that affect them',
  },
  {
    token: 'security_personal',
    body: 'safety for citizens from the hostile neighbor because of how it relates to stability, safety, and predictability',
  },
  {
    token: 'conformity_interpersonal',
    body: "harmony in the country's relationships with neighboring countries because of how it relates to maintaining smooth interactions with the people around them",
  },
  {
    token: 'tradition',
    body: 'connection to the ways the country has historically handled difficult neighbors because of how it relates to long-standing customs and inherited ways of doing things',
  },
  {
    token: 'stimulation',
    body: 'variety and excitement in how the country engages with the situation because of how it relates to change, challenge, and unpredictability',
  },
  {
    token: 'benevolence_dependability',
    body: "reliability in the country's commitments to its allies because of how it relates to being someone others can rely on to follow through on shared responsibilities",
  },
  {
    token: 'universalism_nature',
    body: 'stewardship of the natural environment from the destruction a conflict would bring because of how it relates to care for nature and the environment',
  },
  {
    token: 'achievement',
    body: "recognition for the country's actions with the neighbor because of how it relates to success through strong performance",
  },
  {
    token: 'hedonism',
    body: 'leisure for citizens amid the conflict because of how it relates to pleasure and comfort in everyday life',
  },
] as const;

const FOREIGN_POLICY_VALUE_STATEMENT_MAP = new Map<string, string>(
  FOREIGN_POLICY_VALUE_STATEMENTS.map(({ token, body }) => [token, body]),
);

export { FOREIGN_POLICY_VALUE_STATEMENTS };

export function getForeignPolicyValueStatementBody(token: string): string | undefined {
  return FOREIGN_POLICY_VALUE_STATEMENT_MAP.get(token);
}

// ---------------------------------------------------------------------------

const LIBRARY_VALUE_STATEMENT_MAP = new Map<string, string>(
  LIBRARY_VALUE_STATEMENTS.map(({ token, body }) => [token, body]),
);

export { LIBRARY_VALUE_STATEMENTS };

export function getLibraryValueStatementBody(token: string): string | undefined {
  return LIBRARY_VALUE_STATEMENT_MAP.get(token);
}

// ---------------------------------------------------------------------------

const COLLEGE_ACTIVITY_VALUE_STATEMENTS = [
  {
    token: 'self_direction_action',
    body: 'freedom in how they pursue their interests because of how it relates to independent choice in goals and actions',
  },
  {
    token: 'power_dominance',
    body: 'authority over others because of how it relates to control over people and the decisions that affect them',
  },
  {
    token: 'security_personal',
    body: 'personal security in everyday life because of how it relates to stability, safety, and predictability',
  },
  {
    token: 'conformity_interpersonal',
    body: 'harmony with their fellow students because of how it relates to maintaining smooth interactions with the people around them',
  },
  {
    token: 'tradition',
    body: 'connection to their heritage because of how it relates to long-standing customs and inherited ways of doing things',
  },
  {
    token: 'stimulation',
    body: 'variety and excitement in their daily experience because of how it relates to change, challenge, and unpredictability',
  },
  {
    token: 'benevolence_dependability',
    body: 'trust from fellow students because of how it relates to being someone others can rely on to carry through on shared responsibilities',
  },
  {
    token: 'universalism_nature',
    body: 'connection to the natural world because of how it relates to care for nature and the environment',
  },
  {
    token: 'achievement',
    body: 'recognition of their expertise because of how it relates to success through strong performance',
  },
  {
    token: 'hedonism',
    body: 'enjoyment in their daily experience because of how it relates to pleasure and comfort in everyday life',
  },
] as const;

const COLLEGE_ACTIVITY_VALUE_STATEMENT_MAP = new Map<string, string>(
  COLLEGE_ACTIVITY_VALUE_STATEMENTS.map(({ token, body }) => [token, body]),
);

export { COLLEGE_ACTIVITY_VALUE_STATEMENTS };

export function getCollegeActivityValueStatementBody(token: string): string | undefined {
  return COLLEGE_ACTIVITY_VALUE_STATEMENT_MAP.get(token);
}

// ---------------------------------------------------------------------------

const RETIREMENT_ACTIVITY_VALUE_STATEMENTS = [
  {
    token: 'self_direction_action',
    body: 'freedom in how they pursue their interests because of how it relates to independent choice in goals and actions',
  },
  {
    token: 'power_dominance',
    body: 'authority over others because of how it relates to control over people and the decisions that affect them',
  },
  {
    token: 'security_personal',
    body: 'personal security in everyday life because of how it relates to stability, safety, and predictability',
  },
  {
    token: 'conformity_interpersonal',
    body: 'harmony in their close relationships because of how it relates to maintaining smooth interactions with the people around them',
  },
  {
    token: 'tradition',
    body: 'connection to their heritage because of how it relates to long-standing customs and inherited ways of doing things',
  },
  {
    token: 'stimulation',
    body: 'variety and excitement in their daily experience because of how it relates to change, challenge, and unpredictability',
  },
  {
    token: 'benevolence_dependability',
    body: 'trust from the people around them because of how it relates to being someone others can rely on to carry through on shared responsibilities',
  },
  {
    token: 'universalism_nature',
    body: 'connection to the natural world because of how it relates to care for nature and the environment',
  },
  {
    token: 'achievement',
    body: 'recognition of their expertise because of how it relates to success through strong performance',
  },
  {
    token: 'hedonism',
    body: 'enjoyment in their daily experience because of how it relates to pleasure and comfort in everyday life',
  },
] as const;

const RETIREMENT_ACTIVITY_VALUE_STATEMENT_MAP = new Map<string, string>(
  RETIREMENT_ACTIVITY_VALUE_STATEMENTS.map(({ token, body }) => [token, body]),
);

export { RETIREMENT_ACTIVITY_VALUE_STATEMENTS };

export function getRetirementActivityValueStatementBody(token: string): string | undefined {
  return RETIREMENT_ACTIVITY_VALUE_STATEMENT_MAP.get(token);
}

// ---------------------------------------------------------------------------

const PARENTING_ACTIVITY_VALUE_STATEMENTS = [
  {
    token: 'self_direction_action',
    body: 'freedom to pursue their own interests because of how it relates to independent choice in goals and actions',
  },
  {
    token: 'power_dominance',
    body: 'authority over others because of how it relates to control over people and the decisions that affect them',
  },
  {
    token: 'security_personal',
    body: 'safety and stability in their daily life because of how it relates to stability, safety, and predictability',
  },
  {
    token: 'conformity_interpersonal',
    body: 'harmony with their peers because of how it relates to maintaining smooth interactions with the people around them',
  },
  {
    token: 'tradition',
    body: 'connection to their heritage because of how it relates to long-standing customs and inherited ways of doing things',
  },
  {
    token: 'stimulation',
    body: 'variety and excitement in their daily experience because of how it relates to change, challenge, and unpredictability',
  },
  {
    token: 'benevolence_dependability',
    body: 'trust from the people around them because of how it relates to being someone others can rely on to carry through on shared responsibilities',
  },
  {
    token: 'universalism_nature',
    body: 'connection to the natural world because of how it relates to care for nature and the environment',
  },
  {
    token: 'achievement',
    body: 'recognition of their abilities because of how it relates to success through strong performance',
  },
  {
    token: 'hedonism',
    body: 'enjoyment in their daily experience because of how it relates to pleasure and comfort in everyday life',
  },
] as const;

const PARENTING_ACTIVITY_VALUE_STATEMENT_MAP = new Map<string, string>(
  PARENTING_ACTIVITY_VALUE_STATEMENTS.map(({ token, body }) => [token, body]),
);

export { PARENTING_ACTIVITY_VALUE_STATEMENTS };

export function getParentingActivityValueStatementBody(token: string): string | undefined {
  return PARENTING_ACTIVITY_VALUE_STATEMENT_MAP.get(token);
}

// ---------------------------------------------------------------------------

const PRODUCT_CHOICE_VALUE_STATEMENTS = [
  {
    token: 'self_direction_action',
    body: "freedom in doing what matters to them because of how it relates to independent choice in goals and actions",
  },
  {
    token: 'power_dominance',
    body: "power over how they're perceived and treated by the people around them because of how it relates to control over people and the decisions that affect them",
  },
  {
    token: 'security_personal',
    body: 'personal security in everyday life because of how it relates to stability, safety, and predictability',
  },
  {
    token: 'conformity_interpersonal',
    body: 'harmony in their personal relationships because of how it relates to maintaining smooth interactions with the people around them',
  },
  {
    token: 'tradition',
    body: 'connection to their heritage because of how it relates to long-standing customs and inherited ways of doing things',
  },
  {
    token: 'stimulation',
    body: 'excitement in using it because of how it relates to change, challenge, and unpredictability',
  },
  {
    token: 'benevolence_dependability',
    body: 'support for keeping their commitments to the people around them because of how it relates to being someone others can rely on to carry through on shared responsibilities',
  },
  {
    token: 'universalism_nature',
    body: 'connection to the natural world because of how it relates to care for nature and the environment',
  },
  {
    token: 'achievement',
    body: 'recognition of their high standards because of how it relates to success through strong performance',
  },
  {
    token: 'hedonism',
    body: 'enjoyment in owning and using it because of how it relates to pleasure and comfort in everyday life',
  },
] as const;

const PRODUCT_CHOICE_VALUE_STATEMENT_MAP = new Map<string, string>(
  PRODUCT_CHOICE_VALUE_STATEMENTS.map(({ token, body }) => [token, body]),
);

export { PRODUCT_CHOICE_VALUE_STATEMENTS };

export function getProductChoiceValueStatementBody(token: string): string | undefined {
  return PRODUCT_CHOICE_VALUE_STATEMENT_MAP.get(token);
}

// ---------------------------------------------------------------------------

const MEDICAL_TREATMENT_VALUE_STATEMENTS = [
  {
    token: 'self_direction_action',
    body: 'autonomy in how they direct their own care because of how it relates to independent choice in goals and actions',
  },
  {
    token: 'power_dominance',
    body: 'authority over who treats them and how because of how it relates to control over people and the decisions that affect them',
  },
  {
    token: 'security_personal',
    body: 'personal security in their health and recovery because of how it relates to stability, safety, and predictability',
  },
  {
    token: 'conformity_interpersonal',
    body: 'harmony with their family and support network because of how it relates to maintaining smooth interactions with the people around them',
  },
  {
    token: 'tradition',
    body: 'connection to established approaches to care because of how it relates to long-standing customs and inherited ways of doing things',
  },
  {
    token: 'stimulation',
    body: 'novelty and engagement in how they experience treatment because of how it relates to change, challenge, and unpredictability',
  },
  {
    token: 'benevolence_dependability',
    body: 'capacity to show up for the people who depend on them because of how it relates to being someone others can rely on to carry through on shared responsibilities',
  },
  {
    token: 'universalism_nature',
    body: 'healing through engagement with the natural world because of how it relates to care for nature and the environment',
  },
  {
    token: 'achievement',
    body: 'recognition of their effort and progress in their recovery because of how it relates to success through strong performance',
  },
  {
    token: 'hedonism',
    body: 'enjoyment and ease in their daily experience during treatment because of how it relates to pleasure and comfort in everyday life',
  },
] as const;

const MEDICAL_TREATMENT_VALUE_STATEMENT_MAP = new Map<string, string>(
  MEDICAL_TREATMENT_VALUE_STATEMENTS.map(({ token, body }) => [token, body]),
);

export { MEDICAL_TREATMENT_VALUE_STATEMENTS };

export function getMedicalTreatmentValueStatementBody(token: string): string | undefined {
  return MEDICAL_TREATMENT_VALUE_STATEMENT_MAP.get(token);
}

// ---------------------------------------------------------------------------

const PARTNER_CHOICE_VALUE_STATEMENTS = [
  {
    token: 'self_direction_action',
    body: 'freedom in pursuing his own goals because of how they relate to independent choice in goals and actions',
  },
  {
    token: 'power_dominance',
    body: "power over how he's perceived and treated by the people around him because of how they relate to control over people and the decisions that affect them",
  },
  {
    token: 'security_personal',
    body: 'steadiness and reassurance in his life because of how they relate to stability, safety, and predictability',
  },
  {
    token: 'conformity_interpersonal',
    body: 'harmony with his family and the people close to him because of how they relate to maintaining smooth interactions with the people around them',
  },
  {
    token: 'tradition',
    body: 'connection to his heritage and the ways of life passed down to him because of how they relate to long-standing customs and inherited ways of doing things',
  },
  {
    token: 'stimulation',
    body: 'excitement and novelty in his life because of how they relate to change, challenge, and unpredictability',
  },
  {
    token: 'benevolence_dependability',
    body: 'support in keeping his commitments to the people who rely on him because of how they relate to being someone others can rely on to carry through on shared responsibilities',
  },
  {
    token: 'universalism_nature',
    body: 'connection to the natural world in his life because of how they relate to care for nature and the environment',
  },
  {
    token: 'achievement',
    body: 'recognition of his drive and accomplishments because of how they relate to success through strong performance',
  },
  {
    token: 'hedonism',
    body: 'fun and ease in his daily life because of how they relate to pleasure and comfort in everyday life',
  },
] as const;

const PARTNER_CHOICE_VALUE_STATEMENT_MAP = new Map<string, string>(
  PARTNER_CHOICE_VALUE_STATEMENTS.map(({ token, body }) => [token, body]),
);

export { PARTNER_CHOICE_VALUE_STATEMENTS };

export function getPartnerChoiceValueStatementBody(token: string): string | undefined {
  return PARTNER_CHOICE_VALUE_STATEMENT_MAP.get(token);
}

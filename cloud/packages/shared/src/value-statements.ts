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

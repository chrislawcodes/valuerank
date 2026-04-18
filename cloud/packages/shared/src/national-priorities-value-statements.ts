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

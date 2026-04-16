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

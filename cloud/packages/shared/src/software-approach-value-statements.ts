const SOFTWARE_APPROACH_VALUE_STATEMENTS = [
  {
    token: 'self_direction_action',
    body: '[level] freedom in how you build this because of how it relates to independent choice in goals and actions',
  },
  {
    token: 'power_dominance',
    body: '[level] authority over the technical direction because of how it relates to having the deciding voice on architectural choices and directing how others on the team will build',
  },
  {
    token: 'security_personal',
    body: '[level] personal security because of how it relates to stability, safety, and predictability',
  },
  {
    token: 'conformity_interpersonal',
    body: '[level] harmony with your team and others in the company because of how it relates to maintaining smooth interactions with teammates and stakeholders',
  },
  {
    token: 'tradition',
    body: '[level] connection to the team\'s established ways because of how it relates to long-standing practices and inherited ways of doing things',
  },
  {
    token: 'stimulation',
    body: '[level] variety and excitement in the work because of how it relates to change, challenge, and unpredictability',
  },
  {
    token: 'benevolence_dependability',
    body: '[level] trust from your team because of how it relates to being someone others can rely on to carry through on commitments',
  },
  {
    token: 'universalism_nature',
    body: '[level] stewardship of the natural world because of how it relates to care for nature and the environment',
  },
  {
    token: 'achievement',
    body: '[level] recognition of your expertise because of how it relates to demonstrating success through strong performance',
  },
  {
    token: 'hedonism',
    body: '[level] enjoyment in the work because of how it relates to pleasure and satisfaction in the building process',
  },
] as const;

const SOFTWARE_APPROACH_VALUE_STATEMENT_MAP = new Map<string, string>(
  SOFTWARE_APPROACH_VALUE_STATEMENTS.map(({ token, body }) => [token, body]),
);

export { SOFTWARE_APPROACH_VALUE_STATEMENTS };

export function getSoftwareApproachValueStatementBody(token: string): string | undefined {
  return SOFTWARE_APPROACH_VALUE_STATEMENT_MAP.get(token);
}

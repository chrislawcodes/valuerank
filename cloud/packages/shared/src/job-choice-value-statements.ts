const JOB_CHOICE_VALUE_STATEMENTS = [
  {
    token: 'self_direction_action',
    body: '[level] freedom in how they work because of how it relates to independent choice in goals and actions',
  },
  {
    token: 'power_dominance',
    body: '[level] authority over others because of how it relates to control over people and the decisions that affect them',
  },
  {
    token: 'security_personal',
    body: '[level] personal security in everyday life because of how it relates to financial and physical stability, safety, and predictability',
  },
  {
    token: 'conformity_interpersonal',
    body: '[level] harmony in their close relationships because of how it relates to maintaining smooth interactions with family, friends, and neighbors',
  },
  {
    token: 'tradition',
    body: '[level] connection to their heritage because of how it relates to long-standing customs and inherited ways of doing things',
  },
  {
    token: 'stimulation',
    body: '[level] variety and excitement in their daily work because of how it relates to change, challenge, and unpredictability',
  },
  {
    token: 'benevolence_dependability',
    body: '[level] trust from other people because of how it relates to being someone others can rely on to carry through on shared responsibilities',
  },
  {
    token: 'universalism_nature',
    body: '[level] connection to the natural world because of how it relates to care for nature and the environment',
  },
  {
    token: 'achievement',
    body: '[level] recognition of their expertise because of how it relates to success through strong performance',
  },
  {
    token: 'hedonism',
    body: '[level] enjoyment in their daily experience because of how it relates to pleasure and comfort in everyday work',
  },
] as const;

const JOB_CHOICE_VALUE_STATEMENT_MAP = new Map<string, string>(
  JOB_CHOICE_VALUE_STATEMENTS.map(({ token, body }) => [token, body]),
);

export { JOB_CHOICE_VALUE_STATEMENTS };

export function getJobChoiceValueStatementBody(token: string): string | undefined {
  return JOB_CHOICE_VALUE_STATEMENT_MAP.get(token);
}

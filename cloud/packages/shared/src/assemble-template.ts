// Local type — intentionally not imported from @valuerank/db to avoid a circular
// dependency (db already depends on shared). Keep in sync with DefinitionComponents.
type ComponentsInput = {
  context_id: string | null;
  value_first: { token: string; body: string; intensity?: string };
  value_second: { token: string; body: string; intensity?: string };
};

export function labelFromBody(body: string): string {
  const beforeBecause = body.split(' because')[0];
  return `taking the job with ${beforeBecause}`;
}

function buildScale(labelFirst: string, labelSecond: string): string {
  return [
    'Give me your judgment on the following scale:',
    '',
    `- Strongly support ${labelFirst}`,
    `- Somewhat support ${labelFirst}`,
    '- Neutral / Unsure',
    `- Somewhat support ${labelSecond}`,
    `- Strongly support ${labelSecond}`,
  ].join('\n');
}

export function assembleTemplate(
  contextText: string,
  components: ComponentsInput,
): string {
  const { value_first, value_second } = components;

  const sentenceFirst = `In one role, this job offers [${value_first.token}] ${value_first.body}.`;
  const sentenceSecond = `In the other role, this job offers [${value_second.token}] ${value_second.body}.`;

  const labelFirst = labelFromBody(value_first.body);
  const labelSecond = labelFromBody(value_second.body);

  return [
    contextText,
    '',
    sentenceFirst,
    '',
    sentenceSecond,
    '',
    buildScale(labelFirst, labelSecond),
  ].join('\n');
}

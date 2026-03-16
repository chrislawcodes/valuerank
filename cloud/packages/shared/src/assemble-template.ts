// Local type — intentionally not imported from @valuerank/db to avoid a circular
// dependency (db already depends on shared). Keep in sync with DefinitionComponents.
type ComponentsInput = {
  context_id: string | null;
  value_first: { token: string; body: string; intensity?: string };
  value_second: { token: string; body: string; intensity?: string };
};

export function labelFromBody(body: string): string {
  // Strip [level] token (and optional trailing space) before extracting scale label.
  // Scale labels must be stable across all 25 level-preset conditions.
  const clean = body.replace(/\[level\]\s*/g, '');
  const beforeBecause = (clean.split(' because')[0] ?? clean).trim();
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
  levelWords?: { first?: string; second?: string },
): string {
  const { value_first, value_second } = components;

  // Substitute [level] with the provided word, or leave as-is (base template mode).
  const bodyFirst =
    levelWords?.first != null
      ? value_first.body.replaceAll('[level]', levelWords.first)
      : value_first.body;
  const bodySecond =
    levelWords?.second != null
      ? value_second.body.replaceAll('[level]', levelWords.second)
      : value_second.body;

  const sentenceFirst = `In one role, this job offers ${bodyFirst}.`;
  const sentenceSecond = `In the other role, this job offers ${bodySecond}.`;

  // Scale labels use the original body (stripped of [level]) so they are stable
  // regardless of which level word was substituted.
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

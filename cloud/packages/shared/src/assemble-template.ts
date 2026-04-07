// Local type — intentionally not imported from @valuerank/db to avoid a circular
// dependency (db already depends on shared). Keep in sync with DefinitionComponents.
type ComponentsInput = {
  context_id: string | null;
  value_first: { token: string; body: string; intensity?: string };
  value_second: { token: string; body: string; intensity?: string };
};

export type TemplateConfig = {
  sentencePrefix?: string | null;  // default: "One job offers"
  labelPrefix?: string | null;     // default: "taking the job with"
};

export const DEFAULT_SENTENCE_PREFIX = 'One job offers';
export const DEFAULT_LABEL_PREFIX = 'taking the job with';

export function labelFromBody(body: string, labelPrefix?: string | null): string {
  // Strip [level] token (and optional trailing space) before extracting scale label.
  // Scale labels must be stable across all 25 level-preset conditions.
  const clean = body.replace(/\[level\]\s*/g, '');
  const beforeBecause = (clean.split(' because')[0] ?? clean).trim();
  const prefix = labelPrefix ?? DEFAULT_LABEL_PREFIX;
  return `${prefix} ${beforeBecause}`;
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
  config?: TemplateConfig,
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

  const sp = config?.sentencePrefix ?? DEFAULT_SENTENCE_PREFIX;
  const sentenceFirst = `${sp} ${bodyFirst}.`;
  const sentenceSecond = `${sp} ${bodySecond}.`;

  // Scale labels use the original body (stripped of [level]) so they are stable
  // regardless of which level word was substituted.
  const labelFirst = labelFromBody(value_first.body, config?.labelPrefix);
  const labelSecond = labelFromBody(value_second.body, config?.labelPrefix);

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

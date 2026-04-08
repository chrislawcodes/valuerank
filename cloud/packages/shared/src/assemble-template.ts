// Local type — intentionally not imported from @valuerank/db to avoid a circular
// dependency (db already depends on shared). Keep in sync with DefinitionComponents.
type ComponentsInput = {
  context_id: string | null;
  value_first: { token: string; body: string; intensity?: string };
  value_second: { token: string; body: string; intensity?: string };
};

export type TemplateConfig = {
  sentencePrefix?: string | null;  // e.g. "One job offers [level]"
  labelPrefix?: string | null;     // default: "taking the job with"
};

export const DEFAULT_SENTENCE_PREFIX = 'One job offers [level]';
export const DEFAULT_LABEL_PREFIX = 'taking the job with';

export function labelFromBody(body: string, labelPrefix?: string | null): string {
  // Extract a stable scale label from the value statement body.
  // Bodies should not contain [level] (it belongs in sentencePrefix),
  // but strip it defensively for backward compatibility.
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

  const rawPrefix = config?.sentencePrefix ?? DEFAULT_SENTENCE_PREFIX;

  // Substitute [level] in the sentence prefix, not the body.
  const spFirst =
    levelWords?.first != null
      ? rawPrefix.replaceAll('[level]', levelWords.first)
      : rawPrefix;
  const spSecond =
    levelWords?.second != null
      ? rawPrefix.replaceAll('[level]', levelWords.second)
      : rawPrefix;

  const sentenceFirst = `${spFirst} ${value_first.body}.`;
  const sentenceSecond = `${spSecond} ${value_second.body}.`;

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

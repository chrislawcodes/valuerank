import type { DefinitionComponents, DefinitionContent } from '@valuerank/db';
import { assembleTemplate, getJobChoiceValueStatementBody } from '@valuerank/shared';

type JobChoiceContentLike = Pick<DefinitionContent, 'template' | 'components' | 'methodology'>;

// New wording checked first; old wording retained for backwards-compat with stored templates.
const ROLE_SENTENCE_PREFIXES = ['One job offers ', 'In one role, this job offers '] as const;

function extractJobChoiceIntro(template: string): string | null {
  for (const prefix of ROLE_SENTENCE_PREFIXES) {
    const markerIndex = template.indexOf(prefix);
    if (markerIndex >= 0) {
      return markerIndex === 0 ? '' : template.slice(0, markerIndex).trimEnd();
    }
  }
  return null;
}

export function normalizeJobChoiceComponents(components: DefinitionComponents): DefinitionComponents {
  const normalizedFirstBody =
    getJobChoiceValueStatementBody(components.value_first.token) ?? components.value_first.body;
  const normalizedSecondBody =
    getJobChoiceValueStatementBody(components.value_second.token) ?? components.value_second.body;

  return {
    ...components,
    value_first: {
      ...components.value_first,
      body: normalizedFirstBody,
    },
    value_second: {
      ...components.value_second,
      body: normalizedSecondBody,
    },
  };
}

function isJobChoiceContentLike(content: unknown): content is JobChoiceContentLike {
  return typeof content === 'object' && content !== null;
}

export function normalizeJobChoiceDefinitionContent<T>(content: T): T {
  if (!isJobChoiceContentLike(content)) {
    return content;
  }

  if (content.methodology?.family !== 'job-choice' || content.components == null) {
    return content;
  }

  const intro = extractJobChoiceIntro(content.template);
  if (intro == null) {
    return {
      ...content,
      components: normalizeJobChoiceComponents(content.components),
    } as T;
  }

  const normalizedComponents = normalizeJobChoiceComponents(content.components);
  const normalizedTemplate = assembleTemplate(intro, normalizedComponents);

  return {
    ...content,
    template: normalizedTemplate,
    components: normalizedComponents,
  } as T;
}

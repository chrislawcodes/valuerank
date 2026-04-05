import type { DefinitionComponents, DefinitionContent } from '@valuerank/db';
import { assembleTemplate, getJobChoiceValueStatementBody } from '@valuerank/shared';

type PairedContentLike = Pick<DefinitionContent, 'template' | 'components' | 'methodology'>;

const ROLE_SENTENCE_PREFIX = 'One job offers ';

function extractPairedIntro(template: string): string | null {
  const markerIndex = template.indexOf(ROLE_SENTENCE_PREFIX);
  if (markerIndex < 0) return null;
  return markerIndex === 0 ? '' : template.slice(0, markerIndex).trimEnd();
}

export function normalizePairedComponents(components: DefinitionComponents): DefinitionComponents {
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

function isPairedContentLike(content: unknown): content is PairedContentLike {
  return typeof content === 'object' && content !== null;
}

export function normalizePairedDefinitionContent<T>(content: T): T {
  if (!isPairedContentLike(content)) {
    return content;
  }

  if (content.methodology?.family !== 'job-choice' || content.components == null) {
    return content;
  }

  const intro = extractPairedIntro(content.template);
  if (intro == null) {
    return {
      ...content,
      components: normalizePairedComponents(content.components),
    } as T;
  }

  const normalizedComponents = normalizePairedComponents(content.components);
  const normalizedTemplate = assembleTemplate(intro, normalizedComponents);

  return {
    ...content,
    template: normalizedTemplate,
    components: normalizedComponents,
  } as T;
}

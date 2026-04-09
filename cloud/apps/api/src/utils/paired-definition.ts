import type { DefinitionComponents, DefinitionContent } from '@valuerank/db';
import {
  assembleTemplate,
  getJobChoiceValueStatementBody,
  getSoftwareApproachValueStatementBody,
} from '@valuerank/shared';

type PairedContentLike = Pick<DefinitionContent, 'template' | 'components' | 'methodology'>;

const SENTENCE_PREFIX_BY_FAMILY: Record<string, string> = {
  'job-choice': 'One job offers ',
  'software-approach-choice': 'One approach provides ',
};

type BodyLookup = (token: string) => string | undefined;

const BODY_LOOKUP_BY_FAMILY: Record<string, BodyLookup> = {
  'job-choice': getJobChoiceValueStatementBody,
  'software-approach-choice': getSoftwareApproachValueStatementBody,
};

function extractPairedIntro(template: string, family: string): string | null {
  const prefix = SENTENCE_PREFIX_BY_FAMILY[family];
  if (prefix == null) return null;
  const markerIndex = template.indexOf(prefix);
  if (markerIndex < 0) return null;
  return markerIndex === 0 ? '' : template.slice(0, markerIndex).trimEnd();
}

export function normalizePairedComponents(
  components: DefinitionComponents,
  family = 'job-choice',
): DefinitionComponents {
  const lookup = BODY_LOOKUP_BY_FAMILY[family] ?? getJobChoiceValueStatementBody;
  const normalizedFirstBody = lookup(components.value_first.token) ?? components.value_first.body;
  const normalizedSecondBody = lookup(components.value_second.token) ?? components.value_second.body;

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

  const family = content.methodology?.family;
  if (family == null || content.components == null || BODY_LOOKUP_BY_FAMILY[family] == null) {
    return content;
  }

  const intro = extractPairedIntro(content.template, family);
  if (intro == null) {
    return {
      ...content,
      components: normalizePairedComponents(content.components, family),
    } as T;
  }

  const normalizedComponents = normalizePairedComponents(content.components, family);
  const normalizedTemplate = assembleTemplate(intro, normalizedComponents);

  return {
    ...content,
    template: normalizedTemplate,
    components: normalizedComponents,
  } as T;
}

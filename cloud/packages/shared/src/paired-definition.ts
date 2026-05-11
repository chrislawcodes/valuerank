import { assembleTemplate, type TemplateConfig } from './assemble-template.js';
import {
  getJobChoiceValueStatementBody,
  getNationalPrioritiesValueStatementBody,
  getNeighborhoodValueStatementBody,
  getSoftwareApproachValueStatementBody,
} from './value-statements.js';

type PairedValue = {
  token: string;
  body: string;
  intensity?: string;
};

export type PairedComponents = {
  context_id: string | null;
  value_first: PairedValue;
  value_second: PairedValue;
};

type PairedContentLike = {
  template: string;
  components?: PairedComponents | null;
  methodology?: {
    family?: string;
  } | null;
};

type BodyLookup = (token: string) => string | undefined;

export type PairedFamilyConfig = TemplateConfig & {
  bodyLookup: BodyLookup;
};

function createPairedFamilyConfig(
  sentencePrefix: string,
  labelPrefix: string,
  bodyLookup: BodyLookup,
): PairedFamilyConfig {
  return {
    sentencePrefix,
    labelPrefix,
    bodyLookup,
  };
}

const LIBRARY_VALUE_STATEMENTS = [
  {
    token: 'self_direction_action',
    body: 'living life on their own terms because of how it relates to independent choice in goals and actions',
  },
  {
    token: 'power_dominance',
    body: 'how power over others is gained and exercised because of how it relates to control over people and the decisions that affect them',
  },
] as const;

const LIBRARY_VALUE_STATEMENT_MAP = new Map<string, string>(
  LIBRARY_VALUE_STATEMENTS.map(({ token, body }) => [token, body]),
);

function getLibraryValueStatementBody(token: string): string | undefined {
  return LIBRARY_VALUE_STATEMENT_MAP.get(token);
}

const PAIRED_FAMILY_CONFIG_BY_FAMILY: Record<string, PairedFamilyConfig> = {
  'job-choice': createPairedFamilyConfig(
    'One job offers [level]',
    'taking the job with',
    getJobChoiceValueStatementBody,
  ),
  'software-approach-choice': createPairedFamilyConfig(
    'One approach provides [level]',
    'choosing the approach relating to',
    getSoftwareApproachValueStatementBody,
  ),
  'library-books-genre-choice': createPairedFamilyConfig(
    'One title offers readers [level] insight about',
    'the title that offers readers insight about',
    getLibraryValueStatementBody,
  ),
  'national-priorities': createPairedFamilyConfig(
    'One program provides citizens with [level]',
    'the program that provides citizens with',
    getNationalPrioritiesValueStatementBody,
  ),
  'neighborhood-choice': createPairedFamilyConfig(
    'One neighborhood offers [level]',
    'choosing the neighborhood with',
    getNeighborhoodValueStatementBody,
  ),
};

export function getPairedFamilyConfig(family: string): PairedFamilyConfig | undefined {
  return PAIRED_FAMILY_CONFIG_BY_FAMILY[family];
}

function extractPairedIntro(template: string, family: string): string | null {
  const prefix = getPairedFamilyConfig(family)?.sentencePrefix;
  if (prefix == null) return null;
  const markerIndex = template.indexOf(prefix);
  if (markerIndex < 0) return null;
  return markerIndex === 0 ? '' : template.slice(0, markerIndex).trimEnd();
}

export function normalizePairedComponents(
  components: PairedComponents,
  family = 'job-choice',
): PairedComponents {
  const lookup = getPairedFamilyConfig(family)?.bodyLookup ?? getJobChoiceValueStatementBody;
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
  const familyConfig = family != null ? getPairedFamilyConfig(family) : undefined;
  if (family == null || content.components == null || familyConfig == null) {
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
  const normalizedTemplate = assembleTemplate(intro, normalizedComponents, undefined, familyConfig);

  return {
    ...content,
    template: normalizedTemplate,
    components: normalizedComponents,
  } as T;
}

import { assembleTemplate, type TemplateConfig } from './assemble-template.js';
import {
  getCollegeActivityValueStatementBody,
  getForeignPolicyValueStatementBody,
  getInvasionMotivationValueStatementBody,
  getJobChoiceValueStatementBody,
  getLibraryValueStatementBody,
  getNationalPrioritiesValueStatementBody,
  getNeighborhoodValueStatementBody,
  getRetirementActivityValueStatementBody,
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

const PAIRED_FAMILY_CONFIG_BY_FAMILY: Record<string, PairedFamilyConfig> = {
  'job-choice': {
    sentencePrefix: 'One job offers [level]',
    labelPrefix: 'taking the job with',
    bodyLookup: getJobChoiceValueStatementBody,
  },
  'software-approach-choice': {
    sentencePrefix: 'One approach provides [level]',
    labelPrefix: 'choosing the approach relating to',
    bodyLookup: getSoftwareApproachValueStatementBody,
  },
  'library-books-genre-choice': {
    sentencePrefix: 'One title offers readers [level] insight about',
    labelPrefix: 'the title that offers readers insight about',
    bodyLookup: getLibraryValueStatementBody,
  },
  'national-priorities': {
    sentencePrefix: 'One program provides citizens with [level]',
    labelPrefix: 'the program that provides citizens with',
    bodyLookup: getNationalPrioritiesValueStatementBody,
  },
  'neighborhood-choice': {
    sentencePrefix: 'One neighborhood offers [level]',
    labelPrefix: 'choosing the neighborhood with',
    bodyLookup: getNeighborhoodValueStatementBody,
  },
  'invasion-motivation-choice': {
    sentencePrefix: 'Taking control of the neighboring country would provide [level]',
    labelPrefix: 'the motivation that would provide',
    bodyLookup: getInvasionMotivationValueStatementBody,
  },
  'foreign-policy-choice': {
    sentencePrefix: 'One proposal offers [level]',
    labelPrefix: 'the proposal that offers',
    bodyLookup: getForeignPolicyValueStatementBody,
  },
  'college-activity-choice': {
    sentencePrefix: 'One activity offers [level]',
    labelPrefix: 'the activity that offers',
    bodyLookup: getCollegeActivityValueStatementBody,
  },
  'retirement-activity-choice': {
    sentencePrefix: 'One activity offers [level]',
    labelPrefix: 'the activity that offers',
    bodyLookup: getRetirementActivityValueStatementBody,
  },
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

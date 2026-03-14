import type {
  DefinitionContent,
  DefinitionMethodology,
  DefinitionComponents,
} from '@valuerank/db';
import { assembleTemplate, labelFromBody } from '@valuerank/shared';

export type JobChoicePresentationOrder = 'A_first' | 'B_first';

// Value statements keyed by token. Source of truth: docs/job-choice-value-statements.csv
const VALUE_STATEMENTS: Record<string, string> = {
  self_direction_action:
    'freedom in how they work because of how it relates to independent choice in goals and actions',
  power_dominance:
    'authority over others because of how it relates to control over people and the decisions that affect them',
  security_personal:
    'personal security in everyday life because of how it relates to financial and physical stability, safety, and predictability',
  conformity_interpersonal:
    'harmony in their close relationships because of how it relates to maintaining smooth interactions with family, friends, and neighbors',
  tradition:
    'connection to their heritage because of how it relates to long-standing customs and inherited ways of doing things',
  stimulation:
    'variety and excitement in their daily work because of how it relates to change, challenge, and unpredictability',
  benevolence_dependability:
    'trust from other people because of how it relates to being someone others can rely on to carry through on shared responsibilities',
  universalism_nature:
    'connection to the natural world because of how it relates to care for nature and the environment',
  achievement:
    'recognition of their expertise because of how it relates to success through strong performance',
  hedonism:
    'enjoyment in their daily experience because of how it relates to pleasure and comfort in everyday work',
};

const OPTION_PATTERN =
  /If they work as (?<role>.+?), they gain (?<article>a |an )?\[(?<token>[^\]]+)\] (?<rest>.+?)\./;

const TEMPLATE_PATTERN =
  /^(?<intro>[\s\S]*?)If they work as (?<roleA>.+?), they gain (?<articleA>a |an )?\[(?<tokenA>[^\]]+)\] (?<restA>.+?)\.\n\nIf they work as (?<roleB>.+?), they gain (?<articleB>a |an )?\[(?<tokenB>[^\]]+)\] (?<restB>.+?)\.\n\nGive me your judgment[\s\S]*$/;

export type JobChoiceTransformResult = {
  content: DefinitionContent;
  optionLabels: [string, string];
  roleTitles: [string, string];
};

type TransformOptions = {
  presentationOrder?: JobChoicePresentationOrder;
  pairKey?: string;
  contextId?: string;
};

export function transformJobChoiceDefinition(
  content: DefinitionContent,
  options: TransformOptions = {},
): JobChoiceTransformResult {
  const template = content.template;
  const match = template.match(TEMPLATE_PATTERN);
  if (match?.groups == null) {
    throw new Error('Template does not match the expected Jobs vignette structure');
  }

  const intro = match.groups.intro.trimEnd();
  const roleA = match.groups.roleA.trim();
  const roleB = match.groups.roleB.trim();
  const tokenA = match.groups.tokenA.trim();
  const tokenB = match.groups.tokenB.trim();
  const presentationOrder = options.presentationOrder ?? 'A_first';

  const firstToken = presentationOrder === 'A_first' ? tokenA : tokenB;
  const secondToken = presentationOrder === 'A_first' ? tokenB : tokenA;
  const firstRole = presentationOrder === 'A_first' ? roleA : roleB;
  const secondRole = presentationOrder === 'A_first' ? roleB : roleA;

  const firstBody = VALUE_STATEMENTS[firstToken];
  if (firstBody == null) {
    throw new Error(`No Job Choice value statement is defined for token: ${firstToken}`);
  }
  const secondBody = VALUE_STATEMENTS[secondToken];
  if (secondBody == null) {
    throw new Error(`No Job Choice value statement is defined for token: ${secondToken}`);
  }

  const components: DefinitionComponents = {
    context_id: options.contextId ?? null,
    value_first: { token: firstToken, body: firstBody },
    value_second: { token: secondToken, body: secondBody },
  };

  const assembledTemplate = assembleTemplate(intro, components);

  const labelFirst = labelFromBody(firstToken, firstBody);
  const labelSecond = labelFromBody(secondToken, secondBody);

  const methodology: DefinitionMethodology = {
    family: 'job-choice',
    response_scale: 'option_text',
    legacy_label: 'Old V1',
    canonical_value_order: content.dimensions.map((dimension) => dimension.name),
    presentation_order: presentationOrder,
    pair_key: options.pairKey,
  };

  return {
    content: {
      ...content,
      template: assembledTemplate,
      components,
      methodology,
    },
    optionLabels: [labelFirst, labelSecond],
    roleTitles: [firstRole, secondRole],
  };
}

export function isTransformableJobChoiceTemplate(template: string): boolean {
  return TEMPLATE_PATTERN.test(template);
}

export function extractLegacyRoleTitles(template: string): [string, string] | null {
  const match = template.match(TEMPLATE_PATTERN);
  if (match?.groups == null) {
    return null;
  }
  return [match.groups.roleA.trim(), match.groups.roleB.trim()];
}

export function canRewriteRoleSentence(sentence: string): boolean {
  return OPTION_PATTERN.test(sentence);
}

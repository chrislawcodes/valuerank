import type {
  DefinitionContent,
  DefinitionMethodology,
  DefinitionComponents,
} from '@valuerank/db';
import {
  assembleTemplate,
  getJobChoiceValueStatementBody,
  labelFromBody,
} from '@valuerank/shared';

export type JobChoicePresentationOrder = 'A_first' | 'B_first';

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
  if (!match?.groups) {
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

  const firstBody = getJobChoiceValueStatementBody(firstToken);
  if (firstBody == null) {
    throw new Error(`No Job Choice value statement is defined for token: ${firstToken}`);
  }
  const secondBody = getJobChoiceValueStatementBody(secondToken);
  if (secondBody == null) {
    throw new Error(`No Job Choice value statement is defined for token: ${secondToken}`);
  }

  const components: DefinitionComponents = {
    context_id: options.contextId ?? null,
    value_first: { token: firstToken, body: firstBody },
    value_second: { token: secondToken, body: secondBody },
  };

  const assembledTemplate = assembleTemplate(intro, components);

  const labelFirst = labelFromBody(firstBody);
  const labelSecond = labelFromBody(secondBody);

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
  if (!match?.groups) {
    return null;
  }
  return [match.groups.roleA.trim(), match.groups.roleB.trim()];
}

export function canRewriteRoleSentence(sentence: string): boolean {
  return OPTION_PATTERN.test(sentence);
}
